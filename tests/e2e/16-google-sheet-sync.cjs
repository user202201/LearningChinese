// The Google Sheets sync script (docs/google-sheet-sync/sync.gs), run against a PRETEND Google Sheet and a PRETEND GitHub.
// The user's real sheet already has its own automation (A = week label and L = running total are generated, B..K are typed by hand and checked for duplicates),
// so the script must ONLY FILL EMPTY CELLS of B..K in the right child's tab and week row: never delete, never overwrite, never touch A / L / formulas / formats.
// Every write is audited here. NOT proved: a real Google account (authorisation screens, the timer) — the user has to follow README.md once.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { checks } = require('./harness.cjs');
const { ok, done } = checks();
const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'docs/google-sheet-sync/sync.gs'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'docs/google-sheet-sync/README.md'), 'utf8');

function makeEnv({ files = {}, props = {}, status = {}, noUi = false, answers = [], tabs = {} } = {}) {
  const sheets = new Map();
  const log = { fetches: [], alerts: [], menus: [], writes: [], inserted: [] };
  class Sheet {
    constructor(name, rows = []) { this.name = name; this.grid = rows.map((r) => r.slice()); this.maxRows = Math.max(1000, rows.length); }
    getName() { return this.name; }
    cell(r, c) { const v = this.grid[r - 1]?.[c - 1]; return v === undefined ? '' : v; }
    getLastRow() { let last = 0; this.grid.forEach((row, i) => { if (row.some((v) => v !== '' && v !== undefined)) last = i + 1; }); return last; }
    getLastColumn() { let last = 0; this.grid.forEach((row) => row.forEach((v, j) => { if (v !== '' && v !== undefined) last = Math.max(last, j + 1); })); return last; }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(after, n) { log.inserted.push([this.name, after, n]); this.maxRows += n; }
    getRange(r, c, nr = 1, nc = 1) {
      const sh = this;
      if (r + nr - 1 > sh.maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      const write = (rr, cc, v) => { log.writes.push({ tab: sh.name, row: rr, col: cc, value: v, before: sh.cell(rr, cc) }); (sh.grid[rr - 1] ??= [])[cc - 1] = v; };
      return {
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.grid[r - 1 + i]) sh.grid[r - 1 + i][c - 1 + j] = ''; log.writes.push({ tab: sh.name, clear: true }); return this; },
        setValue(v) { write(r, c, v); return this; },
        setValues(v) { if (v.length !== nr || v.some((row) => row.length !== nc)) throw new Error('setValues size'); v.forEach((row, i) => row.forEach((x, j) => write(r + i, c + j, x))); return this; },
        getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.cell(r + i, c + j))); },
        getDisplayValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => String(sh.cell(r + i, c + j)))); },
      };
    }
  }
  for (const [n, rows] of Object.entries(tabs)) sheets.set(n, new Sheet(n, rows));
  const ss = { getSheetByName: (n) => sheets.get(n) || null, getSheets: () => [...sheets.values()], insertSheet: (n) => { const s = new Sheet(n); sheets.set(n, s); log.writes.push({ created: n }); return s; } };
  const propStore = new Map(Object.entries(props));
  const queue = [...answers];
  const ui = {
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK', CANCEL: 'CANCEL' },
    alert: (title, msg) => { log.alerts.push({ title, msg }); },
    prompt: () => { const a = queue.shift(); return { getSelectedButton: () => (a === null ? 'CANCEL' : 'OK'), getResponseText: () => a ?? '' }; },
    createMenu: (name) => { const m = { name, items: [] }; const chain = { addItem: (l, fn) => { m.items.push([l, fn]); return chain; }, addToUi: () => { log.menus.push(m); } }; return chain; },
  };
  const triggers = [{ fn: 'somethingElse', minutes: 60, id: 0 }]; let tid = 1;
  const ctx = {
    SpreadsheetApp: { getUi: () => { if (noUi) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); return ui; }, getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (propStore.has(k) ? propStore.get(k) : null), setProperties: (o) => Object.entries(o).forEach(([k, v]) => propStore.set(k, v)) }) },
    UrlFetchApp: { fetch: (url, o) => {
      const m = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/.exec(url);
      log.fetches.push({ method: (o.method || 'get').toLowerCase(), headers: o.headers, mute: o.muteHttpExceptions });
      const p = m && m[2].split('/').map(decodeURIComponent).join('/');
      const code = status[p] ?? status['*'] ?? (m && p in files ? 200 : 404);
      return { getResponseCode: () => code, getContentText: () => JSON.stringify(files[p]) };
    } },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.fn, id: t.id })),
      deleteTrigger: (t) => { const i = triggers.findIndex((x) => x.id === t.id); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => triggers.push({ fn, minutes: n, id: tid++ }) }) }) }),
    },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 19).replace('T', ' ') },
    Session: { getScriptTimeZone: () => 'UTC' },
  };
  vm.createContext(ctx); vm.runInContext(SCRIPT, ctx, { filename: 'sync.gs' });
  return { ctx, sheets, log, triggers, props: propStore, run: (fn) => ctx[fn]() };
}
const C = (s) => Array.from(s);
const W1 = '假辣酸贫纺炒缸锅烛扇', W2 = '鼓旧富言忙桶炉锤泉溪', W3 = '波坡板炭镜锁帆筐犁耙';
/** a row of the user's sheet: A = week label, B..K = characters (typed by hand), L = running total */
const trow = (label, cs, total) => [label, ...C(cs), ...Array(10 - C(cs).length).fill(''), total];
const userSheet = () => [trow('第1周-2026-10-25', W1, 10), trow('第2周-2026-11-01', W2, 20), trow('第3周-2026-11-08', W3, 30)];
const REPO = { GITHUB_REPO: 'someone/LearningData', GITHUB_TOKEN: 'github_pat_readonly' };
const kidsJson = (names, startWeek = '2026-10-25') => ({ kids: names.map((n) => ({ id: 'k' + n.toLowerCase(), name: n })), startWeek });
const weeks = (...ws) => ({ weeks: ws.map(([start, cs]) => ({ start, chars: C(cs) })) });
/** the audit: every write must be a single cell in B..K, into a cell that was empty before */
const auditOk = (log) => log.writes.filter((w) => w.tab && w.tab !== '同步状态').every((w) => !w.clear && w.col >= 2 && w.col <= 11 && String(w.before).trim() === '');

