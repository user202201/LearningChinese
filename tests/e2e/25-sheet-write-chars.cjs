// Practice sheet for a child who reads more characters than he writes (Leo): in "Sheet settings" the grown-up types the characters to WRITE (up to 10); the sheet is made
// for them, and this week's and last week's characters (random order) are printed at the LEFT and RIGHT end of the rows, to be READ. The choice is per child and remembered.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { start, checks, addKid, openKid, enterWeek } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
const LAST = '鼓旧富言忙桶炉锤泉溪', THIS = '波坡板炭镜锁帆筐犁耙', WRITE = '一二三十木水火土口日';
const sheetInfo = (page) => page.evaluate(() => {
  const blocks = [...document.querySelectorAll('#sheet .zb')];
  return {
    n: blocks.length, rec: blocks.filter((b) => b.classList.contains('zb-rec')).length,
    write: blocks.map((b) => b.dataset.ch).join(''), left: blocks.map((b) => b.querySelector('.zr-l')?.dataset.read ?? '').join(''), right: blocks.map((b) => b.querySelector('.zr-r')?.dataset.read ?? '').join(''),
    cells: blocks.map((b) => b.querySelectorAll('.zc').length).join(','), traced: blocks.map((b) => b.querySelectorAll('.zc.trace').length).join(','),
    over: document.documentElement.scrollWidth > innerWidth,
  };
});
const setup = async (page, chars, on = true) => { await page.click('#sheet-opt'); await page.waitForSelector('#sheet-write-on'); if ((await page.isChecked('#sheet-write-on')) !== on) await page.click('#sheet-write-on'); if (on && chars !== null) await page.fill('#sheet-write-chars', chars); await page.click('#sheet-write-go'); await page.waitForSelector('dialog.center', { state: 'detached' }); await page.waitForTimeout(250); };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page } = await start(new Map(), { local: true, today: '2026-11-10', viewport: { width: 820, height: 1180 } });
  await addKid(page, 'Leo'); await addKid(page, 'Dory'); await openKid(page, 'Leo');
  await enterWeek(page, '2026-11-01', LAST); await enterWeek(page, '2026-11-08', THIS);
  await page.waitForSelector('#toasts .toast', { state: 'detached' }).catch(() => {});

  // --- the first time the sheet button is pressed for a child the window to type the characters to write comes up AT ONCE, with the option on
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet-write-on');
  ok(await page.locator('#sheet').count() === 0 && (await page.isChecked('#sheet-write-on')) && !(await page.locator('#sheet-write-chars').isDisabled()), 'pressing "字帖" the first time opens the window to type the characters to write straight away (the option is on, the field is ready)');
  ok(await page.locator('#sheet-write-go').isDisabled() && (await page.textContent('#sheet-write-note')).includes('还没有输入要写的字'), 'nothing typed yet: "no characters typed yet", Make the sheet is off');
  await page.fill('#sheet-write-chars', '一 二，三\n十 木 木');
  ok((await page.textContent('#sheet-write-note')) === '已输入 5 个字' && !(await page.locator('#sheet-write-go').isDisabled()), 'spaces, punctuation, line breaks and doubles are dropped: "5 characters typed"');
  await page.fill('#sheet-write-chars', WRITE + '月星');
  ok((await page.textContent('#sheet-write-note')).includes('已输入 12 个字，只用前 10 个'), 'more than ten: the window says only the first 10 are used');
  await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog.center', { state: 'detached' });
  ok(await page.locator('.weekbar').count() === 1 && await page.locator('#sheet').count() === 0 && await page.locator('#toasts .toast').count() === 0, 'cancelling stays on the week page and says nothing');
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet-write-on');
  ok((await page.inputValue('#sheet-write-chars')) === '' && (await page.isChecked('#sheet-write-on')), 'nothing was decided by cancelling: the window comes again, on');
  await page.fill('#sheet-write-chars', WRITE); await page.click('#sheet-write-go'); await page.waitForSelector('dialog.center', { state: 'detached' });
  await page.waitForSelector('#sheet .zb-rec');
  ok((await page.textContent('#sheet-opt')) === '字帖设置', 'the sheet page has a small "字帖设置" button to change it later');

  // --- the sheet: rows for the typed characters, this week's on the left, last week's on the right, random order
  const g = await sheetInfo(page);
  ok(g.n === 10 && g.rec === 10 && g.write === WRITE, 'ten rows, for the ten typed characters in the order typed (' + g.write + ')');
  ok([...g.left].sort().join('') === [...THIS].sort().join('') && [...g.right].sort().join('') === [...LAST].sort().join(''), 'at the left end of the rows: this week\'s ten characters, at the right end: last week\'s ten (each exactly once)');
  ok(g.cells.split(',').every((c) => c === '12') && g.traced.split(',').every((c) => c === '6'), 'the rows themselves are the usual ones: 12 cells, the character, then a traced copy and an empty cell one after the other (6 traced)');
  const orders = new Set([g.left + '|' + g.right]);
  for (let i = 0; i < 5; i++) { await page.click('#sheet-opt'); await page.waitForSelector('#sheet-write-go'); await page.click('#sheet-write-go'); await page.waitForSelector('dialog.center', { state: 'detached' }); await page.waitForTimeout(150); const x = await sheetInfo(page); orders.add(x.left + '|' + x.right); }
  ok(orders.size >= 4 && ![...orders].every((o) => o === THIS + '|' + LAST), 'the order of the characters to read is random: ' + orders.size + ' different orders in 6 sheets');
  const geo = await page.evaluate(() => { const sh = document.querySelector('#sheet').getBoundingClientRect(); return [...document.querySelectorAll('#sheet .zb-rec')].map((b) => { const bb = b.getBoundingClientRect(), l = b.querySelector('.zr-l').getBoundingClientRect(), r = b.querySelector('.zr-r').getBoundingClientRect(), lc = b.querySelector('.zr-l .zr-ch')?.getBoundingClientRect(), rc = b.querySelector('.zr-r .zr-ch')?.getBoundingClientRect(), cs = getComputedStyle(b.querySelector('.zr-l')), z = b.querySelector('.zc').getBoundingClientRect(); return { outL: l.right <= bb.left + 1, outR: r.left >= bb.right - 1, inside: l.left >= sh.left - 1 && r.right <= sh.right + 1, noBox: cs.borderTopWidth === '0px' && cs.backgroundColor === 'rgba(0, 0, 0, 0)', small: !lc || lc.height < z.height * 0.75, mid: !lc || Math.abs((lc.top + lc.bottom) / 2 - (bb.top + bb.bottom) / 2) < 3, vis: !!lc && !!rc }; }); });
  ok(geo.length === 10 && geo.every((x) => x.outL && x.outR && x.inside && x.noBox && x.small && x.mid), 'the characters to read stand BESIDE the frame (left of it / right of it, inside the sheet), without a box or background, smaller than a cell, in the middle of the row');
  const usual = await page.evaluate(() => { const z = document.querySelector('#sheet .zc').getBoundingClientRect(), sh = document.querySelector('#sheet').getBoundingClientRect(), b = document.querySelector('#sheet .zb').getBoundingClientRect(); return { cell: Math.round(z.width), frame: Math.round(b.width), sheet: Math.round(sh.width) }; });
  ok(usual.frame < usual.sheet && usual.frame > usual.sheet * 0.8, 'the frame of the rows is only a little narrower than the sheet (' + usual.frame + ' of ' + usual.sheet + ' px) to leave room beside it');
  await page.screenshot({ path: OUT + 'sheet-write-screen.png' });

  // --- a real PDF: one A4 page, both columns inside the frame
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  fs.writeFileSync(OUT + 'sheet-write.pdf', pdf);
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(pdf.slice(0, 5).toString() === '%PDF-' && pages === 1, 'the PDF made by the browser is ONE A4 page (' + pages + ')');
  try { execFileSync('pdftoppm', ['-r', '60', '-png', OUT + 'sheet-write.pdf', OUT + 'sheet-write-pic']); } catch (e) { /* no pdftoppm */ }

  // --- remembered: after a reload the window still comes straight away, with the characters; it is only gone when the option was switched off
  await page.evaluate(() => (location.hash = '#/')); await page.reload(); await page.waitForSelector('.kid'); await openKid(page, 'Leo');
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet-write-on');
  ok((await page.isChecked('#sheet-write-on')) && (await page.inputValue('#sheet-write-chars')) === WRITE, 'the choice is remembered (also after closing and opening the app again): the window comes at once, on, with the last characters, nothing has to be clicked to switch it on');
  await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog.center', { state: 'detached' });
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet-write-on'); await page.click('#sheet-write-go'); await page.waitForSelector('#sheet .zb-rec');

  // --- remembered per child: the next time the window comes first (filled in), another child is not touched
  await page.click('button.back'); await page.waitForSelector('.weekbar');
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet-write-on');
  ok((await page.isChecked('#sheet-write-on')) && (await page.inputValue('#sheet-write-chars')) === WRITE, 'for Leo the window comes first every time the sheet is opened, with the option on and the last characters filled in');
  await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog.center', { state: 'detached' });
  ok(await page.locator('#sheet').count() === 0 && await page.locator('.weekbar').count() === 1, 'cancelling stays on the week page');
  await page.fill('#sheet-write-chars', '').catch(() => {});
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet-write-on'); await page.fill('#sheet-write-chars', '大小多少上下'); await page.click('#sheet-write-go'); await page.waitForSelector('#sheet .zb-rec');
  const g6 = await sheetInfo(page);
  ok(g6.write.startsWith('大小多少上下') && g6.n === 10 && g6.left.length === 10 && g6.cells.split(',').slice(6).every((c) => c === '12'), 'with only 6 characters to write the sheet still has the ten characters to read: the other 4 rows have empty cells to write in');
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid'); await openKid(page, 'Dory');
  await enterWeek(page, '2026-11-08', '日月水火山石田土');
  await page.waitForSelector('#toasts .toast', { state: 'detached' }).catch(() => {});
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet-write-on');
  ok(await page.isChecked('#sheet-write-on'), 'every child gets the window the first time (Dory too)');
  await page.click('#sheet-write-on'); await page.click('#sheet-write-go'); await page.waitForSelector('#sheet .zb');
  const d = await sheetInfo(page);
  ok(d.rec === 0 && d.cells.split(',').every((c) => c === '12') && d.n === 8, 'Dory switches the option off there: her sheet is the usual one (12 cells a row, her own 8 characters)');
  await page.click('button.back'); await page.waitForSelector('.weekbar'); await page.click('#sheet-btn'); await page.waitForSelector('#sheet .zb');
  ok(await page.locator('#sheet-write-on').count() === 0 && (await sheetInfo(page)).rec === 0, 'and from then on her sheet button goes straight to the sheet, no window');
  // switching the option off again
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid'); await openKid(page, 'Leo'); await page.click('#sheet-btn'); await page.waitForSelector('#sheet-write-on');
  await page.click('#sheet-write-on'); await page.click('#sheet-write-go'); await page.waitForSelector('#sheet .zb');
  const off = await sheetInfo(page);
  ok(off.rec === 0 && off.write === THIS, 'switched off again: Leo\'s sheet is this week\'s characters, as before');
  await page.click('button.back'); await page.waitForSelector('.weekbar'); await page.click('#sheet-btn'); await page.waitForSelector('#sheet .zb');
  ok(await page.locator('#sheet-write-on').count() === 0, 'and the window does not come first any more');

  // --- no week before: the right end stays empty; English / French and a phone
  const t2 = await start(new Map(), { local: true, today: '2026-11-10', viewport: { width: 390, height: 844 } });
  await addKid(t2.page, 'Leo'); await openKid(t2.page, 'Leo'); await enterWeek(t2.page, '2026-11-08', THIS); await t2.page.waitForSelector('#toasts .toast', { state: 'detached' }).catch(() => {});
  await t2.page.click('#sheet-btn'); await t2.page.waitForSelector('#sheet-write-on'); await t2.page.fill('#sheet-write-chars', WRITE); await t2.page.click('#sheet-write-go'); await t2.page.waitForSelector('#sheet .zb-rec'); await t2.page.waitForTimeout(250);
  const first = await sheetInfo(t2.page);
  ok(first.right === '' && first.left.length === 10 && !first.over, 'in the first week there is no last week: the right end is empty, the left end has this week\'s characters, nothing overflows a phone');
  for (const [loc, title, opt, on] of [['en', 'Sheet settings', 'Sheet settings', 'Choose the characters to write'], ['fr', 'Réglages du cahier', 'Réglages du cahier', 'Choisir les caractères à écrire']]) {
    await t2.page.evaluate((l) => { const s = JSON.parse(localStorage.getItem('learn.settings.v1') || '{}'); s.lang = l; localStorage.setItem('learn.settings.v1', JSON.stringify(s)); }, loc);
    await t2.page.reload(); await t2.page.waitForSelector('#sheet-opt');
    await t2.page.click('#sheet-opt'); await t2.page.waitForSelector('#sheet-write-on');
    const txt = await t2.page.evaluate(() => ({ h2: document.querySelector('dialog.center h2').textContent, label: document.querySelector('dialog.center label.check').textContent.trim(), zh: /[一-鿿]/.test([...document.querySelectorAll('dialog.center *')].filter((e) => !e.closest('.user-title, textarea') && e.children.length === 0).map((e) => e.textContent).join('')), btn: document.querySelector('#sheet-write-go').textContent, optBtn: document.querySelector('#sheet-opt')?.textContent }));
    ok(txt.h2 === title && txt.label === on && !txt.zh, loc + ': the settings window is translated (' + txt.h2 + ' / ' + txt.label + ' / ' + txt.btn + ')');
    await t2.page.click('dialog button >> nth=0'); await t2.page.waitForSelector('dialog.center', { state: 'detached' });
  }
  await t2.page.screenshot({ path: OUT + 'sheet-write-phone.png' });
  await t2.browser.close();
  await done(browser);
})();
