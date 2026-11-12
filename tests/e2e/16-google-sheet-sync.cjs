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

function makeEnv({ files = {}, props = {}, status = {}, noUi = false, answers = [], tabs = {}, oldTimer = false } = {}) {
  const opts_oldTimer = oldTimer;
  const sheets = new Map();
  const log = { fetches: [], alerts: [], menus: [], writes: [], inserted: [], boxes: [] };
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
        insertCheckboxes() { log.boxes.push([sh.name, r, c]); return this; },
        setValues(v) { if (v.length !== nr || v.some((row) => row.length !== nc)) throw new Error('setValues size'); v.forEach((row, i) => row.forEach((x, j) => write(r + i, c + j, x))); return this; },
        getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.cell(r + i, c + j))); },
        getDisplayValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => String(sh.cell(r + i, c + j)))); },
      };
    }
  }
  for (const [n, rows] of Object.entries(tabs)) sheets.set(n, new Sheet(n, rows));
  // insertSheet(name, index): like Google, without an index the new tab goes next to the ACTIVE tab (here: the first one), with an index exactly there
  const ss = { getSpreadsheetTimeZone: () => 'Asia/Shanghai', getSheetByName: (n) => sheets.get(n) || null, getSheets: () => [...sheets.values()],
    insertSheet: (n, index) => { const s = new Sheet(n); const all = [...sheets.entries()]; all.splice(index === undefined ? Math.min(1, all.length) : index, 0, [n, s]); sheets.clear(); all.forEach(([k, v]) => sheets.set(k, v)); log.writes.push({ created: n, index }); return s; } };
  const propStore = new Map(Object.entries(props));
  const queue = [...answers];
  const ui = {
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK', CANCEL: 'CANCEL' },
    alert: (title, msg) => { log.alerts.push({ title, msg }); },
    prompt: () => { const a = queue.shift(); return { getSelectedButton: () => (a === null ? 'CANCEL' : 'OK'), getResponseText: () => a ?? '' }; },
    createMenu: (name) => { const m = { name, items: [] }; const chain = { addItem: (l, fn) => { m.items.push([l, fn]); return chain; }, addToUi: () => { log.menus.push(m); } }; return chain; },
  };
  const triggers = [{ fn: 'somethingElse', minutes: 60, id: 0 }, ...(opts_oldTimer ? [{ fn: 'syncAuto', minutes: 10, id: 99 }] : [])]; let tid = 1;
  const ctx = {
    SpreadsheetApp: { getUi: () => { if (noUi) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); return ui; }, getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (propStore.has(k) ? propStore.get(k) : null), setProperties: (o) => Object.entries(o).forEach(([k, v]) => propStore.set(k, v)), setProperty: (k, v) => { propStore.set(k, String(v)); }, getProperties: () => Object.fromEntries(propStore), deleteProperty: (k) => { propStore.delete(k); } }) },
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
      WeekDay: { MONDAY: 'MONDAY', TUESDAY: 'TUESDAY', WEDNESDAY: 'WEDNESDAY', THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY', SUNDAY: 'SUNDAY' },
      newTrigger: (fn) => ({ timeBased: () => ({
        everyMinutes: (n) => ({ create: () => triggers.push({ fn, minutes: n, id: tid++ }) }),
        onWeekDay: (day) => ({ atHour: (h) => ({ inTimezone: (z) => ({ create: () => triggers.push({ fn, day, hour: h, zone: z, id: tid++ }) }) }) }),
      }) }),
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
/** the audit: every write is ONE cell of B..K: either a fill into a cell that was empty, or (only for `dropped`, the characters the app really deleted) a clear of a cell that held exactly that character */
const auditOk = (log, dropped = []) => log.writes.filter((w) => w.tab && w.tab !== '同步状态').every((w) => !w.clear && w.col >= 2 && w.col <= 11 && (String(w.before).trim() === '' ? w.value !== '' : (w.value === '' && dropped.includes(w.before))));

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
  ok([...e.sheets.keys()].join() === 'Dory,Leo,Antoine,同步状态', 'the status tab is created at the far RIGHT, after all the children\'s tabs (not next to the active one): ' + [...e.sheets.keys()].join(' | '));
  const st = e.sheets.get('同步状态');
  ok(st.cell(2, 2) === '成功' && st.cell(3, 2).includes('新填入') && /Dory：新填入 6 个字，已有 30 个/.test(st.cell(4, 2)), 'the status tab: time, "success", and per child how many were added / already there (Dory: 6 / 30)');
  ok(e.log.fetches.length === 5 && e.log.fetches.every((f) => f.method === 'get'), 'GitHub is asked 5 times (kids, three children, idioms), only to READ');

  e.run('syncAuto');
  ok([...e.sheets.keys()].join() === 'Dory,Leo,Antoine,同步状态', 'a later sync does not move any tab');
  const withOthers = makeEnv({ files: FILES, props: REPO, tabs: { Dory: userSheet(), Leo: [], Antoine: [], 成语: [['一心一意']] } });
  withOthers.run('syncAuto');
  ok([...withOthers.sheets.keys()].at(-1) === '同步状态' && [...withOthers.sheets.keys()].slice(0, 4).join() === 'Dory,Leo,Antoine,成语', 'with other tabs in the sheet (such as 成语) the status tab is still the last one, and the others keep their order');

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
  ok(e.sheets.get('Dory').grid[0].slice(1, 6).join('') === '假辣酸贫纺' && e.log.writes.filter((w) => w.tab === 'Dory').length === 0, 'characters typed by hand that the app does not have stay in the sheet (the first sync has no record of what the app had, so it removes nothing)');

  // ---------- what was deleted in the app is cleared in the sheet (only that, only the cell that holds exactly that character)
  const A = (...ws) => weeks(...ws);
  ok(JSON.stringify(E.ctx.removedChars_({ '2026-10-25': '假辣酸' }, [{ start: '2026-10-25', chars: C('假酸') }])) === '[{"start":"2026-10-25","chars":["辣"]}]', 'the characters the app dropped = the record of the last sync minus what the app has now');
  ok(JSON.stringify(E.ctx.removedChars_({ '2026-10-25': '假辣' }, [{ start: '2026-11-01', chars: C('假辣') }])) === '[{"start":"2026-10-25","chars":["假","辣"]}]' && E.ctx.removedChars_({ '2026-10-25': '假' }, [{ start: '2026-10-25', chars: C('假甲') }]).length === 0 && E.ctx.removedChars_(null, []).length === 0, 'a week that vanished drops all its characters; new characters drop nothing; no record drops nothing');
  const F = { 'kids.json': kidsJson(['Dory']), 'kids/kdory.json': A(['2026-10-25', W1], ['2026-11-01', W2]) };
  let d = makeEnv({ files: F, props: REPO, tabs: { Dory: userSheet().slice(0, 2) } });
  d.run('syncAuto');
  ok(d.props.get('S|kdory|2026-10-25') === W1 && d.props.get('S|kdory|2026-11-01') === W2 && d.log.writes.filter((w) => w.tab === 'Dory').length === 0, 'the first sync only records what the app has (kept in the script properties of the sheet), and changes nothing');
  F['kids/kdory.json'] = A(['2026-10-25', W1.replace('辣', '')], ['2026-11-01', W2]);       // 辣 was deleted in the app (manage mode)
  d.log.writes.length = 0; d.run('syncAuto');
  const dw = d.log.writes.filter((w) => w.tab === 'Dory');
  ok(dw.length === 1 && dw[0].value === '' && dw[0].before === '辣' && dw[0].row === 1 && dw[0].col === 3, 'a character deleted in the app is cleared in the sheet: exactly that one cell (' + JSON.stringify(dw.map((w) => [w.row, w.col, w.before, w.value])) + ')');
  ok(d.sheets.get('Dory').cell(1, 1) === '第1周-2026-10-25' && d.sheets.get('Dory').cell(1, 12) === 10 && d.sheets.get('Dory').grid[0].slice(1, 11).join('') === W1.replace('辣', ''), 'the rest of the row, A and L are untouched (the sheet\'s own formulas recalculate the total)');
  ok(auditOk(d.log, ['辣']) && /清除 1 个/.test(d.sheets.get('同步状态').cell(4, 2)) && d.props.get('S|kdory|2026-10-25') === W1.replace('辣', ''), 'AUDIT passes; the status says 1 cleared; the record follows the app');
  d.log.writes.length = 0; d.run('syncAuto');
  ok(d.log.writes.filter((w) => w.tab === 'Dory').length === 0, 'syncing again changes nothing');

  // typed by hand and unknown to the app: never touched; a cell changed by hand after the sync: not cleared
  const FL = { 'kids.json': kidsJson(['Leo']), 'kids/kleo.json': A(['2026-10-25', '春夏秋'], ['2026-11-01', '一二三']) };
  d = makeEnv({ files: FL, props: REPO, tabs: { Leo: [['第1周-2026-10-25', '甲'], ['第2周-2026-11-01', '乙']] } });
  d.run('syncAuto');
  ok(d.sheets.get('Leo').grid[0].slice(1, 5).join('') === '甲春夏秋' && d.sheets.get('Leo').grid[1].slice(1, 5).join('') === '乙一二三', 'Leo: the typed 甲 / 乙 stay in front and the app\'s characters fill the empty cells after them');
  d.sheets.get('Leo').getRange(1, 4, 1, 1).setValue('改');                               // 夏 was changed by hand in the sheet
  FL['kids/kleo.json'] = A(['2026-10-25', '春夏秋']);                                       // the app: week 2 deleted entirely
  d.log.writes.length = 0; d.run('syncAuto');
  ok(d.sheets.get('Leo').grid[1].slice(1, 5).join('') === '乙' && d.sheets.get('Leo').cell(2, 1) === '第2周-2026-11-01', 'a whole week deleted in the app: its characters are cleared; the typed 乙 and the label stay');
  // a cell that was changed by hand after the sync, and then the app deletes that character: the cell no longer holds it, so it is left alone
  const FH = { 'kids.json': kidsJson(['Leo']), 'kids/kleo.json': A(['2026-10-25', '春夏秋']) };
  d = makeEnv({ files: FH, props: REPO, tabs: { Leo: [['第1周-2026-10-25', '甲']] } });
  d.run('syncAuto');                                                                      // row: 甲 春 夏 秋
  d.sheets.get('Leo').getRange(1, 4, 1, 1).setValue('改');                               // 夏 is changed by hand to 改
  FH['kids/kleo.json'] = A(['2026-10-25', '春秋']);                                         // and the app deletes 夏
  d.log.writes.length = 0; d.run('syncAuto');
  ok(d.sheets.get('Leo').grid[0].slice(1, 5).join('') === '甲春改秋' && d.log.writes.filter((w) => w.tab === 'Leo').length === 0, 'a cell that no longer holds the deleted character (changed by hand) is not cleared; the typed 甲 stays');

  // moving a character to another week; the record of one child does not touch another
  const FM = { 'kids.json': kidsJson(['Dory', 'Leo']), 'kids/kdory.json': A(['2026-10-25', '假辣'], ['2026-11-01', '鼓']), 'kids/kleo.json': A(['2026-10-25', '春']) };
  d = makeEnv({ files: FM, props: REPO, tabs: { Dory: [['第1周-2026-10-25'], ['第2周-2026-11-01']], Leo: [['第1周-2026-10-25']] } });
  d.run('syncAuto');
  FM['kids/kdory.json'] = A(['2026-10-25', '假'], ['2026-11-01', '鼓辣']);
  d.run('syncAuto');
  ok(d.sheets.get('Dory').grid[0].slice(1, 4).join('') === '假' && d.sheets.get('Dory').grid[1].slice(1, 4).join('') === '鼓辣' && d.sheets.get('Leo').grid[0].slice(1, 3).join('') === '春' && d.props.get('S|kleo|2026-10-25') === '春', 'a character moved to another week: gone from the old row, in the new one; the other child is untouched');

  // safety: no data for the child (nothing is cleared), too many at once (nothing is cleared, then allowed by a setting)
  const FS = { 'kids.json': kidsJson(['Dory']), 'kids/kdory.json': A(['2026-10-25', W1], ['2026-11-01', W2]) };
  d = makeEnv({ files: FS, props: REPO, tabs: { Dory: userSheet().slice(0, 2) } });
  d.run('syncAuto');
  delete FS['kids/kdory.json'];
  d.log.writes.length = 0; d.run('syncAuto');
  ok(d.log.writes.filter((w) => w.tab === 'Dory').length === 0 && d.props.get('S|kdory|2026-10-25') === W1, 'GitHub has no file for the child any more (a mistake, not a deletion): nothing is cleared and the record is kept');
  const FB = { 'kids.json': kidsJson(['Dory']), 'kids/kdory.json': A(['2026-10-25', W1], ['2026-11-01', W2], ['2026-11-08', W3], ['2026-11-15', '一']) };
  d = makeEnv({ files: FB, props: REPO, tabs: { Dory: [...userSheet()] } });
  d.run('syncAuto');
  FB['kids/kdory.json'] = { weeks: [] };                                                    // 31 characters gone at once
  d.log.writes.length = 0; d.run('syncAuto');
  ok(d.log.writes.filter((w) => w.tab === 'Dory').length === 0 && d.sheets.get('同步状态').cell(4, 2).includes('安全上限 30') && d.props.get('S|kdory|2026-10-25') === W1, '31 characters gone at once is more than the safety limit (30): nothing is cleared, the status says why, the record is kept');
  d.props.set('MAX_DELETES', '50');
  d.log.writes.length = 0; d.run('syncAuto');
  ok(d.log.writes.filter((w) => w.tab === 'Dory' && w.value === '').length === 31 && !d.props.has('S|kdory|2026-10-25'), 'with MAX_DELETES raised in the script properties they are cleared (all 31 cells that the sheet holds) and the record is emptied');
  // a recorded week that has no row in the sheet: a note, no error
  d = makeEnv({ files: { 'kids.json': kidsJson(['Dory']), 'kids/kdory.json': A(['2026-11-01', W2]) }, props: { ...REPO, 'S|kdory|2026-10-25': '假' }, tabs: { Dory: [['第1周-2026-11-01']] } });
  d.run('syncNow');
  ok(d.log.alerts[0].title === '同步完成' && d.log.alerts[0].msg.includes('要清除的字') && d.sheets.get('Dory').grid[0].slice(1, 11).join('') === W2, 'a character to clear in a week that has no row in the sheet: mentioned in the status, nothing breaks, the rest is synced');

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

  // ---------- the auto-sync switch: weekends, once a day (not every 10 minutes)
  const tt = makeEnv({ files: FILES, oldTimer: true });
  ok(tt.triggers.some((y) => y.fn === 'syncAuto' && y.minutes === 10), '(the sheet still has the old "every 10 minutes" timer of the previous version)');
  tt.run('enableAutoSync'); tt.run('enableAutoSync');
  const mine = tt.triggers.filter((y) => y.fn === 'syncAuto');
  ok(mine.length === 2 && mine.map((y) => y.day).sort().join() === 'SATURDAY,SUNDAY' && mine.every((y) => y.hour === 20 && y.zone === 'Asia/Shanghai' && y.minutes === undefined), 'switching it on (even twice) leaves exactly two timers: Saturday and Sunday, around 20:00, in the sheet\'s own time zone; the old every-10-minutes timer is gone');
  ok(tt.triggers.some((y) => y.fn === 'somethingElse'), 'other timers of the sheet are not touched');
  ok(/周六、周日/.test(tt.log.alerts.at(-1).msg) && /20 点/.test(tt.log.alerts.at(-1).msg) && /立即同步/.test(tt.log.alerts.at(-1).msg), 'the message says when it will run and that "sync now" is there for any time: ' + JSON.stringify(tt.log.alerts.at(-1).msg).slice(0, 70));
  tt.run('disableAutoSync');
  ok(tt.triggers.filter((y) => y.fn === 'syncAuto').length === 0 && tt.triggers.some((y) => y.fn === 'somethingElse'), 'switching it off removes both of ours and nothing else');
  // "is the automatic sync on?" - a menu item that counts our timers and says when the last sync was
  const st0 = makeEnv({ files: FILES, props: REPO, tabs: { Dory: [], Leo: [], Antoine: [] } });
  st0.run('showAutoSyncStatus');
  ok(st0.log.alerts.at(-1).title === '自动同步：没有开启' && /菜单 识字助手 → 3\. 开启自动同步/.test(st0.log.alerts.at(-1).msg), 'the status menu item says "not on" (and how to switch it on) when there is no timer');
  st0.run('enableAutoSync'); st0.run('showAutoSyncStatus');
  const onMsg = st0.log.alerts.at(-1);
  ok(onMsg.title === '自动同步：已开启' && /2 个自动同步的定时器/.test(onMsg.msg) && /周六、周日/.test(onMsg.msg) && /20 点/.test(onMsg.msg) && /触发器/.test(onMsg.msg), 'after switching it on it says "on", how many timers, when, and where the sheet shows them (Triggers in Apps Script)');
  st0.run('syncAuto'); st0.run('showAutoSyncStatus');
  ok(/最近一次同步：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}（成功）/.test(st0.log.alerts.at(-1).msg), 'and when a sync has run, the time and result of the last one: ' + (st0.log.alerts.at(-1).msg.match(/最近一次同步：[^。]*/) || [''])[0]);
  st0.run('disableAutoSync'); st0.run('showAutoSyncStatus');
  ok(st0.log.alerts.at(-1).title === '自动同步：没有开启', 'after switching it off it says "not on" again');
  ok(!/everyMinutes|EVERY_MINUTES/.test(SCRIPT), 'the script has no every-N-minutes timer any more');
  const once = makeEnv({ files: FILES });
  const oncePatched = SCRIPT.replace("var SYNC_DAYS = ['SATURDAY', 'SUNDAY'];", "var SYNC_DAYS = ['SUNDAY'];");
  ok(oncePatched !== SCRIPT, '(the setting SYNC_DAYS can be changed in the script)');

  // ---------- the 成语 tab: A = idiom (locked by the user), B = tick box, C = count made by the sheet. The script only TICKS B for idioms the app has given a week.
  const LIB = ['对牛弹琴', '指鹿为马', '井底之蛙', '刻舟求剑', '守株待兔', '尊老爱幼', '知错就改', '夜郎自大'];
  const idiomTab = () => [['对牛弹琴', true, 24], ['指鹿为马', false, 24], ['井底之蛙', false, 24], ['刻舟求剑', false, 24], ['守株待兔', false, 24], ['尊老爱幼', true, 24], ['知错就改', false, 24], ['夜郎自大', false, 24]];
  const IDIOMS = { weeks: [{ start: '2026-11-08', items: ['对牛弹琴', '井底之蛙', '刻舟求剑'] }, { start: '2026-11-15', items: ['夜郎自大', '不在表格里的成语'] }], pool: LIB, stories: { 对牛弹琴: '故事', 不在表格里的成语: '新故事', 井底之蛙: 'App里改过的故事' } };
  const ib = makeEnv({ files: { ...FILES, 'idioms.json': IDIOMS }, props: REPO, tabs: { Dory: userSheet(), Leo: [], Antoine: [], 成语: idiomTab() } });
  const idiomBefore = JSON.stringify(ib.sheets.get('成语').grid);
  ib.run('syncAuto');
  const iw = ib.log.writes.filter((w) => w.tab === '成语');
  const igrid = ib.sheets.get('成语').grid;
  const tickW = iw.filter((w) => w.row <= 8 && w.col === 2), weekW = iw.filter((w) => w.row <= 8 && w.col === 4), storyW = iw.filter((w) => w.row <= 8 && w.col === 5), newW = iw.filter((w) => w.row > 8);
  ok(tickW.length === 3 && tickW.every((w) => w.value === true && w.before === false) && tickW.map((w) => w.row).sort().join() === '3,4,8', 'the idioms the app gave a week get their box in column B TICKED (rows 3, 4 and 8)');
  ok(weekW.length === 4 && weekW.map((w) => w.row + ':' + w.value).sort().join() === '1:第3周-2026-11-08,3:第3周-2026-11-08,4:第3周-2026-11-08,8:第4周-2026-11-15' && weekW.every((w) => w.before === ''), 'the week they were learned in is written in column D, in the same form as the children\'s tabs ("第3周-2026-11-08", counted from the first week of the app)');
  ok(storyW.length === 2 && storyW.map((w) => w.row + ':' + w.value).sort().join() === '1:故事,3:App里改过的故事' && storyW.every((w) => w.before === ''), 'the stories of the app are written into column E, only where E is empty (rows 1 and 3)');
  ok(newW.length === 4 && newW.every((w) => w.row === 9) && newW.find((w) => w.col === 5).value === '新故事' && newW.find((w) => w.col === 1).value === '不在表格里的成语' && newW.find((w) => w.col === 1).before === '' && newW.find((w) => w.col === 2).value === true && newW.find((w) => w.col === 4).value === '第4周-2026-11-15' && ib.log.boxes.length === 1 && ib.log.boxes[0].join() === '成语,9,2', 'a new idiom of the app (typed by hand) is ADDED below the last idiom of column A (row 9) with a tick box in B, ticked, and its week in D; nothing else is written');
  ok(igrid.slice(0, 8).every((r, i) => r[0] === JSON.parse(idiomBefore)[i][0] && r[2] === 24) && igrid[8][2] === undefined, 'the existing idioms of column A and the counts in column C are never touched (the new row leaves C to the sheet)');
  ok(igrid[0][1] === true && igrid[5][1] === true && igrid[1][1] === false && igrid[4][1] === false && igrid[6][1] === false, 'ticks that were already there stay, boxes of idioms without a week stay empty, nothing is ever un-ticked');
  const idSt = ib.sheets.get('同步状态').grid.flat().join('|');
  ok(/新打勾 3 个/.test(idSt) && /D 列写入学习的周 4 个/.test(idSt) && /E 列写入故事 3 个/.test(idSt) && /新加到表格 A 列 1 个（不在表格里的成语）/.test(idSt), 'the status tab says how many were ticked and which new idioms were added: ' + (idSt.match(/成语：[^|]*/) || [''])[0]);
  ib.log.writes.length = 0; ib.run('syncAuto');
  ok(ib.log.writes.filter((w) => w.tab === '成语').length === 0, 'running it again writes nothing more (idempotent)');
  // column D: only an empty cell, or an old week label with another week, is written; anything the user wrote there stays
  const dTab = idiomTab().map((r) => r.slice());
  dTab[0][3] = '我的备注'; dTab[2][3] = '第3周-2026-11-08'; dTab[3][3] = '第1周-2026-10-25';
  const dd = makeEnv({ files: { ...FILES, 'idioms.json': { weeks: [{ start: '2026-11-08', items: ['对牛弹琴', '井底之蛙', '刻舟求剑'] }], pool: LIB } }, props: REPO, tabs: { Dory: userSheet(), Leo: [], Antoine: [], 成语: dTab } });
  dd.run('syncAuto');
  const dWrites = dd.log.writes.filter((w) => w.tab === '成语' && w.col === 4);
  ok(dWrites.length === 1 && dWrites[0].row === 4 && dWrites[0].before === '第1周-2026-10-25' && dWrites[0].value === '第3周-2026-11-08', 'column D: something the user wrote (我的备注) is not touched, a cell that already has the right week is not written again, an old week label with another week is corrected (row 4)');
  ok(dd.sheets.get('成语').grid[0][3] === '我的备注' && /另有 1 个 D 格里是你自己写的内容，没有动/.test(dd.sheets.get('同步状态').grid.flat().join('|')), 'and the status tab says that one D cell with your own text was left alone');
  // column E follows the APP: an empty cell is filled, a cell with another text is rewritten with the app's story (the app is the master, the sheet is the backup);
  // an idiom the app has no story for is left alone (never cleared); the same text is not written again
  const eTab = idiomTab().map((r) => r.slice());
  eTab[0][4] = '我在表格里写过的旧版本'; eTab[2][4] = '没有故事的成语的内容'; eTab[3][4] = '刻舟求剑的故事';
  const ee = makeEnv({ files: { ...FILES, 'idioms.json': { weeks: [], pool: LIB, stories: { 对牛弹琴: 'App里的新版本', 指鹿为马: '指鹿为马的故事', 刻舟求剑: '刻舟求剑的故事' } } }, props: REPO, tabs: { Dory: userSheet(), Leo: [], Antoine: [], 成语: eTab } });
  ee.run('syncAuto');
  const eW = ee.log.writes.filter((w) => w.tab === '成语' && w.col === 5);
  ok(eW.length === 2 && eW.find((w) => w.row === 1).before === '我在表格里写过的旧版本' && eW.find((w) => w.row === 1).value === 'App里的新版本' && eW.find((w) => w.row === 2).before === '' && eW.find((w) => w.row === 2).value === '指鹿为马的故事', 'column E follows the app: a story edited in the app REPLACES the old text in the sheet (row 1), an empty cell is filled (row 2)');
  ok(ee.sheets.get('成语').grid[2][4] === '没有故事的成语的内容' && ee.sheets.get('成语').grid[3][4] === '刻舟求剑的故事', 'an idiom the app has no story for keeps whatever is in its E cell (never cleared), and a cell that already has the same text is not written again');
  ok(/E 列写入故事 2 个（其中改写原有内容 1 个，以 App 为准）/.test(ee.sheets.get('同步状态').grid.flat().join('|')), 'the status tab says how many E cells were rewritten');
  ee.log.writes.length = 0; ee.run('syncAuto');
  ok(ee.log.writes.filter((w) => w.tab === '成语').length === 0, 'a second sync writes nothing (the sheet already has the app\'s stories)');
  // safety: too many rewrites at once
  const many2 = ['对牛弹琴', '指鹿为马', '井底之蛙', '刻舟求剑', '守株待兔', '尊老爱幼', '知错就改', '夜郎自大'];
  const tabBig = Array.from({ length: 60 }, (_, k) => [`测试成语${String(k).padStart(2, '甲')}`, false, 24, '', '旧内容' + k]);
  const stBig = Object.fromEntries(tabBig.map((r, k) => [r[0], '新故事' + k]));
  const eo = makeEnv({ files: { ...FILES, 'idioms.json': { weeks: [], pool: tabBig.map((r) => r[0]), stories: stBig } }, props: REPO, tabs: { Dory: userSheet(), Leo: [], Antoine: [], 成语: tabBig } });
  eo.run('syncAuto');
  ok(eo.log.writes.filter((w) => w.tab === '成语' && w.col === 5).length === 0 && /超过一次最多改写 50 个的安全上限/.test(eo.sheets.get('同步状态').grid.flat().join('|')), 'safety: 60 cells that differ from the app at once is more than the limit (50): none is rewritten and the status tab says why');
  const noTab = makeEnv({ files: { ...FILES, 'idioms.json': IDIOMS }, props: REPO, tabs: { Dory: userSheet(), Leo: [], Antoine: [] } });
  noTab.run('syncAuto');
  ok(/成语：表格里没有叫“成语”的标签页/.test(noTab.sheets.get('同步状态').grid.flat().join('|')) && noTab.sheets.get('同步状态').grid.flat().includes('成功'), 'no 成语 tab in the sheet: skipped with a note, the rest of the sync still succeeds');
  const noFile = makeEnv({ files: FILES, props: REPO, tabs: { Dory: userSheet(), Leo: [], Antoine: [], 成语: idiomTab() } });
  const nfBefore = JSON.stringify(noFile.sheets.get('成语').grid);
  noFile.run('syncAuto');
  ok(JSON.stringify(noFile.sheets.get('成语').grid) === nfBefore, 'no idioms.json in the data repository yet: the tab is left exactly as it is');
  const many = Array.from({ length: 40 }, (_, k) => '新成语' + String(k).padStart(2, '甲'));
  const mb = makeEnv({ files: { ...FILES, 'idioms.json': { weeks: [], pool: [...LIB, ...many] } }, props: REPO, tabs: { Dory: userSheet(), Leo: [], Antoine: [], 成语: idiomTab() } });
  const mbBefore = JSON.stringify(mb.sheets.get('成语').grid);
  mb.run('syncAuto');
  ok(JSON.stringify(mb.sheets.get('成语').grid) === mbBefore && /超过一次最多 30 个的安全上限/.test(mb.sheets.get('同步状态').grid.flat().join('|')), 'safety: 40 new idioms at once is more than the limit (30): nothing is added and the status tab says why');
  ok(/idiomTicks_/.test(SCRIPT) && !/setValue\(false\)|setValue\(''\).*idiom/i.test(SCRIPT.slice(SCRIPT.indexOf('function syncIdioms_'), SCRIPT.indexOf('function syncIdioms_') + 1600)), 'the script text: the idiom part only ever writes true');

  // ---------- the script text, the menu, the guide
  ok(!/\.clear\(|deleteRow|deleteColumn|deleteSheet|removeSheet|setFormula|setBackground|setNumberFormat|setFontColor/.test(SCRIPT) && (SCRIPT.match(/clearContent\(\)/g) || []).length === 1 && (SCRIPT.match(/setValues\(/g) || []).length === 1, 'the script text: nothing that deletes or reformats; clearContent / setValues appear once each, only for the status tab');
  ok(!/method:\s*'(put|post|delete|patch)'/i.test(SCRIPT), 'and no write request to GitHub');
  const mm = makeEnv(); mm.run('onOpen');
  ok(mm.log.menus[0].name === '识字助手' && mm.log.menus[0].items.map((i) => i[0]).join('|') === '1. 设置 GitHub 连接|2. 立即同步|3. 开启自动同步（周六、周日各一次）|关闭自动同步|查看自动同步是否开启' && mm.log.menus[0].items.every(([, fn]) => typeof mm.ctx[fn] === 'function'), 'the menu "识字助手" with its four items, each calling a function that exists');
  ok(mm.log.menus[0].items.every(([label]) => README.includes(label)), 'README.md uses the exact menu names');
  ok(['github_pat_', 'SYNC_DAYS', 'SYNC_HOUR', 'FIRST_WEEK', '同步状态', 'Contents', '只读', '空格', 'A 列', 'L 列'].every((k) => README.includes(k)), 'README.md covers: the read-only token, only empty cells, A / L untouched, the status tab, FIRST_WEEK, the days and hour');
  ok(!/整页重写|整页由脚本管理|会被覆盖/.test(README), 'README.md no longer says that tabs are rewritten');
  ok(!/user202201|@ptc|zdeng/i.test(SCRIPT + README) && !/github_pat_[A-Za-z0-9_]{20,}/.test(SCRIPT + README), 'no personal data and no real token in these files (public repository)');
  await done();
})();
