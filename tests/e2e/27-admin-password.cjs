// Admin mode is protected by a password kept on this device: chosen (twice) the first time, asked for afterwards; cancelling or a wrong password changes nothing.
const { start, checks, addKid, openSettings, goHome } = require('./harness.cjs');
const { ok, done } = checks();
(async () => {
  const { browser, page } = await start(new Map(), { local: true, viewport: { width: 820, height: 1180 } });
  await addKid(page, 'Dory');
  const stored = () => page.evaluate(() => localStorage.getItem('learn.admin.v1'));
  const box = () => page.isChecked('#manage-mode');
  const open = async () => { await page.click('#manage-mode'); await page.waitForSelector('#admin-pw'); };
  await openSettings(page);
  ok(!(await stored()), 'no password yet');

  // first use: choose one
  await open();
  ok(await page.locator('#admin-pw2').count() === 1 && (await page.textContent('dialog h2')) === '设置管理密码', 'the first time: a window to set the password, typed twice');
  await page.fill('#admin-pw', '12'); await page.fill('#admin-pw2', '12'); await page.click('#admin-ok');
  ok((await page.textContent('#admin-err')).includes('至少 4 位') && !(await stored()), 'too short is refused with a message, nothing saved');
  await page.fill('#admin-pw', 'abcd'); await page.fill('#admin-pw2', 'abce'); await page.click('#admin-ok');
  ok((await page.textContent('#admin-err')).includes('不一致') && !(await stored()), 'two different entries are refused');
  await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog.center', { state: 'detached' }); await page.waitForSelector('#toasts .toast', { state: 'detached' }).catch(() => {});
  ok(!(await box()) && !(await page.locator('#add-kid').isVisible()) && await page.locator('#toasts .toast').count() === 0 && !(await stored()), 'cancelling: the switch goes back off, nothing is opened, no message, no password');
  await open(); await page.fill('#admin-pw', 'abcd'); await page.fill('#admin-pw2', 'abcd'); await page.click('#admin-ok');
  await page.waitForSelector('dialog.center', { state: 'detached' }); await page.waitForSelector('#add-kid', { state: 'visible' });
  const s = await stored();
  ok(await box() && !!s && !s.includes('abcd') && JSON.parse(s).hash.length >= 32, 'a good password opens admin mode and only a salted hash is kept (not the password)');
  await page.waitForSelector('#toasts .toast:has-text("已设置管理密码")');
  ok((await page.textContent('#toasts')).includes('已设置管理密码'), 'a message says the password was set');

  // afterwards: asked for it
  await page.uncheck('#manage-mode'); await page.waitForTimeout(100);
  await open();
  ok(await page.locator('#admin-pw2').count() === 0 && (await page.textContent('dialog h2')) === '输入管理密码', 'afterwards the password is asked for (one field)');
  await page.fill('#admin-pw', 'wrong'); await page.click('#admin-ok'); await page.waitForSelector('#admin-err:not(:empty)');
  ok((await page.textContent('#admin-err')) === '密码不对' && await page.locator('#admin-pw').inputValue() === '' && !(await page.locator('#add-kid').isVisible()), 'a wrong password: message, field cleared, nothing opens');
  await page.fill('#admin-pw', 'abcd'); await page.press('#admin-pw', 'Enter');
  await page.waitForSelector('dialog.center', { state: 'detached' }); await page.waitForSelector('#add-kid', { state: 'visible' });
  ok(await box(), 'the right password (Enter works) opens it');

  // change it
  await page.click('#admin-change'); await page.waitForSelector('#admin-pw2');
  await page.fill('#admin-pw', 'wxyz'); await page.fill('#admin-pw2', 'wxyz'); await page.click('#admin-ok');
  await page.waitForSelector('dialog.center', { state: 'detached' });
  await page.waitForSelector('#toasts .toast:has-text("已修改密码")');
  ok((await page.textContent('#toasts')).includes('已修改密码'), 'changing the password says so');
  await page.uncheck('#manage-mode'); await page.waitForTimeout(100); await open();
  await page.fill('#admin-pw', 'abcd'); await page.click('#admin-ok'); await page.waitForSelector('#admin-err:not(:empty)');
  ok((await page.textContent('#admin-err')) === '密码不对', 'the old password no longer works');
  await page.fill('#admin-pw', 'wxyz'); await page.click('#admin-ok'); await page.waitForSelector('dialog.center', { state: 'detached' });
  ok(await box(), 'the new one does');

  // switching OFF never shows the password window, however fast it is tapped on and off again
  await page.uncheck('#manage-mode'); await page.waitForTimeout(100);
  ok(await page.locator('dialog[open]').count() === 0, 'switching off asks for nothing');
  await page.click('#manage-mode'); await page.waitForSelector('#admin-pw'); await page.keyboard.press('Escape'); await page.waitForSelector('dialog.center', { state: 'detached' });
  ok(!(await box()) && await page.locator('dialog[open]').count() === 0, 'cancel with Esc: back off, no second window');
  await page.click('#manage-mode'); await page.waitForSelector('#admin-pw'); await page.fill('#admin-pw', 'wxyz'); await page.click('#admin-ok'); await page.waitForSelector('dialog.center', { state: 'detached' });
  await page.click('#manage-mode', { clickCount: 2, delay: 20 }); await page.waitForTimeout(400);
  ok(await page.locator('dialog[open]').count() <= 1, 'a quick double tap on the switch (off, then on again) opens one password window at most');
  if (await page.locator('dialog[open]').count()) { await page.keyboard.press('Escape'); await page.waitForSelector('dialog.center', { state: 'detached' }); }
  ok(!(await box()) && !(await page.locator('#add-kid').isVisible()), 'and cancelling it leaves everything switched off');

  // not remembered; the week page's "Done" turns it off without a password
  await page.reload(); await page.waitForSelector('#manage-mode');
  ok(!(await box()), 'after the app is opened again admin mode is off (the password is asked again)');
  await browser.close();

  // translations
  for (const [locale, t1, t2, wrong] of [['en-US', 'Set an admin password', 'Enter the admin password', 'Wrong password'], ['fr-FR', 'Définir un mot de passe administrateur', 'Saisissez le mot de passe administrateur', 'Mot de passe incorrect']]) {
    const t = await start(new Map(), { local: true, locale, viewport: { width: 390, height: 780 } });
    await addKid(t.page, 'Dory'); await openSettings(t.page);
    await t.page.click('#manage-mode'); await t.page.waitForSelector('#admin-pw');
    const d1 = await t.page.textContent('dialog'); ok((await t.page.textContent('dialog h2')) === t1 && !/[一-鿿]/.test(d1), locale + ': first-use window is translated');
    const fit = await t.page.$eval('dialog', (e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && [...e.querySelectorAll('input,button')].every((b) => { const x = b.getBoundingClientRect(); return x.right <= r.right + 1 && x.left >= r.left - 1; }); });
    ok(fit, locale + ': the window fits the phone screen');
    await t.page.fill('#admin-pw', 'abcd'); await t.page.fill('#admin-pw2', 'abcd'); await t.page.click('#admin-ok'); await t.page.waitForSelector('dialog.center', { state: 'detached' });
    await t.page.uncheck('#manage-mode'); await t.page.waitForTimeout(100); await t.page.click('#manage-mode'); await t.page.waitForSelector('#admin-pw');
    ok((await t.page.textContent('dialog h2')) === t2, locale + ': ask window title');
    await t.page.fill('#admin-pw', 'x'); await t.page.click('#admin-ok'); await t.page.waitForSelector('#admin-err:not(:empty)'); ok((await t.page.textContent('#admin-err')) === wrong, locale + ': wrong-password message');
    await t.browser.close();
  }
  done();
})();
