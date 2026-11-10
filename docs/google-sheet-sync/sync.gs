/**
 * 识字小助手 → Google 表格：把新加的汉字填进表格（Google Apps Script）
 *
 * 做什么：定时从你的私有 GitHub 数据仓库（LearningData）读取孩子们学过的汉字，
 *         把“表格里还没有的字”填进对应孩子标签页、对应那一周那一行的 B ～ K 列的【空格】里。
 *
 * 它【只往空格里填】：
 *   - 不删除、不覆盖任何已有内容（包括你手动录入的字）；
 *   - 不碰 A 列、L 列，也不碰公式、格式、条件格式——你表格自己的“自动生成周标签、累计字数、
 *     重复检测变色”照常工作；
 *   - 这一周这一行里已经有的字不会重复填；重复运行不会重复填。
 * 找行的办法：看这个孩子标签页 A 列里已经有的“第N周-日期”（例如 第3周-2026-11-08），
 *   按日期对上 App 里的周；A 列还是空的下一周，就按“每周一行”顺着往下推。
 * 只读：脚本只读取 GitHub，不会改动 App 里的任何数据。
 *
 * 使用步骤见同目录的 README.md。整段复制到 扩展程序 → Apps Script，保存，刷新表格即可。
 */

var STATUS_TAB = '同步状态';
var FIRST_CHAR_COL = 2;        // B 列
var CHAR_COLS = 10;            // B ～ K：每周 10 个字
var EVERY_MINUTES = 10;        // 自动同步的间隔（分钟；只能是 1、5、10、15、30）

// ---------- 菜单 ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('识字助手')
    .addItem('1. 设置 GitHub 连接', 'setupConnection')
    .addItem('2. 立即同步', 'syncNow')
    .addItem('3. 开启自动同步（每 10 分钟）', 'enableAutoSync')
    .addItem('关闭自动同步', 'disableAutoSync')
    .addToUi();
}

// ---------- 设置连接 ----------
function setupConnection() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var r1 = ui.prompt('GitHub 数据仓库', '填写“你的用户名/仓库名”，例如 zhangsan/LearningData', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var repo = String(r1.getResponseText()).trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    ui.alert('仓库格式不对', '应该像 zhangsan/LearningData 这样（用户名/仓库名）。', ui.ButtonSet.OK);
    return;
  }
  var r2 = ui.prompt('只读令牌', '粘贴专门给表格用的 GitHub 令牌（github_pat_ 开头，权限只给 Contents: Read-only）', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var token = String(r2.getResponseText()).trim();
  if (!token) {
    ui.alert('没有填写令牌', '令牌不能为空。', ui.ButtonSet.OK);
    return;
  }
  props.setProperties({ GITHUB_REPO: repo, GITHUB_TOKEN: token });
  try {
    var kids = (ghGet_(readConfig_(), 'kids.json') || {}).kids;
    if (!kids) throw new Error('仓库里还没有 kids.json（先在 App 里添加孩子和汉字）。');
    ui.alert('连接成功', '找到 ' + kids.length + ' 个孩子：' + kids.map(function (k) { return k.name; }).join('、') + '。\n下一步：菜单 识字助手 → 2. 立即同步。', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('连接没有成功', e.message, ui.ButtonSet.OK);
  }
}

function readConfig_() {
  var p = PropertiesService.getScriptProperties();
  var repo = p.getProperty('GITHUB_REPO'), token = p.getProperty('GITHUB_TOKEN');
  if (!repo || !token) throw new Error('还没有设置 GitHub 连接：请先点菜单 识字助手 → 1. 设置 GitHub 连接。');
  return { repo: repo, token: token, first: p.getProperty('FIRST_WEEK') || '' };
}

// ---------- 读取 GitHub ----------
/** 读取仓库里的一个 JSON 文件；文件不存在返回 null；令牌不对等情况抛出能看懂的错误 */
function ghGet_(cfg, path) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  var code = res.getResponseCode();
  if (code === 404) return null;
  if (code === 401) throw new Error('GitHub 说令牌无效或已过期（401）。请重新生成令牌，再点 1. 设置 GitHub 连接。');
  if (code === 403) throw new Error('GitHub 拒绝访问（403）：令牌没有这个仓库的读取权限，或请求太频繁。请检查令牌的 Contents: Read-only。');
  if (code !== 200) throw new Error('GitHub 返回了 ' + code + '，请稍后再试。');
  return JSON.parse(res.getContentText());
}

