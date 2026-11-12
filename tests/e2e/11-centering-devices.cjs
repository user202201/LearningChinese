// "Both sides must be equal": on every screen size (iPhone small / normal / large / landscape, iPad mini / Air / Pro, both ways, a narrow and a wide
// desktop window) the content is centred: equal space left and right, the character cards are exactly as wide as the week bar, the empty-area plus and
// the full-screen character are in the middle, and nothing in the full-screen view lies on anything else. (Emulated screens in Chromium: real devices are not available here.)
const { start, checks, addKid, openKid, enterWeek, openManage, goHome, WEEK3 } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
const DEVICES = {
  'iphone-se': [375, 667], 'iphone-14': [390, 844], 'iphone-pro-max': [430, 932], 'iphone-landscape': [844, 390],
  'ipad-mini-portrait': [744, 1133], 'ipad-air-portrait': [820, 1180], 'ipad-landscape': [1180, 820], 'ipad-pro-portrait': [1024, 1366],
  'desktop-narrow': [577, 768], 'desktop': [1440, 900], 'desktop-wide': [1920, 1080],
};
const TOL = 2;
/** space left and right of an element inside its scrolling area (a classic scroll bar takes room on desktops; the content is centred in what is left) */
const gaps = (page, sel) => page.$eval(sel, (e) => {
  const sc = e.closest('.scroll'); const r = e.getBoundingClientRect();
  const a = sc ? sc.getBoundingClientRect() : { left: 0, right: innerWidth };
  const right = sc ? a.left + sc.clientWidth : a.right;
  return { left: r.left - a.left, right: right - r.right };
});
const centred = async (page, sel, what, tag) => { const g = await gaps(page, sel); ok(Math.abs(g.left - g.right) <= TOL, `${tag} ${what}: equal space left / right (${Math.round(g.left)} / ${Math.round(g.right)})`); };

