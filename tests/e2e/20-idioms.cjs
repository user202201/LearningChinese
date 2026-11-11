// Idioms: ONE list and ONE story page shared by every child. A "成语故事" button under the week's characters opens the list (idioms in order, by week);
// tapping one opens its story page (the idiom in 田字格 cells with pinyin, and the story the adult typed). Adding idioms, editing a story, shared between children,
// back goes to where you came from, phone layout, English / French.
const { start, checks, addKid, openKid, enterWeek, WEEK1 } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
const store = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem('learn.local.' + k) || 'null'), key);
const noChinese = (page) => page.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (/[一-鿿]/.test(n.textContent) && !n.parentElement.closest('.user, .user-title, .tzg, .kname')) bad.push(n.textContent.trim()); } return bad; });
(async () => {
  const { browser, page } = await start(new Map(), { local: true, today: '2026-11-10', touch: true, viewport: { width: 390, height: 844 } });
  await addKid(page, 'Dory'); await addKid(page, 'Leo'); await openKid(page, 'Dory');
  await enterWeek(page, '2026-11-08', WEEK1);
  const geo = await page.evaluate(() => { const g = document.querySelector('.cards').getBoundingClientRect(), b = document.querySelector('#idioms-btn').getBoundingClientRect(), s = document.querySelector('main.scroll, .scroll').getBoundingClientRect(); return { below: b.top - g.bottom, toBottom: s.bottom - b.bottom, text: document.querySelector('#idioms-btn').textContent }; });
  ok(geo.text === '成语故事' && geo.below > 60 && geo.toBottom < 60, 'the week page has a "成语故事" button at the bottom of the screen, not right under the characters (' + Math.round(geo.below) + ' px below them, ' + Math.round(geo.toBottom) + ' px from the bottom edge)');
  await page.screenshot({ path: OUT + 'week-idioms-btn.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  const short = await page.evaluate(() => { const g = document.querySelector('.cards').getBoundingClientRect(), b = document.querySelector('#idioms-btn').getBoundingClientRect(); return { below: b.top - g.bottom, w: document.documentElement.scrollWidth > innerWidth }; });
  ok(short.below >= 10 && !short.w, 'on a short screen (phone held sideways) the button simply follows the characters (' + Math.round(short.below) + ' px below) and the page scrolls');
  await page.setViewportSize({ width: 390, height: 844 });
  // the same big button as "Start the game", only without the nudge animation
  const look = () => page.evaluate(() => { const b = document.querySelector('#idioms-btn, #game-start'), c = getComputedStyle(b); return { bg: c.backgroundImage, h: Math.round(b.getBoundingClientRect().height), r: c.borderRadius, fs: c.fontSize, col: c.color, sh: c.boxShadow, anim: c.animationName, w: Math.round(b.getBoundingClientRect().width) }; });
  const idBtn = await look();
  await page.click('#tab-game'); await page.waitForSelector('#game-start'); const gameBtn = await look();
  ok(idBtn.bg === gameBtn.bg && idBtn.h === gameBtn.h && idBtn.r === gameBtn.r && idBtn.fs === gameBtn.fs && idBtn.col === gameBtn.col && idBtn.sh === gameBtn.sh && idBtn.w === gameBtn.w && idBtn.h >= 60, 'the "成语故事" button looks exactly like "开始游戏" (' + idBtn.w + 'x' + idBtn.h + ' px, radius ' + idBtn.r + ', ' + idBtn.fs + ')');
  ok(idBtn.anim === 'none', 'but without its nudge animation');
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid'); await openKid(page, 'Dory');

  // --- the list (empty first)
  await page.click('#idioms-btn'); await page.waitForSelector('#idiom-add');
  ok(await page.locator('#idiom-empty').count() === 1 && (await page.textContent('h1')) === '成语故事', 'the idiom list opens; with no idioms it says how to add them');
  // adding: cancelling says nothing; saving says how many
  await page.click('#idiom-add'); await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog', { state: 'detached' });
  ok(await page.locator('#toasts .toast:has-text("个成语")').count() === 0 && await page.locator('.idiom-card').count() === 0, 'cancelling the add window changes nothing and says nothing');
  await page.click('#idiom-add'); await page.fill('dialog textarea', '一心一意 画蛇添足，守株待兔'); await page.click('dialog button.primary');
  await page.waitForSelector('.idiom-card'); 
  ok((await page.$$eval('.idiom-card .idiom-name', (e) => e.map((x) => x.textContent))).join('|') === '一心一意|画蛇添足|守株待兔', 'the three idioms are listed, in the order they were typed');
  ok(await page.locator('#toasts .toast:has-text("已添加 3 个成语")').count() === 1 && (await store(page, 'idioms.json')).weeks[0].items.length === 3, 'a message says "added 3 idioms" and they are saved in idioms.json (shared, not in a child file)');
  ok((await page.textContent('.idiom-week')) === '第1周', 'under the heading of their week');
  await page.click('#idiom-add'); await page.fill('dialog textarea', '一心一意'); await page.click('dialog button.primary');
  await page.waitForSelector('#toasts .toast:has-text("已经在列表里")');
  ok(await page.locator('.idiom-card').count() === 3, 'adding an idiom that is already there adds nothing (and says so)');

  // --- the list shows only the week it was opened from; "all idioms" shows every week
  await page.click('#idiom-add'); await page.fill('dialog input[type=date]', '2026-11-01'); await page.fill('dialog textarea', '亡羊补牢 掩耳盗铃'); await page.click('dialog button.primary');
  await page.waitForSelector('#toasts .toast:has-text("已添加 2 个成语")');
  ok(await page.locator('.idiom-card').count() === 3 && (await page.$$eval('.idiom-card .idiom-name', (e) => e.map((x) => x.textContent))).join('|') === '一心一意|画蛇添足|守株待兔', "idioms added for another week are not in this week's list: it still shows only this week's three");
  ok((await page.textContent('#idiom-scope')) === '全部成语', 'and a button offers "all idioms"');
  await page.click('#idiom-scope'); await page.waitForFunction(() => document.querySelectorAll('.idiom-card').length === 5);
  ok((await page.$$eval('.idiom-week', (e) => e.map((x) => x.textContent))).join('|') !== '' && (await page.$$eval('.idiom-week', (e) => e.length)) === 2 && (await page.textContent('#idiom-scope')) === '只看这一周', 'all idioms: both weeks, in order, each under its heading; the button now says "this week only"');
  await page.click('#idiom-scope'); await page.waitForFunction(() => document.querySelectorAll('.idiom-card').length === 3);
  ok(await page.locator('.idiom-card').count() === 3, 'and back to this week only');

  // --- the story page
  await page.click('.idiom-card[data-idiom=画蛇添足]'); await page.waitForSelector('#idiom-chars');
  const sp = await page.evaluate(() => ({ cells: [...document.querySelectorAll('#idiom-chars .tzg .ch')].map((e) => e.textContent).join(''), py: [...document.querySelectorAll('#idiom-chars .tzg .py')].map((e) => e.textContent).join(' '), vis: [...document.querySelectorAll('#idiom-chars .tzg .py')].every((e) => getComputedStyle(e).visibility === 'visible'), over: document.documentElement.scrollWidth > innerWidth }));
  ok(sp.cells === '画蛇添足' && sp.vis && sp.py === 'huà shé tiān zú' && !sp.over, 'the story page shows the idiom in 田字格 cells with its pinyin: ' + sp.py);
  ok(await page.locator('#idiom-nostory').count() === 1, 'no story yet: it says so');
  await page.click('#story-edit'); await page.fill('dialog textarea', '从前有个人画蛇。\n他给蛇添了脚。'); await page.click('#story-save');
  await page.waitForSelector('#idiom-story');
  ok((await page.textContent('#idiom-story')) === '从前有个人画蛇。\n他给蛇添了脚。' && (await store(page, 'idioms.json')).stories['画蛇添足'] === '从前有个人画蛇。\n他给蛇添了脚。', 'the story is written, shown (line breaks kept) and saved');
  ok(await page.locator('#toasts .toast:has-text("已保存故事")').count() === 1, 'with a message');
  await page.screenshot({ path: OUT + 'idiom-story.png' });
  await page.click('#story-edit'); await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog', { state: 'detached' });
  ok((await page.textContent('#idiom-story')).startsWith('从前'), 'cancelling the story window changes nothing');
  await page.reload(); await page.waitForSelector('#idiom-story');
  ok((await page.textContent('#idiom-story')).includes('他给蛇添了脚'), 'the story is still there after a reload');

  // --- back goes where it came from
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid'); await openKid(page, 'Dory');
  await page.click('#idioms-btn'); await page.click('.idiom-card[data-idiom=画蛇添足]'); await page.waitForSelector('#idiom-story');
  await page.click('button.back'); await page.waitForSelector('.idiom-card');
  ok((await page.textContent('h1')) === '成语故事' && await page.locator('.idiom-card').count() === 3, 'back from a story: the list');
  await page.screenshot({ path: OUT + 'idiom-list.png' });
  await page.click('button.back'); await page.waitForSelector('.weekbar');
  ok((await page.textContent('h1')).includes('Dory'), "back from the list: Dory's page, where it was opened");

  // --- shared by every child
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid');
  await openKid(page, 'Leo');
  await page.click('#idioms-btn'); await page.waitForSelector('.idiom-card');
  ok(await page.locator('.idiom-card').count() === 3, "Leo's button opens the very same list (3 idioms, shared)");
  await page.click('.idiom-card[data-idiom=画蛇添足]'); await page.waitForSelector('#idiom-story');
  ok((await page.textContent('#idiom-story')).includes('画蛇'), 'and the same story');
  await page.click('button.back'); await page.click('button.back'); await page.waitForSelector('.weekbar');
  ok((await page.textContent('h1')).includes('Leo'), "back goes to Leo's page");

  // --- English and French: nothing Chinese left except the user's own idioms and story
  for (const [loc, btn] of [['en', 'Idiom stories'], ['fr', 'Histoires de chengyu']]) {
    await page.evaluate((l) => { const s = JSON.parse(localStorage.getItem('learn.settings.v1') || '{}'); s.lang = l; localStorage.setItem('learn.settings.v1', JSON.stringify(s)); }, loc);
    await page.evaluate(() => (location.hash = '#/')); await page.reload(); await page.waitForSelector('.kid');
    await openKid(page, 'Leo');
    ok((await page.textContent('#idioms-btn')) === btn, loc + ': the button reads "' + btn + '"');
    await page.click('#idioms-btn'); await page.waitForSelector('.idiom-card');
    ok((await noChinese(page)).length === 0 && !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), loc + ': the list has no Chinese UI text and fits the phone ' + JSON.stringify(await noChinese(page)));
    await page.click('#idiom-add'); ok((await noChinese(page)).length === 0, loc + ': the add window is translated ' + JSON.stringify(await noChinese(page))); await page.click('dialog button >> nth=0'); await page.waitForSelector('dialog', { state: 'detached' });
    await page.click('.idiom-card[data-idiom=画蛇添足]'); await page.waitForSelector('#idiom-story');
    ok((await noChinese(page)).length === 0 && !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), loc + ': the story page is translated and fits ' + JSON.stringify(await noChinese(page)));
    await page.screenshot({ path: OUT + `idiom-story-${loc}.png` });
  }
  // --- both sides equal on a tablet and a desktop (rule 13)
  for (const [w, h2] of [[820, 1180], [1180, 820], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h2 });
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('learn.settings.v1') || '{}'); s.lang = 'zh'; localStorage.setItem('learn.settings.v1', JSON.stringify(s)); });
    await page.evaluate(() => (location.hash = '#/idioms')); await page.reload(); await page.waitForSelector('.idiom-card');
    const l = await page.evaluate(() => { const c = document.querySelector('.idiom-card').getBoundingClientRect(); return c.left - (innerWidth - c.right); });
    await page.click('.idiom-card[data-idiom=画蛇添足]'); await page.waitForSelector('#idiom-chars');
    const s2 = await page.evaluate(() => { const c = document.querySelector('#idiom-chars').getBoundingClientRect(), st = document.querySelector('#idiom-story')?.getBoundingClientRect(); return [c.left - (innerWidth - c.right), st ? st.left - (innerWidth - st.right) : 0]; });
    ok(Math.abs(l) <= 1 && Math.abs(s2[0]) <= 1 && Math.abs(s2[1]) <= 1, w + 'x' + h2 + ': the list, the idiom and the story are centred (equal space left and right: ' + [l, ...s2].map((x) => x.toFixed(1)).join(', ') + ')');
  }
  await done(browser);
})();
