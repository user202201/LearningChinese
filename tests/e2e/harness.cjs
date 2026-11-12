// Shared test harness: a pretend GitHub (the contents API of repo demo/LearningData, kept in memory) and a browser page.
const { chromium } = require('playwright');
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const REPO = 'demo/LearningData';
exports.REPO = REPO;
exports.URL = process.env.APP_URL || 'http://localhost:5173/';

/** store: Map path -> string; opts: locale, viewport, local (use this device), today ('YYYY-MM-DD' for the page's clock), hooks.beforePut(path) */
exports.start = async function (store = new Map(), opts = {}) {
  // (app.test -> "localhost", not 127.0.0.1: on some machines the dev server listens on IPv6 only)
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP app.test localhost'] });
  const ctx = await browser.newContext({ colorScheme: opts.colorScheme || 'light', locale: opts.locale || 'zh-CN', viewport: opts.viewport || { width: 1180, height: 820 }, hasTouch: !!opts.touch, reducedMotion: opts.motion ? 'no-preference' : 'reduce' });   // (the pop-in animations are off in tests so that measurements are stable; 06-look tests them)
  const page = await ctx.newPage();
  if (opts.today) await page.clock.setFixedTime(new Date(opts.today + 'T10:00:00'));
  if (opts.clock) await page.clock.install({ time: new Date(opts.clock) });   // a clock the test can move forward (page.clock.runFor); it also decides what "today" is
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const log = { gets: [], puts: [], deletes: [] };
  const version = new Map();                      // path -> number (the "sha")
  const sha = (k) => 'v' + (version.get(k) || 0);
  await ctx.route('https://api.github.com/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
    const json = (o, s = 200) => route.fulfill({ status: s, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.headers()['authorization'] !== 'Bearer good') return json({ message: 'Bad credentials' }, 401);
    if (opts.offline) return route.abort();
    if (p === '/repos/' + REPO) return json({ permissions: { push: true }, default_branch: 'main', private: true });
    if (p === '/repos/demo/PublicRepo') return json({ permissions: { push: true }, default_branch: 'main', private: false });
    if (p === '/repos/demo/PianistScores') return json({ permissions: { push: true }, default_branch: 'main', private: true });
    if (p === '/repos/demo/PianistScores/contents') return json([{ name: 'scores', type: 'dir' }, { name: 'README.md', type: 'file' }]);
    if (p === '/repos/demo/ReadOnly') return json({ permissions: { push: false }, default_branch: 'main', private: true });
    if (p === '/user') return json({ login: 'tester' });
    const m = p.match(new RegExp('^/repos/' + REPO + '/contents/(.+)$'));
    if (!m) return json({ message: 'Not Found' }, 404);
    const key = decodeURIComponent(m[1]);
    if (req.method() === 'GET') {
      log.gets.push(key);
      if (!store.has(key)) return json({ message: 'Not Found' }, 404);
      return json({ sha: sha(key), content: Buffer.from(store.get(key), 'utf8').toString('base64'), encoding: 'base64' });
    }
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    if (req.method() === 'PUT') {
      if (opts.beforePut) opts.beforePut(key, store, version);   // lets a test change the file "from another device"
      if (store.has(key) && body.sha !== sha(key)) return json({ message: key + ' does not match' }, 409);
      if (!store.has(key) && body.sha) return json({ message: 'Invalid request' }, 422);
      store.set(key, Buffer.from(body.content, 'base64').toString('utf8'));
      version.set(key, (version.get(key) || 0) + 1);
      log.puts.push(key);
      return json({ content: { sha: sha(key) } }, store.has(key) ? 200 : 201);
    }
    if (req.method() === 'DELETE') {
      if (!store.has(key)) return json({ message: 'Not Found' }, 404);
      if (body.sha !== sha(key)) return json({ message: 'does not match' }, 409);
      store.delete(key); log.deletes.push(key);
      return json({});
    }
    return json({}, 404);
  });
  if (opts.init) await page.addInitScript(opts.init, opts.initArg);   // e.g. a pretend camera
  await page.goto(opts.url || exports.URL);
  if (opts.noLogin) return { browser, page, store, log, ctx };
  if (opts.local) { await page.click('#local-btn'); }
  else { await page.fill('input[type=text]', REPO); await page.fill('input[type=password]', 'good'); await page.click('button.primary'); }
  await page.waitForSelector('.kids, .empty-home');
  return { browser, page, store, log, ctx };
};

