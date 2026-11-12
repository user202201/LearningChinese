// The week page (opens on the week we are in, arrows only forward, small plus buttons, a big plus in an empty area, no big button)
// and the full-screen character (tap a character; left / right by buttons, swipe, arrow keys; tap = pinyin; Esc / x closes).
const { start, checks, addKid, openKid, enterWeek, gotoWeek, openEntry, WEEK1, WEEK3 } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
(async () => {
  const { browser, page, ctx } = await start(new Map(), { local: true, today: '2026-11-10', touch: true, viewport: { width: 390, height: 844 } });
  await addKid(page, 'Dory'); await openKid(page, 'Dory');

  // --- the week page
  ok((await page.textContent('.wlabel .muted')).startsWith('2026-11-08'), 'opens on the week that contains today (Sunday 2026-11-08)');
  ok(await page.locator('button[title=上一周]').isDisabled(), 'nothing entered anywhere yet: there is no earlier week to go back to, the left arrow is off');
  ok(await page.locator('button.primary.wide:not(#idioms-btn)').count() === 0, 'no big "enter this week" button any more (the only big button is the one to the idiom stories)');
  const big = await page.locator('#enter').boundingBox();
  const area = await page.locator('.narrow').boundingBox();
  ok(await page.locator('#enter.add-big').count() === 1 && Math.abs((big.x + big.width / 2) - (area.x + area.width / 2)) <= 2, 'an empty week: a big + in the middle of the area (' + Math.round(big.x + big.width / 2) + ' vs ' + Math.round(area.x + area.width / 2) + ')');
  ok(await page.locator('.idiom, .idioms, #enter-idioms, .idiom-card').count() === 0 && await page.locator('#idioms-btn').count() === 1 && (await page.textContent('.narrow')).replace('成语故事', '').indexOf('成语') === -1, 'the child page has no idiom list of its own, only the "成语故事" button to the shared list');
  await page.screenshot({ path: OUT + 'week-empty.png' });

  await page.click('#enter');                                           // the big + opens the entry with the characters box ready
  ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === '汉字', 'the big + opens the entry with the cursor in the characters box');
  await require('./harness.cjs').setDate(page, '2026-11-08'); await page.fill('dialog textarea', WEEK3);
  await page.click('dialog button.primary'); await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('#toasts .toast.working') && document.querySelectorAll('.cards .tzg').length === 10);
  ok(await page.locator('#enter').count() === 0, 'with the 10 characters of the week in, there is no + any more');

  // fewer than 10: a small + to complete the week
  await page.click('button[title=下一周]');
  ok((await page.textContent('.wlabel strong')) === '第2周' && await page.locator('#enter.add-big').count() === 1, 'a week in the future is empty and can be filled (a big +)');
  await page.click('#enter'); await require('./harness.cjs').setDate(page, '2026-11-15'); await page.fill('dialog textarea', '一二三四五六');
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
  // no double-tap zoom: the second tap of a double tap is cancelled (iPad Safari ignores touch-action here); pinching stays possible
  const dbl = await page.evaluate(async () => {
    const send = (sel, x, y) => { const el = document.querySelector(sel); const tc = new Touch({ identifier: 1, target: el, clientX: x, clientY: y }); const e = new TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: [tc] }); el.dispatchEvent(e); return e.defaultPrevented; };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    out.first = send('#viewer .tzg', 300, 300);
    out.second = send('#viewer .tzg', 305, 302);
    await wait(450); out.late = send('#viewer .tzg', 305, 302);
    await wait(50); out.far = send('#viewer .tzg', 305, 302); out.far2 = send('#viewer .tzg', 120, 600);
    await wait(450); send('#viewer-next', 100, 100); out.button = send('#viewer-next', 102, 101);
    await wait(450);
    return out;
  });
  ok(!dbl.first && dbl.second && !dbl.late && !dbl.far2 && !dbl.button, 'the second tap of a double tap (same place, within 350 ms) is cancelled, so Safari can not zoom; a single tap, a later tap, a tap elsewhere and a button are left alone: ' + JSON.stringify(dbl));
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

  // the big areas: a tap on the left part of the screen = previous, on the right part = next (no small button needed); the 田字格 only toggles the pinyin
  const here = () => shown();
  await page.touchscreen.tap(20, 420);                                  // far left, level with the character
  ok((await here()) === chars[8], 'a tap on the left side of the screen goes to the previous character');
  await page.touchscreen.tap(372, 420);                                 // far right
  ok((await here()) === chars[9], 'a tap on the right side goes to the next one');
  await page.touchscreen.tap(60, 120);                                  // above the character, left half
  ok((await here()) === chars[8], 'a tap ABOVE the character, on the left half, goes back too');
  await page.touchscreen.tap(330, 760);                                 // below the character, right half
  ok((await here()) === chars[9], 'a tap BELOW the character, on the right half, goes forward');
  await page.touchscreen.tap(330, 760);
  ok((await here()) === chars[9], 'on the last character a tap on the right does nothing');
  const py0 = await page.$eval('#viewer .tzg .py', (e) => getComputedStyle(e).visibility);
  await page.touchscreen.tap(195, 420);
  ok((await here()) === chars[9] && (await page.$eval('#viewer .tzg .py', (e) => getComputedStyle(e).visibility)) !== py0, 'a tap on the 田字格 does not move: it shows / hides the pinyin');
  await page.touchscreen.tap(195, 420);
  await page.touchscreen.tap(20, 420); await page.touchscreen.tap(20, 420);
  ok((await here()) === chars[7], 'taps on the left side can follow each other: two steps back');
  await page.click('#viewer-close');
  await page.click('.cards .tzg >> nth=0'); await page.waitForSelector('#viewer');
  await page.touchscreen.tap(20, 420);
  ok((await here()) === chars[0], 'on the first character a tap on the left does nothing');
  await page.touchscreen.tap(372, 420);
  ok((await here()) === chars[1], 'and a tap on the right goes on');
  await page.click('#viewer-close');
  await page.click('.cards .tzg >> nth=9'); await page.waitForSelector('#viewer');   // (open again on the last one for the keyboard checks below)

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

  // an iPad held sideways: the same, with the character box in the middle and wide areas on both sides
  const ip = await start(new Map(), { local: true, today: '2026-11-10', touch: true, viewport: { width: 1180, height: 820 } });
  await addKid(ip.page, 'Dory'); await openKid(ip.page, 'Dory'); await openEntry(ip.page);
  await require('./harness.cjs').setDate(ip.page, '2026-11-08'); await ip.page.fill('dialog textarea', WEEK3);
  await ip.page.click('dialog button.primary'); await ip.page.waitForSelector('dialog', { state: 'detached' });
  await ip.page.waitForFunction(() => document.querySelectorAll('.cards .tzg').length === 10 && !document.querySelector('#toasts .toast.working'));
  const ic = await ip.page.$$eval('.cards .tzg', (e) => e.map((x) => x.dataset.ch));
  await ip.page.click('.cards .tzg >> nth=4'); await ip.page.waitForSelector('#viewer');
  const ish = () => ip.page.$eval('#viewer .tzg .ch', (e) => e.textContent);
  const ibox = await ip.page.$eval('#viewer .tzg .box', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
  ok(ibox.l > 250 && 1180 - ibox.r > 250, 'iPad landscape: the character box leaves wide areas on both sides (' + Math.round(ibox.l) + ' px each)');
  await ip.page.touchscreen.tap(ibox.l / 2, 410);
  ok((await ish()) === ic[3], 'iPad: a tap anywhere in the left area (' + Math.round(ibox.l / 2) + ', 410) goes back');
  await ip.page.touchscreen.tap(1180 - ibox.l / 2, 410); await ip.page.touchscreen.tap(1180 - ibox.l / 2, 700);
  ok((await ish()) === ic[5], 'iPad: taps in the right area, level with the box and below it, go forward');
  await ip.page.touchscreen.tap(300, 100);
  ok((await ish()) === ic[4], 'iPad: a tap high up on the left half goes back as well');
  await ip.page.touchscreen.tap((ibox.l + ibox.r) / 2, (ibox.t + ibox.b) / 2);
  ok((await ish()) === ic[4] && await ip.page.$eval('#viewer', (e) => e.classList.contains('pinyin-on')), 'iPad: a tap on the box itself toggles the pinyin and does not move');
  await ip.page.screenshot({ path: OUT + 'viewer-ipad.png' });
  await ip.browser.close();

  // languages: no Chinese UI text in the week page / viewer / week list
  for (const [locale] of [['en-US'], ['fr-FR']]) {
    const t = await start(new Map(), { local: true, locale, today: '2026-11-10', viewport: { width: 390, height: 844 } });
    await addKid(t.page, 'Dory'); await openKid(t.page, 'Dory');
    const cn = () => t.page.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (/[一-鿿]/.test(n.nodeValue) && !n.parentElement.closest('.user, .user-title, #toasts')) bad.push(n.nodeValue.trim()); for (const el of document.querySelectorAll('[title],[aria-label]')) for (const a of ['title', 'aria-label']) { const v = el.getAttribute(a); if (v && /[一-鿿]/.test(v) && !el.closest('.user,.user-title')) bad.push(a + ':' + v); } return bad; });
    ok((await cn()).length === 0, locale + ': the empty week page has no Chinese UI text ' + JSON.stringify(await cn()));
    await t.page.click('#enter'); await require('./harness.cjs').setDate(t.page, '2026-11-08'); await t.page.fill('dialog textarea', WEEK3);
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