(async () => {
  for (const [lang, locale] of [['zh', 'zh-CN'], ['en', 'en-US'], ['fr', 'fr-FR']]) {
    for (const [name, [w, h]] of Object.entries(DEVICES)) {
      if (lang !== 'zh' && !['iphone-14', 'ipad-air-portrait', 'desktop'].includes(name)) continue;
      const tag = `${lang}/${name}`;
      const t = await start(new Map(), { local: true, locale, viewport: { width: w, height: h }, today: '2026-11-10', touch: /iphone|ipad/.test(name) });
      const { page } = t;
      // the first time: the one thing to do is in the exact middle of the screen
      const mid = await page.evaluate(() => { const g = document.querySelector('.home-empty'); const sc = g.closest('.scroll'); const a = sc.getBoundingClientRect(); const items = [...g.children].map((c) => c.getBoundingClientRect()); const top = Math.min(...items.map((r) => r.top)), bottom = Math.max(...items.map((r) => r.bottom)); const b = document.querySelector('#add-kid-big').getBoundingClientRect(); return { dx: (b.left + b.width / 2) - (a.left + sc.clientWidth / 2), dy: (top + bottom) / 2 - (a.top + a.height / 2) }; });
      ok(Math.abs(mid.dx) <= TOL && Math.abs(mid.dy) <= 20, `${tag} first time: the add-a-child + is in the middle of the screen (off by ${mid.dx.toFixed(1)} / ${mid.dy.toFixed(1)}px)`);
      await addKid(page, 'Dory'); await addKid(page, 'Leo');
      await page.waitForTimeout(100);
      await centred(page, '.kids', 'home: the children list', tag);
      await openManage(page);
      await centred(page, '.narrow .card', 'settings: the cards', tag);
      await centred(page, '#add-kid', 'settings: the add button', tag);
      await page.screenshot({ path: `${OUT}centering-${tag.replace('/', '-')}-settings.png` });
      await goHome(page);
      await openKid(page, 'Dory');
      // empty week: the big plus is in the middle
      const plus = await page.$eval('#enter', (e) => { const r = e.getBoundingClientRect(); const sc = e.closest('.scroll'); const a = sc.getBoundingClientRect(); return (r.left + r.width / 2) - (a.left + sc.clientWidth / 2); });
      ok(Math.abs(plus) <= TOL, `${tag} empty week: the big + is in the middle (off by ${plus.toFixed(1)}px)`);
      await page.click('#enter'); await require('./harness.cjs').setDate(page, '2026-11-08'); await page.fill('dialog textarea', WEEK3);
      await page.click('dialog button.primary'); await page.waitForSelector('dialog', { state: 'detached' });
      await page.waitForFunction(() => document.querySelectorAll('.cards .tzg').length === 10 && !document.querySelector('#toasts .toast.working'));
      await centred(page, '.weekbar', 'week: the week bar', tag);
      await centred(page, '.cards', 'week: the characters', tag);
      const align = await page.evaluate(() => { const b = document.querySelector('.weekbar').getBoundingClientRect(); const c = [...document.querySelectorAll('.cards .tzg')]; return [c[0].getBoundingClientRect().left - b.left, b.right - c[4].getBoundingClientRect().right]; });
      ok(Math.abs(align[0]) <= 1 && Math.abs(align[1]) <= 1, `${tag} week: the characters are exactly as wide as the week bar (${align.map((x) => x.toFixed(1)).join(' / ')})`);
      await page.screenshot({ path: `${OUT}centering-${tag.replace('/', '-')}-week.png` });

      // the learned page
      await page.click('button[data-tab=learned]'); await page.waitForSelector('#grid .tzg');
      await centred(page, '#grid', 'learned: the grid', tag);
      const big = await page.$eval('.learned-head .big', (e) => { const r = e.getBoundingClientRect(); const sc = e.closest('.scroll'); const a = sc.getBoundingClientRect(); return (r.left + r.width / 2) - (a.left + sc.clientWidth / 2); });
      ok(Math.abs(big) <= TOL, `${tag} learned: the total is in the middle (off by ${big.toFixed(1)}px)`);
      await page.click('button:has(+ button[data-tab=learned])');

      // the full-screen character: in the middle, nothing lies on anything else
      await page.waitForSelector('.cards .tzg'); await page.click('.cards .tzg >> nth=4'); await page.waitForSelector('#viewer');
      await page.addStyleTag({ content: '.viewer * { letter-spacing: .05em !important; }' });   // (stress: wider letters, like a wider font on a real device)
      await page.click('#viewer .vstage'); await page.waitForFunction(() => document.querySelector('#viewer .tzg .py')?.textContent);
      await page.waitForTimeout(350);
      const v = await page.evaluate(() => {
        const R = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        return { vw: innerWidth, vh: innerHeight, box: R('#viewer .tzg .box'), py: R('#viewer .tzg .py'), top: R('.vcount'), close: R('.vclose'), prev: R('#viewer-prev'), next: R('#viewer-next'), hint: R('.vhint'),
          ch: parseFloat(getComputedStyle(document.querySelector('#viewer .ch')).fontSize), pyText: document.querySelector('#viewer .tzg .py').textContent };
      });
      const cx = (v.box.l + v.box.r) / 2 - v.vw / 2, cy = (v.box.t + v.box.b) / 2 - v.vh / 2;
      ok(Math.abs(cx) <= TOL && Math.abs(cy) <= TOL, `${tag} full screen: the character box is exactly in the middle (off by ${cx.toFixed(1)} / ${cy.toFixed(1)}px)`);
      ok(Math.abs(v.box.w - v.box.h) <= 1, `${tag} full screen: the box is square (${Math.round(v.box.w)}px)`);
      ok(Math.abs(v.prev.l - (v.vw - v.next.r)) <= TOL, `${tag} full screen: the two switch buttons are equally far from the edges (${Math.round(v.prev.l)} / ${Math.round(v.vw - v.next.r)})`);
      ok(v.box.w >= Math.min(v.vw, v.vh) * 0.4 && v.ch > v.box.w * 0.6, `${tag} full screen: big (box ${Math.round(v.box.w)}px, character ${Math.round(v.ch)}px)`);
      const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      const parts = { counter: v.top, close: v.close, prev: v.prev, next: v.next, box: v.box, pinyin: v.py, hint: v.hint };
      const clashes = [];
      for (const [a, ra] of Object.entries(parts)) for (const [b, rb] of Object.entries(parts)) if (a < b && ra && rb && hit(ra, rb)) clashes.push(`${a}/${b}`);
      ok(clashes.length === 0, `${tag} full screen: nothing lies on anything else` + (clashes.length ? ' -> ' + clashes.join(', ') : ''));
      ok(Object.values(parts).every((r) => r.l >= -0.5 && r.t >= -0.5 && r.r <= v.vw + 0.5 && r.b <= v.vh + 0.5), `${tag} full screen: everything is inside the screen`);
      await page.screenshot({ path: `${OUT}centering-${tag.replace('/', '-')}-viewer.png` });
      await t.browser.close();
    }
  }
  await done();
})();
