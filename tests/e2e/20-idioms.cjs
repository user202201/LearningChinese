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
  const look = () => page.evaluate(() => { const b = document.querySelector('#idioms-btn, #game-start, #idiom-scope'), c = getComputedStyle(b); return { bg: c.backgroundImage, h: Math.round(b.getBoundingClientRect().height), r: c.borderRadius, fs: c.fontSize, col: c.color, sh: c.boxShadow, anim: c.animationName, w: Math.round(b.getBoundingClientRect().width) }; });
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
  ok((await page.$$eval('.idiom-card', (e) => e.map((x) => x.dataset.idiom))).join('|') === '一心一意|画蛇添足|守株待兔', 'the three idioms are listed, in the order they were typed');
  ok(await page.locator('#toasts .toast:has-text("已添加 3 个成语")').count() === 1 && (await store(page, 'idioms.json')).weeks[0].items.length === 3, 'a message says "added 3 idioms" and they are saved in idioms.json (shared, not in a child file)');
  ok((await page.textContent('.sec-row .sec')) === '成语（3）', 'with the count in the heading (like the characters page)');
  ok(await page.locator('.sec-row .plus#idiom-add').count() === 1, 'and a small + to add more (a week has six idioms, so there is room)');
  await page.click('#idiom-add'); await page.fill('dialog textarea', '一心一意');
  ok((await page.textContent('#idiom-check')).includes('已经学过了，不能保存：一心一意') && await page.locator('#idiom-save').isDisabled(), 'typing an idiom that is already there: the window says it is already learned and Save is off');
  await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog', { state: 'detached' });
  ok(await page.locator('.idiom-card').count() === 3, 'so nothing is added');

  // --- the list shows only the week it was opened from; "all idioms" shows every week
  await page.click('#idiom-add'); await require('./harness.cjs').setDate(page, '2026-11-01'); await page.fill('dialog textarea', '亡羊补牢 掩耳盗铃'); await page.click('dialog button.primary');
  await page.waitForSelector('#toasts .toast:has-text("已添加 2 个成语")');
  ok(await page.locator('.idiom-card').count() === 3 && (await page.$$eval('.idiom-card', (e) => e.map((x) => x.dataset.idiom))).join('|') === '一心一意|画蛇添足|守株待兔', "idioms added for another week are not in this week's list: it still shows only this week's three");
  ok((await page.textContent('#idiom-scope')) === '全部成语', 'and a button offers "all idioms"');
  const sc = await look(); const scPos = await page.evaluate(() => { const b = document.querySelector('#idiom-scope').getBoundingClientRect(), l = document.querySelector('#idiom-list').getBoundingClientRect(); return { below: b.top - l.bottom, toBottom: innerHeight - b.bottom }; });
  ok(sc.bg === idBtn.bg && sc.h === idBtn.h && sc.r === idBtn.r && sc.fs === idBtn.fs && sc.w === idBtn.w && sc.anim === 'none', 'the "all idioms" button is the same big button as "成语故事" and "开始游戏" (' + sc.w + 'x' + sc.h + ')');
  ok(scPos.toBottom < 60 && scPos.below > 60, 'and it sits at the bottom of the screen, not under the list (' + Math.round(scPos.below) + ' px below it, ' + Math.round(scPos.toBottom) + ' px from the edge)');
  const cw = await page.evaluate(() => [...document.querySelectorAll('.idiom-card')].map((r) => { const cs = [...r.querySelectorAll('.tzg')].map((c) => c.getBoundingClientRect()); const rs = getComputedStyle(r); const bx = r.querySelector('.box').getBoundingClientRect(); return { sq: Math.abs(bx.width - bx.height) <= 2 && Math.abs(cs[0].height - cs[0].width) <= 2, n: cs.length, w: Math.round(cs[0].width), same: new Set(cs.map((c) => Math.round(c.top))).size === 1, joined: cs.every((c, i) => i === 0 || Math.abs(c.left - cs[i - 1].right) <= 2.5), frame: rs.borderTopWidth, mid: [...r.querySelectorAll('.tzg')].every((z) => { const b = z.querySelector('.box').getBoundingClientRect(), g = z.querySelector('.ch').getBoundingClientRect(); return Math.abs((g.left + g.right) / 2 - (b.left + b.right) / 2) <= 1.5 && Math.abs((g.top + g.bottom) / 2 - (b.top + b.bottom) / 2) <= 1.5; }), round: parseFloat(rs.borderTopLeftRadius) > 10, cell: getComputedStyle(r.querySelector('.box')).borderTopWidth }; }));
  ok(cw.every((c) => c.n === 4 && c.sq && c.same && c.joined && c.mid && c.frame === '4px' && c.round && c.cell === '0px' && c.w >= 70 && c.w <= 102), 'one idiom per line: the four characters are JOINED in one framed strip like a line of a 田字本, each in its own 田字格 cell with the character in the middle (' + cw.map((c) => c.w + 'px').join(', ') + ')');
  await page.click('#idiom-scope'); await page.waitForFunction(() => document.querySelectorAll('.idiom-card').length === 5);
  ok((await page.$$eval('.idiom-week', (e) => e.length)) === 2 && (await page.textContent('#idiom-scope')) === '只看这一周', 'all idioms: both weeks, each under its heading; the button now says "this week only"');
  await page.click('#idiom-scope'); await page.waitForFunction(() => document.querySelectorAll('.idiom-card').length === 3);
  ok(await page.locator('.idiom-card').count() === 3, 'and back to this week only');

  // --- the story page
  await page.click('.idiom-card[data-idiom=画蛇添足]'); await page.waitForSelector('#idiom-chars');
  const sp = await page.evaluate(() => ({ cells: [...document.querySelectorAll('#idiom-chars .tzg .ch')].map((e) => e.textContent).join(''), py: [...document.querySelectorAll('#idiom-chars .tzg .py')].map((e) => e.textContent).join(' '), vis: [...document.querySelectorAll('#idiom-chars .tzg .py')].every((e) => getComputedStyle(e).visibility === 'visible'), over: document.documentElement.scrollWidth > innerWidth }));
  ok(sp.cells === '画蛇添足' && sp.vis && sp.py === 'huà shé tiān zú' && !sp.over, 'the story page shows the idiom in 田字格 cells with its pinyin: ' + sp.py);
  ok(await page.locator('#idiom-nostory').count() === 1, 'no story yet: it says so');
  const ic = await page.evaluate(() => { const b = document.querySelector('#story-edit').getBoundingClientRect(), s = b.width, cs = getComputedStyle(document.querySelector('#story-edit')); return { w: Math.round(b.width), h: Math.round(b.height), right: Math.round(innerWidth - b.right), top: Math.round(b.top), op: parseFloat(cs.opacity), bg: cs.backgroundColor, text: document.querySelector('#story-edit').textContent.trim(), svg: !!document.querySelector('#story-edit svg'), big: !!document.querySelector('button.wide#story-edit, .narrow button.wide') }; });
  ok(ic.svg && ic.text === '' && ic.w <= 44 && ic.h <= 44 && ic.right <= 24 && ic.top <= 40 && ic.op <= 0.6 && ic.bg === 'rgba(0, 0, 0, 0)' && !ic.big, 'the editor is opened by a small, faint pencil icon in the top right corner (' + ic.w + 'x' + ic.h + ' px, ' + ic.right + ' px from the right edge), not by a big button');
  await page.click('#story-edit'); await page.waitForTimeout(700);
  ok(await page.locator('dialog.center').count() === 0, 'a single tap on it does nothing (a child can not open the editor by accident)');
  await page.click('#story-edit'); await page.waitForTimeout(700); await page.click('#story-edit'); await page.waitForTimeout(700);
  ok(await page.locator('dialog.center').count() === 0, 'two slow taps (more than half a second apart) do not open it either');
  await page.focus('#story-edit'); await page.keyboard.press('Enter'); await page.waitForSelector('dialog.center');
  ok(await page.locator('dialog.center').count() === 1, 'with a keyboard Enter opens it (no mouse needed)');
  await page.click('dialog.center button:has-text("取消")'); await page.waitForSelector('dialog.center', { state: 'detached' });
  ok((await page.textContent('#idiom-nostory')).includes('双击右上角的小铅笔'), 'the empty-story text says how: double-tap the pencil');
  await page.dblclick('#story-edit');
  ok((await page.textContent('#story-count')) === '0 字（不含标点）', 'the story window shows how many characters are written, not counting punctuation: 0 at the start');
  await page.fill('dialog textarea', '从前有个人画蛇。\n他给蛇添了脚！“好”，');
  ok((await page.textContent('#story-count')) === '14 字（不含标点）', 'it counts as you type: 7 + 6 + 1 = 14 (the 。 ！ “ ” ， and the line break are not counted)');
  await page.fill('dialog textarea', '一 二，三 abc 12\n\n。。');
  ok((await page.textContent('#story-count')) === '8 字（不含标点）', 'spaces and line breaks are not counted either; letters and digits are (8)');
  await page.fill('dialog textarea', '从前有个人画蛇。\n他给蛇添了脚。'); await page.click('#story-save');
  await page.waitForSelector('#idiom-story');
  ok((await page.textContent('#idiom-story')) === '从前有个人画蛇。\n他给蛇添了脚。' && (await store(page, 'idioms.json')).stories['画蛇添足'] === '从前有个人画蛇。\n他给蛇添了脚。', 'the story is written, shown (line breaks kept) and saved');
  ok(await page.locator('#toasts .toast:has-text("已保存故事")').count() === 1, 'with a message');
  await page.screenshot({ path: OUT + 'idiom-story.png' });
  await page.dblclick('#story-edit');
  ok((await page.textContent('#story-count')) === '13 字（不含标点）', 'editing an existing story starts with its count (13)');
  await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog', { state: 'detached' });
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
    await page.click('#idiom-add'); await page.fill('dialog textarea', '一心一意'); const dn = (await page.textContent('#idiom-check')).replace('一心一意', ''); ok(!/[\u4e00-\u9fff]/.test(dn) && /learned|appris/.test(dn) && await page.locator('#idiom-save').isDisabled(), loc + ': the "already learned" warning is translated: ' + dn); await page.fill('dialog textarea', '新来的成语'); const dn2 = (await page.textContent('#idiom-check')).replace('新来的成语', ''); ok(!/[\u4e00-\u9fff]/.test(dn2) && /library|bibliothèque/i.test(dn2), loc + ': the library / new line is translated: ' + dn2); await page.fill('dialog textarea', ''); ok((await noChinese(page)).length === 0, loc + ': the add window is translated ' + JSON.stringify(await noChinese(page))); await page.click('dialog button >> nth=0'); await page.waitForSelector('dialog', { state: 'detached' });
    await page.click('.idiom-card[data-idiom=画蛇添足]'); await page.waitForSelector('#idiom-story');
    await page.dblclick('#story-edit'); await page.fill('dialog textarea', '从前，有个人。'); ok((await page.textContent('#story-count')) === (loc === 'en' ? '5 characters (punctuation not counted)' : '5 caractères (sans la ponctuation)') && (await noChinese(page)).length === 0, loc + ': the count line is translated: ' + await page.textContent('#story-count')); await page.click('dialog button >> nth=0'); await page.waitForSelector('dialog', { state: 'detached' });
    ok((await noChinese(page)).length === 0 && !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), loc + ': the story page is translated and fits ' + JSON.stringify(await noChinese(page)));
    await page.screenshot({ path: OUT + `idiom-story-${loc}.png` });
  }
  // --- left / right on the story page: previous / next story of the list it was opened from (tap on a half of the screen, or swipe)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('learn.settings.v1') || '{}'); s.lang = 'zh'; localStorage.setItem('learn.settings.v1', JSON.stringify(s)); });
  await page.evaluate(() => (location.hash = '#/')); await page.reload(); await page.waitForSelector('.kid'); await openKid(page, 'Dory'); await page.click('#idioms-btn'); await page.waitForSelector('.idiom-card');
  const week3 = await page.$$eval('.idiom-card', (e) => e.map((x) => x.dataset.idiom));
  const shownIdiom = () => page.$$eval('#idiom-chars .tzg .ch', (e) => e.map((x) => x.textContent).join(''));
  const pos = () => page.textContent('#story-pos');
  const swipe = async (dx) => { await page.mouse.move(200, 700); await page.mouse.down(); await page.mouse.move(200 + dx / 2, 703, { steps: 3 }); await page.mouse.move(200 + dx, 706, { steps: 3 }); await page.mouse.up(); };
  await page.click(`.idiom-card[data-idiom=${week3[0]}]`); await page.waitForSelector('#idiom-chars');
  ok(await shownIdiom() === week3[0] && await pos() === '1 / 3', 'the story page says where you are in the list: "1 / 3"');
  await page.mouse.click(350, 500); await page.waitForFunction((n) => document.querySelector('#story-pos').textContent === n, '2 / 3');
  ok(await shownIdiom() === week3[1], 'a tap in the right quarter of the screen goes to the next story');
  await page.mouse.click(40, 500); await page.waitForFunction((n) => document.querySelector('#story-pos').textContent === n, '1 / 3');
  ok(await shownIdiom() === week3[0], 'a tap in the left quarter goes back to the previous one');
  await page.mouse.click(40, 500); await page.waitForTimeout(200);
  ok(await pos() === '1 / 3' && await shownIdiom() === week3[0], 'before the first story there is nothing: it stays');
  // the middle of the screen is for reading: a tap there does nothing; the edges of the zones: 25 % and 75 % of the width (97 and 292 px on this 390 px screen)
  for (const x of [105, 150, 195, 250, 285]) { await page.mouse.click(x, 500); await page.waitForTimeout(120); }
  ok(await pos() === '1 / 3', 'taps in the middle half of the screen (x = 27 % ... 73 % of the width) do nothing');
  await page.mouse.click(292 + 8, 500); await page.waitForFunction((n) => document.querySelector('#story-pos').textContent === n, '2 / 3');
  await page.mouse.click(97 - 8, 500); await page.waitForFunction((n) => document.querySelector('#story-pos').textContent === n, '1 / 3');
  ok(true, 'just inside the quarters (x = 89 and 300 px) the page turns');
  await swipe(-120); await page.waitForFunction((n) => document.querySelector('#story-pos').textContent === n, '2 / 3');
  await swipe(-120); await page.waitForFunction((n) => document.querySelector('#story-pos').textContent === n, '3 / 3');
  ok(await shownIdiom() === week3[2], 'swiping left goes to the next story, twice');
  await swipe(-120); await page.waitForTimeout(200);
  ok(await pos() === '3 / 3', 'and after the last story it stays');
  await swipe(120); await page.waitForFunction((n) => document.querySelector('#story-pos').textContent === n, '2 / 3');
  ok(await shownIdiom() === week3[1], 'swiping right goes back');
  await swipe(30); await page.waitForTimeout(150);
  ok(await pos() === '2 / 3', 'a short move does not change the story');
  await page.dblclick('#story-edit'); await page.waitForSelector('dialog.center'); await page.click('dialog.center h2'); await page.waitForTimeout(200);
  ok(await pos() === '2 / 3' && await page.locator('dialog.center').count() === 1, 'the edit button opens the editor; a tap inside it does not change the story');
  await page.click('dialog.center button:has-text("取消")'); await page.waitForSelector('dialog.center', { state: 'detached' });
  await page.click('button.back'); await page.waitForSelector('.idiom-card');
  ok(await page.locator('.idiom-card').count() === 3 && (await page.textContent('h1')) === '成语故事', 'one press of back returns to the list (the stories you went through are not in the way)');
  // opened from "all idioms": the list is all of them, across the weeks
  await page.click('#idiom-scope'); await page.waitForFunction(() => document.querySelectorAll('.idiom-card').length === 5);
  const all5 = await page.$$eval('.idiom-card', (e) => e.map((x) => x.dataset.idiom));
  await page.click(`.idiom-card[data-idiom=${all5[4]}]`); await page.waitForSelector('#idiom-chars');
  ok(await pos() === '5 / 5' && await shownIdiom() === all5[4], 'from the list of all idioms the stories of every week follow each other (5 / 5)');
  await page.mouse.click(40, 500); await page.waitForFunction((n) => document.querySelector('#story-pos').textContent === n, '4 / 5');
  ok(await shownIdiom() === all5[3], 'and left goes through them in the order of the list');
  await page.reload(); await page.waitForSelector('#idiom-chars');
  ok((await pos()).endsWith('/ 2') || (await pos()).endsWith('/ 3') || (await pos()).endsWith('/ 1') || (await page.locator('#story-pos').count()) === 0, 'after a reload the neighbours are the idioms of the same week');
  await page.setViewportSize({ width: 390, height: 844 });

  // --- the story page keeps the whole idiom on ONE line, on the smallest screens too
  for (const [w, h2] of [[320, 568], [360, 640], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width: w, height: h2 });
    await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid'); await openKid(page, 'Dory'); await page.click('#idioms-btn'); await page.waitForSelector('.idiom-card');
    await page.click('.idiom-card[data-idiom=画蛇添足]'); await page.waitForSelector('#idiom-chars');
    const one = await page.evaluate(() => { const cs = [...document.querySelectorAll('#idiom-chars .tzg')].map((c) => c.getBoundingClientRect()); const m = document.querySelector('#idiom-chars').getBoundingClientRect(); return { n: cs.length, rows: new Set(cs.map((c) => Math.round(c.top))).size, w: Math.round(cs[0].width), over: document.documentElement.scrollWidth > innerWidth, inside: cs.every((c) => c.left >= -0.5 && c.right <= innerWidth + 0.5), mid: Math.abs((cs[0].left + cs[cs.length - 1].right) / 2 - innerWidth / 2) <= 1 }; });
    ok(one.n === 4 && one.rows === 1 && !one.over && one.inside && one.mid, w + 'x' + h2 + ': the four characters of the story page stay on one line, centred, cells ' + one.w + ' px');
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // --- both sides equal on a tablet and a desktop (rule 13)
  for (const [w, h2] of [[820, 1180], [1180, 820], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h2 });
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('learn.settings.v1') || '{}'); s.lang = 'zh'; localStorage.setItem('learn.settings.v1', JSON.stringify(s)); });
    await page.evaluate(() => (location.hash = '#/idioms')); await page.reload(); await page.waitForSelector('.idiom-card');
    const l = await page.evaluate(() => { const c = document.querySelector('.idiom-card').getBoundingClientRect(); return c.left - (innerWidth - c.right); });
    const idW = await page.evaluate(() => document.querySelector('.idiom-card .tzg').getBoundingClientRect().width);
    const cr = await page.evaluate(() => { const r = [...document.querySelectorAll('.idiom-card')].map((x) => x.getBoundingClientRect()); const m = document.querySelector('main.scroll').getBoundingClientRect(); return r.map((x) => (x.left - m.left) - (m.right - x.right)); });
    await page.click('.idiom-card[data-idiom=画蛇添足]'); await page.waitForSelector('#idiom-chars');
    const s2 = await page.evaluate(() => { const c = document.querySelector('#idiom-chars').getBoundingClientRect(), st = document.querySelector('#idiom-story')?.getBoundingClientRect(); return [c.left - (innerWidth - c.right), st ? st.left - (innerWidth - st.right) : 0]; });
    if (w >= 820) { const kid0 = await page.evaluate(() => JSON.parse(localStorage.getItem('learn.local.kids.json')).kids[0].id); await page.evaluate((i) => (location.hash = `#/kid/${i}/learned`), kid0); await page.waitForSelector('#grid .tzg'); const lw = await page.evaluate(() => document.querySelector('#grid .tzg').getBoundingClientRect().width); ok(Math.abs(idW - lw) <= 2, w + 'x' + h2 + ': an idiom cell is as big as a recorded character cell (' + Math.round(idW) + ' / ' + Math.round(lw) + ' px)'); }
    ok(cr.every((x) => Math.abs(x) <= 1), w + 'x' + h2 + ': every idiom line is centred (' + cr.map((x) => x.toFixed(1)).join(', ') + ')');
    ok(Math.abs(l) <= 1 && Math.abs(s2[0]) <= 1 && Math.abs(s2[1]) <= 1, w + 'x' + h2 + ': the list, the idiom and the story are centred (equal space left and right: ' + [l, ...s2].map((x) => x.toFixed(1)).join(', ') + ')');
  }
  // --- only the idioms in the middle scroll: the heading above and the button below stay where they are
  await page.setViewportSize({ width: 390, height: 640 });
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid'); await openKid(page, 'Dory'); await page.click('#idioms-btn'); await page.waitForSelector('.idiom-card');
  await page.click('#idiom-scope'); await page.waitForFunction(() => document.querySelectorAll('.idiom-card').length === 5);
  const sr = () => page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const m = document.querySelector('.idiom-scroll'); return { btn: Math.round(r('#idiom-scope').top), btnBottom: Math.round(innerHeight - r('#idiom-scope').bottom), head: Math.round(r('.idiom-head').top), top: m.scrollTop, can: m.scrollHeight - m.clientHeight, pageScroll: document.documentElement.scrollHeight > innerHeight }; });
  const s0 = await sr();
  await page.evaluate(() => { document.querySelector('.idiom-scroll').scrollTop = 400; });
  const s1 = await sr();
  ok(s0.can > 100 && s1.top > 100 && s1.btn === s0.btn && s1.head === s0.head && !s1.pageScroll && s1.btnBottom < 40, 'the idioms scroll in the middle (' + s1.top + ' px) while the heading and the "只看这一周" button stay in place (button ' + s0.btn + ' -> ' + s1.btn + ', ' + s1.btnBottom + ' px from the bottom), and the page itself does not scroll');
  await page.setViewportSize({ width: 390, height: 844 });
  // --- a week has six idioms: at six the small + is gone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid'); await openKid(page, 'Dory'); await page.click('#idioms-btn'); await page.waitForSelector('.idiom-card');
  await page.click('#idiom-add'); await page.fill('dialog textarea', '井底之蛙 刻舟求剑 对牛弹琴'); await page.click('dialog button.primary');
  await page.waitForFunction(() => document.querySelectorAll('.idiom-card').length === 6);
  ok(await page.locator('#idiom-add').count() === 0 && (await page.textContent('.sec-row .sec')) === '成语（6）', 'with six idioms the small + is gone (like the characters at ten): "成语（6）"');
  await done(browser);
})();
