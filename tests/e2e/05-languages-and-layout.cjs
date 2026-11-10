// Languages (zh / en / fr) and layout: no Chinese UI text left in en / fr (the user's own names, characters and idioms stay as typed),
// nothing sticking out of the screen on a phone and on tablets, the user's text is never "translated". Screenshots: tests/out/work/layout-*.png (look at them).
const { start, checks, addKid, openKid, enterWeek, WEEK1, WEEK2 } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
const SIZES = { phone: { width: 360, height: 740 }, 'ipad-portrait': { width: 820, height: 1180 }, 'ipad-landscape': { width: 1180, height: 820 } };
const cjk = /[一-鿿]/;

/** UI text with Chinese in it: everything visible except the user's own texts (class user / user-title) */
const chineseLeft = (page) => page.evaluate(() => {
  const bad = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (!/[一-鿿]/.test(n.nodeValue) || n.parentElement.closest('.user, .user-title, script, style')) continue;
    const r = n.parentElement.getBoundingClientRect(); if (!r.width && !r.height) continue;
    bad.push(n.nodeValue.trim());
  }
  for (const el of document.querySelectorAll('[title],[placeholder],[aria-label]'))
    for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && /[一-鿿]/.test(v) && !el.closest('.user, .user-title')) bad.push(a + ': ' + v); }
  return bad;
}).then((list) => list.filter((t) => /[一-鿿]/.test(t.replace(/小明/g, '')) && t !== '中文'));   // (the child's name inside a message, and the language's own name, are fine)
/** things that do not fit: a page wider than the screen, a button whose text is cut, an element sticking out on the right */
const fits = (page) => page.evaluate(() => {
  const bad = []; const W = innerWidth;
  if (document.documentElement.scrollWidth > W) bad.push('page wider than the screen: ' + document.documentElement.scrollWidth + ' > ' + W);
  for (const el of document.querySelectorAll('button, h1, h2, h3, label, .note, .toast, .idiom, .kid, .kname')) {
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    if (r.right > W + 1 || r.left < -1) bad.push('outside the screen: ' + (el.textContent || el.className).trim().slice(0, 30));
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && el.tagName !== 'H1') bad.push('clipped text: ' + el.textContent.trim().slice(0, 30));
  }
  const btns = [...document.querySelectorAll(document.querySelector('dialog[open]') ? 'dialog[open] button' : '.page button, .login button')]   // (behind an open dialog nothing counts)
    .filter((b) => b.getBoundingClientRect().width);
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i].getBoundingClientRect(), b = btns[j].getBoundingClientRect();
    if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2 && !btns[i].contains(btns[j]) && !btns[j].contains(btns[i])) bad.push('overlap: ' + btns[i].textContent.trim() + ' / ' + btns[j].textContent.trim());
  }
  return bad;
});

(async () => {
  for (const [lang, locale] of [['zh', 'zh-CN'], ['en', 'en-US'], ['fr', 'fr-FR']]) {
    for (const [sizeName, viewport] of Object.entries(SIZES)) {
      const tag = `${lang}/${sizeName}`;
      const { browser, page } = await start(new Map(), { local: true, locale, viewport, today: '2026-11-08', noLogin: true });
      await page.waitForSelector('.login');
      const shot = (n) => page.screenshot({ path: `${OUT}layout-${lang}-${sizeName}-${n}.png` });
      const check = async (what) => {
        const f = await fits(page); ok(f.length === 0, `${tag} ${what}: fits` + (f.length ? ' -> ' + f.join(' | ') : ''));
        if (lang !== 'zh') { const c = await chineseLeft(page); ok(c.length === 0, `${tag} ${what}: no Chinese UI text left` + (c.length ? ' -> ' + c.join(' | ') : '')); }
      };
      await check('login'); await shot('1-login');
      await page.click('#local-btn'); await page.waitForSelector('.empty');
      await check('home (no children)');
      await page.click('button.primary'); await page.waitForSelector('dialog input');
      await check('add-child dialog'); await page.fill('dialog input', 'Antoine Dupont-Martin'); await page.click('dialog button.primary');
      await page.waitForSelector('.kid'); await addKid(page, '小明');
      await check('home'); await shot('2-home');
      await page.click('.kid >> nth=1'); await page.waitForSelector('#enter');
      await check('week (empty)');
      await page.click('#enter'); await page.fill('dialog input[type=date]', '2026-11-08'); await page.fill('dialog textarea >> nth=0', WEEK1 + '假');
      await page.fill('dialog textarea >> nth=1', '一心一意 画蛇添足 守株待兔 亡羊补牢 掩耳盗铃 对牛弹琴 一心一意');
      await check('enter dialog'); await shot('3-enter');
      await page.click('dialog button.primary'); await page.waitForSelector('dialog', { state: 'detached' });
      await page.waitForFunction(() => !document.querySelector('#toasts .toast.working'));
      await check('week (filled, with saved message)'); await shot('4-week');
      await page.click('button[data-tab=learned]'); await page.waitForSelector('#grid .tzg');
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
      await page.waitForFunction(() => document.querySelector('#grid .tzg .py')?.textContent);
      await check('learned (pinyin on)'); await shot('5-learned');
      ok((await page.textContent('#grid .tzg[data-ch=假] .box')) === '假', `${tag} the user's characters are shown as typed`);
      ok((await page.textContent('.top h1')) === '小明', `${tag} the user's child name is shown as typed`);
      await page.click('button.back'); await page.waitForSelector('.kids');
      await page.evaluate(() => (location.hash = '#/settings')); await page.waitForSelector('.card h3');
      await check('settings'); await shot('6-settings');
      await page.click('button:has-text("改用"), button:has-text("instead"), button:has-text("plutôt")');
      await page.waitForSelector('.login');
      await check('login (after leaving this-device mode)');
      await browser.close();
    }
  }
  // the language menu itself switches the language of what is on screen, and the choice is kept
  const { browser, page } = await start(new Map(), { local: true, locale: 'zh-CN', today: '2026-11-08' });
  await page.evaluate(() => (location.hash = '#/settings')); await page.waitForSelector('.card h3');
  await page.click('.seg button:has-text("English")');
  ok((await page.textContent('h1')) === 'Settings', 'choosing English switches the screen at once');
  await page.click('.seg button:has-text("Français")');
  ok((await page.textContent('h1')) === 'Réglages', 'choosing Français switches it to French');
  await page.reload(); await page.waitForSelector('h1');
  ok((await page.textContent('h1')) === 'Réglages', 'the language choice is remembered');
  await page.click('.seg button:has-text("中文")');
  ok((await page.textContent('h1')) === '设置', 'choosing Chinese puts the original texts back');
  await done(browser);
})();
