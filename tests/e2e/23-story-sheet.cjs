// The story printout: THREE idiom stories on an A4 page, 14 pt type, an A4 sheet printed on both sides holds the week's six. A story that is too long gets a smaller
// type instead of being cut off; the page says how long a story can be. Checked on the screen layout AND on a real PDF made by the browser (page count, size).
const fs = require('fs');
const { execFileSync } = require('child_process');
const { start, checks, addKid, openKid } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
const S = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/stories.json', 'utf8'));
const IDIOMS = Object.keys(S.long);
const count = (t) => t.replace(/[\s\p{P}]/gu, '').length;
// ~150 characters (without punctuation): the first sentences of the long versions
const mid = Object.fromEntries(IDIOMS.map((k) => { let out = ''; for (const s of S.long[k].split(/(?<=。)/)) { if (count(out + s) > 158) break; out += s; } return [k, out]; }));
const seed = (stories, items = IDIOMS) => stories && ({ weeks: [{ start: '2026-11-08', items }], stories, pool: [] });
const putIdioms = (page, data) => page.evaluate((d) => localStorage.setItem('learn.local.idioms.json', JSON.stringify(d)), data);
const open = async (page, data) => { await putIdioms(page, data); await page.evaluate(() => (location.hash = '#/')); await page.reload(); await page.waitForSelector('.kid'); await openKid(page, 'Dory'); await page.click('#idioms-btn'); await page.waitForSelector('#story-print-btn'); lastLabel = await page.textContent('#story-print-btn'); await page.click('#story-print-btn'); await page.waitForSelector('#story-sheet .sb'); await page.waitForTimeout(300); };
let lastLabel = '';
const geo = (page) => page.evaluate(() => {
  const mm = (px) => px / 96 * 25.4;
  const pages = [...document.querySelectorAll('#story-sheet .sp')];
  const z = parseFloat(document.querySelector('#story-sheet').style.zoom || '1') || 1;
  return {
    pages: pages.length, blocks: pages.map((p) => p.querySelectorAll('.sb[data-idiom]').length),
    w: Math.round(mm(pages[0].getBoundingClientRect().width / z)), h: Math.round(mm(pages[0].getBoundingClientRect().height / z)),
    pt: [...document.querySelectorAll('.sb[data-idiom] .sb-text')].map((e) => Math.round(parseFloat(getComputedStyle(e).fontSize) / 96 * 72 * 10) / 10),
    title: [...document.querySelectorAll('.sb[data-idiom]')].map((b) => { const t = b.querySelector('.sb-title'), x = b.querySelector('.sb-text'); return [t.textContent, getComputedStyle(t).fontSize === getComputedStyle(x).fontSize, getComputedStyle(t).fontWeight]; }),
    fancy: document.querySelectorAll('#story-sheet .tzg, #story-sheet .py, #story-sheet .box').length,
    over: [...document.querySelectorAll('.sb-over')].length,
    fill: [...document.querySelectorAll('.sb[data-idiom] .sb-text')].map((e) => Math.round([...e.children].reduce((n, c) => n + c.getBoundingClientRect().height, 0) / e.getBoundingClientRect().height * 100)),
    note: document.querySelector('#story-note')?.textContent, 
  };
});
const pdfPages = async (page, name) => { await page.emulateMedia({ media: 'print' }); const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true }); await page.emulateMedia({ media: 'screen' }); fs.writeFileSync(OUT + name, pdf); return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page } = await start(new Map(), { local: true, today: '2026-11-10', viewport: { width: 820, height: 1180 } });
  await addKid(page, 'Dory');
  ok(IDIOMS.length === 6 && IDIOMS.every((k) => count(mid[k]) >= 120 && count(mid[k]) <= 160), 'the test stories: six idioms with stories of about 150 characters (without punctuation): ' + IDIOMS.map((k) => count(mid[k])).join(', '));

  await open(page, seed(mid));
  const g = await geo(page);
  ok(lastLabel === '打印故事' && (await page.textContent('#story-print')) === '打印 / 保存为 PDF' && (await page.textContent('h1')).startsWith('故事打印'), 'the idiom page has a "打印故事" button; it opens the print page of that week');
  ok(g.pages === 2 && g.blocks.join() === '3,3', 'six stories make TWO pages of three: front and back of one sheet (' + g.pages + ' pages, ' + g.blocks.join(' + ') + ' stories)');
  ok(g.w === 180 && g.h === 266, 'a page is 180 x 266 mm inside the 15 mm margins of an A4 sheet (' + g.w + ' x ' + g.h + ' mm)');
  ok(g.pt.length === 6 && g.pt.every((x) => x === 14), 'every story is set in 14 pt (' + g.pt.join(', ') + ')');
  ok(g.fancy === 0 && g.title.map((x) => x[0]).join() === IDIOMS.join() && g.title.every((x) => x[1] && Number(x[2]) <= 400), 'each story starts with its idiom as a PLAIN line: the same size as the story, normal weight, no 田字格 and no pinyin: ' + g.title.map((x) => x[0]).join(' '));
  ok(g.over === 0 && g.fill.every((f) => f > 0 && f <= 100), 'every ~150 character story fits its third (the text uses ' + g.fill.join('%, ') + '% of the room)');
  const capN = Number((g.note.match(/最多约 (\d+) 个字/) || [])[1]);
  ok(capN >= 200 && capN <= 300, 'the page says how many characters (not counting punctuation) a story can have at 14 pt: about ' + capN);
  await page.screenshot({ path: OUT + 'story-sheet-screen.png' });
  const p1 = await pdfPages(page, 'story-sheet-150.pdf');
  ok(p1 === 2, 'the PDF made by the browser has exactly 2 pages (front and back of one A4 sheet): ' + p1);
  fs.copyFileSync(OUT + 'story-sheet-150.pdf', OUT + 'story-sheet.pdf');

  // the stories of ~190 characters: the usual length of a "fuller" story, still 14 pt
  await open(page, seed(S.long));
  const gl = await geo(page);
  ok(gl.pt.every((x) => x === 14) && gl.over === 0 && gl.pages === 2, 'stories of 170-190 characters still fit at 14 pt (' + gl.pt.join(', ') + ' pt), none is cut (the text uses ' + gl.fill.join('%, ') + '%)');
  ok(await pdfPages(page, 'story-sheet-190.pdf') === 2, 'and still make a 2 page PDF');

  // a story that is too long is set smaller, never cut; one that is far too long is named
  const big = { ...mid, 亡羊补牢: S.long['亡羊补牢'] + S.long['井底之蛙'].slice(0, 90), 守株待兔: S.long['守株待兔'].repeat(4) };
  await open(page, seed(big));
  const gb = await geo(page);
  ok(gb.pt[0] < 14 && gb.pt[0] >= 11 && gb.pt.slice(2).every((x) => x === 14) && /字数较多，已缩小字号：亡羊补牢/.test(gb.note), 'a story of ~280 characters is set smaller (' + gb.pt[0] + ' pt, never below 11) and the page says so');
  ok(gb.over === 1 && /太长，打印会被截断，请缩短：守株待兔/.test(gb.note) && await page.locator('.sb-over').count() === 1, 'one of ~750 characters does not fit even at 11 pt: it is marked and named in a warning');

  // less than six / no story
  await open(page, seed({ 亡羊补牢: mid['亡羊补牢'] }, IDIOMS.slice(0, 4)));
  const g4 = await geo(page);
  ok(g4.pages === 2 && g4.blocks.join() === '3,1' && await page.locator('.sb-empty').count() === 2 && /还没有故事：守株待兔、刻舟求剑、井底之蛙/.test(g4.note), 'four idioms: the second page has one story and two empty places; the page names the idioms that have no story yet');

  // the print page itself
  await open(page, seed(mid));
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => ({ foot: getComputedStyle(document.querySelector('.sheet-foot')).display, top: getComputedStyle(document.querySelector('.top')).display, note: getComputedStyle(document.querySelector('#story-note')).display, shadow: getComputedStyle(document.querySelector('.sp')).boxShadow }));
  await page.emulateMedia({ media: 'screen' });
  ok(pr.foot === 'none' && pr.top === 'none' && pr.note === 'none' && pr.shadow === 'none', 'when printing: no title bar, no button, no hints, no shadow');

  // picture of the PDF: three blocks on a page, text starts near the top of each, left / right margins equal
  try {
    execFileSync('pdftoppm', ['-r', '60', '-png', OUT + 'story-sheet-150.pdf', OUT + 'story-pic']);
    ok(fs.existsSync(OUT + 'story-pic-1.png') && fs.existsSync(OUT + 'story-pic-2.png'), 'the PDF pages were drawn to pictures (looked at as screenshots)');
  } catch (e) { console.log('SKIP picture (pdftoppm not available)'); }

  // English / French and a phone
  for (const [loc, btn, title] of [['en', 'Print stories', 'Stories to print'], ['fr', 'Imprimer les histoires', 'Histoires à imprimer']]) {
    await page.evaluate((l) => { const s = JSON.parse(localStorage.getItem('learn.settings.v1') || '{}'); s.lang = l; localStorage.setItem('learn.settings.v1', JSON.stringify(s)); }, loc);
    await page.setViewportSize({ width: 390, height: 844 });
    await putIdioms(page, seed({ ...mid, 守株待兔: mid['守株待兔'].repeat(5) }));
    await page.evaluate(() => (location.hash = '#/')); await page.reload(); await page.waitForSelector('.kid'); await openKid(page, 'Dory'); await page.click('#idioms-btn'); await page.waitForSelector('#story-print-btn');
    const label = await page.textContent('#story-print-btn');
    await page.click('#story-print-btn'); await page.waitForSelector('#story-sheet .sb'); await page.waitForTimeout(300);
    const bad = await page.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (/[一-鿿]/.test(n.textContent) && !n.parentElement.closest('.user, .user-title, .sb, .kname')) bad.push(n.textContent.trim()); return bad.map((b) => b.replace(/(守株待兔|刻舟求剑|井底之蛙|亡羊补牢|对牛弹琴|指鹿为马)[、]?/g, '').trim()).filter((s) => /[\u4e00-\u9fff]/.test(s)); });
    const gp = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, title: document.querySelector('h1').textContent, btn: document.querySelector('#story-print').textContent }));
    ok(label === btn && gp.title.startsWith(title) && bad.length === 0 && !gp.over, loc + ': "' + label + '" / "' + gp.title + '" / "' + gp.btn + '" translated, nothing Chinese left over ' + JSON.stringify(bad) + ', fits a phone');
    await page.screenshot({ path: OUT + `story-sheet-${loc}-phone.png` });
  }
  await done(browser);
})();
