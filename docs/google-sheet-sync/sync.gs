/**
 * 识字小助手 → Google 表格：把新加的汉字填进表格（Google Apps Script）
 *
 * 做什么：定时从你的私有 GitHub 数据仓库（LearningData）读取孩子们学过的汉字，
 *         把“表格里还没有的字”填进对应孩子标签页、对应那一周那一行的 B ～ K 列的【空格】里。
 *
 * 它【只往空格里填】：
 *   - 不覆盖任何已有内容（包括你手动录入的字）；
 *   - 不碰 A 列、L 列，也不碰公式、格式、条件格式——你表格自己的“自动生成周标签、累计字数、
 *     重复检测变色”照常工作；
 *   - 这一周这一行里已经有的字不会重复填；重复运行不会重复填。
 * 在 App 里【删掉】的字，下次同步会从表格里清掉那一格（让表格和 App 保持一致）：
 *   - 脚本每次同步后记下“App 当时有哪些字”；只清“上次 App 有、这次 App 没有了”的字，
 *     而且只清那一格里正好是这个字的格子；
 *   - 你手动录入、App 里本来就没有的字永远不动；
 *   - 保险：读不到这个孩子的数据时不删；一次要删的字超过 30 个时不删，并在“同步状态”里提醒你。
 * 找行的办法：看这个孩子标签页 A 列里已经有的“第N周-日期”（例如 第3周-2026-11-08），
 *   按日期对上 App 里的周；A 列还是空的下一周，就按“每周一行”顺着往下推。
 * 只读：脚本只读取 GitHub，不会改动 App 里的任何数据。
 *
 * 自动同步：默认每周六、周日晚上 8 点左右各一次（一周最多两次）；随时可以点菜单“立即同步”。
 * 使用步骤见同目录的 README.md。整段复制到 扩展程序 → Apps Script，保存，刷新表格即可。
 */

var STATUS_TAB = '同步状态';
var FIRST_CHAR_COL = 2;        // B 列
var CHAR_COLS = 10;            // B ～ K：每周 10 个字
var SYNC_DAYS = ['SATURDAY', 'SUNDAY'];   // 自动同步在每周的哪几天（MONDAY 星期一 … SUNDAY 星期日）；只想每周一次就留一个，例如 ['SUNDAY']
var SYNC_HOUR = 20;            // 几点同步（0～23，按这份表格的时区：文件 → 设置 → 时区）；Google 会在这个小时内的某个时间运行
var MAX_DELETES = 30;          // 一次同步里，一个孩子最多从表格里清掉这么多个字（再多就不清，提醒你；可在脚本属性里加 MAX_DELETES 改）
var RECORD_PREFIX = 'S|';      // 脚本属性里“App 上次有哪些字”的记录：S|孩子编号|周日期 = 这一周的字

// ---------- 菜单 ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('识字助手')
    .addItem('1. 设置 GitHub 连接', 'setupConnection')
    .addItem('2. 立即同步', 'syncNow')
    .addItem('3. 开启自动同步（周六、周日各一次）', 'enableAutoSync')
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
  return { repo: repo, token: token, first: p.getProperty('FIRST_WEEK') || '', maxDeletes: Number(p.getProperty('MAX_DELETES')) || MAX_DELETES };
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
 * 上次同步时 App 里有、这次没有了的字（在 App 里删掉的，或者换到别的周去了）。
 * record：上次的记录 {周日期: '这一周的字'}；weeks：这次 App 里的周 [{start, chars}]。
 * 返回 [{start, chars: [字…]}]
 */
