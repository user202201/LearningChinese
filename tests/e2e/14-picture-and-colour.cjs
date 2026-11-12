// "Picture and colour": tap the picture at the top of a child's page (or use Settings) to choose a picture and a theme colour. Every choice shows
// in a preview at once and is saved only with "Done"; "Cancel" changes nothing. The colour changes the whole look of that child (page, tabs, cards,
// home card, Settings). All colours are readable with white text; the window fits on a small phone; translated.
const { start, checks, addKid, openKid, openManage, goHome } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const css = (h) => `rgb(${rgb(h).join(', ')})`;
(async () => {
  const store = new Map();
  const { browser, page } = await start(store, { today: '2026-11-10', viewport: { width: 390, height: 844 } });
  await addKid(page, 'Dory'); await addKid(page, 'Leo');
  const kids = () => JSON.parse(store.get('kids.json')).kids;
  const dory = () => kids().find((k) => k.name === 'Dory');
  await openKid(page, 'Dory');
  const startColor = dory().color;

  // --- the picture at the top: a double tap opens the window (no pencil on it, a single tap does nothing)
  ok(await page.locator('#hero-avatar').count() === 1 && await page.locator('#hero-avatar .avatar svg').count() === 1, "the child's picture is at the top of the page");
  const pencil = await page.$eval('#hero-avatar', (e) => getComputedStyle(e, '::after').content);
  ok(pencil === 'none' || pencil === 'normal' || pencil === '""', 'there is no pencil badge on it any more (' + pencil + ')');
  ok((await page.getAttribute('#hero-avatar', 'title')) === '双击修改头像和颜色', 'its tip says to double-tap');
  const ta = await page.evaluate(() => ['body', '#hero-avatar', '#hero-avatar svg', '.tabs button', '.weekbar button'].map((s) => [s, getComputedStyle(document.querySelector(s)).touchAction]));
  ok(ta.every(([, v]) => v === 'manipulation'), 'double-tap zoom is switched off on the page, the picture, the tabs and the buttons (touch-action: manipulation): ' + ta.map((x) => x.join('=')).join(', '));
  const hash = await page.evaluate(() => location.hash);
  await page.click('#hero-avatar'); await page.waitForTimeout(600);
  ok(await page.locator('dialog').count() === 0, 'a single click does not open anything');
  await page.click('#hero-avatar'); await page.waitForTimeout(700); await page.click('#hero-avatar'); await page.waitForTimeout(600);
  ok(await page.locator('dialog').count() === 0, 'two clicks far apart in time are not a double click');
  await page.focus('#hero-avatar'); await page.keyboard.press('Enter'); await page.waitForSelector('dialog .swatches');
  ok(true, 'with the keyboard (no double click there): Enter opens it');
  await page.click('#avatar-cancel'); await page.waitForSelector('dialog', { state: 'detached' });
  await page.dblclick('#hero-avatar'); await page.waitForSelector('dialog .swatches');
  ok(await page.evaluate(() => location.hash) === hash, 'a double click opens the window and goes nowhere');
  ok(await page.locator('dialog .swatches button').count() === 10 && await page.locator('dialog .animals button').count() === 12, '10 colours and 12 animals');
  ok(await page.locator(`dialog .swatch.on[data-color="${startColor}"]`).count() === 1, "the child's colour is marked");
  await page.screenshot({ path: OUT + 'picture-colour-dialog.png' });

  // --- choosing shows at once; Cancel changes nothing and says nothing
  const before = store.get('kids.json');
  await page.click('dialog .swatch[data-color="#d6336c"]'); await page.click('dialog [data-animal=tiger]');
  const prev = await page.$eval('dialog .avatar-now .avatar', (e) => ({ bg: getComputedStyle(e).backgroundColor, art: e.querySelector('svg').dataset.art }));
  ok(prev.bg === css('#d6336c') && prev.art === 'tiger', 'the preview follows every choice at once (' + prev.art + ', ' + prev.bg + ')');
  ok(await page.$eval('.page', (e) => e.style.getPropertyValue('--kid')) === startColor, 'the page behind has not changed yet');
  await page.click('#avatar-cancel'); await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForTimeout(300);
  ok(store.get('kids.json') === before && await page.locator('#toasts .toast:has-text("已更换")').count() === 0, 'Cancel: nothing saved, no message');
  ok(await page.$eval('.page', (e) => e.style.getPropertyValue('--kid')) === startColor, 'and the colour is as before');

  // --- Done: picture and colour together; the whole look of the child changes
  await page.dblclick('#hero-avatar'); await page.waitForSelector('dialog .swatches');
  await page.click('dialog .swatch[data-color="#d6336c"]'); await page.click('dialog [data-animal=tiger]'); await page.click('#avatar-done');
  await page.waitForSelector('#toasts .toast:has-text("已更换头像和颜色")');
  await page.waitForFunction(() => document.querySelector('.page')?.style.getPropertyValue('--kid') === '#d6336c');
  ok(dory().color === '#d6336c' && dory().avatar === 'animal:tiger', 'saved with the child (kids.json): colour and picture');
  ok(await page.$eval('#hero-avatar svg', (e) => e.dataset.art) === 'tiger', 'the new picture is at the top of the page');
  ok(await page.$eval('.seg button.on', (e) => getComputedStyle(e).backgroundColor) === css('#d6336c'), 'the selected tab has the new colour');
  const hero = await page.$eval('.top.hero', (e) => getComputedStyle(e).backgroundImage);
  ok(hero.includes('rgb(214, 51, 108)'), 'the coloured band at the top has it too');
  await page.screenshot({ path: OUT + 'picture-colour-changed.png' });

  // --- only the colour / only the picture / "Done" without a change
  await page.dblclick('#hero-avatar'); await page.waitForSelector('dialog .swatches');
  await page.click('dialog .swatch[data-color="#1c7ed6"]'); await page.click('#avatar-done');
  await page.waitForSelector('#toasts .toast:has-text("已更换颜色")');
  ok(dory().color === '#1c7ed6' && dory().avatar === 'animal:tiger', 'only the colour changed: "colour changed", the picture is kept');
  await page.waitForFunction(() => document.querySelector('.page')?.style.getPropertyValue('--kid') === '#1c7ed6');
  await page.waitForTimeout(3700);
  await page.dblclick('#hero-avatar'); await page.waitForSelector('dialog .swatches');
  await page.click('dialog [data-animal=panda]'); await page.click('#avatar-done');
  await page.waitForSelector('#toasts .toast:has-text("已更换头像")');
  ok(dory().avatar === 'animal:panda' && dory().color === '#1c7ed6', 'only the picture changed: "picture changed", the colour is kept');
  await page.waitForTimeout(3700);
  const kidsBefore = store.get('kids.json');
  await page.dblclick('#hero-avatar'); await page.waitForSelector('dialog .swatches'); await page.click('#avatar-done');
  await page.waitForSelector('dialog', { state: 'detached' }); await page.waitForTimeout(300);
  ok(store.get('kids.json') === kidsBefore && await page.locator('#toasts .toast').count() === 0, '"Done" without a change saves nothing and says nothing');

  // --- the colour is the child's everywhere; the other child keeps theirs
  await goHome(page);
  ok(await page.$eval('.kid:has-text("Dory")', (e) => e.style.getPropertyValue('--kid')) === '#1c7ed6', 'the home card has the new colour');
  const leoColor = kids().find((k) => k.name === 'Leo').color;
  ok(await page.$eval('.kid:has-text("Leo")', (e) => e.style.getPropertyValue('--kid')) === leoColor, 'the other child keeps their own colour');
  await openManage(page);
  ok(await page.$eval('.kidrow:has-text("Dory")', (e) => e.style.getPropertyValue('--kid')) === '#1c7ed6', 'and Settings');
  await page.click('.kidrow:has-text("Dory") .change-avatar'); await page.waitForSelector('dialog .swatches');
  ok(await page.locator('dialog .swatch.on[data-color="#1c7ed6"]').count() === 1 && await page.locator('dialog [data-animal=panda].on').count() === 1, 'Settings opens the same window, with the current choices marked');
  await page.click('#avatar-cancel'); await page.waitForSelector('dialog', { state: 'detached' });

  // --- every colour is readable with white text; the buttons are big enough
  await page.click('.kidrow:has-text("Dory") .change-avatar'); await page.waitForSelector('dialog .swatches');
  const sw = await page.$$eval('dialog .swatch', (e) => e.map((x) => ({ c: x.dataset.color, w: x.getBoundingClientRect().width })));
  const low = sw.filter((x) => { const [a, b] = [lum(rgb(x.c)), 1].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05) < 3; }).map((x) => x.c);
  ok(low.length === 0, 'white text is readable on every colour you can choose' + (low.length ? ' -> too light: ' + low.join(', ') : ''));
  ok(sw.every((x) => x.w >= 36), 'the colour buttons are big enough to hit (' + Math.min(...sw.map((x) => Math.round(x.w))) + 'px)');
  await page.click('#avatar-cancel');
  await browser.close();

  // --- a finger on a touch screen: two quick taps
  const tt = await start(new Map(), { local: true, touch: true, viewport: { width: 820, height: 1180 }, today: '2026-11-10' });
  await addKid(tt.page, 'Dory'); await openKid(tt.page, 'Dory');
  const hb = await tt.page.locator('#hero-avatar').boundingBox();
  const cx = hb.x + hb.width / 2, cy = hb.y + hb.height / 2;
  await tt.page.touchscreen.tap(cx, cy); await tt.page.waitForTimeout(700);
  ok(await tt.page.locator('dialog').count() === 0, 'iPad: one tap with a finger does not open it');
  await tt.page.touchscreen.tap(cx, cy); await tt.page.touchscreen.tap(cx + 3, cy + 2);
  await tt.page.waitForSelector('dialog .swatches', { timeout: 4000 });
  ok(true, 'iPad: two quick taps with a finger open it');
  await tt.browser.close();

  // --- a small phone and an iPad: the window fits
  for (const [name, w, h] of [['small-phone', 360, 640], ['ipad', 820, 1180]]) {
    const t = await start(new Map(), { local: true, viewport: { width: w, height: h }, today: '2026-11-10' });
    await addKid(t.page, 'Dory'); await openKid(t.page, 'Dory');
    await t.page.dblclick('#hero-avatar'); await t.page.waitForSelector('dialog .swatches');
    const f = await t.page.evaluate(() => { const d = document.querySelector('dialog .dlg'); const r = document.querySelector('dialog').getBoundingClientRect(); const btns = [...d.querySelectorAll('.swatch,.animal,button')].map((b) => b.getBoundingClientRect()); return { over: d.scrollWidth > d.clientWidth + 1, inside: btns.every((b) => b.left >= r.left - 1 && b.right <= r.right + 1), vw: innerWidth, dw: r.width }; });
    ok(!f.over && f.inside, name + ': the window fits (no sideways overflow, all buttons inside)');
    const doneBtn = await t.page.$eval('#avatar-done', (e) => { const r = e.getBoundingClientRect(); return { b: r.bottom, h: innerHeight, visible: r.top >= 0 && r.bottom <= innerHeight }; });
    ok(doneBtn.visible, name + ': "Done" is on the screen without scrolling (' + Math.round(doneBtn.b) + ' of ' + doneBtn.h + ' px)');
    await t.page.screenshot({ path: OUT + `picture-colour-${name}.png` });
    await t.browser.close();
  }

  // --- languages
  for (const [locale, title] of [['en-US', 'Picture and colour'], ['fr-FR', 'Image et couleur']]) {
    const t = await start(new Map(), { local: true, locale, viewport: { width: 390, height: 844 }, today: '2026-11-10' });
    await addKid(t.page, 'Dory'); await openKid(t.page, 'Dory');
    ok((await t.page.getAttribute('#hero-avatar', 'title')) !== '修改头像和颜色', locale + ': the button title is translated');
    await t.page.dblclick('#hero-avatar'); await t.page.waitForSelector('dialog .swatches');
    const text = await t.page.textContent('dialog');
    ok(text.includes(title) && !/[一-鿿]/.test(text.replace('Dory', '')), locale + ': the window is translated (' + title + ')');
    await t.browser.close();
  }
  await done();
})();
