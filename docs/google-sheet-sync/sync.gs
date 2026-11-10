/**
 * 识字小助手 → Google 表格 自动同步脚本（Google Apps Script）
 *
 * 做什么：定时从你的私有 GitHub 数据仓库（LearningData）读取孩子们学过的汉字，
 *         按你表格原来的格式写进这个 Google 表格：
 *           每个孩子一个标签页（标签页名 = 孩子的名字），一行一周：
 *           A 列  第3周-2026-11-08      B ～ K 列  这一周的 10 个汉字      L 列  累计字数
 *         另有一个“同步状态”标签页，记录最后一次同步的时间和结果。
 * 只读：脚本只读取 GitHub，不会改动 App 里的任何数据。
 * 注意：孩子的标签页由脚本整页重写——请不要在这些标签页里手改（下次同步会被覆盖）。
 *
 * 使用步骤见同目录的 README.md。整段复制到 扩展程序 → Apps Script，保存，刷新表格即可。
 */

var STATUS_TAB = '同步状态';
var MIN_CHARS = 10;            // 每周 10 个字：B ～ K，累计放在 L（某周超过 10 个字时，累计列整体往右挪）
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

// ---------- 整理成表格的样子（不碰表格，方便测试）----------
function utcDay_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
}
/** 第几周：从起始周算起（和 App 里的“第N周”一样） */
function weekNo_(start, anchor) {
  if (!anchor) return 1;
  return Math.round((utcDay_(start) - utcDay_(anchor)) / (7 * 86400000)) + 1;
}
/**
 * 一个孩子的所有周 → 表格的行。
 * 返回 { rows: [[标签, 字, 字, …, 累计], …], width: 列数, total: 总字数 }
 * 每行：A 列 “第N周-日期”，然后这周的字（不足的留空），最后一列是累计字数。
 */
function buildKidRows_(kidData, anchor) {
  var weeks = ((kidData && kidData.weeks) || []).filter(function (w) { return w.chars && w.chars.length; })
    .sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
  var first = anchor || (weeks.length ? weeks[0].start : '');
  var most = MIN_CHARS;
  weeks.forEach(function (w) { if (w.chars.length > most) most = w.chars.length; });
  var running = 0;
  var rows = weeks.map(function (w) {
    running += w.chars.length;
    var row = ['第' + weekNo_(w.start, first) + '周-' + w.start];
    for (var i = 0; i < most; i++) row.push(i < w.chars.length ? w.chars[i] : '');
    row.push(running);
    return row;
  });
  return { rows: rows, width: most + 2, total: running };
}
/** 标签页的名字不能含 [ ] * ? : / \，也不能太长 */
function safeTabName_(name) {
  var n = String(name).replace(/[\[\]*?:\/\\]/g, '_').trim().slice(0, 90);
  return n || '孩子';
}

// ---------- 写进表格 ----------
function writeKidTab_(ss, name, built) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow > 0 && lastCol > 0) sheet.getRange(1, 1, lastRow, lastCol).clearContent();   // 这个标签页整页由脚本管理
  if (built.rows.length) sheet.getRange(1, 1, built.rows.length, built.width).setValues(built.rows);
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
  var anchor = cfg.first || kidsFile.startWeek || '';
  var lines = [];
  kids.forEach(function (k) {
    var data = ghGet_(cfg, 'kids/' + k.id + '.json') || { weeks: [] };
    var built = buildKidRows_(data, anchor);
    var tab = safeTabName_(k.name);
    writeKidTab_(ss, tab, built);
    lines.push(k.name + '：' + built.rows.length + ' 周，共 ' + built.total + ' 个字（标签页“' + tab + '”）');
  });
  var message = '已同步 ' + kids.length + ' 个孩子';
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