function removedChars_(record, weeks) {
  var now = {};
  (weeks || []).forEach(function (w) { now[w.start] = {}; (w.chars || []).forEach(function (c) { now[w.start][c] = true; }); });
  var out = [];
  Object.keys(record || {}).sort().forEach(function (start) {
    var gone = Array.from(String(record[start])).filter(function (c) { return !(now[start] && now[start][c]); });
    if (gone.length) out.push({ start: start, chars: gone });
  });
  return out;
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

/**
 * 一个孩子：把 App 里的字填进表格的空格；再把“App 里已经删掉的字”从表格里清掉。
 * kidData：这个孩子在 GitHub 上的数据（读不到时传 null：只填不删）；record：上次的记录；maxDeletes：一次最多清几个字。
 * 返回统计和说明；out.keepRecord 为 true 时，调用的人不要更新记录（这次没删成，下次再来）。
 */
function syncKid_(sheet, kidData, fallbackFirst, record, maxDeletes) {
  var out = { added: 0, present: 0, deleted: 0, noRoom: [], notes: [], weeks: 0, keepRecord: false };
  var weeks = ((kidData && kidData.weeks) || []).filter(function (w) { return w.chars && w.chars.length; })
    .sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
  var removed = kidData && record ? removedChars_(record, weeks) : [];
  if (!weeks.length && !removed.length) return out;
  var labels = readLabels_(sheet);
  var map = rowMap_(labels, fallbackFirst || (weeks.length ? weeks[0].start : ''));
  if (!map) return out;
  // 1. 填
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
  // 2. 清：只清 App 里已经没有的字，而且只清“这一格里正好是这个字”的格子
  var total = removed.reduce(function (n, r) { return n + r.chars.length; }, 0);
  if (total > maxDeletes) {
    out.keepRecord = true;
    out.notes.push('App 里一次删掉了 ' + total + ' 个字，超过安全上限 ' + maxDeletes + '，这次没有从表格里清除（确认没问题的话，在脚本属性里加 MAX_DELETES = 更大的数，或者在表格里手动清）');
    return out;
  }
  removed.forEach(function (r) {
    var at = rowForWeek_(map, labels, r.start);
    if (at.skip) { out.notes.push('要清除的字：' + at.skip); return; }
    var current = sheet.getRange(at.row, FIRST_CHAR_COL, 1, CHAR_COLS).getValues()[0];
    r.chars.forEach(function (c) {
      for (var i = 0; i < CHAR_COLS; i++) {
        if (String(current[i]).trim() === c) {
          sheet.getRange(at.row, FIRST_CHAR_COL + i).setValue('');
          current[i] = '';
          out.deleted++;
          break;
        }
      }
    });
  });
  return out;
}

/** 脚本属性里这个孩子“上次同步时 App 有哪些字”的记录 */
function readRecord_(props, kidId) {
  var all = props.getProperties(), p = RECORD_PREFIX + kidId + '|', out = {};
  Object.keys(all).forEach(function (k) { if (k.indexOf(p) === 0) out[k.slice(p.length)] = all[k]; });
  return out;
}
function saveRecord_(props, kidId, record, kidData) {
  var p = RECORD_PREFIX + kidId + '|', keep = {};
  ((kidData && kidData.weeks) || []).forEach(function (w) {
    if (!w.chars || !w.chars.length) return;
    keep[w.start] = true;
    var v = w.chars.join('');
    if (record[w.start] !== v) props.setProperty(p + w.start, v);
  });
  Object.keys(record).forEach(function (s) { if (!keep[s]) props.deleteProperty(p + s); });
}

function writeStatus_(ss, ok, message, lines) {
  // 新建时放在所有标签页的最右边（不指定位置的话，Google 会把它插在当前标签页旁边）；已经有的标签页不会被挪动
  var sheet = ss.getSheetByName(STATUS_TAB) || ss.insertSheet(STATUS_TAB, ss.getSheets().length);
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
  var props = PropertiesService.getScriptProperties();
  var kidsFile = ghGet_(cfg, 'kids.json');
  if (!kidsFile) throw new Error('仓库里还没有 kids.json：请先在 App 里添加孩子和汉字。');
  var kids = kidsFile.kids || [];
  var fallback = cfg.first || kidsFile.startWeek || '';
  var lines = [], addedAll = 0, deletedAll = 0;
  kids.forEach(function (k) {
    var sheet = findTab_(ss, k.name);
    if (!sheet) { lines.push(k.name + '：表格里没有叫“' + k.name + '”的标签页，已跳过（请把标签页改成孩子的名字）'); return; }
    var data = ghGet_(cfg, 'kids/' + k.id + '.json');          // null = 读不到这个孩子的文件：只填不删，也不改记录
    var record = readRecord_(props, k.id);
    var r = syncKid_(sheet, data || { weeks: [] }, fallback, data ? record : null, cfg.maxDeletes);
    if (data && !r.keepRecord) saveRecord_(props, k.id, record, data);
    addedAll += r.added;
    deletedAll += r.deleted;
    lines.push(k.name + '：新填入 ' + r.added + ' 个字，已有 ' + r.present + ' 个' + (r.deleted ? '，清除 ' + r.deleted + ' 个（App 里已删除）' : '') + (r.notes.length ? '；注意：' + r.notes.join('；') : ''));
  });
  var message = '新填入 ' + addedAll + ' 个字' + (deletedAll ? '，清除 ' + deletedAll + ' 个字' : '') + '（' + kids.length + ' 个孩子）';
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
  removeTriggers_();      // 先删掉所有旧的自动同步（包括旧版本的“每 10 分钟”），再按现在的设置重新建
  var zone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  SYNC_DAYS.forEach(function (d) {
    ScriptApp.newTrigger('syncAuto').timeBased().onWeekDay(ScriptApp.WeekDay[d]).atHour(SYNC_HOUR).inTimezone(zone).create();
  });
  ui.alert('自动同步已开启', '以后每' + SYNC_DAYS.map(function (d) { return '周' + dayName_(d); }).join('、') + '的晚上 ' + SYNC_HOUR + ' 点左右自动同步一次（按这份表格的时区：' + zone + '）。\n想马上更新，点菜单 识字助手 → 2. 立即同步。结果可以在“同步状态”标签页里看到。', ui.ButtonSet.OK);
}
function dayName_(d) {
  return { MONDAY: '一', TUESDAY: '二', WEDNESDAY: '三', THURSDAY: '四', FRIDAY: '五', SATURDAY: '六', SUNDAY: '日' }[d] || d;
}
function disableAutoSync() {
  removeTriggers_();
  SpreadsheetApp.getUi().alert('自动同步已关闭', '想再开启，点菜单 识字助手 → 3. 开启自动同步。', SpreadsheetApp.getUi().ButtonSet.OK);
}