(async () => {
  const E = makeEnv();
  // ---------- finding the row
  ok(E.ctx.dateInLabel_('第3周-2026-11-08') === '2026-11-08' && E.ctx.dateInLabel_('2026/11/8') === '2026-11-08' && E.ctx.dateInLabel_('abc') === '' && E.ctx.dateInLabel_('2026-13-45') === '' && E.ctx.dateInLabel_('') === '' && E.ctx.dateInLabel_(undefined) === '', 'the date is read out of the week label in column A (also 2026/11/8; nonsense gives nothing)');
  let map = E.ctx.rowMap_(['第1周-2026-10-25', '第2周-2026-11-01'], '');
  ok(map.row0 === 1 && map.date0 === '2026-10-25' && map.from === 'sheet', 'the sheet\'s own first label is the reference (row 1 = 2026-10-25)');
  map = E.ctx.rowMap_(['', '', '第1周-2026-10-25'], '2030-01-06');
  ok(map.row0 === 3 && map.date0 === '2026-10-25', 'a sheet whose first label is in row 3: the reference is row 3, not row 1 (and not the fallback)');
  ok(E.ctx.rowMap_(['', ''], '2026-10-25').from === 'fallback' && E.ctx.rowMap_([], '') === null, 'no labels at all: the first week of the app is row 1; nothing to go by: no map');
  const L3 = ['第1周-2026-10-25', '第2周-2026-11-01', '第3周-2026-11-08'];
  map = { row0: 1, date0: '2026-10-25' };
  ok(E.ctx.rowForWeek_(map, L3, '2026-11-08').row === 3 && E.ctx.rowForWeek_(map, L3, '2026-10-25').row === 1 && E.ctx.rowForWeek_(map, L3, '2026-11-15').row === 4, 'week -> row: the date 2026-11-08 is row 3, the next week (no label yet) is row 4');
  ok(E.ctx.rowForWeek_(map, L3, '2026-10-18').skip.includes('之前') && E.ctx.rowForWeek_(map, L3, '2026-10-26').skip.includes('对不上'), 'a week before the first row, or not on the sheet\'s weekly rhythm: skipped with a reason');
  ok(E.ctx.rowForWeek_(map, ['', '', '第3周-2026-11-15'], '2026-11-08').skip.includes('对不上'), 'a row whose label says another week: not filled');
  map = { row0: 3, date0: '2026-10-25' };
  ok(E.ctx.rowForWeek_(map, [], '2026-10-25').row === 3 && E.ctx.rowForWeek_(map, [], '2026-10-18').row === 2 && E.ctx.rowForWeek_(map, [], '2026-10-04').skip, 'a reference in row 3: the weeks before it have rows 2 and 1, earlier ones have none');

  // ---------- placing characters
  let p = E.ctx.placeChars_(['假', '', '酸', '', '', '', '', '', '', ''], C('假辣酸贫'));
  ok(JSON.stringify(p.fills) === '[[1,"辣"],[3,"贫"]]' && p.present === 2 && p.noRoom.length === 0, 'characters already in the row are not put in again; new ones take the empty cells, left to right');
  p = E.ctx.placeChars_(C(W1), C('甲乙'));
  ok(p.fills.length === 0 && p.noRoom.join('') === '甲乙', 'a full row: nothing is overwritten, the characters that do not fit are reported');
  p = E.ctx.placeChars_(['', ' ', '', '', '', '', '', '', '', ''], C('一二三四五六七八九十甲'));
  ok(p.fills.length === 10 && p.noRoom.join('') === '甲' && p.fills[1][0] === 1, 'a cell with only a space counts as empty; 11 characters into an empty row: 10 fit, 1 does not');
  ok(E.ctx.placeChars_(['', '', '', '', '', '', '', '', '', ''], C('一一二')).fills.length === 2, 'the same character twice is entered once');

  // ---------- a whole sync against the user's kind of sheet
  const FILES = { 'kids.json': kidsJson(['Dory', 'Leo', 'Antoine']), 'kids/kdory.json': weeks(['2026-10-25', W1], ['2026-11-01', W2], ['2026-11-08', W3], ['2026-11-15', '一二三四五六']),
    'kids/kleo.json': weeks(['2026-10-25', '春夏秋冬']), 'kids/kantoine.json': weeks(['2026-11-01', '天地人']) };
  let e = makeEnv({ files: FILES, props: REPO, tabs: { Dory: userSheet(), Leo: [['第1周-2026-10-25', '', '', '', '', '', '', '', '', '', '', 0]], Antoine: [] } });
  const before = JSON.stringify([...e.sheets].map(([n, s]) => [n, s.grid]));
  e.run('syncNow');
  const dory = e.sheets.get('Dory');
  ok(e.log.alerts[0].title === '同步完成' && e.log.alerts[0].msg.includes('Dory'), 'the menu "sync now" tells what it did');
  ok(JSON.stringify(dory.grid.slice(0, 3)) === JSON.stringify(userSheet()), 'Dory rows 1 - 3 (all there already, typed by hand): not a single cell changed');
  ok(dory.grid[3].slice(1, 7).join('') === '一二三四五六' && dory.cell(4, 1) === '' && dory.cell(4, 12) === '', 'the new week 2026-11-15 goes to row 4, B..G; A4 and L4 are left empty for the sheet\'s own formulas');
  ok(e.sheets.get('Leo').grid[0].slice(1, 5).join('') === '春夏秋冬' && e.sheets.get('Leo').cell(1, 1) === '第1周-2026-10-25' && e.sheets.get('Leo').cell(1, 12) === 0, "Leo: the characters fill B..E of the row of that week; his A1 and L1 are untouched");
  ok(e.sheets.get('Antoine').cell(2, 2) === '天' && e.sheets.get('Antoine').cell(1, 1) === '', "Antoine's tab has no labels: the app's first week (2026-10-25) is row 1, so 2026-11-01 is row 2");
  ok(auditOk(e.log), 'AUDIT: every write is one cell of B..K that was empty before (nothing overwritten, nothing in A or L, no clearing): ' + e.log.writes.filter((w) => w.tab && w.tab !== '同步状态').length + ' writes');
  ok(!e.log.writes.some((w) => w.created && w.created !== '同步状态'), 'no tab is created except the status tab');
  const st = e.sheets.get('同步状态');
  ok(st.cell(2, 2) === '成功' && st.cell(3, 2).includes('新填入') && /Dory：新填入 6 个字，已有 30 个/.test(st.cell(4, 2)), 'the status tab: time, "success", and per child how many were added / already there (Dory: 6 / 30)');
  ok(e.log.fetches.length === 4 && e.log.fetches.every((f) => f.method === 'get'), 'GitHub is asked 4 times, only to READ');

  // ---------- again: nothing more to do
  e.log.writes.length = 0; e.run('syncAuto');
  ok(e.log.writes.filter((w) => w.tab !== '同步状态').length === 0, 'syncing again changes nothing (no cell is written twice)');
  ok(/新填入 0 个字/.test(e.sheets.get('同步状态').cell(3, 2)), 'and the status says 0 added');

  // ---------- the user's own entries are respected
  e = makeEnv({ files: { 'kids.json': kidsJson(['Dory']), 'kids/kdory.json': weeks(['2026-10-25', W1], ['2026-11-01', W2]) }, props: REPO,
    tabs: { Dory: [trow('第1周-2026-10-25', '假辣酸贫纺', 5), [ '第2周-2026-11-01', '鼓', '旧', '', '', '', '', '', '', '', '', 7]] } });
  e.run('syncAuto');
  const d2 = e.sheets.get('Dory');
  ok(d2.grid[0].slice(1, 6).join('') === '假辣酸贫纺' && d2.grid[0].slice(6, 11).join('') === '炒缸锅烛扇', 'a row typed halfway by hand (5 of 10): the app\'s other 5 go into the empty cells after them, the typed ones stay');
  ok(d2.cell(2, 2) === '鼓' && d2.cell(2, 3) === '旧' && d2.grid[1].slice(3, 11).join('') === '富言忙桶炉锤泉溪', 'row 2: 鼓 and 旧 were typed already and are not repeated; the remaining 8 fill the empty cells');
  ok(d2.cell(1, 12) === 5 && d2.cell(2, 12) === 7 && auditOk(e.log), 'the running totals in L are not touched (the sheet recalculates them itself); audit passes');
  // characters typed by hand that the app does not know, and a character deleted in the app: nothing is taken away
  e = makeEnv({ files: { 'kids.json': kidsJson(['Dory']), 'kids/kdory.json': weeks(['2026-10-25', '假辣']) }, props: REPO, tabs: { Dory: [trow('第1周-2026-10-25', '假辣酸贫纺', 5)] } });
  e.run('syncAuto');
  ok(e.sheets.get('Dory').grid[0].slice(1, 6).join('') === '假辣酸贫纺' && e.log.writes.filter((w) => w.tab === 'Dory').length === 0, 'characters typed by hand that the app does not have, or deleted in the app (manage mode), stay in the sheet: nothing is ever removed');

  // ---------- awkward cases
  e = makeEnv({ files: { 'kids.json': kidsJson(['Dory', 'Mia']), 'kids/kdory.json': weeks(['2026-10-25', '假辣']), 'kids/kmia.json': weeks(['2026-10-25', '猫狗']) }, props: REPO, tabs: { dory: [trow('第1周-2026-10-25', '', 0)] } });
  e.run('syncNow');
  ok(e.sheets.get('dory').cell(1, 2) === '假' && !e.sheets.has('Mia') && e.log.alerts[0].msg.includes('没有叫“Mia”的标签页'), 'a tab named "dory" is found for "Dory" (case ignored); a child without a tab is skipped and named in the message, no tab is made');
  e = makeEnv({ files: { 'kids.json': kidsJson(['Dory'], '2026-10-25'), 'kids/kdory.json': weeks(['2026-10-25', '甲'], ['2026-11-22', '乙丙']) }, props: REPO, tabs: { Dory: [['第1周-2026-10-25'], ['第2周-2026-11-01'], ['第3周-2026-11-08']] } });
  e.sheets.get('Dory').maxRows = 3;
  e.run('syncAuto');
  ok(e.log.inserted.length === 1 && e.sheets.get('Dory').cell(5, 2) === '乙' && e.sheets.get('Dory').cell(5, 3) === '丙', 'a week below the last row of the tab: rows are added, then filled (no error)');
  e = makeEnv({ files: { 'kids.json': kidsJson(['Dory']), 'kids/kdory.json': weeks(['2026-10-18', '甲乙'], ['2026-10-25', '丙']) }, props: REPO, tabs: { Dory: [['第1周-2026-10-25']] } });
  e.run('syncNow');
  ok(e.sheets.get('Dory').cell(1, 2) === '丙' && e.log.alerts[0].msg.includes('之前'), 'a week before the first row of the sheet is skipped with a reason, the others are filled');
  e = makeEnv({ files: { 'kids.json': kidsJson(['Dory']), 'kids/kdory.json': weeks(['2026-10-25', W1 + '甲']) }, props: REPO, tabs: { Dory: [trow('第1周-2026-10-25', W1, 10)] } });
  e.run('syncNow');
  ok(e.sheets.get('Dory').cell(1, 12) === 10 && e.log.writes.filter((w) => w.tab === 'Dory').length === 0 && e.log.alerts[0].msg.includes('放不下：甲'), 'an 11th character for a full row is reported ("does not fit") and nothing else happens');
  e = makeEnv({ files: { 'kids.json': { kids: [{ id: 'kdory', name: 'Dory' }] }, 'kids/kdory.json': weeks(['2026-11-08', '甲']) }, props: { ...REPO, FIRST_WEEK: '2026-10-25' }, tabs: { Dory: [] } });
  e.run('syncAuto');
  ok(e.sheets.get('Dory').cell(3, 2) === '甲', 'an empty tab and a FIRST_WEEK setting: row 1 is that week');
  e = makeEnv({ files: { 'kids.json': kidsJson(['Dory']), 'kids/kdory.json': { weeks: [] } }, props: REPO, tabs: { Dory: userSheet() } });
  e.run('syncAuto');
  ok(e.log.writes.filter((w) => w.tab === 'Dory').length === 0, 'a child without any characters yet: nothing to do');

  // ---------- no screen (the timer), errors explained
  const t3 = makeEnv({ files: FILES, props: REPO, tabs: { Dory: userSheet() }, noUi: true });
  let threw = false; try { t3.run('syncAuto'); } catch { threw = true; }
  ok(!threw && t3.sheets.get('同步状态').cell(2, 2) === '成功', 'syncAuto works without a screen (as when started by the timer)');
  const err = (opts, fn = 'syncNow') => { const x = makeEnv(opts); x.run(fn); return x; };
  let x = err({ files: FILES, props: { ...REPO, GITHUB_TOKEN: 'bad' }, status: { '*': 401 } });
  ok(x.log.alerts[0].title === '同步没有成功' && x.log.alerts[0].msg.includes('令牌无效') && x.sheets.get('同步状态').cell(2, 2) === '失败', 'a bad token (401): an explanation; the status tab says it failed');
  x = err({ files: FILES, props: REPO, status: { 'kids.json': 403 } });
  ok(x.log.alerts[0].msg.includes('403') && x.log.alerts[0].msg.includes('Contents'), '403: says the token has no read access');
  x = err({ files: FILES, props: REPO, status: { '*': 500 } });
  ok(x.log.alerts[0].msg.includes('500'), 'another problem at GitHub (500): shown');
  x = err({ files: {}, props: REPO });
  ok(x.log.alerts[0].msg.includes('kids.json'), 'no data in the repository yet: says to add children and characters in the app first');
  x = err({ files: FILES });
  ok(x.log.alerts[0].msg.includes('设置 GitHub 连接'), 'no connection set yet: says where to set it');
  x = err({ files: {}, props: { ...REPO, GITHUB_TOKEN: 'bad' }, status: { '*': 401 } }, 'syncAuto');
  ok(x.sheets.get('同步状态').cell(2, 2) === '失败' && x.sheets.get('同步状态').cell(3, 2).includes('401'), 'the timer version writes the problem into the status tab');
  ok(x.log.writes.filter((w) => w.tab && w.tab !== '同步状态').length === 0, 'an error never writes into a child tab');

  // ---------- setting up the connection (the menu)
  let s = makeEnv({ files: { 'kids.json': kidsJson(['Dory', 'Leo']) }, answers: ['https://github.com/someone/LearningData/', '  github_pat_abc  '] });
  s.run('setupConnection');
  ok(s.props.get('GITHUB_REPO') === 'someone/LearningData' && s.props.get('GITHUB_TOKEN') === 'github_pat_abc' && s.log.alerts[0].title === '连接成功' && s.log.alerts[0].msg.includes('Dory、Leo'), 'the repository (a pasted link is cleaned up) and the token are stored; the children found are listed');
  s = makeEnv({ files: FILES, answers: ['not a repo', 'x'] }); s.run('setupConnection');
  ok(s.log.alerts[0].title === '仓库格式不对' && !s.props.has('GITHUB_REPO'), 'a wrong repository name is refused with an example');
  s = makeEnv({ files: FILES, answers: [null] }); s.run('setupConnection');
  ok(s.log.alerts.length === 0 && !s.props.has('GITHUB_TOKEN'), 'cancelling stores nothing and says nothing');
  s = makeEnv({ files: FILES, status: { '*': 401 }, answers: ['a/b', 'tok'] }); s.run('setupConnection');
  ok(s.log.alerts[0].title === '连接没有成功' && s.log.alerts[0].msg.includes('401'), 'a token that does not work is reported right away');

  // ---------- the auto-sync switch
  const t = makeEnv({ files: FILES });
  t.run('enableAutoSync'); t.run('enableAutoSync');
  ok(t.triggers.filter((y) => y.fn === 'syncAuto').length === 1 && t.triggers.find((y) => y.fn === 'syncAuto').minutes === 10 && t.triggers.some((y) => y.fn === 'somethingElse'), 'switching it on (even twice) leaves exactly one timer, every 10 minutes; other timers are not touched');
  t.run('disableAutoSync');
  ok(t.triggers.filter((y) => y.fn === 'syncAuto').length === 0 && t.triggers.some((y) => y.fn === 'somethingElse'), 'switching it off removes only ours');

  // ---------- the script text, the menu, the guide
  ok(!/\.clear\(|deleteRow|deleteColumn|deleteSheet|removeSheet|setFormula|setBackground|setNumberFormat|setFontColor/.test(SCRIPT) && (SCRIPT.match(/clearContent\(\)/g) || []).length === 1 && (SCRIPT.match(/setValues\(/g) || []).length === 1, 'the script text: nothing that deletes or reformats; clearContent / setValues appear once each, only for the status tab');
  ok(!/method:\s*'(put|post|delete|patch)'/i.test(SCRIPT), 'and no write request to GitHub');
  const mm = makeEnv(); mm.run('onOpen');
  ok(mm.log.menus[0].name === '识字助手' && mm.log.menus[0].items.map((i) => i[0]).join('|') === '1. 设置 GitHub 连接|2. 立即同步|3. 开启自动同步（每 10 分钟）|关闭自动同步' && mm.log.menus[0].items.every(([, fn]) => typeof mm.ctx[fn] === 'function'), 'the menu "识字助手" with its four items, each calling a function that exists');
  ok(mm.log.menus[0].items.every(([label]) => README.includes(label)), 'README.md uses the exact menu names');
  ok(['github_pat_', 'EVERY_MINUTES', 'FIRST_WEEK', '同步状态', 'Contents', '只读', '空格', 'A 列', 'L 列'].every((k) => README.includes(k)), 'README.md covers: the read-only token, only empty cells, A / L untouched, the status tab, FIRST_WEEK, the interval');
  ok(!/整页重写|整页由脚本管理|会被覆盖/.test(README), 'README.md no longer says that tabs are rewritten');
  ok(!/user202201|@ptc|zdeng/i.test(SCRIPT + README) && !/github_pat_[A-Za-z0-9_]{20,}/.test(SCRIPT + README), 'no personal data and no real token in these files (public repository)');
  await done();
})();
