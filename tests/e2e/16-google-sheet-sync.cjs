// The Google Sheets sync script (docs/google-sheet-sync/sync.gs): it is run here against a PRETEND Google Sheet (tabs, cells, menu, triggers, dialogs)
// and a PRETEND GitHub. Proves: the table layout the user already keeps (A = "第N周-日期", B.. = the week's characters, L = running total), re-sync cleans up,
// errors are explained, the auto-sync switch, read-only, no personal data in a public file. NOT proved here: a real Google account, the authorisation screens,
// a real timer — those need the user to follow README.md once.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const { checks } = require('./harness.cjs');
const { ok, done } = checks();
const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'docs/google-sheet-sync/sync.gs'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'docs/google-sheet-sync/README.md'), 'utf8');

/** a pretend Google Sheets + Apps Script + GitHub; `files` = what is in the data repository (path -> object) */
function makeEnv({ files = {}, props = {}, status = {}, noUi = false, answers = [] } = {}) {
  const sheets = new Map();
  const log = { fetches: [], alerts: [], menus: [], triggers: [], prompts: [] };
  class Sheet {
    constructor(name) { this.name = name; this.grid = []; }
    cell(r, c) { return this.grid[r - 1]?.[c - 1] ?? ''; }
    getLastRow() { let last = 0; this.grid.forEach((row, i) => { if (row.some((v) => v !== '' && v !== undefined)) last = i + 1; }); return last; }
    getLastColumn() { let last = 0; this.grid.forEach((row) => row.forEach((v, j) => { if (v !== '' && v !== undefined) last = Math.max(last, j + 1); })); return last; }
    getRange(r, c, nr = 1, nc = 1) {
      const sh = this;
      return {
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.grid[r - 1 + i]) sh.grid[r - 1 + i][c - 1 + j] = ''; return this; },
        setValues(v) { if (v.length !== nr || v.some((row) => row.length !== nc)) throw new Error(`setValues: the data is ${v.length}x${v[0]?.length}, the range ${nr}x${nc}`); v.forEach((row, i) => row.forEach((x, j) => { (sh.grid[r - 1 + i] ??= [])[c - 1 + j] = x; })); return this; },
        getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.cell(r + i, c + j))); },
      };
    }
  }
  const ss = { getSheetByName: (n) => sheets.get(n) || null, insertSheet: (n) => { if (sheets.has(n)) throw new Error('a tab named ' + n + ' exists'); const s = new Sheet(n); sheets.set(n, s); return s; } };
  const propStore = new Map(Object.entries(props));
  const queue = [...answers];
  const ui = {
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK', CANCEL: 'CANCEL' },
    alert: (title, msg) => { log.alerts.push({ title, msg }); },
    prompt: (title, msg) => { log.prompts.push({ title, msg }); const a = queue.shift(); return { getSelectedButton: () => (a === null ? 'CANCEL' : 'OK'), getResponseText: () => a ?? '' }; },
    createMenu: (name) => { const m = { name, items: [] }; const chain = { addItem: (label, fn) => { m.items.push([label, fn]); return chain; }, addToUi: () => { log.menus.push(m); } }; return chain; },
  };
  const triggers = [{ fn: 'somethingElse', minutes: 60, id: 0 }];
  let tid = 1;
  const ctx = {
    SpreadsheetApp: { getUi: () => { if (noUi) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); return ui; }, getActiveSpreadsheet: () => ss, ...ui },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (propStore.has(k) ? propStore.get(k) : null), setProperties: (o) => Object.entries(o).forEach(([k, v]) => propStore.set(k, v)) }) },
    UrlFetchApp: {
      fetch: (url, o) => {
        const m = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/.exec(url);
        log.fetches.push({ url, method: (o.method || 'get').toLowerCase(), headers: o.headers, mute: o.muteHttpExceptions });
        const p = m && m[2].split('/').map(decodeURIComponent).join('/');
        const code = status[p] ?? status['*'] ?? (m && p in files ? 200 : 404);
        return { getResponseCode: () => code, getContentText: () => JSON.stringify(files[p]) };
      },
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.fn, id: t.id })),
      deleteTrigger: (t) => { const i = triggers.findIndex((x) => x.id === t.id); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => triggers.push({ fn, minutes: n, id: tid++ }) }) }) }),
    },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 19).replace('T', ' ') },
    Session: { getScriptTimeZone: () => 'UTC' },
  };
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx, { filename: 'sync.gs' });
  return { ctx, sheets, log, triggers, props: propStore, run: (fn) => ctx[fn]() };
}
const chars = (s) => Array.from(s);
const row = (label, cs, total, width = 10) => [label, ...chars(cs), ...Array(Math.max(0, width - cs.length)).fill(''), total];
const gridOf = (sheet) => sheet.grid.map((r) => r.slice());
const W1 = '假辣酸贫纺炒缸锅烛扇', W2 = '鼓旧富言忙桶炉锤泉溪', W3 = '波坡板炭镜锁帆筐犁耙';
const FILES = {
  'kids.json': { kids: [{ id: 'kdory', name: 'Dory', color: '#f2545b' }, { id: 'kleo', name: 'Leo', color: '#1c7ed6' }, { id: 'kant', name: 'Antoine', color: '#2f9e44' }], startWeek: '2026-10-25' },
  'kids/kdory.json': { weeks: [{ start: '2026-10-25', chars: chars(W1) }, { start: '2026-11-01', chars: chars(W2) }, { start: '2026-11-08', chars: chars(W3) }] },
  'kids/kleo.json': { weeks: [{ start: '2026-11-01', chars: chars('春夏秋冬风雨') }] },
  // Antoine has no file yet
};

