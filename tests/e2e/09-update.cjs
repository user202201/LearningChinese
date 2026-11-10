// Updating a web app that has no reload button (iPad home screen): Settings -> Check for updates / Force refresh, and a bar that appears by itself when a newer
// build exists. Uses a REAL production build (vite build + vite preview), because the automatic check only exists there.
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { start, checks, REPO } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = path.resolve(process.env.D || 'tests/out/work/');
const DIST = path.join(OUT, 'dist-test');
const PORT = 4177;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  execSync(`BASE_PATH=/ BUILD_ID=build-A npx vite build --outDir "${DIST}" --emptyOutDir`, { stdio: 'pipe' });
  ok(JSON.parse(fs.readFileSync(path.join(DIST, 'version.json'), 'utf8')).build === 'build-A', 'the build writes version.json with the build id');
  execSync(`MOBILE=1 BUILD_ID=build-M npx vite build --outDir "${DIST}-app" --emptyOutDir`, { stdio: 'pipe' });
  const appJs = fs.readdirSync(path.join(DIST + '-app', 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(DIST + '-app', 'assets', f), 'utf8')).join('');
  ok(!appJs.includes('check-update') && !appJs.includes('update-bar'), 'the iOS app build has no update buttons (the app itself is the copy)');

  const srv = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: { ...process.env, BASE_PATH: '/' } });   // (preview must use the same base as the build)
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {} await sleep(250); }
    let mode = 'real';
    const url = `http://localhost:${PORT}/`;
    const { browser, page, ctx } = await start(new Map(), { url });
    await ctx.route('**/version.json*', (r) => mode === 'real' ? r.fallback() : mode === 'new' ? r.fulfill({ json: { build: 'build-B' } }) : r.abort());
    const toastText = async (re) => { await page.waitForFunction((s) => [...document.querySelectorAll('#toasts .toast')].some((t) => new RegExp(s).test(t.textContent)), re.source, { timeout: 8000 }); return true; };

    await page.evaluate(() => (location.hash = '#/settings')); await page.waitForSelector('#check-update');
    ok(await page.locator('#hard-refresh').count() === 1, 'Settings has "Check for updates" and "Force refresh"');
    ok((await page.textContent('.card:has(#check-update)')).includes('build-A'), 'Settings shows the version of this build');
    await page.screenshot({ path: path.join(OUT, 'settings-update.png') });

    await page.click('#check-update');
    ok(await toastText(/已是最新版本/), 'up to date: "you have the newest version"');
    ok(await page.locator('#update-bar').count() === 0, 'no update bar when up to date');
    mode = 'fail';
    await page.click('#check-update');
    ok(await toastText(/检查更新失败/), 'the site cannot be reached: says so');
    ok(await page.locator('#toasts .toast.working').count() === 0, 'the "checking…" spinner is closed afterwards');
    mode = 'new';
    await page.click('#check-update');
    await page.waitForSelector('#update-bar');
    ok(await page.locator('#update-now').isVisible(), 'a newer build exists: a bar with "Update now" appears');
    ok(await toastText(/有新版本可用，请点/), 'and the check says so too');
    await page.screenshot({ path: path.join(OUT, 'update-bar.png') });

    // forced refresh: the old cached copy is thrown away, the sign-in is kept
    await page.evaluate(async () => { const c = await caches.open('old-app'); await c.put('/x', new Response('old')); });
    mode = 'real';
    await Promise.all([page.waitForURL(/\?r=\d+/), page.click('#update-now')]);
    await page.waitForSelector('#check-update');          // (the page you were on is kept: Settings)
    ok(await page.locator('.login').count() === 0, 'after the refresh you are still signed in');
    ok(!(await page.evaluate(() => caches.keys())).includes('old-app'), 'the cached copy was deleted');
    await page.evaluate(async () => { const c = await caches.open('old-app'); await c.put('/x', new Response('old')); });
    await page.goto(url + '#/settings'); await page.waitForSelector('#hard-refresh');    // a clean address, then the button in Settings
    await page.evaluate(async () => { const c = await caches.open('old-app'); await c.put('/x', new Response('old')); });
    await Promise.all([page.waitForURL(/\?r=\d+/), page.click('#hard-refresh')]);
    await page.waitForSelector('#check-update');
    ok(!(await page.evaluate(() => caches.keys())).includes('old-app'), 'Settings -> Force refresh clears the cache too');

    // by itself: when the app comes back to the front and when it is opened
    mode = 'real';
    await page.reload(); await page.waitForSelector('#check-update'); await sleep(3600);
    ok(await page.locator('#update-bar').count() === 0, 'opening the app with nothing new: no bar');
    mode = 'new';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForSelector('#update-bar', { timeout: 8000 });
    ok(true, 'coming back to the app while a new build exists shows the bar (no message, it never reloads by itself)');
    await page.reload(); await page.waitForSelector('#check-update');
    await page.waitForSelector('#update-bar', { timeout: 8000 });
    ok(true, 'opening the app while a new build exists shows the bar');
    await browser.close();

    // languages
    const en = await start(new Map(), { url, local: true, locale: 'en-US' });
    await en.page.evaluate(() => (location.hash = '#/settings')); await en.page.waitForSelector('#check-update');
    ok((await en.page.textContent('#check-update')) === 'Check for updates' && (await en.page.textContent('#hard-refresh')).startsWith('Force refresh'), 'English: both buttons are translated');
    await en.browser.close();
    const fr = await start(new Map(), { url, local: true, locale: 'fr-FR' });
    await fr.page.evaluate(() => (location.hash = '#/settings')); await fr.page.waitForSelector('#check-update');
    ok((await fr.page.textContent('#check-update')) === 'Rechercher une mise à jour', 'French: translated');
    await fr.browser.close();
  } finally {
    srv.kill();
  }
  await done();
})();
