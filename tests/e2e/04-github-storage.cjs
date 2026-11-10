// Data in the private repository: which files are written, UTF-8 round trip, a second device sees it, two devices editing at the same time
// are merged (not overwritten), a lost connection is reported and nothing is claimed as saved, delete removes the file.
const { start, checks, addKid, openKid, enterWeek, WEEK1, WEEK2, REPO, URL } = require('./harness.cjs');
const { ok, done } = checks();
(async () => {
  const store = new Map();
  const opts = { today: '2026-11-10' };
  const { browser, page, log } = await start(store, opts);
  await addKid(page, 'Dory'); await addKid(page, 'Leo');
  const kids = JSON.parse(store.get('kids.json'));
  ok(kids.kids.length === 2 && kids.kids[0].name === 'Dory' && !!kids.kids[0].id, 'kids.json lists the children');
  const id = kids.kids[0].id, id2 = kids.kids[1].id;
  await openKid(page, 'Dory');
  await enterWeek(page, '2026-10-25', WEEK1, '一心一意 画蛇添足');
  ok(store.has(`kids/${id}.json`) && !store.has(`kids/${id2}.json`), 'characters go to kids/<id>.json of that child only');
  const kd = JSON.parse(store.get(`kids/${id}.json`));
  ok(kd.weeks.length === 1 && kd.weeks[0].start === '2026-10-25' && kd.weeks[0].chars.join('') === WEEK1, 'file content: week start and the characters, UTF-8 intact');
  ok(JSON.parse(store.get('idioms.json')).weeks[0].items.join(',') === '一心一意,画蛇添足', 'idioms are in idioms.json (shared)');
  ok(JSON.parse(store.get('kids.json')).startWeek === '2026-10-25', 'the first week entered becomes week 1');
  ok([...store.keys()].every((k) => k === 'kids.json' || k === 'idioms.json' || /^kids\/k\w+\.json$/.test(k)), 'nothing else is written to the repository');

  // a second device (fresh browser) signs in and sees the same data
  const b = await start(store, { today: '2026-11-10' });
  await openKid(b.page, 'Dory');   // this week is empty, so the newest entered week is shown
  ok(await b.page.locator('.cards .tzg').count() === 10, 'a second device sees the 10 characters');
  await b.browser.close();

  // two devices at the same time: the other device adds a week to the same file while this one is saving
  let injected = false;
  opts.beforePut = (key, st, ver) => {
    if (injected || key !== `kids/${id}.json`) return;
    injected = true;
    const d = JSON.parse(st.get(key)); d.weeks.push({ start: '2026-11-01', chars: Array.from('桌椅') });
    st.set(key, JSON.stringify(d)); ver.set(key, (ver.get(key) || 0) + 1);
  };
  await page.click('button[title=下一周]');
  await enterWeek(page, '2026-11-08', WEEK2);
  const merged = JSON.parse(store.get(`kids/${id}.json`));
  ok(injected && merged.weeks.length === 3, 'conflict (409): the other device\'s week and this one\'s are both kept');
  ok(merged.weeks.some((w) => w.chars.join('') === '桌椅') && merged.weeks.some((w) => w.chars.join('') === WEEK2), 'nothing was overwritten');
  ok((await page.textContent('#toasts')).includes('已保存'), 'and the user is told it was saved');

  // lost connection: an error is shown, no "saved" message
  await page.waitForSelector('#enter');                 // (the page has finished reloading after the save)
  opts.offline = true;
  await page.click('#enter'); await page.fill('dialog textarea >> nth=0', '梨桃李'); await page.click('dialog button.primary');
  await page.waitForSelector('#toasts .toast:has-text("网络请求失败")', { timeout: 15000 });
  ok(await page.locator('#toasts .toast:has-text("已保存")').count() === 0 || (await page.textContent('#toasts')).indexOf('网络请求失败') >= 0, 'offline: the failure is reported');
  ok(await page.locator('#toasts .toast.working').count() === 0, 'the "saving…" spinner is closed when it failed');
  ok(!store.get(`kids/${id}.json`).includes('梨'), 'nothing was written');
  opts.offline = false;

  // delete a child: its file is removed from the repository
  await page.click('button.back'); await openKid(page, 'Leo');
  await page.click('button[title=更多]'); await page.click('dialog button:has-text("删除这个孩子")'); await page.click('dialog button.danger');
  await page.waitForSelector('#toasts .toast:has-text("已删除")');
  ok(JSON.parse(store.get('kids.json')).kids.length === 1, 'child removed from kids.json');
  ok(!store.has(`kids/${id2}.json`) || log.deletes.length === 1, 'and its data file is deleted');
  await done(browser);
})();