(async () => {
  // ---------- the table layout (the pure part)
  const E = makeEnv();
  const b = E.ctx.buildKidRows_(FILES['kids/kdory.json'], '2026-10-25');
  ok(JSON.stringify(b.rows) === JSON.stringify([row('第1周-2026-10-25', W1, 10), row('第2周-2026-11-01', W2, 20), row('第3周-2026-11-08', W3, 30)]) && b.width === 12 && b.total === 30,
    'the layout of the user\'s sheet: A = "第1周-2026-10-25", B..K = the 10 characters, L = running total 10 / 20 / 30');
  const b6 = E.ctx.buildKidRows_({ weeks: [{ start: '2026-11-01', chars: chars('春夏秋冬风雨') }] }, '2026-10-25');
  ok(JSON.stringify(b6.rows[0]) === JSON.stringify(row('第2周-2026-11-01', '春夏秋冬风雨', 6)) && b6.rows[0].length === 12, 'a week with 6 characters: the rest of B..K stays empty and the total is still in L');
  const b12 = E.ctx.buildKidRows_({ weeks: [{ start: '2026-10-25', chars: chars(W1 + '甲乙') }, { start: '2026-11-01', chars: chars('春夏') }] }, '2026-10-25');
  ok(b12.width === 14 && b12.rows.every((r) => r.length === 14) && b12.rows[0][13] === 12 && b12.rows[1][13] === 14, 'a week with 12 characters (typed by mistake): every row gets the same width and the total moves to the next column for ALL rows');
  const rev = E.ctx.buildKidRows_({ weeks: [...FILES['kids/kdory.json'].weeks].reverse() }, '2026-10-25');
  ok(rev.rows.map((r) => r[0]).join() === '第1周-2026-10-25,第2周-2026-11-01,第3周-2026-11-08' && rev.rows[2][11] === 30, 'weeks are put in order, oldest first, and the running total follows that order');
  ok(E.ctx.buildKidRows_(FILES['kids/kdory.json'], '2026-10-18').rows[0][0] === '第2周-2026-10-25', 'a given first week (FIRST_WEEK) shifts the week numbers');
  ok(E.ctx.buildKidRows_(FILES['kids/kdory.json'], '').rows[0][0] === '第1周-2026-10-25', 'without a start week the first week that has characters is week 1');
  ok(E.ctx.buildKidRows_({ weeks: [] }, '2026-10-25').rows.length === 0 && E.ctx.buildKidRows_(undefined, '').total === 0 && E.ctx.buildKidRows_({ weeks: [{ start: '2026-11-01', chars: [] }] }, '').rows.length === 0, 'no weeks / empty weeks: no rows');
  // the same week numbers as the app
  const M = await import(pathToFileURL(path.join(ROOT, 'src/model.ts')).href).catch(() => null);
  if (M) {
    let same = true; const days = ['2026-10-25', '2026-11-01', '2026-11-08', '2026-03-29', '2026-10-31', '2027-01-03', '2026-10-18', '2026-09-06'];
    for (const a of days) for (const s of days) if (E.ctx.weekNo_(s, a) !== M.weekNo(s, a)) same = false;
    ok(same, 'the week numbers are the same as in the app (src/model.ts), also across a summer-time change and before the start week');
  } else ok(true, '(week numbers vs the app: model.ts could not be loaded here, skipped)');
  ok(E.ctx.safeTabName_('A/B?[x]') === 'A_B__x_' && E.ctx.safeTabName_('   ') === '孩子' && E.ctx.safeTabName_('x'.repeat(200)).length === 90, 'tab names: characters Google does not allow are replaced, empty and very long names are handled');

  // ---------- a whole sync
  const e = makeEnv({ files: FILES, props: { GITHUB_REPO: 'someone/LearningData', GITHUB_TOKEN: 'github_pat_readonly' } });
  e.run('syncNow');
  ok(e.log.alerts.length === 1 && e.log.alerts[0].title === '同步完成' && e.log.alerts[0].msg.includes('3 个孩子'), 'the menu "sync now" tells what it did: ' + JSON.stringify(e.log.alerts[0]?.msg).slice(0, 60));
  ok(['Dory', 'Leo', 'Antoine'].every((n) => e.sheets.has(n)), 'one tab per child, named like the child');
  ok(JSON.stringify(gridOf(e.sheets.get('Dory'))) === JSON.stringify([row('第1周-2026-10-25', W1, 10), row('第2周-2026-11-01', W2, 20), row('第3周-2026-11-08', W3, 30)]), "Dory's tab is exactly the user's layout");
  ok(JSON.stringify(gridOf(e.sheets.get('Leo'))) === JSON.stringify([row('第2周-2026-11-01', '春夏秋冬风雨', 6)]), "Leo's tab: week 2, 6 characters, total 6");
  ok(e.sheets.get('Antoine').getLastRow() === 0, 'a child without any data yet gets an empty tab (no error)');
  const st = e.sheets.get('同步状态');
  ok(st.cell(1, 1) === '最后同步时间' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(st.cell(1, 2)) && st.cell(2, 2) === '成功' && st.cell(4, 2).includes('Dory：3 周，共 30 个字'), 'the status tab shows the time, "success" and one line per child');
  ok(e.log.fetches.length === 4 && e.log.fetches.every((f) => f.method === 'get'), 'GitHub is asked 4 times (kids.json + 3 children), only to READ (' + e.log.fetches.map((f) => f.method).join() + ')');
  ok(e.log.fetches.every((f) => f.headers.Authorization === 'Bearer github_pat_readonly' && /raw/.test(f.headers.Accept) && f.mute === true), 'with the token, asking for the plain file, and errors handled by the script');
  ok(!/method:\s*'(put|post|delete|patch)'/i.test(SCRIPT) && /method: 'get'/.test(SCRIPT), 'the script text itself has no write request to GitHub');

  // ---------- syncing again after changes
  e.sheets.get('Leo').getRange(5, 1, 1, 1).setValues([['手写的备注']]);      // something typed by hand lower down in a child's tab
  e.sheets.get('Dory').getRange(1, 14, 1, 1).setValues([['旧内容']]);          // and far to the right
  FILES['kids/kdory.json'] = { weeks: [{ start: '2026-10-25', chars: chars(W1) }, { start: '2026-11-08', chars: chars(W3) }] };   // week 2 was deleted in the app (manage mode)
  FILES['kids/kant.json'] = { weeks: [{ start: '2026-11-08', chars: chars('天地人') }] };
  FILES['kids.json'] = { ...FILES['kids.json'], kids: [{ id: 'kdory', name: 'Dory' }, { id: 'kleo', name: 'Léo' }, { id: 'kant', name: 'Antoine' }] };   // Leo was renamed
  const e2 = makeEnv({ files: FILES, props: { GITHUB_REPO: 'someone/LearningData', GITHUB_TOKEN: 't' } });
  const pre = e2.ctx.SpreadsheetApp.getActiveSpreadsheet();
  pre.insertSheet('Dory').getRange(1, 1, 5, 14).setValues(Array.from({ length: 5 }, () => Array(14).fill('旧')));
  pre.insertSheet('Leo').getRange(1, 1, 1, 2).setValues([['旧Leo', '旧']]);
  e2.run('syncAuto');
  ok(e2.sheets.get('Dory').getLastRow() === 2 && e2.sheets.get('Dory').getLastColumn() === 12, 'syncing again: the deleted week is gone and old leftovers (rows below, columns to the right) are cleared');
  ok(e2.sheets.get('Dory').cell(2, 1) === '第3周-2026-11-08' && e2.sheets.get('Dory').cell(2, 12) === 20, 'week 3 keeps its number and the total follows (20)');
  ok(e2.sheets.has('Léo') && e2.sheets.get('Léo').cell(1, 1) === '第2周-2026-11-01' && e2.sheets.get('Leo').cell(1, 1) === '旧Leo', 'a renamed child gets a new tab; the old tab is left alone (delete it by hand)');
  ok(e2.sheets.get('Antoine').cell(1, 1) === '第3周-2026-11-08' && e2.sheets.get('Antoine').cell(1, 12) === 3, "Antoine's first characters appear");
  ok(e2.log.alerts.length === 0, 'the timer version shows no dialog');

  // ---------- the timer runs where there is no screen: no dialog may be needed
  const e3 = makeEnv({ files: FILES, props: { GITHUB_REPO: 'a/b', GITHUB_TOKEN: 't' }, noUi: true });
  let threw = false; try { e3.run('syncAuto'); } catch { threw = true; }
  ok(!threw && e3.sheets.get('同步状态').cell(2, 2) === '成功', 'syncAuto works without a screen (as when started by the timer)');

  // ---------- errors are explained
  const err = (opts, fn = 'syncNow') => { const x = makeEnv(opts); x.run(fn); return x; };
  let x = err({ files: FILES, props: { GITHUB_REPO: 'a/b', GITHUB_TOKEN: 'bad' }, status: { '*': 401 } });
  ok(x.log.alerts[0].title === '同步没有成功' && x.log.alerts[0].msg.includes('令牌无效') && x.sheets.get('同步状态').cell(2, 2) === '失败', 'a bad token (401): an explanation, and the status tab says it failed');
  x = err({ files: FILES, props: { GITHUB_REPO: 'a/b', GITHUB_TOKEN: 't' }, status: { 'kids.json': 403 } });
  ok(x.log.alerts[0].msg.includes('403') && x.log.alerts[0].msg.includes('Contents'), '403: says the token has no read access');
  x = err({ files: FILES, props: { GITHUB_REPO: 'a/b', GITHUB_TOKEN: 't' }, status: { '*': 500 } });
  ok(x.log.alerts[0].msg.includes('500'), 'another problem at GitHub (500): shown');
  x = err({ files: {}, props: { GITHUB_REPO: 'a/b', GITHUB_TOKEN: 't' } });
  ok(x.log.alerts[0].msg.includes('kids.json'), 'no data in the repository yet: says to add children and characters in the app first');
  x = err({ files: FILES });
  ok(x.log.alerts[0].msg.includes('设置 GitHub 连接'), 'no connection set yet: says where to set it');
  x = err({ files: {}, props: { GITHUB_REPO: 'a/b', GITHUB_TOKEN: 'bad' }, status: { '*': 401 } }, 'syncAuto');
  ok(x.sheets.get('同步状态').cell(2, 2) === '失败' && x.sheets.get('同步状态').cell(3, 2).includes('401'), 'the timer version writes the problem into the status tab (nobody is there to see a dialog)');

  // ---------- setting up the connection (the menu)
  let s = makeEnv({ files: FILES, answers: ['https://github.com/someone/LearningData/', '  github_pat_abc  '] });
  s.run('setupConnection');
  ok(s.props.get('GITHUB_REPO') === 'someone/LearningData' && s.props.get('GITHUB_TOKEN') === 'github_pat_abc', 'the repository (a pasted link is cleaned up) and the token (spaces removed) are stored');
  ok(s.log.alerts[0].title === '连接成功' && s.log.alerts[0].msg.includes('Dory、Léo、Antoine'), 'and the children found are listed as a check');
  s = makeEnv({ files: FILES, answers: ['not a repo', 'x'] }); s.run('setupConnection');
  ok(s.log.alerts[0].title === '仓库格式不对' && !s.props.has('GITHUB_REPO'), 'a wrong repository name is refused with an example');
  s = makeEnv({ files: FILES, answers: [null] }); s.run('setupConnection');
  ok(s.log.alerts.length === 0 && !s.props.has('GITHUB_TOKEN'), 'cancelling stores nothing and says nothing');
  s = makeEnv({ files: FILES, status: { '*': 401 }, answers: ['a/b', 'tok'] }); s.run('setupConnection');
  ok(s.log.alerts[0].title === '连接没有成功' && s.log.alerts[0].msg.includes('401'), 'a token that does not work is reported right away');

  // ---------- the auto-sync switch
  const t = makeEnv({ files: FILES });
  t.run('enableAutoSync'); t.run('enableAutoSync');
  const mine = t.triggers.filter((x) => x.fn === 'syncAuto');
  ok(mine.length === 1 && mine[0].minutes === 10, 'switching it on (even twice) leaves exactly one timer, every 10 minutes');
  ok(t.triggers.some((x) => x.fn === 'somethingElse'), "other timers of the sheet are not touched");
  t.run('disableAutoSync');
  ok(t.triggers.filter((x) => x.fn === 'syncAuto').length === 0 && t.triggers.some((x) => x.fn === 'somethingElse'), 'switching it off removes only ours');

  // ---------- the menu, and the text that goes with the script
  const mm = makeEnv(); mm.run('onOpen');
  ok(mm.log.menus[0].name === '识字助手' && mm.log.menus[0].items.map((i) => i[0]).join('|') === '1. 设置 GitHub 连接|2. 立即同步|3. 开启自动同步（每 10 分钟）|关闭自动同步', 'the menu "识字助手" with its four items');
  ok(mm.log.menus[0].items.every(([, fn]) => typeof mm.ctx[fn] === 'function'), 'every menu item calls a function that exists');
  ok(mm.log.menus[0].items.every(([label]) => README.includes(label)), 'README.md uses the exact menu names');
  ok(['github_pat_', 'EVERY_MINUTES', 'FIRST_WEEK', '同步状态', 'Contents', 'Read-only|只读', '创建副本|Make a copy'].every((k) => new RegExp(k).test(README)), 'README.md covers: the read-only token, backing up first, the status tab, FIRST_WEEK, the interval');
  ok(!/user202201|@ptc|zdeng/i.test(SCRIPT + README), 'no personal data in these files (they are in a public repository)');
  ok(!/github_pat_[A-Za-z0-9_]{20,}/.test(SCRIPT + README), 'and no real token');
  await done();
})();
