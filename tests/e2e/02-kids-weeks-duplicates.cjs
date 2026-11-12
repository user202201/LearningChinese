// Children (3) and where they are managed (Settings, not the home screen), entering a week, "already learned?" detection, week navigation,
// rename / delete in Settings (cancel = no message), and that a child's own page has no delete.
const { start, checks, addKid, openKid, enterWeek, gotoWeek, openEntry, openManage, goHome, WEEK1, WEEK2, WEEK3 } = require('./harness.cjs');
const { ok, done } = checks();
(async () => {
  const { browser, page } = await start(new Map(), { local: true, today: '2026-11-10' });

  // the very first time: nothing but one big + in the middle
  ok(await page.locator('#add-kid-big').count() === 1 && await page.locator('main button').count() === 1, 'first time, nobody yet: the only thing on the screen is the big + (add a child)');
  for (const n of ['Dory', 'Leo', 'Antoine']) await addKid(page, n);
  ok(await page.locator('.kid').count() === 3, 'three children on the home screen');
  ok(await page.locator('main button').count() === 3 && await page.locator('#add-kid, #add-kid-big, #import-btn').count() === 0, 'once there are children the home screen holds only the children: no add / import buttons');

  // adding is in Settings: a second "Dory" is refused, cancelling adds nobody and says nothing
  await openManage(page);
  ok(await page.locator('.kidrow').count() === 3 && await page.locator('#import-btn').count() === 1, 'Settings lists the children and has "add a child" and "import from Excel"');
  await page.click('#add-kid'); await page.fill('dialog input', 'dory'); await page.click('dialog button.primary');
  await page.waitForSelector('#toasts .toast:has-text("同名")');
  ok(await page.locator('.kidrow').count() === 3, 'a second "Dory" is refused with a message');
  await page.click('#add-kid'); await page.fill('dialog input', 'Nobody'); await page.click('dialog button:has-text("取消")');
  await page.waitForTimeout(300);
  ok(await page.locator('.kidrow').count() === 3 && await page.locator('#toasts .toast:has-text("已添加 Nobody")').count() === 0, 'cancelling "add a child" adds nobody and shows no "done" message');
  await goHome(page);

  await openKid(page, 'Dory');
  ok(await page.locator('button[title=更多]').count() === 0 && await page.locator('text=删除').count() === 0, "a child's own page has no menu and no delete (that is in Settings)");
  ok((await page.textContent('h2.sec >> nth=0')).includes('（0）'), 'this week (2026-11-08) is shown first and is empty');
  ok((await page.textContent('.wlabel .muted')).startsWith('2026-11-08'), 'the week starts on the Sunday before today');
  ok(await page.locator('.idiom, .idioms, #enter-idioms, .idiom-card').count() === 0 && await page.locator('#idioms-btn').count() === 1 && (await page.textContent('.narrow')).replace('成语故事', '').indexOf('成语') === -1, 'the child page has no idiom list of its own (they are the same for everybody): only the one "成语故事" button that opens the shared list');

  // week 1 entry: live check while typing
  await page.click('#enter');
  ok(await page.locator('dialog textarea').count() === 1, 'the entry has only the characters box');
  await require('./harness.cjs').setDate(page, '2026-10-27');         // a Tuesday: snaps to Sunday 10-25
  ok((await page.textContent('dialog .muted.small')).includes('2026-10-25'), 'a date inside the week snaps to its Sunday');
  await page.fill('dialog textarea', '假 辣，酸、贫\n纺 abc 123 炒缸锅烛扇');
  ok((await page.textContent('#note-chars')).includes('共 10 个汉字，新的 10 个'), 'spaces, punctuation, digits and letters are dropped: 10 characters');
  await page.click('dialog button.primary');
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForSelector('#toasts .toast:has-text("已保存")');
  ok((await page.textContent('#toasts')).includes('新增 10 个汉字'), 'result message says what was saved');
  ok((await page.textContent('.wlabel strong')) === '第1周', 'week 1');
  ok(await page.locator('.cards .tzg').count() === 10 && (await page.textContent('.cards')).includes('假'), '10 characters shown for the week');

  // week 2, then week 3 (which repeats two characters)
  await enterWeek(page, '2026-11-01', WEEK2);
  ok((await page.textContent('.wlabel strong')) === '第2周', 'week 2 numbered from week 1');
  await openEntry(page);   // (the week just saved has its 10 characters and no +)
  ok(await page.locator('dialog input[type=date]').isDisabled(), 'in the entry window the week date is locked (it is the week being shown)');
  await require('./harness.cjs').setDate(page, '2026-11-08');
  await page.fill('dialog textarea', WEEK3 + '假鼓');
  const note = await page.textContent('#note-chars');
  ok(note.includes('新的 10 个'), 'week 3: 10 new characters');
  ok(note.includes('已入库') && note.includes('假') && note.includes('鼓') && !/第\d+周/.test(note), 'duplicates are named (no week in brackets) in');
  { const vp = page.viewportSize(); await page.setViewportSize({ width: 320, height: 420 }); await page.waitForTimeout(150); const r = await page.$eval('dialog button.primary', (b) => { const x = b.getBoundingClientRect(); return { b: x.bottom, t: x.top }; }); ok(r.b <= 420 && r.t >= 0, 'on a small screen (320 x 420) the Cancel / Save buttons stay in view'); await page.setViewportSize(vp); }
  await page.click('dialog button.primary');
  await page.waitForSelector('#toasts .toast:has-text("已入库，已跳过")');   // (the toast of the previous save may still be on screen)
  const msg = await page.textContent('#toasts');
  ok(msg.includes('新增 10 个汉字') && msg.includes('2 个已入库'), 'saving skips the learned ones and says how many (2)');
  ok(await page.locator('.cards .tzg').count() === 10 && (await page.textContent('.cards')).indexOf('假') < 0, 'week 3 has exactly its 10 new characters; the repeated one is not added again');
  ok((await page.textContent('button[data-tab=learned]')).includes('30'), 'learned tab counts 30 characters');
  await openEntry(page);   // (the week just saved has its 10 characters and no +)
  await page.fill('dialog textarea', '假辣');
  ok(await page.locator('dialog button.primary').isDisabled(), 'only learned characters typed: Save is disabled');
  await page.click('dialog button:has-text("取消")');

  // week navigation (forward arrows, the list for earlier weeks)
  await gotoWeek(page, '2026-11-01');
  ok((await page.textContent('.wlabel strong')) === '第2周' && await page.locator('.cards .tzg').count() === 10, 'choosing week 2 in the week list shows it');
  await page.click('button[title=下一周]'); await page.click('button[title=下一周]');
  ok((await page.textContent('h2.sec >> nth=0')).includes('（0）'), 'a week with nothing entered is empty');
  await page.click('text=回到本周');
  ok((await page.textContent('.wlabel .muted')).startsWith('2026-11-08'), '"back to this week" returns to the current week');

  // children are independent
  await goHome(page);
  ok((await page.textContent('.kid:has-text("Dory")')).includes('已入库 30 字') && (await page.textContent('.kid:has-text("Leo")')).includes('已入库 0 字'), 'Dory 30, Leo 0: each child has their own library');
  await openKid(page, 'Leo');
  await page.click('#enter'); await require('./harness.cjs').setDate(page, '2026-11-08'); await page.fill('dialog textarea', '假鼓');
  ok((await page.textContent('#note-chars')).includes('新的 2 个'), 'Leo can learn what Dory has already learned');
  await page.click('dialog button:has-text("取消")');

  // rename and delete are in Settings
  await openManage(page);
  await page.click('.kidrow:has-text("Leo") .rename'); await page.fill('dialog input', 'Léo'); await page.click('dialog button.primary');
  await page.waitForSelector('.kidrow:has-text("Léo")');
  ok(true, 'rename (in Settings) works');
  await page.click('.kidrow:has-text("Léo") .delete');
  ok((await page.textContent('dialog')).includes('0 个汉字'), 'the delete question says how much would be lost');
  await page.click('dialog button:has-text("取消")');
  await page.waitForTimeout(300);
  ok(await page.locator('#toasts .toast:has-text("已删除")').count() === 0 && await page.locator('.kidrow').count() === 3, 'cancelling a delete shows no "done" message and deletes nobody');
  await page.click('.kidrow:has-text("Léo") .delete'); await page.click('dialog button.danger');
  await page.waitForSelector('#toasts .toast:has-text("已删除")');
  ok(await page.locator('.kidrow').count() === 2, 'child deleted');
  await goHome(page);
  ok(await page.locator('.kid').count() === 2, 'the home screen follows');
  await done(browser);
})();
