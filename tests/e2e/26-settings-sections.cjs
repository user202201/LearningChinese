// Settings are grouped by function: section headings in a fixed order, every control under the right heading, nothing lost.
const { start, checks, addKid, openManage, openSettings } = require('./harness.cjs');
const { ok, done } = checks();
const WANT = [
  ['管理', ['#manage-mode', '#add-kid', '#import-btn']],
  ['学习和游戏', ['#pin-toggle', '#game-secs']],
  ['通用', ['.seg']],
  ['关于', ['#hard-refresh', '#credits']],
];
const layout = (page) => page.evaluate(() => {
  const root = document.querySelector('.settings'); const out = []; let cur = null;
  for (const el of root.children) { if (el.classList.contains('set-sec')) { cur = { title: el.textContent, ids: [] }; out.push(cur); } else if (cur) cur.ids.push(el); }
  return out.map((s) => ({ title: s.title, html: s.ids.map((e) => e.outerHTML).join('') }));
});
(async () => {
  {
    // the admin block slides open and shut without re-drawing the page
    const { browser, page } = await start(new Map(), { local: true, motion: true, viewport: { width: 820, height: 1180 } });
    await addKid(page, 'Dory'); await openSettings(page);
    const H = () => page.$eval('#admin-box', (e) => Math.round(e.getBoundingClientRect().height));
    ok((await H()) === 0 && !(await page.locator('#add-kid').isVisible()), 'switched off: the admin block takes no room and is not visible');
    await page.evaluate(() => { window.__same = document.querySelector('#manage-mode'); });
    await require('./harness.cjs').adminOn(page); await page.uncheck('#manage-mode'); await page.waitForTimeout(500);   // (the first time sets the password)
    await page.click('#manage-mode'); await page.fill('#admin-pw', '1234'); await page.click('#admin-ok'); await page.waitForSelector('dialog.center', { state: 'detached' });
    await page.waitForTimeout(90); const mid = await H();
    await page.waitForSelector('#add-kid', { state: 'visible' }); await page.waitForTimeout(450); const full = await H();
    ok(mid > 0 && mid < full && full > 200, `switching on slides it open (${mid}px after 90 ms, ${full}px at the end)`);
    ok(await page.evaluate(() => window.__same === document.querySelector('#manage-mode')), 'and the page is not drawn again (same switch element)');
    await page.uncheck('#manage-mode'); await page.waitForTimeout(90); const mid2 = await H();
    await page.waitForTimeout(450);
    ok(mid2 > 0 && mid2 < full && (await H()) === 0 && !(await page.locator('#add-kid').isVisible()), 'switching off folds it up until it is gone');
    await require('./harness.cjs').adminOn(page); await page.reload(); await page.waitForSelector('#manage-mode'); await page.waitForTimeout(450);
    ok(!(await page.locator('#add-kid').isVisible()), 'admin mode is not remembered: after a reload the block is folded');
    await browser.close();
  }
  for (const locale of ['zh-CN', 'en-US']) {
    const { browser, page } = await start(new Map(), { local: true, locale, viewport: { width: 820, height: 1180 } });
    await addKid(page, 'Dory'); await openManage(page);
    const secs = await layout(page);
    ok(secs.length === WANT.length, `${locale}: ${WANT.length} section headings (got ${secs.length})`);
    if (locale === 'zh-CN') ok(secs.map((s) => s.title).join('|') === WANT.map((w) => w[0]).join('|'), 'headings are in the planned order');
    else ok(!secs.some((s) => /[一-鿿]/.test(s.title)), 'English headings contain no Chinese: ' + secs.map((s) => s.title).join(' / '));
    for (let i = 0; i < WANT.length; i++) for (const sel of WANT[i][1]) {
      const id = sel.replace(/^[#.]/, '');
      ok(!!secs[i] && secs[i].html.includes(id), `${locale}: ${sel} sits under section ${i + 1}`);
    }
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${locale}: no horizontal overflow`);
    await browser.close();
  }
  done();
})();
