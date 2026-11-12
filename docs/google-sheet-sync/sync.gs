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
 * 成语标签页（A 列 = 成语，B 列 = 打勾的格子，C 列 = 你表格自己算的数量）：
 *   App 每周从成语库里给下一周随机选 6 个成语；同步时，脚本把“App 里已经分配到某一周的成语”在 B 列对应的格子【打上勾】。
 *   只会【打勾】，不会取消已有的勾；已有的 A 列成语和 C 列（计算）一律不碰。
 *   App 里有故事的成语，会把故事写进 E 列：E 格是空的就写；E 格里是别的内容，就改成 App 里的故事（以 App 为准，你在 App 里改了故事，表格里的备份就跟着变）。
 *   App 里【没有】故事的成语，E 格不动（不会清空）。一次最多改写 50 个已有内容的 E 格，再多就不改并在“同步状态”里提醒（防止出错）。
 *   学习的周会写在 D 列（例如 第4周-2026-11-15），和孩子标签页 A 列的写法一样；D 列是空的、或者已经是这种周标签但周不一样时才写，
 *   你自己在 D 列写的别的内容不动。下次在 App 里重新导入这张表时，D 列写了周的成语会回到原来的那一周。
 *   你在 App 里手动添加的、表格里还没有的新成语，会【加到 A 列最后一个成语的下面】（B 列同时放一个勾选框，并按 App 里有没有分配到周打勾）；
 *   一次最多加 30 个，再多就不加并在“同步状态”里提醒（可在脚本属性里加 MAX_IDIOM_ADDS 改）。
 * 只读：脚本只读取 GitHub，不会改动 App 里的任何数据。
 *
 * 自动同步：默认每周六、周日晚上 8 点左右各一次（一周最多两次）；随时可以点菜单“立即同步”。
 * 使用步骤见同目录的 README.md。整段复制到 扩展程序 → Apps Script，保存，刷新表格即可。
 */

var STATUS_TAB = '同步状态';
var MAX_IDIOM_ADDS = 30;       // 一次同步最多往成语标签页 A 列加几个新成语
var IDIOM_WEEK_COL = 4;       // D 列：这个成语学习的周
var IDIOM_STORY_COL = 5;      // E 列：这个成语的故事
var MAX_STORY_OVERWRITES = 50;   // 一次同步最多改写多少个“已经有内容、但和 App 里不一样”的 E 格
var IDIOM_TAB = '成语';         // 成语标签页的名字（A 列成语，B 列打勾）
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
    .addItem('查看自动同步是否开启', 'showAutoSyncStatus')
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
  return { repo: repo, token: token, first: p.getProperty('FIRST_WEEK') || '', maxDeletes: Number(p.getProperty('MAX_DELETES')) || MAX_DELETES, maxIdiomAdds: Number(p.getProperty('MAX_IDIOM_ADDS')) || MAX_IDIOM_ADDS, maxStoryOverwrites: Number(p.getProperty('MAX_STORY_OVERWRITES')) || MAX_STORY_OVERWRITES };
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

/**
 * 成语标签页：哪些行的 B 列要打勾。aValues = A 列（成语），bValues = B 列（true / false），used = {成语: true}（App 里已经分配到周的成语）。
 * 返回 { ticks: [行号…], already: 已经打了勾的个数, missing: [App 里有、表格 A 列里找不到的成语] }；只会要求【打勾】，不会取消。
 */
function idiomTicks_(aValues, bValues, used) {
  var out = { ticks: [], already: 0, missing: [] }, seen = {};
  for (var i = 0; i < aValues.length; i++) {
    var a = String(aValues[i] === undefined || aValues[i] === null ? '' : aValues[i]).replace(/\s+/g, '');
    if (!a) continue;
    seen[a] = true;
    if (!used[a]) continue;
    var b = bValues[i];
    if (b === true || String(b).toUpperCase() === 'TRUE') out.already++; else out.ticks.push(i + 1);
  }
  Object.keys(used).forEach(function (k) { if (!seen[k]) out.missing.push(k); });
  return out;
}
/** “第N周-日期”：N 从 anchor（App 里第一周）算起，和 App、孩子标签页 A 列的写法一样 */
function weekLabel_(start, anchor) {
  var diff = utcDay_(start) - utcDay_(anchor);
  var n = isNaN(diff) ? 1 : Math.round(diff / WEEK_MS) + 1;
  return '第' + n + '周-' + start;
}
/**
 * D 列要写什么：aValues = A 列（成语），dValues = D 列现在的内容，weekOf = {成语: 周日期}，anchor = App 里第一周的日期。
 * 只在 D 格是【空的】，或者里面是“带日期的周标签但日期不一样”时才写；你自己写的别的内容不动。
 * 返回 { writes: [[行号, 标签]], kept: 别的内容没动的个数 }
 */
