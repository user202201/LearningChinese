// Practice sheet (字帖) of the week's characters, made on the device: per character the pinyin, the number of strokes, the strokes one by one in writing order,
// then a row of 田字格 cells (the character, traced copies, empty cells). The stroke data comes from the app itself (public/strokes, Make Me a Hanzi), nothing is sent
// anywhere. The printout is a real PDF page (checked with the browser's own PDF export), the license notice is in Settings.
const fs = require('fs');
const { start, checks, addKid, openKid, enterWeek } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
// the characters of the sample the user showed (from the site they use): 生 5 strokes, 字 6, 帖 8, 支 4, 持 9
const WEEK = '生字帖支持山水火土木';
const COUNTS = { 生: 5, 字: 6, 帖: 8, 支: 4, 持: 9, 山: 3, 水: 4, 火: 4, 土: 3, 木: 4 };
const PINYIN = { 生: 'shēng', 字: 'zì', 帖: 'tiē', 支: 'zhī', 持: 'chí' };
(async () => {
  const { browser, page, ctx } = await start(new Map(), { local: true, today: '2026-11-10', viewport: { width: 820, height: 1180 } });
  const hosts = new Set(); page.on('request', (r) => hosts.add(new URL(r.url()).host));
  await addKid(page, 'Dory'); await openKid(page, 'Dory');
  ok(await page.locator('#sheet-btn').count() === 0, 'an empty week has no practice-sheet button');
  await enterWeek(page, '2026-11-08', WEEK);
  ok((await page.textContent('#sheet-btn')) === '字帖', 'a week with characters has a "字帖" button next to the heading');
  await page.waitForSelector('#toasts .toast', { state: 'detached' }).catch(() => {});
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet .zb');
  ok((await page.textContent('h1')).startsWith('字帖') && await page.locator('#sheet .zb').count() === 10, 'it opens the sheet of that week: ten blocks, one per character');
  ok((await page.textContent('.sheet-top')).includes('姓名') && (await page.textContent('.sheet-top')).includes('年') && (await page.textContent('.sheet-top')).includes('日'), 'with the name and date line at the top');

  // --- every block: pinyin, number of strokes, the strokes one by one, the row of cells
  const blocks = await page.evaluate(() => [...document.querySelectorAll('#sheet .zb')].map((b) => {
    const cells = [...b.querySelectorAll('.zc')];
    return { ch: b.dataset.ch, py: b.querySelector('.zb-py').textContent, n: b.querySelector('.zb-n').textContent, steps: [...b.querySelectorAll('.zb-steps svg')].map((s) => [...s.querySelectorAll('path')].map((p) => p.getAttribute('fill'))),
      cells: cells.map((c) => (c.classList.contains('model') ? 'M' : c.classList.contains('trace') ? 'T' : '.') + (c.querySelectorAll('svg path').length)), tops: new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top))).size, sq: cells.every((c) => Math.abs(c.getBoundingClientRect().width - c.getBoundingClientRect().height) < 1.5) };
  }));
  const wanted = [...WEEK];
  ok(blocks.map((b) => b.ch).join('') === WEEK, 'in the order of the week');
  ok(blocks.every((b) => b.n === COUNTS[b.ch] + '画'), 'the stroke counts are right (生 5, 字 6, 帖 8, 支 4, 持 9, ...): ' + blocks.map((b) => b.ch + b.n).join(' '));
  ok(Object.keys(PINYIN).every((c) => blocks.find((b) => b.ch === c).py === PINYIN[c]), 'with the pinyin: ' + blocks.slice(0, 5).map((b) => b.py).join(' '));
  ok(blocks.every((b) => b.steps.length === COUNTS[b.ch] && b.steps.every((s, i) => s.length === i + 1)), 'the strokes one by one in writing order: picture i has i strokes (the first has 1, the last all of them)');
  ok(blocks.every((b) => b.steps.every((s) => s.slice(0, -1).every((f) => f === '#2d2230') && s.at(-1) === 'var(--kid)')), 'the newest stroke of each picture is in the colour, the earlier ones in black');
  ok(blocks.every((b) => b.cells.length === 12 && b.cells[0] === 'M' + COUNTS[b.ch] && [1, 3, 5, 7, 9, 11].every((i) => b.cells[i] === 'T' + COUNTS[b.ch]) && [2, 4, 6, 8, 10].every((i) => b.cells[i] === '.0') && b.tops === 1 && b.sq), 'a row of 12 square cells: the character, then a traced copy and an empty cell, one after the other (6 to trace, 5 to write)');
  const thin = await page.evaluate(() => ['.zb-py', '.zb-n'].map((s) => { const e = document.querySelector('#sheet ' + s), c = getComputedStyle(e); return [s, c.fontWeight, Math.round(parseFloat(c.fontSize) / (document.querySelector('#sheet').getBoundingClientRect().width / 100) * 10) / 10]; }));
  ok(thin.every(([, w, s]) => Number(w) <= 300 && s <= 2.2), 'the pinyin and the stroke count are small and in the lightest weight (300; name, weight, size in % of the sheet width): ' + thin.map((x) => x.join(' ')).join(', '));
  // the header sits on the same columns as the cells: pinyin centred over the first cell, the stroke count over the second, the stroke pictures from the third on
  const al = await page.evaluate(() => [...document.querySelectorAll('#sheet .zb')].map((b) => { const cs = [...b.querySelectorAll('.zc')].map((c) => c.getBoundingClientRect()), mid = (r) => (r.left + r.right) / 2; const py = b.querySelector('.zb-py').getBoundingClientRect(), n = b.querySelector('.zb-n').getBoundingClientRect(), st = b.querySelector('.zb-steps svg').getBoundingClientRect(); const tx = (e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); }; return { ch: b.dataset.ch, py: mid(tx(b.querySelector('.zb-py'))) - mid(cs[0]), n: mid(tx(b.querySelector('.zb-n'))) - mid(cs[1]), step: st.left - cs[2].left }; }));
  ok(al.every((a) => Math.abs(a.py) <= 1.5 && Math.abs(a.n) <= 1.5 && a.step >= -0.5), 'pinyin centred over the first cell, stroke count over the second, stroke pictures from the third cell on, the same for every character (off by ' + al.map((a) => a.py.toFixed(1) + '/' + a.n.toFixed(1)).join(', ') + ' px)');
  const sh = await page.evaluate(() => { const r = document.querySelector('#sheet').getBoundingClientRect(); return { w: Math.round(r.width), over: document.documentElement.scrollWidth > innerWidth, left: r.left - (innerWidth - r.right) }; });
  ok(!sh.over && Math.abs(sh.left) <= 1, 'the sheet is centred and fits the screen (' + sh.w + ' px)');
  await page.screenshot({ path: OUT + 'sheet-screen.png', fullPage: false });

  // --- the printout: a real PDF, one A4 page for ten characters, without the buttons
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => ({ foot: getComputedStyle(document.querySelector('.sheet-foot')).display, top: getComputedStyle(document.querySelector('.top')).display, w: Math.round(document.querySelector('#sheet').getBoundingClientRect().width) }));
  ok(pr.foot === 'none' && pr.top === 'none', 'when printing the title bar and the button are not printed');
  const topw = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.sheet-top')); return [c.fontWeight, c.fontFamily.split(',')[0]]; });
  ok(Number(topw[0]) <= 300, 'the name and date line is not bold either (weight ' + topw[0] + ')');
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(OUT + 'sheet.pdf', pdf);
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(pdf.slice(0, 5).toString() === '%PDF-' && pdf.length > 5000, 'the browser makes a real PDF of it (' + Math.round(pdf.length / 1024) + ' KB)');
  ok(pages === 1, 'ten characters fit on ONE A4 page (' + pages + ' page)');
  await page.emulateMedia({ media: 'screen' });

  // --- nothing leaves the device: only this app's own address was asked
  ok([...hosts].every((h) => /^localhost(:\d+)?$/.test(h)), 'only the app itself was asked for anything (the stroke data is part of the app): ' + [...hosts].join(', '));

  // --- a character without stroke data (not in the everyday list) still gets its row
  await page.click('button.back'); await page.waitForSelector('.weekbar');
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid'); await openKid(page, 'Dory');
  const fresh = await ctx.newPage(); await fresh.close();
  await page.evaluate(() => { const k = JSON.parse(localStorage.getItem('learn.local.kids.json')).kids[0].id; const key = `learn.local.kids/${k}.json`; const d = JSON.parse(localStorage.getItem(key)); d.weeks.push({ start: '2026-11-15', chars: ['垚', '生'] }); localStorage.setItem(key, JSON.stringify(d)); });
  await page.reload(); await page.waitForSelector('.weekbar'); await page.click('button[title=下一周]'); await page.waitForSelector('#sheet-btn');
  await page.click('#sheet-btn'); await page.waitForSelector('#sheet .zb');
  const rare = await page.evaluate(() => { const b = document.querySelector('#sheet .zb[data-ch=垚]'); return { steps: b.querySelectorAll('.zb-steps svg').length, n: b.querySelector('.zb-n').textContent, cells: b.querySelectorAll('.zc').length, text: b.querySelector('.zc.model')?.textContent }; });
  ok(rare.steps === 0 && rare.n === '' && rare.cells === 12 && rare.text === '垚', 'a character the stroke data does not have still gets its row (the character in the cell, no stroke pictures) instead of an error');

  // --- the license notice is in Settings
  await page.evaluate(() => (location.hash = '#/settings')); await page.waitForSelector('#credits');
  const href = await page.getAttribute('#license-link', 'href');
  const lic = await page.evaluate(async (u) => { const r = await fetch(u); return [r.status, (await r.text()).slice(0, 200)]; }, href);
  ok((await page.textContent('#credits')).includes('Make Me a Hanzi') && lic[0] === 200 && /Arphic/i.test(lic[1]), 'Settings has the credits and the license text of the stroke data (Arphic Public License) that goes with the app');

  // --- English / French and a small phone
  for (const [loc, title, name] of [['en', 'Practice sheet', 'Name'], ['fr', "Cahier d'écriture", 'Nom']]) {
    await page.evaluate((l) => { const s = JSON.parse(localStorage.getItem('learn.settings.v1') || '{}'); s.lang = l; localStorage.setItem('learn.settings.v1', JSON.stringify(s)); }, loc);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => (location.hash = '#/')); await page.reload(); await page.waitForSelector('.kid'); await openKid(page, 'Dory');
    await page.click('#sheet-btn'); await page.waitForSelector('#sheet .zb');
    const bad = await page.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (/[一-鿿]/.test(n.textContent) && !n.parentElement.closest('.user, .user-title, .kname, .zc')) bad.push(n.textContent.trim()); return bad; });
    const geo = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, title: document.querySelector('h1').textContent, top: document.querySelector('.sheet-top').textContent, btn: document.querySelector('#sheet-print').textContent }));
    ok(bad.length === 0 && !geo.over && geo.title.startsWith(title) && geo.top.includes(name), loc + ': the sheet page is translated (' + geo.title + ' / ' + geo.btn + '), nothing Chinese left over ' + JSON.stringify(bad) + ', fits a 320 px phone');
    await page.screenshot({ path: OUT + `sheet-${loc}-phone.png` });
  }
  await done(browser);
})();
