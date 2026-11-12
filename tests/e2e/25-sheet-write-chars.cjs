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

  // --- off by default: the sheet is the usual one, and a button leads to the settings
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet .zb');
  const plain = await sheetInfo(page);
  ok(plain.n === 10 && plain.rec === 0 && plain.write === THIS && plain.cells.split(',').every((c) => c === '12'), 'by default nothing changes: this week\'s characters, 12 cells a row, no characters to read');
  ok((await page.textContent('#sheet-opt')) === '字帖设置', 'the sheet page has a small "字帖设置" button');

  // --- the settings window
  await page.click('#sheet-opt'); await page.waitForSelector('#sheet-write-on');
  ok(!(await page.isChecked('#sheet-write-on')) && await page.locator('#sheet-write-chars').isDisabled(), 'the window: the option is off, the field is locked until it is switched on');
  await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog.center', { state: 'detached' });
  ok((await sheetInfo(page)).write === THIS && await page.locator('#toasts .toast').count() === 0, 'cancelling changes nothing and says nothing');
  await page.click('#sheet-opt'); await page.click('#sheet-write-on');
  ok(await page.locator('#sheet-write-go').isDisabled() && (await page.textContent('#sheet-write-note')).includes('还没有输入要写的字'), 'switched on with nothing typed: "no characters typed yet", Make the sheet is off');
  await page.fill('#sheet-write-chars', '一 二，三\n十 木 木');
  ok((await page.textContent('#sheet-write-note')) === '已输入 5 个字' && !(await page.locator('#sheet-write-go').isDisabled()), 'spaces, punctuation, line breaks and doubles are dropped: "5 characters typed"');
  await page.fill('#sheet-write-chars', WRITE + '月星');
  ok((await page.textContent('#sheet-write-note')).includes('已输入 12 个字，只用前 10 个'), 'more than ten: the window says only the first 10 are used');
  await page.fill('#sheet-write-chars', WRITE); await page.click('#sheet-write-go'); await page.waitForSelector('dialog.center', { state: 'detached' });
  await page.waitForSelector('#sheet .zb-rec');

  // --- the sheet: rows for the typed characters, this week's on the left, last week's on the right, random order
  const g = await sheetInfo(page);
  ok(g.n === 10 && g.rec === 10 && g.write === WRITE, 'ten rows, for the ten typed characters in the order typed (' + g.write + ')');
  ok([...g.left].sort().join('') === [...THIS].sort().join('') && [...g.right].sort().join('') === [...LAST].sort().join(''), 'at the left end of the rows: this week\'s ten characters, at the right end: last week\'s ten (each exactly once)');
  ok(g.cells.split(',').every((c) => c === '10') && g.traced.split(',').every((c) => c === '5'), 'in the middle of each row 10 cells to write in: the character, then a traced copy and an empty cell one after the other (5 traced)');
  const orders = new Set([g.left + '|' + g.right]);
  for (let i = 0; i < 5; i++) { await page.click('#sheet-opt'); await page.waitForSelector('#sheet-write-go'); await page.click('#sheet-write-go'); await page.waitForSelector('dialog.center', { state: 'detached' }); await page.waitForTimeout(150); const x = await sheetInfo(page); orders.add(x.left + '|' + x.right); }
  ok(orders.size >= 4 && ![...orders].every((o) => o === THIS + '|' + LAST), 'the order of the characters to read is random: ' + orders.size + ' different orders in 6 sheets');
  const geo = await page.evaluate(() => { const b = document.querySelector('#sheet .zb-rec'), l = b.querySelector('.zr-l').getBoundingClientRect(), r = b.querySelector('.zr-r').getBoundingClientRect(), m = b.querySelector('.zb-main').getBoundingClientRect(), bb = b.getBoundingClientRect(), ch = b.querySelector('.zr-ch').getBoundingClientRect(), z = b.querySelector('.zc').getBoundingClientRect(); return { lw: Math.round(l.width), rw: Math.round(r.width), zw: Math.round(z.width), mid: Math.abs((l.left + l.right) / 2 - bb.left - (bb.right - (r.left + r.right) / 2)) < 1.5, inl: l.top <= m.top + 1 && l.bottom >= m.bottom - 1, chBig: ch.height > z.height * 0.5 }; });
  ok(Math.abs(geo.lw - geo.zw) <= 2 && Math.abs(geo.rw - geo.zw) <= 2 && geo.mid && geo.inl && geo.chBig, 'the characters to read stand in a column as wide as a cell at each end, as tall as the whole row, big (' + geo.lw + ' / ' + geo.rw + ' / ' + geo.zw + ' px)');
  await page.screenshot({ path: OUT + 'sheet-write-screen.png' });

  // --- a real PDF: one A4 page, both columns inside the frame
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  fs.writeFileSync(OUT + 'sheet-write.pdf', pdf);
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(pdf.slice(0, 5).toString() === '%PDF-' && pages === 1, 'the PDF made by the browser is ONE A4 page (' + pages + ')');
  try { execFileSync('pdftoppm', ['-r', '60', '-png', OUT + 'sheet-write.pdf', OUT + 'sheet-write-pic']); } catch (e) { /* no pdftoppm */ }

  // --- remembered per child: the next time the window comes first (filled in), another child is not touched
  await page.click('button.back'); await page.waitForSelector('.weekbar');
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet-write-on');
  ok((await page.isChecked('#sheet-write-on')) && (await page.inputValue('#sheet-write-chars')) === WRITE, 'for Leo the window comes first every time the sheet is opened, with the option on and the last characters filled in');
  await page.click('dialog button:has-text("取消")'); await page.waitForSelector('dialog.center', { state: 'detached' });
  ok(await page.locator('#sheet').count() === 0 && await page.locator('.weekbar').count() === 1, 'cancelling stays on the week page');
  await page.fill('#sheet-write-chars', '').catch(() => {});
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet-write-on'); await page.fill('#sheet-write-chars', '大小多少上下'); await page.click('#sheet-write-go'); await page.waitForSelector('#sheet .zb-rec');
  const g6 = await sheetInfo(page);
  ok(g6.write.startsWith('大小多少上下') && g6.n === 10 && g6.left.length === 10 && g6.cells.split(',').slice(6).every((c) => c === '10'), 'with only 6 characters to write the sheet still has the ten characters to read: the other 4 rows have empty cells to write in');
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid'); await openKid(page, 'Dory');
  ok(await page.locator('#sheet-btn').count() === 0, '(Dory has no characters yet: no sheet button)');
  await enterWeek(page, '2026-11-08', '日月水火山石田土');
  await page.waitForSelector('#toasts .toast', { state: 'detached' }).catch(() => {});
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet .zb');
  const d = await sheetInfo(page);
  ok(d.rec === 0 && d.cells.split(',').every((c) => c === '12') && d.n === 8, 'Dory (option never switched on): her sheet is the usual one, no window in between');
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
  await t2.page.click('#sheet-btn'); await t2.page.waitForSelector('#sheet .zb');
  await setup(t2.page, WRITE);
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