// ---------- 判断往哪一行填（不碰表格，方便测试）----------
var WEEK_MS = 7 * 86400000;
function utcDay_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
}
/** A 列里的文字（例如 “第3周-2026-11-08”）里的日期，没有就返回 '' */
function dateInLabel_(text) {
  var m = /(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(String(text || ''));
  if (!m) return '';
  var mm = ('0' + m[2]).slice(-2), dd = ('0' + m[3]).slice(-2);
  var s = m[1] + '-' + mm + '-' + dd;
  var d = new Date(utcDay_(s));
  return isNaN(+d) || d.getUTCDate() !== +dd || d.getUTCMonth() + 1 !== +mm ? '' : s;
}
/**
 * 表格的周和行是怎么对应的：labels 是 A 列从第 1 行开始的文字。
 * 找到第一个带日期的标签作为基准（第几行 = 哪一周）；A 列一个日期都没有时，用 fallback（FIRST_WEEK 或 App 里最早的一周）当第 1 行。
 */
function rowMap_(labels, fallback) {
  for (var i = 0; i < labels.length; i++) {
    var d = dateInLabel_(labels[i]);
    if (d) return { row0: i + 1, date0: d, from: 'sheet' };
  }
  return fallback ? { row0: 1, date0: fallback, from: 'fallback' } : null;
}
/**
 * App 里的某一周 → 表格的第几行。
 * 返回 { row: 行号 } ；或 { skip: '原因' }（这一周在表格第一行之前、日期对不上等，不填，只在状态里说明）
 */
function rowForWeek_(map, labels, start) {
  var diff = utcDay_(start) - utcDay_(map.date0);
  if (isNaN(diff)) return { skip: '周日期无法识别：' + start };
  if (diff % WEEK_MS !== 0) return { skip: start + ' 和表格里的周对不上（表格按每周日一行）' };
  var row = map.row0 + diff / WEEK_MS;
  if (row < 1) return { skip: start + ' 在表格第一行（' + map.date0 + '）之前，表格里没有这一行' };
  var shown = dateInLabel_(labels[row - 1]);
  if (shown && shown !== start) return { skip: '第 ' + row + ' 行的周标签是 ' + shown + '，和 App 里的 ' + start + ' 对不上，没有填' };
  return { row: row };
}
/**
 * 把汉字填进这一行 B ～ K 的空格：已经有的字不重复，已有内容一律不动。
 * current：这一行 B ～ K 现在的 10 个格子。返回 { fills: [[第几格(0～9), 字]], present: 已有的个数, noRoom: [放不下的字] }
 */
function placeChars_(current, chars) {
  var have = {}, empty = [];
  for (var i = 0; i < CHAR_COLS; i++) {
    var v = String(current[i] === undefined || current[i] === null ? '' : current[i]).trim();
    if (v) have[v] = true; else empty.push(i);
  }
  var fills = [], present = 0, noRoom = [], seen = {};
  chars.forEach(function (c) {
    if (seen[c]) return;       // 同一个字在 App 里这周只算一次
    seen[c] = true;
    if (have[c]) { present++; return; }
    if (empty.length) fills.push([empty.shift(), c]); else noRoom.push(c);
  });
  return { fills: fills, present: present, noRoom: noRoom };
}

// ---------- 写进表格 ----------
/** 找孩子的标签页：名字完全一样；找不到再忽略大小写和空格找一次；不会自己新建 */
function findTab_(ss, name) {
  var exact = ss.getSheetByName(name);
  if (exact) return exact;
  var want = String(name).trim().toLowerCase();
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) if (String(all[i].getName()).trim().toLowerCase() === want) return all[i];
  return null;
}
function readLabels_(sheet) {
  var last = sheet.getLastRow();
  return last < 1 ? [] : sheet.getRange(1, 1, last, 1).getDisplayValues().map(function (r) { return r[0]; });
}

