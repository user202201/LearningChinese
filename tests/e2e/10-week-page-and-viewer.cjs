// The week page (opens on the week we are in, arrows only forward, small plus buttons, a big plus in an empty area, no big button)
// and the full-screen character (tap a character; left / right by buttons, swipe, arrow keys; tap = pinyin; Esc / x closes).
const { start, checks, addKid, openKid, enterWeek, gotoWeek, WEEK1, WEEK3 } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
(async () => {
  const { browser, page, ctx } = await start(new Map(), { local: true, today: '2026-11-10', touch: true, viewport: { width: 390, height: 844 } });
  await addKid(page, 'Dory'); await openKid(page, 'Dory');

  // --- the week page
  ok((await page.textContent('.wlabel .muted')).startsWith('2026-11-08'), 'opens on the week that contains today (Sunday 2026-11-08)');
  ok(await page.locator('button[title=上一周]').isDisabled(), 'nothing entered anywhere yet: there is no earlier week to go back to, the left arrow is off');
  ok(await page.locator('button.primary.wide').count() === 0, 'no big "enter this week" button any more');
  const big = await page.locator('#enter').boundingBox();
  const area = await page.locator('.narrow').boundingBox();
  ok(await page.locator('#enter.add-big').count() === 1 && Math.abs((big.x + big.width / 2) - (area.x + area.width / 2)) <= 2, 'an empty week: a big + in the middle of the area (' + Math.round(big.x + big.width / 2) + ' vs ' + Math.round(area.x + area.width / 2) + ')');
  ok(await page.locator('.idiom, .idioms, #enter-idioms').count() === 0 && !(await page.textContent('.narrow')).includes('成语'), 'no idioms on the child page');
  await page.screenshot({ path: OUT + 'week-empty.png' });

  await page.click('#enter');                                           // the big + opens the entry with the characters box ready
  ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === '汉字', 'the big + opens the entry with the cursor in the characters box');
  await page.fill('dialog input[type=date]', '2026-11-08'); await page.fill('dialog textarea', WEEK3);
  await page.click('dialog button.primary'); await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('#toasts .toast.working') && document.querySelectorAll('.cards .tzg').length === 10);
  ok(await page.locator('#enter').count() === 0, 'with the 10 characters of the week in, there is no + any more');

  // fewer than 10: a small + to complete the week
  await page.click('button[title=下一周]');
  ok((await page.textContent('.wlabel strong')) === '第2周' && await page.locator('#enter.add-big').count() === 1, 'a week in the future is empty and can be filled (a big +)');
  await page.click('#enter'); await page.fill('dialog input[type=date]', '2026-11-15'); await page.fill('dialog textarea', '一二三四五六');
  await page.click('dialog button.primary'); await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForFunction(() => document.querySelectorAll('.cards .tzg').length === 6 && !document.querySelector('#toasts .toast.working'));
  const small = await page.locator('#enter').boundingBox();
  ok(await page.locator('#enter.plus').count() === 1 && small.width <= 48, 'with 6 of the 10 the + is a small round button in the heading (' + Math.round(small.width) + 'px)');
  await page.screenshot({ path: OUT + 'week-filled.png' });
  // both ways: back to the first week that has something, forward without limit
  ok(!(await page.locator('button[title=上一周]').isDisabled()), 'in week 2 the left arrow is on (week 1 has characters)');
  await page.click('button[title=上一周]');
  ok((await page.textContent('.wlabel strong')) === '第1周' && await page.locator('.cards .tzg').count() === 10, 'the left arrow shows the week before, with its characters');
  ok(await page.locator('button[title=上一周]').isDisabled(), 'week 1 is the first one with something: the left arrow is off there');
  await page.click('button[title=下一周]');
  ok((await page.textContent('.wlabel .muted')).startsWith('2026-11-15') && await page.locator('button[title=下一周]').isDisabled(), 'forward goes only as far as NEXT week (2026-11-15): there the right arrow is off');

  // coming back from the home screen starts on the current week again
  await page.click('button.back'); await page.waitForSelector('.kids');
  await openKid(page, 'Dory');
  ok((await page.textContent('.wlabel .muted')).startsWith('2026-11-08'), 'opening the child again starts on the current week, not where you left');

  // the week list: earlier weeks
  await enterWeek(page, '2026-10-25', WEEK1);
  await page.click('#week-pick');
  const rows = await page.$$eval('.weekrow', (e) => e.map((r) => ({ start: r.dataset.start, text: r.textContent, on: r.classList.contains('on') })));
  ok(rows.map((r) => r.start).join() === '2026-11-15,2026-11-08,2026-10-25', 'the week list shows the weeks that have something, newest first');
  ok(rows[1].text.includes('本周') && rows[1].text.includes('10 个汉字') && rows[2].text.includes('第1周'), 'each row: the week, "this week" badge, how much is in it');
  await page.screenshot({ path: OUT + 'week-list.png' });
  await page.click('dialog button:not(.weekrow)'); await page.waitForSelector('dialog', { state: 'detached' });
  ok(await page.locator('#toasts .toast:has-text("已选")').count() === 0, 'closing the week list changes nothing and shows no message');
  await gotoWeek(page, '2026-10-25');
  ok((await page.textContent('.wlabel strong')) === '第1周' && await page.locator('.cards .tzg').count() === 10, 'choosing an earlier week shows it');
  await page.click('text=回到本周');

  // --- the full-screen character
  await page.waitForSelector('.cards .tzg');
  const chars = await page.$$eval('.cards .tzg', (e) => e.map((x) => x.dataset.ch));
  await page.click('.cards .tzg >> nth=2');
  await page.waitForSelector('#viewer');
  const shown = () => page.$eval('#viewer .tzg .ch', (e) => e.textContent);
  const count = () => page.textContent('#viewer .vcount');
  ok((await shown()) === chars[2] && (await count()) === '3 / 10', 'tapping the 3rd character shows exactly that one, full screen: ' + chars[2] + ', 3 / 10');
  const vr = await page.$eval('#viewer', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, innerWidth, innerHeight]; });
  ok(vr[0] === 0 && vr[1] === 0 && vr[2] === vr[4] && vr[3] === vr[5], 'it covers the whole screen');
  const fs = await page.$eval('#viewer .tzg .ch', (e) => parseFloat(getComputedStyle(e).fontSize));
  ok(fs > 150, 'the character is big: ' + Math.round(fs) + 'px');
  await page.screenshot({ path: OUT + 'viewer-phone.png' });

  await page.click('#viewer-next');
  ok((await shown()) === chars[3] && (await count()) === '4 / 10', 'the right button goes to the next character');
  await page.click('#viewer-prev'); await page.click('#viewer-prev'); await page.click('#viewer-prev');
  ok((await shown()) === chars[0] && await page.locator('#viewer-prev').isDisabled(), 'at the first character the left button is off');
  for (let i = 0; i < 9; i++) await page.click('#viewer-next');
  ok((await shown()) === chars[9] && await page.locator('#viewer-next').isDisabled() && (await count()) === '10 / 10', 'at the last character the right button is off');

  // swipes with a real touch (finger), left = next, right = previous; a vertical drag does nothing
  const cdp = await ctx.newCDPSession(page);
  const swipe = async (x0, y0, x1, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * k) / 5, y: y0 + ((y1 - y0) * k) / 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
  };
  await swipe(250, 300, 60, 300);  // (to the left of a char at index 9: nothing after it)
  ok((await shown()) === chars[9], 'swiping left on the last character stays on it');
  await swipe(60, 400, 300, 400);
  ok((await shown()) === chars[8], 'a finger swipe to the right goes to the previous character');
  await swipe(300, 400, 60, 400);
  ok((await shown()) === chars[9], 'a finger swipe to the left goes to the next character');
  await swipe(200, 300, 200, 520);
  ok((await shown()) === chars[9], 'a vertical drag changes nothing');

  // tap = pinyin on / off
  ok(await page.$eval('#viewer .tzg .py', (e) => getComputedStyle(e).visibility) === 'hidden', 'the pinyin is hidden at first');
  await page.touchscreen.tap(195, 420);
  await page.waitForFunction(() => document.querySelector('#viewer .tzg .py')?.textContent);
  ok(await page.$eval('#viewer .tzg .py', (e) => getComputedStyle(e).visibility) === 'visible', 'a tap on the character shows the pinyin');
  ok((await page.textContent('#viewer .tzg .py')) !== '' && (await shown()) === chars[9], 'with the right pinyin for the character: ' + (await page.textContent('#viewer .tzg .py')));
  await page.touchscreen.tap(195, 420);
  ok(await page.$eval('#viewer .tzg .py', (e) => getComputedStyle(e).visibility) === 'hidden', 'another tap hides it');
  await page.touchscreen.tap(195, 420);

  // keyboard (web), close
  await page.keyboard.press('ArrowLeft');
  ok((await shown()) === chars[8], 'arrow keys switch characters (web)');
  await page.keyboard.press('Escape');
  ok(await page.locator('#viewer').count() === 0, 'Esc closes it');
  await page.click('.cards .tzg >> nth=0'); await page.click('#viewer-close');
  ok(await page.locator('#viewer').count() === 0, 'the × button closes it');
  await page.waitForFunction(() => document.querySelector('.cards .tzg .py')?.textContent);
  ok(await page.locator('.cards.pinyin-on').count() === 1 && await page.$eval('.cards .tzg .py', (e) => getComputedStyle(e).visibility) === 'visible', 'and the pinyin choice made in the viewer applies to the week cards behind it');
  await browser.close();

  // languages: no Chinese UI text in the week page / viewer / week list
  for (const [locale] of [['en-US'], ['fr-FR']]) {
    const t = await start(new Map(), { local: true, locale, today: '2026-11-10', viewport: { width: 390, height: 844 } });
    await addKid(t.page, 'Dory'); await openKid(t.page, 'Dory');
    const cn = () => t.page.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (/[一-鿿]/.test(n.nodeValue) && !n.parentElement.closest('.user, .user-title, #toasts')) bad.push(n.nodeValue.trim()); for (const el of document.querySelectorAll('[title],[aria-label]')) for (const a of ['title', 'aria-label']) { const v = el.getAttribute(a); if (v && /[一-鿿]/.test(v) && !el.closest('.user,.user-title')) bad.push(a + ':' + v); } return bad; });
    ok((await cn()).length === 0, locale + ': the empty week page has no Chinese UI text ' + JSON.stringify(await cn()));
    await t.page.click('#enter'); await t.page.fill('dialog input[type=date]', '2026-11-08'); await t.page.fill('dialog textarea', WEEK3);
    await t.page.click('dialog button.primary'); await t.page.waitForFunction(() => document.querySelectorAll('.cards .tzg').length === 10);
    await t.page.click('.cards .tzg >> nth=1'); await t.page.waitForSelector('#viewer');
    ok((await cn()).length === 0, locale + ': the full-screen character has no Chinese UI text ' + JSON.stringify(await cn()));
    await t.page.screenshot({ path: OUT + `viewer-${locale}.png` });
    await t.page.keyboard.press('Escape'); await t.page.click('#week-pick');
    ok((await cn()).length === 0, locale + ': the week list has no Chinese UI text ' + JSON.stringify(await cn()));
    await t.browser.close();
  }
  await done();
})();
