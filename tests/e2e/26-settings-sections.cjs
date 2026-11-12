// Settings are grouped by function: section headings in a fixed order, every control under the right heading, nothing lost.
const { start, checks, addKid, openManage } = require('./harness.cjs');
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