/** 一个孩子：把 App 里的字填进表格。返回这个孩子的统计和说明 */
function syncKid_(sheet, kidData, fallbackFirst) {
  var out = { added: 0, present: 0, noRoom: [], notes: [], weeks: 0 };
  var weeks = ((kidData && kidData.weeks) || []).filter(function (w) { return w.chars && w.chars.length; })
    .sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
  if (!weeks.length) return out;
  var labels = readLabels_(sheet);
  var map = rowMap_(labels, fallbackFirst || weeks[0].start);
  weeks.forEach(function (w) {
    var at = rowForWeek_(map, labels, w.start);
    if (at.skip) { out.notes.push(at.skip); return; }
    out.weeks++;
    if (at.row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), at.row - sheet.getMaxRows());
    var current = sheet.getRange(at.row, FIRST_CHAR_COL, 1, CHAR_COLS).getValues()[0];
    var r = placeChars_(current, w.chars);
    r.fills.forEach(function (f) { sheet.getRange(at.row, FIRST_CHAR_COL + f[0]).setValue(f[1]); });   // 只写空格，一格一格写
    out.added += r.fills.length;
    out.present += r.present;
    if (r.noRoom.length) {
      out.noRoom = out.noRoom.concat(r.noRoom);
      out.notes.push('第 ' + at.row + ' 行（' + w.start + '）B～K 已经满了，放不下：' + r.noRoom.join(''));
    }
  });
  return out;
}

function writeStatus_(ss, ok, message, lines) {
  var sheet = ss.getSheetByName(STATUS_TAB) || ss.insertSheet(STATUS_TAB);
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow > 0 && lastCol > 0) sheet.getRange(1, 1, lastRow, lastCol).clearContent();
  var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var rows = [['最后同步时间', when], ['结果', ok ? '成功' : '失败'], ['说明', message]];
  (lines || []).forEach(function (l) { rows.push(['', l]); });
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
}

/** 同步一次；成功返回一段文字，失败抛出错误 */
function doSync_() {
  var cfg = readConfig_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kidsFile = ghGet_(cfg, 'kids.json');
  if (!kidsFile) throw new Error('仓库里还没有 kids.json：请先在 App 里添加孩子和汉字。');
  var kids = kidsFile.kids || [];
  var fallback = cfg.first || kidsFile.startWeek || '';
  var lines = [], addedAll = 0;
  kids.forEach(function (k) {
    var sheet = findTab_(ss, k.name);
    if (!sheet) { lines.push(k.name + '：表格里没有叫“' + k.name + '”的标签页，已跳过（请把标签页改成孩子的名字）'); return; }
    var data = ghGet_(cfg, 'kids/' + k.id + '.json') || { weeks: [] };
    var r = syncKid_(sheet, data, fallback);
    addedAll += r.added;
    lines.push(k.name + '：新填入 ' + r.added + ' 个字，已有 ' + r.present + ' 个' + (r.notes.length ? '；注意：' + r.notes.join('；') : ''));
  });
  var message = '新填入 ' + addedAll + ' 个字（' + kids.length + ' 个孩子）';
  writeStatus_(ss, true, message, lines);
  return message + '\n' + lines.join('\n');
}

// ---------- 菜单里的“立即同步”和定时器 ----------
function syncNow() {
  var ui = SpreadsheetApp.getUi();
  try {
    ui.alert('同步完成', doSync_(), ui.ButtonSet.OK);
  } catch (e) {
    try { writeStatus_(SpreadsheetApp.getActiveSpreadsheet(), false, e.message, []); } catch (e2) { /* 连状态页也写不了就算了 */ }
    ui.alert('同步没有成功', e.message, ui.ButtonSet.OK);
  }
}
/** 定时器调用的版本：不弹窗，结果写在“同步状态”标签页 */
function syncAuto() {
  try {
    doSync_();
  } catch (e) {
    writeStatus_(SpreadsheetApp.getActiveSpreadsheet(), false, e.message, []);
  }
}

// ---------- 自动同步的开关 ----------
function removeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAuto') ScriptApp.deleteTrigger(t);
  });
}
function enableAutoSync() {
  var ui = SpreadsheetApp.getUi();
  removeTriggers_();
  ScriptApp.newTrigger('syncAuto').timeBased().everyMinutes(EVERY_MINUTES).create();
  ui.alert('自动同步已开启', '以后每 ' + EVERY_MINUTES + ' 分钟自动同步一次。结果可以在“同步状态”标签页里看到。', ui.ButtonSet.OK);
}
function disableAutoSync() {
  removeTriggers_();
  SpreadsheetApp.getUi().alert('自动同步已关闭', '想再开启，点菜单 识字助手 → 3. 开启自动同步。', SpreadsheetApp.getUi().ButtonSet.OK);
}