/** the tiny test runner: ok(cond, message) prints PASS / FAIL, done() sets the exit code */
exports.checks = function () {
  let fail = 0;
  return {
    ok: (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; },
    done: async (...browsers) => { for (const b of browsers) await b.close(); if (fail) { console.log(fail + ' check(s) failed'); process.exit(1); } },
  };
};

// ---- helpers shared by the suites ----
/** Settings (the gear on the home screen): where the children are added, renamed, given a picture, deleted and where Excel is imported */
exports.openSettings = async (page) => { await page.evaluate(() => (location.hash = '#/settings')); await page.waitForSelector('#manage-mode'); };
/** Settings with the manage mode switched ON (that is where the children are listed, added, renamed, deleted); `manageOff` puts the switch back */
exports.PW = '1234';
/** switches Admin mode on the way a user does: the first time a password is chosen (typed twice), afterwards it is typed; waits until the block has slid open */
exports.adminOn = async (page, pw = exports.PW) => {
  if (await page.isChecked('#manage-mode')) return;
  await page.click('#manage-mode'); await page.waitForSelector('#admin-pw');
  if (await page.locator('#admin-pw2').count()) await page.fill('#admin-pw2', pw);
  await page.fill('#admin-pw', pw); await page.click('#admin-ok');
  await page.waitForSelector('dialog.center', { state: 'detached' }); await page.waitForSelector('#add-kid', { state: 'visible' });
};
/** switches Admin mode on and comes back to the page the test was on (admin mode is not remembered, so a test cannot just store it) */
exports.manageOnHere = async (page) => { const hash = await page.evaluate(() => location.hash); await exports.openManage(page); await page.evaluate((h) => (location.hash = h), hash); await page.waitForTimeout(150); };
exports.openManage = async (page) => { await exports.openSettings(page); await exports.adminOn(page); };
exports.manageOff = async (page) => { if (await page.locator('#manage-mode').count() && (await page.isChecked('#manage-mode'))) await page.uncheck('#manage-mode'); };
exports.goHome = async (page) => { await exports.manageOff(page); await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kids, .empty-home'); };
/** adds a child the way a user does: the big + when there is nobody yet, otherwise in Settings; ends on the home screen */
exports.addKid = async (page, name) => {
  if (await page.locator('#add-kid-big').count()) await page.click('#add-kid-big');
  else { await exports.openManage(page); await page.click('#add-kid'); }
  await page.fill('dialog input', name);
  await page.click('dialog button.primary');
  await page.waitForSelector(`.kname:has-text("${name}")`);
  await exports.manageOff(page);
  await exports.goHome(page);
};
exports.openKid = async (page, name) => { await page.click('.kid:has-text("' + name + '")'); await page.waitForSelector('.weekbar'); };   // (not #enter: a week with its 10 characters has no +)
/** earlier weeks are reached by tapping the week's name (the arrow only goes forward) */
exports.gotoWeek = async (page, start) => { await page.click('#week-pick'); await page.click(`.weekrow[data-start="${start}"]`); await page.waitForSelector('dialog', { state: 'detached' }); };
/** opens the entry window the way a user gets there: a week with its 10 characters has no +, so go to an empty week (forward as far as it goes, then back) and tap its big + */
exports.openEntry = async (page) => {
  for (const dir of ['下一周', '上一周']) {
    while (!(await page.locator('#enter').count())) { const b = page.locator(`button[title=${dir}]`); if (await b.isDisabled()) break; await b.click(); }
    if (await page.locator('#enter').count()) break;
  }
  await page.click('#enter');
};
exports.enterWeek = async (page, date, chars) => {
  await exports.openEntry(page);
  await page.fill('dialog input[type=date]', date);
  await page.fill('dialog textarea >> nth=0', chars);
  await page.click('dialog button.primary');
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('#toasts .toast.working'));   // the saving is finished
};
exports.WEEK1 = '假辣酸贫纺炒缸锅烛扇';
exports.WEEK2 = '鼓旧富言忙桶炉锤泉溪';
exports.WEEK3 = '波坡板炭镜锁帆筐犁耙';
