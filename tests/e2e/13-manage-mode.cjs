// Manage mode (Settings): a red "-" on every character (like deleting an app on the iPhone) to delete a wrongly entered character.
// Off by default; cancel = nothing happens and nothing is said; the change is saved; works in "Learned" too; the + comes back below 10;
// an emptied week disappears; turning it off again; the red buttons are inside the screen on every device size.
const { start, checks, addKid, openKid, enterWeek, openSettings, goHome, openEntry } = require('./harness.cjs');
const { ok, done } = checks();
(async () => {
  const store = new Map();
  const { browser, page } = await start(store, { today: '2026-11-10', viewport: { width: 390, height: 844 } });
  await addKid(page, 'Dory'); await addKid(page, 'Leo');
  await openKid(page, 'Dory');
  await openEntry(page);                                              // 12 characters typed by mistake: two too many (the + is gone at 10 or more)
  await require('./harness.cjs').setDate(page, '2026-11-08'); await page.fill('dialog textarea', '一二三四五六七八九十甲乙');
  await page.click('dialog button.primary'); await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForFunction(() => document.querySelectorAll('.cards .tzg').length === 12 && !document.querySelector('#toasts .toast.working'));
  const kidFile = () => JSON.parse([...store].find(([k]) => /^kids\/k\w+\.json$/.test(k))[1]);
  ok(await page.locator('#enter').count() === 0 && await page.locator('.tzg .del').count() === 0, 'with 12 characters there is no + and nothing to delete them with (the problem)');

  // --- the switch is in Settings and off by default
  await openSettings(page);
  ok(await page.locator('#manage-mode').count() === 1 && !(await page.locator('#manage-mode').isChecked()), 'Settings has "Manage mode", off by default');
  await page.screenshot({ path: (process.env.D || 'tests/out/work/') + 'manage-settings.png' });
  await require('./harness.cjs').adminOn(page);
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kids'); await openKid(page, 'Dory');
  ok(await page.locator('.cards .tzg .del').count() === 12, 'switched on: every character has a red "-"');
  ok(await page.locator('.managebar').count() === 1, 'and a bar says that manage mode is on');
  const m = await page.$eval('.cards .tzg .del', (e) => { const r = e.getBoundingClientRect(); const b = e.closest('.box').getBoundingClientRect(); return { w: r.width, cx: r.left + r.width / 2, cy: r.top + r.height / 2, bx: b.right, by: b.top, col: getComputedStyle(e).backgroundColor }; });
  ok(m.col === 'rgb(224, 49, 49)' && m.w >= 26 && m.w <= 44 && Math.abs(m.cx - m.bx) <= 12 && Math.abs(m.cy - m.by) <= 12, 'a red round button in the top right corner of the character (' + Math.round(m.w) + 'px)');
  await page.screenshot({ path: (process.env.D || 'tests/out/work/') + 'manage-week.png' });
  await page.click('.cards .tzg >> nth=0', { position: { x: 20, y: 40 } }).catch(() => {});
  ok(await page.locator('#viewer').count() === 0, 'in manage mode a tap on a character does not open the big view');

  // --- cancelling: nothing happens, nothing is said
  const saved = JSON.stringify(kidFile());
  await page.click('.cards .tzg[data-ch=乙] .del');
  ok((await page.textContent('dialog')).includes('乙'), 'the question names the character');
  await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForTimeout(300);
  ok(await page.locator('.cards .tzg').count() === 12 && JSON.stringify(kidFile()) === saved && await page.locator('#toasts .toast:has-text("已删除")').count() === 0, 'cancelling deletes nothing and shows no "done" message');

  // --- deleting the two wrong ones
  await page.click('.cards .tzg[data-ch=乙] .del'); await page.click('dialog button.danger');
  await page.waitForSelector('#toasts .toast:has-text("已删除“乙”")');
  await page.waitForFunction(() => document.querySelectorAll('.cards .tzg').length === 11);
  ok(!kidFile().weeks[0].chars.includes('乙') && kidFile().weeks[0].chars.length === 11, 'the character is gone, and the change is saved');
  ok(await page.locator('#enter').count() === 0, 'with 11 there is still no +');
  await page.click('.cards .tzg[data-ch=甲] .del'); await page.click('dialog button.danger');
  await page.waitForFunction(() => document.querySelectorAll('.cards .tzg').length === 10 && !document.querySelector('#toasts .toast.working'));
  ok(await page.locator('.cards .tzg').count() === 10 && (await page.textContent('button[data-tab=learned]')).includes('10'), 'back to 10; the "Learned" total follows (10)');
  await page.click('.cards .tzg[data-ch=十] .del'); await page.click('dialog button.danger');
  await page.waitForFunction(() => document.querySelectorAll('.cards .tzg').length === 9 && !document.querySelector('#toasts .toast.working'));
  ok(await page.locator('#enter.plus').count() === 1, 'below 10 the small + is back (to add the missing one)');

  // --- in "Learned" as well; a tap on the red button does not toggle the pinyin
  await page.click('button[data-tab=learned]'); await page.waitForSelector('#grid .tzg');
  ok(await page.locator('#grid .tzg .del').count() === 9 && await page.locator('.managebar').count() === 1, 'the "Learned" grid has the red buttons and the bar too');
  const pyBefore = await page.locator('#grid.pinyin-on').count();
  await page.click('#grid .tzg[data-ch=九] .del'); await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog', { state: 'detached' });
  ok(await page.locator('#grid.pinyin-on').count() === pyBefore, 'tapping the red button does not show / hide the pinyin');
  await page.click('#grid .tzg[data-ch=九] .del'); await page.click('dialog button.danger');
  await page.waitForFunction(() => document.querySelectorAll('#grid .tzg').length === 8 && !document.querySelector('#toasts .toast.working'));
  ok(kidFile().weeks[0].chars.join('') === '一二三四五六七八', 'deleted in "Learned": saved');

  // --- an emptied week disappears
  for (const c of '一二三四五六七八') { await page.click(`#grid .tzg[data-ch=${c}] .del`); await page.click('dialog button.danger'); await page.waitForFunction((n) => document.querySelectorAll('#grid .tzg').length === n && !document.querySelector('#toasts .toast.working'), 7 - '一二三四五六七八'.indexOf(c)); }
  ok(kidFile().weeks.length === 0 && (await page.textContent('#learned-scroll')).includes('还没有入库的字'), 'a week with nothing left disappears; the empty "Learned" page says so');

  // --- turning it off
  await page.click('#manage-off');
  await page.waitForFunction(() => !document.querySelector('.managebar'));
  ok(await page.locator('.tzg .del').count() === 0, 'the "Done" button on the bar turns it off');
  await openSettings(page);
  ok(!(await page.locator('#manage-mode').isChecked()), 'and the switch in Settings is off');
  await require('./harness.cjs').adminOn(page); await page.reload(); await page.waitForSelector('#manage-mode');
  ok(!(await page.locator('#manage-mode').isChecked()) && !(await page.locator('#add-kid').isVisible()), 'admin mode is not remembered: after the app is opened again it is off');
  await browser.close();

  // --- every screen size: the red buttons are inside the screen and big enough to hit
  for (const [name, w, h] of [['iphone-se', 375, 667], ['iphone-14', 390, 844], ['ipad-air-portrait', 820, 1180], ['ipad-landscape', 1180, 820], ['desktop', 1440, 900]]) {
    const t = await start(new Map(), { local: true, today: '2026-11-10', viewport: { width: w, height: h }, touch: /ip/.test(name) });
    await addKid(t.page, 'Dory');
    await openKid(t.page, 'Dory'); await openEntry(t.page);
    await require('./harness.cjs').setDate(t.page, '2026-11-08'); await t.page.fill('dialog textarea', '一二三四五六七八九十');
    await t.page.click('dialog button.primary'); await t.page.waitForSelector('dialog', { state: 'detached' });
    await require('./harness.cjs').manageOnHere(t.page); await t.page.waitForSelector('.cards .tzg .del');
    const r = await t.page.$$eval('.cards .tzg .del', (els) => els.map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, w: b.width }; }));
    const vw = await t.page.evaluate(() => innerWidth);
    ok(r.length === 10 && r.every((b) => b.l >= 0 && b.r <= vw && b.w >= 26), name + ': all 10 red buttons are inside the screen and big enough (' + Math.round(Math.min(...r.map((b) => b.w))) + 'px)');
    await t.page.screenshot({ path: (process.env.D || 'tests/out/work/') + `manage-${name}.png` });
    await t.browser.close();
  }

  // --- languages
  for (const [locale, title] of [['en-US', 'Admin mode'], ['fr-FR', 'Mode administrateur']]) {
    const t = await start(new Map(), { local: true, locale, today: '2026-11-10', viewport: { width: 390, height: 844 } });
    await addKid(t.page, 'Dory');
    await openKid(t.page, 'Dory'); await openEntry(t.page);
    await require('./harness.cjs').setDate(t.page, '2026-11-08'); await t.page.fill('dialog textarea', '一二三');
    await t.page.click('dialog button.primary'); await t.page.waitForSelector('dialog', { state: 'detached' });
    await require('./harness.cjs').manageOnHere(t.page); await t.page.waitForSelector('.cards .tzg .del');
    await t.page.click('.cards .tzg .del >> nth=0');
    const cn = () => t.page.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (/[一-鿿]/.test(n.nodeValue) && !n.parentElement.closest('.user, .user-title, #toasts')) bad.push(n.nodeValue.trim()); return bad.filter((x) => /[一-鿿]/.test(x.replace(/[«“]\s*[一-鿿]\s*[»”]/g, ''))); });   // (the user's own character inside the quotes is fine)
    const c = await cn();
    ok(c.length === 0, locale + ': the manage bar and the delete question have no Chinese UI text' + (c.length ? ' -> ' + JSON.stringify(c) : ''));
    await t.page.click('dialog button:not(.danger)'); await t.page.waitForSelector('dialog', { state: 'detached' });
    await openSettings(t.page);
    ok((await t.page.textContent('.card:has(#manage-mode)')).includes(title), locale + ': Settings: "' + title + '"');
    await t.browser.close();
  }
  await done();
})();
