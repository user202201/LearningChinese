// The child-friendly look: an animal and a colour for every child (stable, different), the mascot, readable white text on every colour,
// pop-in animations that are off when the device asks for less motion.
const { start, checks, addKid, openKid } = require('./harness.cjs');
const { ok, done } = checks();
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
(async () => {
  const store = new Map();
  const { browser, page } = await start(store, { local: true, today: '2026-11-08' });
  ok(await page.locator('.home-hero .mascot svg[data-art=mascot]').count() === 1, 'the home screen has the mascot');
  for (const n of ['Dory', 'Leo', 'Antoine', 'Mia', 'Tom', 'Zoe']) await addKid(page, n);
  const kids = await page.$$eval('.kid', (els) => els.map((e) => ({ color: e.style.getPropertyValue('--kid'), animal: e.querySelector('.avatar svg')?.dataset.art })));
  ok(kids.length === 6 && kids.every((k) => k.animal), 'every child has an animal avatar');
  ok(new Set(kids.map((k) => k.color)).size === 6, 'six children, six different colours');
  await page.reload(); await page.waitForSelector('.kid');
  const again = await page.$$eval('.kid', (els) => els.map((e) => e.querySelector('.avatar svg')?.dataset.art));
  ok(JSON.stringify(again) === JSON.stringify(kids.map((k) => k.animal)), 'the same child keeps the same animal after a reload');

  // white text on every child colour must be readable (large bold text needs 3:1)
  const low = kids.filter((k) => contrast(hex(k.color), [255, 255, 255]) < 3.0).map((k) => k.color);
  ok(low.length === 0, 'white text is readable on every child colour' + (low.length ? ' -> too light: ' + low.join(', ') : ''));

  // a child's page uses the child's colour
  await openKid(page, 'Leo');
  const c = await page.$eval('.page', (e) => e.style.getPropertyValue('--kid'));
  ok(c === kids[1].color, "Leo's page uses Leo's colour");
  const rgb = await page.$eval('.seg button.on', (e) => getComputedStyle(e).backgroundColor);
  const want = hex(c);
  ok(rgb === `rgb(${want.join(', ')})`, "the selected tab is painted in the child's colour");
  ok(await page.locator('.top.kid-hero .avatar svg').count() === 1, "the child's animal is in the header");
  await browser.close();

  // animations: on by default, off when the device asks for less motion
  for (const [motion, expect] of [[true, 'pop'], [false, 'none']]) {
    const t = await start(new Map(), { local: true, motion });
    await addKid(t.page, 'Dory');
    const a = await t.page.$eval('.kid', (e) => getComputedStyle(e).animationName);
    ok(a === expect, motion ? 'cards pop in when motion is allowed (' + a + ')' : 'no animation when the device asks for less motion (' + a + ')');
    await t.browser.close();
  }
  await done();
})();
