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
  const ctx = await browser.newContext({ locale: opts.locale || 'zh-CN', viewport: opts.viewport || { width: 1180, height: 820 }, hasTouch: !!opts.touch, reducedMotion: opts.motion ? 'no-preference' : 'reduce' });   // (the pop-in animations are off in tests so that measurements are stable; 06-look tests them)
  const page = await ctx.newPage();
  if (opts.today) await page.clock.setFixedTime(new Date(opts.today + 'T10:00:00'));
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
  await page.waitForSelector('.kids, .empty');
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
exports.addKid = async (page, name) => {
  await page.click('main button.primary.wide');   // "+ Add a child" in any language
  await page.fill('dialog input', name);
  await page.click('dialog button.primary');
  await page.waitForSelector('.kname:has-text("' + name + '")');
};
exports.openKid = async (page, name) => { await page.click('.kid:has-text("' + name + '")'); await page.waitForSelector('#enter'); };
exports.enterWeek = async (page, date, chars, idioms = '') => {
  await page.click('#enter');
  await page.fill('dialog input[type=date]', date);
  await page.fill('dialog textarea >> nth=0', chars);
  if (idioms) await page.fill('dialog textarea >> nth=1', idioms);
  await page.click('dialog button.primary');
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('#toasts .toast.working'));   // the saving is finished
};
exports.WEEK1 = '假辣酸贫纺炒缸锅烛扇';
exports.WEEK2 = '鼓旧富言忙桶炉锤泉溪';
exports.WEEK3 = '波坡板炭镜锁帆筐犁耙';