function idiomWeekWrites_(aValues, dValues, weekOf, anchor) {
  var out = { writes: [], kept: 0 };
  for (var i = 0; i < aValues.length; i++) {
    var a = String(aValues[i] === undefined || aValues[i] === null ? '' : aValues[i]).replace(/\s+/g, '');
    var start = a && weekOf[a];
    if (!start) continue;
    var cur = String(dValues[i] === undefined || dValues[i] === null ? '' : dValues[i]).trim();
    if (!cur || (dateInLabel_(cur) && dateInLabel_(cur) !== start)) out.writes.push([i + 1, weekLabel_(start, anchor)]);
    else if (dateInLabel_(cur) !== start) out.kept++;
  }
  return out;
}
/**
 * E 列要写什么：App 里有故事的成语，E 格是空的、或者里面的内容和 App 里的故事不一样，就写成 App 里的故事（以 App 为准）。
 * App 里没有故事的成语不管（E 格不清空）。返回 { writes: [[行号, 故事, 是不是改写了原有内容]], same: 一样不用写的个数 }
 */
function idiomStoryWrites_(aValues, eValues, stories) {
  var out = { writes: [], same: 0 };
  for (var i = 0; i < aValues.length; i++) {
    var a = String(aValues[i] === undefined || aValues[i] === null ? '' : aValues[i]).replace(/\s+/g, '');
    var story = a && stories[a] ? String(stories[a]).trim() : '';
    if (!story) continue;
    var cur = String(eValues[i] === undefined || eValues[i] === null ? '' : eValues[i]).trim();
    if (cur === story) out.same++;
    else out.writes.push([i + 1, story, !!cur]);
  }
  return out;
}
/** App 里有、表格 A 列里还没有的成语（成语库 + 已分配到周的），按成语库的顺序；返回 [{idiom, tick: 是否分配到周}] */
function idiomAppends_(aValues, pool, used) {
  var have = {}, out = [], seen = {};
  aValues.forEach(function (v) { var a = String(v === undefined || v === null ? '' : v).replace(/\s+/g, ''); if (a) have[a] = true; });
  (pool || []).concat(Object.keys(used)).forEach(function (x) {
    if (!x || have[x] || seen[x]) return;
    seen[x] = true;
    out.push({ idiom: x, tick: !!used[x] });
  });
  return out;
}
/** 把 App 里已经分配到周的成语在 B 列打勾、在 D 列写上学习的周；再把表格里还没有的新成语加到 A 列最后一个成语的下面。返回一行说明 */
function syncIdioms_(ss, idiomsFile, maxAdds, startWeek, cfgMaxOver) {
  var sheet = findTab_(ss, IDIOM_TAB);
  if (!sheet) return '成语：表格里没有叫“' + IDIOM_TAB + '”的标签页，已跳过';
  if (!idiomsFile) return '成语：App 里还没有成语数据，已跳过';
  var used = {}, weekOf = {}, n = 0, earliest = '';
  (idiomsFile.weeks || []).forEach(function (w) {
    if (w.items && w.items.length && (!earliest || w.start < earliest)) earliest = w.start;
    (w.items || []).forEach(function (x) { if (!used[x]) { used[x] = true; weekOf[x] = w.start; n++; } });
  });
  var anchor = startWeek || earliest;
  var last = sheet.getLastRow();
  var a = last < 1 ? [] : sheet.getRange(1, 1, last, 1).getDisplayValues().map(function (r) { return r[0]; });
  var b = last < 1 ? [] : sheet.getRange(1, 2, last, 1).getValues().map(function (r) { return r[0]; });
  var d = last < 1 ? [] : sheet.getRange(1, IDIOM_WEEK_COL, last, 1).getDisplayValues().map(function (r) { return r[0]; });
  var e = last < 1 ? [] : sheet.getRange(1, IDIOM_STORY_COL, last, 1).getDisplayValues().map(function (r) { return r[0]; });
  var r = idiomTicks_(a, b, used);
  r.ticks.forEach(function (row) { sheet.getRange(row, 2).setValue(true); });
  var wk = idiomWeekWrites_(a, d, weekOf, anchor);
  wk.writes.forEach(function (w) { sheet.getRange(w[0], IDIOM_WEEK_COL).setValue(w[1]); });
  // 故事：以 App 为准。E 格是空的就写；里面是别的内容，就改成 App 里的故事（改写的个数有上限）
  var sw = idiomStoryWrites_(a, e, idiomsFile.stories || {});
  var storyWrites = sw.writes, overwrites = storyWrites.filter(function (w) { return w[2]; }).length, storyNote = '';
  if (overwrites > (cfgMaxOver || MAX_STORY_OVERWRITES)) {
    storyWrites = storyWrites.filter(function (w) { return !w[2]; });
    storyNote = '；有 ' + overwrites + ' 个 E 格里的内容和 App 里的故事不一样，超过一次最多改写 ' + (cfgMaxOver || MAX_STORY_OVERWRITES) + ' 个的安全上限，这次只写了空的 E 格（确认没问题的话，在脚本属性里加 MAX_STORY_OVERWRITES）';
    overwrites = 0;
  }
  storyWrites.forEach(function (w) { sheet.getRange(w[0], IDIOM_STORY_COL).setValue(w[1]); });
  // 新成语：加到 A 列最后一个成语的下面（不碰已有的格子；C 列留给表格自己的公式）
  var add = idiomAppends_(a, idiomsFile.pool, used), added = 0, storyAdded = 0, note = '';
  if (add.length > (maxAdds || MAX_IDIOM_ADDS)) {
    note = '；App 里有 ' + add.length + ' 个表格里没有的新成语，超过一次最多 ' + (maxAdds || MAX_IDIOM_ADDS) + ' 个的安全上限，这次没有加（确认没问题的话，在脚本属性里加 MAX_IDIOM_ADDS）';
  } else if (add.length) {
    var lastA = 0;
    a.forEach(function (v, i) { if (String(v).trim()) lastA = i + 1; });
    add.forEach(function (x, i) {
      var row = lastA + 1 + i;
      if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
      sheet.getRange(row, 1).setValue(x.idiom);
      var box = sheet.getRange(row, 2);
      if (typeof box.insertCheckboxes === 'function') box.insertCheckboxes();
      box.setValue(x.tick);
      if (x.tick && weekOf[x.idiom]) sheet.getRange(row, IDIOM_WEEK_COL).setValue(weekLabel_(weekOf[x.idiom], anchor));
      var story = (idiomsFile.stories || {})[x.idiom];
      if (story && String(story).trim()) { sheet.getRange(row, IDIOM_STORY_COL).setValue(story); storyAdded++; }
      added++;
    });
    note = '；新加到表格 A 列 ' + added + ' 个（' + add.slice(0, 6).map(function (x) { return x.idiom; }).join('、') + (add.length > 6 ? ' 等' : '') + '）';
  }
  return '成语：App 里分配了 ' + n + ' 个，新打勾 ' + r.ticks.length + ' 个，原来就有勾 ' + r.already + ' 个；D 列写入学习的周 ' + wk.writes.length + ' 个；E 列写入故事 ' + (storyWrites.length + storyAdded) + ' 个' + (overwrites ? '（其中改写原有内容 ' + overwrites + ' 个，以 App 为准）' : '') + storyNote + (wk.kept ? '（另有 ' + wk.kept + ' 个 D 格里是你自己写的内容，没有动）' : '') + note;
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
  try {
    lines.push(syncIdioms_(ss, ghGet_(cfg, 'idioms.json'), cfg.maxIdiomAdds, fallback, cfg.maxStoryOverwrites));
  } catch (e) {
    lines.push('成语：没有同步成功（' + e.message + '）');
  }
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

/** 自动同步现在开着吗：数一数名叫 syncAuto 的定时器，并告诉你最近一次同步是什么时候 */
function showAutoSyncStatus() {
  var ui = SpreadsheetApp.getUi();
  var n = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'syncAuto'; }).length;
  var last = '';
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STATUS_TAB);
    if (sheet && sheet.getLastRow() >= 2) {
      var v = sheet.getRange(1, 2, 2, 1).getDisplayValues();
      last = '\n\n最近一次同步：' + v[0][0] + '（' + v[1][0] + '）。详细情况看“' + STATUS_TAB + '”标签页。';
    }
  } catch (e) { /* 读不到状态页就不显示 */ }
  var days = SYNC_DAYS.map(function (d) { return '周' + dayName_(d); }).join('、');
  if (n > 0) ui.alert('自动同步：已开启', '现在有 ' + n + ' 个自动同步的定时器，按脚本里的设置：每' + days + '的晚上 ' + SYNC_HOUR + ' 点左右各同步一次。' + last + '\n\n也可以在 扩展程序 → Apps Script 左边的“触发器”（闹钟图标）里看到它们。', ui.ButtonSet.OK);
  else ui.alert('自动同步：没有开启', '现在没有自动同步的定时器。想开启：菜单 识字助手 → 3. 开启自动同步。' + last, ui.ButtonSet.OK);
}
