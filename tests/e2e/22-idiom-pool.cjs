// The idiom LIBRARY: the user's 成语 tab (A = idiom, B = tick box "already used with the children", C = a count made by the sheet) is imported once;
// the ticked idioms are given weeks (in the order of the sheet, 6 a week, over the weeks that have started + next week), the rest stays in the library, and every
// week the app picks 6 random unused ones for NEXT week by itself. (The sheet side - ticking B again - is tested in 16-google-sheet-sync.)
const fs = require('fs');
const { zipSync, strToU8 } = require('fflate');
const { start, checks, addKid, openKid, enterWeek, openSettings } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';

// 60 idioms; the first 24 are ticked in a mixed pattern like the user's sheet (not one block)
const IDIOMS = [...'甲乙丙丁戊己庚辛壬癸'].flatMap((a) => [...'一二三四五六'].map((b) => a + b + a + b));   // 60 distinct 4-character "idioms"
const TICKED = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 21, 22, 24, 26, 28, 30, 31, 33];       // 24 rows
const xlsx = (file, rows) => {
  const X = (s) => strToU8(`<?xml version="1.0" encoding="UTF-8"?>${s}`);
  const sheet = rows.map((r, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>${r[0]}</t></is></c><c r="B${i + 1}" t="b"><v>${r[1] ? 1 : 0}</v></c><c r="C${i + 1}"><v>24</v></c></row>`).join('');
  fs.writeFileSync(file, Buffer.from(zipSync({
    '[Content_Types].xml': X('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': X('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="成语" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': X('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': X(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`),
  })));
};
const FILE = OUT + 'idiom-pool.xlsx';
const store = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem('learn.local.' + k) || 'null'), key);
const noChinese = (page, sel) => page.evaluate((s) => { const bad = []; const w = document.createTreeWalker(document.querySelector(s), NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (/[一-鿿]/.test(n.textContent) && !n.parentElement.closest('.user, .user-title')) bad.push(n.textContent.trim()); return bad; }, sel);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  xlsx(FILE, IDIOMS.map((x, i) => [x, TICKED.includes(i)]));
  const { browser, page } = await start(new Map(), { local: true, today: '2026-11-10', viewport: { width: 820, height: 1000 } });

  // ---------- the rules, run in the page against the real modules
  const R = await page.evaluate(async ([IDIOMS, TICKED]) => {
    const M = await import('/src/model.ts'), I = await import('/src/importer.ts');
    const seeded = (n) => () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
    const out = {};
    const rows = IDIOMS.map((x, i) => [x, TICKED.includes(i) ? true : false, 24]);
    out.isPool = I.isPoolSheet(rows) && !I.isPoolSheet([['第1周-2026-10-25', '一心一意', '画蛇添足']]) && !I.isPoolSheet([['成语'], ['一心一意']]);
    const p = I.parsePool(rows);
    out.parsed = [p.items.length, p.checked.length, p.items[0], p.checked[15]];
    const texty = I.parsePool([['成语'], ['对牛弹琴', 'TRUE'], ['指鹿为马', 'FALSE'], [' 井底之蛙 ', 1], ['对牛弹琴', true], ['x'], ['守株待兔', '是']]);
    out.text = [texty.items.join('|'), texty.checked.join('|')];
    const weeks = ['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15'];
    const a = I.applyPool(M.EMPTY_IDIOMS, p, weeks);
    out.weeks = a.data.weeks.map((w) => [w.start, w.items.length, w.items[0]]);
    out.order = a.data.weeks.flatMap((w) => w.items).join('') === p.checked.join('');
    out.plan = [a.plan.assigned, a.plan.leftover, a.plan.unticked, a.plan.fresh];
    const again = I.applyPool(a.data, p, weeks);
    out.idem = JSON.stringify(again.data) === JSON.stringify(a.data) && again.plan.assigned === 0 && again.plan.fresh === 0;
    const small = I.applyPool(M.EMPTY_IDIOMS, p, weeks.slice(0, 3));
    out.leftover = [small.plan.assigned, small.plan.leftover, small.data.weeks.length];
    // topping up a week that already has two
    const two = { weeks: [{ start: weeks[0], items: [p.checked[20], p.checked[21]] }] };
    const t = M.assignToWeeks(two, p.checked, weeks);
    out.top = [t.data.weeks[0].items.length, t.data.weeks[0].items.slice(0, 2).join('') === p.checked[20] + p.checked[21], t.leftover.length, t.assigned];
    // random picks
    const lib = { ...a.data };
    const f1 = M.fillWeek(lib, '2026-11-22', 6, seeded(7)), f2 = M.fillWeek(lib, '2026-11-22', 6, seeded(8));
    const used = M.usedIdioms(lib);
    out.pick = [f1.added.length, f1.added.every((x) => !used.has(x) && p.items.includes(x)), new Set(f1.added).size, f1.added.join('') !== f2.added.join('')];
    out.full = M.fillWeek(f1.data, '2026-11-22').added.length;
    const three = M.fillWeek({ weeks: [], pool: ['甲乙丙丁', '戊己庚辛', '壬癸甲乙'] }, '2026-11-22');
    out.fewer = [three.added.length, M.fillWeek(three.data, '2026-11-29').added.length];
    const partial = M.fillWeek({ weeks: [{ start: '2026-11-22', items: ['甲乙丙丁', '戊己庚辛'] }], pool: p.items }, '2026-11-22');
    out.partial = [partial.data.weeks[0].items.length, partial.data.weeks[0].items.slice(0, 2).join('')];
    out.stories = M.fillWeek({ weeks: [], pool: p.items, stories: { 甲一甲一: '故事' } }, '2026-11-22').data.stories['甲一甲一'];
    return out;
  }, [IDIOMS, TICKED]);
  ok(R.isPool && R.parsed.join() === `60,24,${IDIOMS[0]},${IDIOMS[TICKED[15]]}`, 'a 成语 tab without week labels is recognised as the library; 60 idioms, 24 ticked, in the order of the sheet');
  ok(R.text.join('#') === '对牛弹琴|指鹿为马|井底之蛙|守株待兔#对牛弹琴|井底之蛙|守株待兔', 'ticks are read from a real tick box, TRUE, 1 or 是; a heading, doubles and rubbish rows are ignored: ' + R.text.join(' # '));
  ok(R.weeks.length === 4 && R.weeks.every((w) => w[1] === 6) && R.order && R.plan.join() === '24,0,36,60', 'the 24 ticked idioms are given to the 4 weeks, 6 each, in the order of the sheet; 36 stay in the library');
  ok(R.idem, 'importing the same sheet again changes nothing');
  ok(R.leftover.join() === '18,6,3', 'with only 3 weeks 18 are placed and 6 are left over (kept in the library, not lost)');
  ok(R.top.join() === '6,true,0,22', 'a week that already has two idioms is topped up to six, the two stay in front, the other 22 ticked ones fill the rest');
  ok(R.pick.join() === '6,true,6,true' && R.full === 0, 'random picks: 6 different idioms from the unused ones, never a used one, a different set with another seed, nothing when the week is full');
  ok(R.fewer.join() === '3,0' && R.partial.join() === '6,甲乙丙丁戊己庚辛' && R.stories === '故事', 'with fewer than 6 left it takes what is there, a week with 2 is topped up to 6, stories are kept');

  // ---------- the real flow: three weeks of characters, import the sheet, preview, import
  await addKid(page, 'Dory'); await openKid(page, 'Dory');
  await enterWeek(page, '2026-10-25', '假辣酸贫纺炒缸锅烛扇'); await enterWeek(page, '2026-11-01', '鼓旧富言忙桶炉锤泉溪'); await enterWeek(page, '2026-11-08', '波坡板炭镜锁帆筐犁耙');
  await page.waitForSelector('#toasts .toast', { state: 'detached' }).catch(() => {});
  await openSettings(page); await page.click('#import-btn'); await page.setInputFiles('#import-file', FILE); await page.waitForSelector('#import-go');
  const pv = (await page.textContent('.entry')).replace(/\u2011/g, '-');
  ok(pv.includes('成语库：60 个成语，其中 24 个已勾选') && pv.includes('分配到 4 周，每周 6 个（10-25、11-01、11-08、11-15）') && pv.includes('还没有分配到周的 36 个留在成语库里') && !(await page.locator('.entry .warn').count()), 'the preview says: library of 60, 24 ticked, 4 weeks of 6 (the 3 started weeks and next week), 36 stay in the library');
  await page.screenshot({ path: OUT + 'idiom-pool-preview.png' });
  ok(await store(page, 'idioms.json') === null, 'nothing is written while only previewing');
  await page.click('#import-go');
  await page.waitForSelector('#toasts .toast:has-text("已导入")');
  const saved = await store(page, 'idioms.json');
  ok(saved.pool.length === 60 && saved.weeks.map((w) => w.start).join() === '2026-10-25,2026-11-01,2026-11-08,2026-11-15' && saved.weeks.every((w) => w.items.length === 6), 'saved: the library (60) and 4 weeks of 6 idioms');
  const ticked = TICKED.map((i) => IDIOMS[i]);
  ok(saved.weeks.flatMap((w) => w.items).join(',') === ticked.join(','), 'the first six ticked idioms of the sheet are week 1, the next six week 2, ... (the sheet order)');
  ok((await page.textContent('#toasts')).includes('24 个成语'), 'the result message says 24 idioms');

  // the idiom page of the current week shows that week's six
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid'); await openKid(page, 'Dory'); await page.click('#idioms-btn'); await page.waitForSelector('.idiom-card');
  ok((await page.$$eval('.idiom-card', (e) => e.map((x) => x.dataset.idiom))).join(',') === ticked.slice(12, 18).join(',') && (await page.textContent('.sec-row .sec')) === '成语（6）', 'the idiom page of this week (11-08) shows its six idioms: the third group of the sheet');

  // ---------- every week: next week gets 6 random unused idioms by itself (here: a week later, next week = 11-22)
  await page.clock.setFixedTime(new Date('2026-11-17T10:00:00'));
  await page.evaluate(() => (location.hash = '#/'));            // (opening the home screen: the picking is done when the data is loaded)
  await page.waitForSelector('#toasts .toast:has-text("随机选好")');
  ok((await page.textContent('#toasts')).includes('已为下一周随机选好 6 个成语'), 'a week later, opening the app: "6 idioms picked at random for next week"');
  const s2 = await store(page, 'idioms.json');
  const next = s2.weeks.find((w) => w.start === '2026-11-22');
  const old = new Set(saved.weeks.flatMap((w) => w.items));
  ok(next && next.items.length === 6 && new Set(next.items).size === 6 && next.items.every((x) => !old.has(x) && IDIOMS.includes(x)) && s2.weeks.length === 5, 'next week (11-22) got 6 different idioms of the library that nobody had used; the earlier weeks are unchanged');
  ok(JSON.stringify(s2.weeks.slice(0, 4)) === JSON.stringify(saved.weeks) && s2.pool.length === 60, 'the four weeks before are exactly as they were, the library is intact');
  await page.reload(); await page.waitForSelector('.kid'); await page.waitForTimeout(500);
  ok(JSON.stringify(await store(page, 'idioms.json')) === JSON.stringify(s2) && await page.locator('#toasts .toast:has-text("随机选好")').count() === 0, 'opening the app again the same week picks nothing more (and says nothing)');
  // a week with two idioms of its own is topped up to six
  await page.evaluate(([x, y]) => { const d = JSON.parse(localStorage.getItem('learn.local.idioms.json')); d.weeks.push({ start: '2026-11-29', items: [x, y] }); localStorage.setItem('learn.local.idioms.json', JSON.stringify(d)); }, [IDIOMS[40], IDIOMS[41]]);
  await page.clock.setFixedTime(new Date('2026-11-24T10:00:00'));
  await page.reload(); await page.waitForSelector('#toasts .toast:has-text("随机选好")');
  const s3 = await store(page, 'idioms.json'); const w29 = s3.weeks.find((w) => w.start === '2026-11-29');
  ok(w29.items.length === 6 && w29.items[0] === IDIOMS[40] && w29.items[1] === IDIOMS[41] && (await page.textContent('#toasts')).includes('随机选好 4 个'), 'next week with two idioms the user chose is topped up to six (4 picked), the two stay first');

  // ---------- no library imported: the app does nothing by itself
  const t2 = await start(new Map(), { local: true, today: '2026-11-10' });
  await addKid(t2.page, 'Leo'); await openKid(t2.page, 'Leo'); await t2.page.waitForTimeout(500);
  ok(await t2.page.locator('#toasts .toast:has-text("随机选好")').count() === 0 && await store(t2.page, 'idioms.json') === null, 'without an imported library nothing is picked and nothing is written');
  await t2.browser.close();

  // ---------- English and French
  for (const [loc, a, b, c] of [['en-US', 'Idiom library: 60 idioms, 24 of them ticked', 'go to 2 weeks', '6 idioms picked at random for next week'], ['fr-FR', 'Bibliothèque de chengyu : 60 chengyu, dont 24 cochés', 'vont dans 2 semaines', '6 chengyu tirés au sort pour la semaine suivante']]) {
    const t3 = await start(new Map(), { local: true, locale: loc, today: '2026-11-10' });
    await addKid(t3.page, 'Dory'); await openKid(t3.page, 'Dory');
    await t3.page.evaluate(() => (location.hash = '#/settings')); await t3.page.waitForSelector('#import-btn');
    await t3.page.click('#import-btn'); await t3.page.setInputFiles('#import-file', FILE); await t3.page.waitForSelector('#import-go');
    const txt = await t3.page.textContent('.entry');
    ok(txt.includes(a) && txt.includes(b) && (await noChinese(t3.page, 'dialog')).length === 0, loc + ': the import preview of the library is translated: ' + txt.replace(/\s+/g, ' ').slice(0, 150));
    await t3.page.screenshot({ path: OUT + `idiom-pool-preview-${loc}.png` });
    await t3.page.click('#import-go'); await t3.page.waitForSelector('#toasts .toast >> text=/imported|importés|Imported|Importé/i').catch(() => {});
    await t3.page.clock.setFixedTime(new Date('2026-11-17T10:00:00'));
    await t3.page.reload(); await t3.page.waitForSelector('#toasts .toast >> text=/picked at random|tirés au sort/');
    ok((await t3.page.textContent('#toasts')).includes(c), loc + ': the message "' + c + '"');
    await t3.browser.close();
  }
  await done(browser);
})();
