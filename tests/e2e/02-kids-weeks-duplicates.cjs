// Children (3), entering a week, "already learned?" detection, shared idioms, week navigation, rename / delete.
const { start, checks, addKid, openKid, enterWeek, WEEK1, WEEK2, WEEK3 } = require('./harness.cjs');
const { ok, done } = checks();
(async () => {
  const { browser, page } = await start(new Map(), { local: true, today: '2026-11-10' });
  for (const n of ['Dory', 'Leo', 'Antoine']) await addKid(page, n);
  ok(await page.locator('.kid').count() === 3, 'three children on the home screen');
  await page.click('text=＋ 添加孩子'); await page.fill('dialog input', 'dory'); await page.click('dialog button.primary');
  await page.waitForSelector('#toasts .toast:has-text("同名")');
  ok(await page.locator('.kid').count() === 3, 'a second "Dory" is refused with a message');
  await page.click('text=＋ 添加孩子'); await page.fill('dialog input', 'Nobody'); await page.click('dialog button:has-text("取消")');
  await page.waitForTimeout(300);
  ok(await page.locator('.kid').count() === 3 && await page.locator('#toasts .toast:has-text("已添加 Nobody")').count() === 0, 'cancelling "add a child" adds nobody and shows no "done" message');

  await openKid(page, 'Dory');
  ok((await page.textContent('h2.sec >> nth=0')).includes('（0）'), 'this week (2026-11-08) is shown first and is empty');
  ok((await page.textContent('.wlabel .muted')).startsWith('2026-11-08'), 'the week starts on the Sunday before today');

  // week 1 entry: live check while typing
  await page.click('#enter');
  await page.fill('dialog input[type=date]', '2026-10-27');         // a Tuesday: snaps to Sunday 10-25
  ok((await page.textContent('dialog .muted.small')).includes('2026-10-25'), 'a date inside the week snaps to its Sunday');
  await page.fill('dialog textarea >> nth=0', '假 辣，酸、贫\n纺 abc 123 炒缸锅烛扇');
  ok((await page.textContent('#note-chars')).includes('共 10 个汉字，新的 10 个'), 'spaces, punctuation, digits and letters are dropped: 10 characters');
  await page.fill('dialog textarea >> nth=1', '一心一意 三心二意，画蛇添足\n守株待兔 亡羊补牢 掩耳盗铃');
  ok((await page.textContent('#note-idioms')).includes('共 6 个成语'), '6 idioms recognised');
  await page.click('dialog button.primary');
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForSelector('#toasts .toast:has-text("已保存")');
  ok((await page.textContent('#toasts')).includes('新增 10 个汉字、6 个成语'), 'result message says what was saved');
  ok((await page.textContent('.wlabel strong')) === '第1周', 'week 1');
  ok(await page.locator('.cards .tzg').count() === 10, '10 characters shown for the week');
  ok(await page.locator('.idiom').count() === 6, '6 idioms shown for the week');
  ok((await page.textContent('.cards')).includes('假'), 'the typed characters are there');

  // week 2 and week 3 (week 3 repeats two characters from week 1 and 2 and an idiom)
  await enterWeek(page, '2026-11-01', WEEK2, '见义勇为 一鸣惊人 井底之蛙 狐假虎威 对牛弹琴 马到成功');
  ok((await page.textContent('.wlabel strong')) === '第2周', 'week 2 numbered from week 1');
  await page.click('#enter');
  await page.fill('dialog input[type=date]', '2026-11-08');
  await page.fill('dialog textarea >> nth=0', WEEK3 + '假鼓');
  const note = await page.textContent('#note-chars');
  ok(note.includes('新的 10 个'), 'week 3: 10 new characters');
  ok(note.includes('已学过') && note.includes('假（第1周）') && note.includes('鼓（第2周）'), 'duplicates are named with the week they were learned in');
  await page.fill('dialog textarea >> nth=1', '一心一意 新成语一二');
  ok((await page.textContent('#note-idioms')).includes('一心一意（第1周）'), 'an idiom learned before is detected (shared by all children)');
  await page.click('dialog button.primary');
  await page.waitForSelector('#toasts .toast:has-text("已保存")');
  const msg = await page.textContent('#toasts');
  ok(msg.includes('新增 10 个汉字、1 个成语') && msg.includes('3 个已学过'), 'saving skips the learned ones (2 characters + 1 idiom) and says how many');
  ok(await page.locator('.cards .tzg').count() === 10, 'week 3 has exactly its 10 new characters (no duplicates added)');
  ok((await page.textContent('.cards')).indexOf('假') < 0, 'the repeated character is not in week 3');
  ok((await page.textContent('button[data-tab=learned]')).includes('30'), 'learned tab counts 30 characters');

  // nothing new: the save button stays disabled
  await page.click('#enter');
  await page.fill('dialog textarea >> nth=0', '假辣');
  ok(await page.locator('dialog button.primary').isDisabled(), 'only learned characters typed: Save is disabled');
  await page.click('dialog button:has-text("取消")');

  // week navigation
  await page.click('button[title=上一周]');
  ok((await page.textContent('.wlabel strong')) === '第2周' && await page.locator('.cards .tzg').count() === 10, 'previous week shows week 2');
  await page.click('button[title=下一周]'); await page.click('button[title=下一周]');
  ok((await page.textContent('h2.sec >> nth=0')).includes('（0）'), 'a week with nothing entered is empty');
  await page.click('text=回到本周');
  ok((await page.textContent('.wlabel .muted')).startsWith('2026-11-08'), '"back to this week" returns to the current week');

  // children are independent: Leo has not learned anything
  await page.click('button.back');
  await page.waitForSelector('.kids');
  ok((await page.textContent('.kid:has-text("Dory")')).includes('已学 30 字'), 'Dory: 30 characters on the home card');
  ok((await page.textContent('.kid:has-text("Leo")')).includes('已学 0 字'), 'Leo: 0 (each child has their own library)');
  await openKid(page, 'Leo');
  await page.click('#enter'); await page.fill('dialog input[type=date]', '2026-11-08'); await page.fill('dialog textarea >> nth=0', '假鼓');
  ok((await page.textContent('#note-chars')).includes('新的 2 个'), 'Leo can learn what Dory has already learned');
  await page.click('dialog button:has-text("取消")');
  await page.click('button[title=更多]');
  await page.click('dialog button:has-text("修改名字")'); await page.fill('dialog input', 'Léo'); await page.click('dialog button.primary');
  await page.waitForSelector('h1:has-text("Léo")');
  ok(true, 'rename works');

  // delete: cancelling is silent, confirming removes the child but not the idioms
  await page.click('button[title=更多]'); await page.click('dialog button:has-text("删除这个孩子")');
  await page.click('dialog button:has-text("取消")');
  await page.waitForTimeout(300);
  ok(await page.locator('#toasts .toast:has-text("已删除")').count() === 0, 'cancelling a delete shows no "done" message');
  await page.click('button[title=更多]'); await page.click('dialog button:has-text("删除这个孩子")');
  await page.click('dialog button.danger');
  await page.waitForSelector('#toasts .toast:has-text("已删除")');
  ok(await page.locator('.kid').count() === 2, 'child deleted');
  await openKid(page, 'Dory');
  await page.click('button[title=上一周]'); await page.click('button[title=上一周]');
  ok(await page.locator('.idiom').count() === 6, 'idioms (shared) are untouched');
  await done(browser);
})();
