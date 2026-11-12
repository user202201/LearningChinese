// "已入库": every learned character in a 田字格 cell, tap the screen to show / hide pinyin, scroll up / down through all of them.
const { start, checks, addKid, openKid, enterWeek, gotoWeek, WEEK1 } = require('./harness.cjs');
const { ok, done } = checks();
const MANY = Array.from('一二三四五六七八九十上下大小山水火土木金日月田人口手足目耳心中天地风雨花草鸟鱼马牛羊虫书门工农学校早晚东西南北左右前后红黄蓝绿白黑'); // 60 distinct
// (today is late in the year so that all the weeks entered below are in the past: a week can only be prepared one week ahead)
(async () => {
  const { browser, page } = await start(new Map(), { local: true, today: '2026-12-20', viewport: { width: 820, height: 1000 } });
  await addKid(page, 'Dory'); await openKid(page, 'Dory');
  await page.click('button[data-tab=learned]');
  await page.waitForSelector('#learned-scroll');
  ok((await page.textContent('#learned-scroll')).includes('还没有入库的字'), 'empty library: tells where to add characters');
  await page.click('button:has-text("本周")');
  await enterWeek(page, '2026-10-25', WEEK1);
  const DATES = ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'];
  for (let i = 0; i < 5; i++) await enterWeek(page, DATES[i], MANY.slice(i * 12, i * 12 + 12).join(''));
  await page.click('button[data-tab=learned]');
  await page.waitForSelector('#grid .tzg');
  ok(await page.locator('#grid .tzg').count() === 70, 'all 70 learned characters are in the grid (10 + 5 x 12)');
  ok((await page.textContent('#count')) === '70', 'the total is shown as a big number');

  const box = page.locator('#grid .tzg .box').first();
  const css = await box.evaluate((e) => { const c = getComputedStyle(e); return { img: c.backgroundImage, border: c.borderTopWidth, ar: e.getBoundingClientRect().width / e.getBoundingClientRect().height }; });
  ok(css.img.includes('gradient') && css.border === '3px', '田字格: a bordered square with a dashed cross');
  ok(Math.abs(css.ar - 1) < 0.02, 'the cell is square');
  const fs = await page.locator('#grid .ch').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  const bw = await box.evaluate((e) => e.getBoundingClientRect().width);
  ok(fs > bw * 0.55 && fs < bw * 0.85, 'the character fills most of the cell (' + Math.round(fs) + 'px in ' + Math.round(bw) + 'px)');

  // pinyin: hidden at first, a tap anywhere shows it, another tap hides it; no layout jump
  const y0 = await page.locator('#grid .tzg .box').first().evaluate((e) => e.getBoundingClientRect().top);
  ok(await page.locator('#grid .tzg .py').first().evaluate((e) => getComputedStyle(e).visibility) === 'hidden', 'pinyin is hidden at first');
  await page.waitForSelector('#toasts .toast', { state: 'detached' });   // (the "saved" message of the last entry would sit over the hint line)
  const tapHint = async () => { const b = await page.locator('.learned-head .muted').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };   // (an empty spot: a tap on a character opens the big view)
  await tapHint();
  await page.waitForFunction(() => document.querySelector('#grid .tzg .py')?.textContent);
  ok(await page.locator('#grid .tzg .py').first().evaluate((e) => getComputedStyle(e).visibility) === 'visible', 'a tap on the screen shows the pinyin');
  ok((await page.textContent('#grid .tzg[data-ch=假] .py')) === 'jiǎ', 'pinyin of 假 is jiǎ (with tone)');
  ok((await page.textContent('#grid .tzg[data-ch=酸] .py')) === 'suān', 'pinyin of 酸 is suān');
  const y1 = await page.locator('#grid .tzg .box').first().evaluate((e) => e.getBoundingClientRect().top);
  ok(y0 === y1, 'showing the pinyin does not move the characters (' + y0 + ' / ' + y1 + ')');
  await tapHint();
  ok(await page.locator('#grid .tzg .py').first().evaluate((e) => getComputedStyle(e).visibility) === 'hidden', 'another tap hides it again');
  await tapHint();                                   // on again, to check it is remembered
  await page.reload(); await page.waitForSelector('#grid .tzg');
  await page.waitForFunction(() => document.querySelector('#grid .tzg .py')?.textContent);
  ok(await page.locator('#grid .tzg .py').first().evaluate((e) => getComputedStyle(e).visibility) === 'visible', 'the pinyin choice is remembered');

  // scrolling up / down reaches every character; scrolling does not toggle the pinyin
  const sc = page.locator('#learned-scroll');
  const m = await sc.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
  ok(m.sh > m.ch * 1.5, 'the list is taller than the screen and scrolls (' + m.sh + ' / ' + m.ch + ')');
  await page.mouse.move(410, 500); await page.mouse.wheel(0, 100000);
  await page.waitForTimeout(300);
  const st = await sc.evaluate((e) => e.scrollTop);
  ok(st > 0 && st + m.ch >= m.sh - 2, 'scrolling down reaches the end of the list');
  ok(await page.locator('#grid .tzg .py').first().evaluate((e) => getComputedStyle(e).visibility) === 'visible', 'scrolling does not toggle the pinyin');
  const last = await page.locator('#grid .tzg').last().evaluate((e) => { const r = e.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; });
  ok(last, 'the last character is fully on screen at the end');
  await page.mouse.wheel(0, -100000); await page.waitForTimeout(300);
  ok(await sc.evaluate((e) => e.scrollTop) === 0, 'and scrolling up returns to the top');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok(!wide, 'no sideways scrolling');
  await page.screenshot({ path: (process.env.D || 'tests/out/work/') + 'learned-grid.png' });

  // tapping a character enlarges it (like on the week page): that very character, back / forward through all of them, closing returns to the list
  const all = await page.$$eval('#grid .tzg', (e) => e.map((x) => x.dataset.ch));
  const nAll = all.length;
  await page.locator('#grid .tzg').nth(5).click();
  await page.waitForSelector('#viewer');
  const vshown = () => page.$eval('#viewer .tzg .ch', (e) => e.textContent);
  ok((await vshown()) === all[5] && (await page.textContent('#viewer .vcount')) === `6 / ${nAll}`, 'tapping the 6th recorded character enlarges exactly that one (' + all[5] + ', 6 / ' + nAll + ')');
  await page.click('#viewer-next'); ok((await vshown()) === all[6], 'the arrow goes forward through the recorded characters');
  await page.click('#viewer-prev'); await page.click('#viewer-prev'); ok((await vshown()) === all[4], 'and back');
  const vb = await page.$eval('#viewer .vstage', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  await page.mouse.click(vb[0] + 12, vb[1] + vb[3] / 2); ok((await vshown()) === all[3], 'a tap on the left part of the screen goes back');
  await page.mouse.click(vb[0] + vb[2] - 12, vb[1] + vb[3] / 2); await page.mouse.click(vb[0] + vb[2] - 12, vb[1] + vb[3] / 2); ok((await vshown()) === all[5], 'a tap on the right part goes forward');
  await page.click('#viewer-close'); await page.waitForSelector('#viewer', { state: 'detached' });
  ok(await page.locator('#grid .tzg').count() === nAll && await page.locator('#viewer').count() === 0, 'closing returns to the list');
  const pyBefore = await page.locator('#grid .tzg .py').first().evaluate((e) => getComputedStyle(e).visibility);
  await tapHint();
  ok(await page.locator('#viewer').count() === 0 && await page.locator('#grid .tzg .py').first().evaluate((e) => getComputedStyle(e).visibility) !== pyBefore, 'a tap on an empty spot still shows / hides the pinyin (and opens nothing)');
  await tapHint();
  await require('./harness.cjs').manageOnHere(page); await page.waitForSelector('#grid .tzg .del');
  await page.locator('#grid .tzg').nth(2).click({ position: { x: 20, y: 40 } });
  ok(await page.locator('#viewer').count() === 0, 'in manage mode a tap on a character does not open the big view (the red − deletes)');
  await page.waitForSelector('#toasts .toast', { state: 'detached' }).catch(() => {}); await tapHint();   // (the tap on the character switched the pinyin, as before: switch it back)
  await page.reload(); await page.waitForSelector('#grid .tzg');   // (admin mode is not remembered: off again)

  // the pinyin choice made inside the big view is followed by the list behind it, and the next taps on the list work (the "only once" bug)
  const gridPy = () => page.locator('#grid .tzg .py').first().evaluate((e) => getComputedStyle(e).visibility);
  await page.waitForSelector('#toasts .toast', { state: 'detached' }).catch(() => {});
  const was = await gridPy();
  await page.locator('#grid .tzg').nth(1).click(); await page.waitForSelector('#viewer');
  await page.click('#viewer .tzg');                                                  // switches the pinyin inside the big view
  await page.click('#viewer-close'); await page.waitForSelector('#viewer', { state: 'detached' });
  await page.waitForFunction(() => true);
  const afterViewer = await gridPy();
  ok(afterViewer !== was, 'the list behind follows the pinyin choice made in the big view (' + was + ' -> ' + afterViewer + ')');
  const seq = [];
  for (let n = 0; n < 4; n++) { await tapHint(); await page.waitForTimeout(150); seq.push(await gridPy()); }
  ok(seq.every((v, n) => v === (n % 2 === 0 ? (afterViewer === 'visible' ? 'hidden' : 'visible') : afterViewer)), 'and then every tap on an empty spot switches it, again and again (' + seq.join(', ') + ')');
  if (await gridPy() === 'hidden') await tapHint();   // (back to "on" for the checks below)
  // the Self-test button is a button, not an empty spot: pressing it must not also switch the pinyin
  const beforeSelf = await gridPy();
  await page.click('#selftest'); await page.waitForSelector('#game'); await page.click('#game-quit'); await page.click('dialog button.danger'); await page.waitForSelector('#game', { state: 'detached' });
  await page.waitForSelector('#grid .tzg'); await page.waitForTimeout(300);
  ok(await gridPy() === beforeSelf, 'pressing the Self-test button does not switch the pinyin of the list');
  // a tap by the finger alone (pointer down + up, the browser\'s click never comes) works, and a click that follows a tap does not count twice
  const hb = await page.locator('.learned-head .muted').boundingBox(); const hx = hb.x + hb.width / 2, hy = hb.y + hb.height / 2;
  const fingerTap = () => page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); const o = { bubbles: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); }, [hx, hy]);
  const s0 = await gridPy(); await fingerTap(); const s1 = await gridPy(); await fingerTap(); const s2 = await gridPy(); await fingerTap(); const s3 = await gridPy();
  ok(s1 !== s0 && s2 === s0 && s3 !== s0, 'a finger tap without a browser click still switches the pinyin, three times in a row (' + [s0, s1, s2, s3].join(', ') + ')');
  const s4 = await gridPy(); await page.mouse.click(hx, hy); await page.waitForTimeout(100);
  ok(await gridPy() !== s4, 'a normal tap (pointer events + click) switches it once, not twice');
  if (await gridPy() === 'hidden') await tapHint();
  // the week view follows the same pinyin setting
  await page.click('button:has-text("本周")'); await gotoWeek(page, '2026-11-29');
  await page.waitForSelector('.cards .tzg .py');
  await page.waitForFunction(() => document.querySelector('.cards .tzg .py')?.textContent);
  ok(await page.locator('.cards .tzg .py').first().evaluate((e) => getComputedStyle(e).visibility) === 'visible', 'the week cards show pinyin when it is on');
  await done(browser);
})();
