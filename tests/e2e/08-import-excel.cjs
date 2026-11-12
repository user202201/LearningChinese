// Import from Excel / Google Sheets: the user's layout (one tab per child, one row per week, A = "第1周-2026-10-25", then the characters; a 成语 tab),
// real .xlsx files (made by openpyxl, see fixtures/make-xlsx.py), preview before anything is written, duplicates, paste, bad files, cancel.
const fs = require('fs');
const path = require('path');
const { zipSync, strToU8 } = require('fflate');
const { start, checks, gotoWeek, openManage } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
const SAMPLE = path.resolve(__dirname, '../fixtures/sample.xlsx');
(async () => {
  const store = new Map();
  const { browser, page, log } = await start(store, { today: '2026-11-10' });
  const preview = async (file) => { await openManage(page); await page.click('#import-btn'); await page.setInputFiles('#import-file', file); await page.waitForSelector('#import-go'); };
  const entry = (name) => page.locator('.entry', { has: page.locator(`strong.user:text-is("${name}")`) });

  await preview(SAMPLE);
  ok(await page.locator('.entry').count() === 4, 'four tabs are offered: Dory, Leo, Antoine, 成语 (the hidden tab is left out)');
  let t = await entry('Dory').textContent();
  ok(t.includes('3 周，30 个汉字，其中新的 30 个') && t.includes('新建孩子'), 'Dory: 3 weeks, 30 characters, all new, a new child');
  t = await entry('Leo').textContent();
  ok(t.includes('2 周，20 个汉字，其中新的 19 个') && t.includes('已入库，会跳过：1 个'), 'Leo (real Excel dates): a character repeated in week 2 is skipped, the earliest week keeps it');
  t = await entry('Antoine').textContent();
  ok(t.includes('1 周，6 个汉字，其中新的 6 个') && t.includes('有 1 行没认出日期') && t.includes('第 3 行'), 'Antoine: the heading row is ignored, a row without a date is reported (row 3)');
  t = await entry('成语').textContent();
  ok(t.includes('2 周，12 个成语，其中新的 12 个') && !t.includes('新建孩子'), '成语: 2 weeks, 12 idioms');
  ok(store.size === 0, 'nothing is written while only previewing');
  await page.screenshot({ path: OUT + 'import-preview.png' });

  // cancel: nothing written, no message
  await page.click('dialog button:not(.primary):has-text("取消")');
  await page.waitForSelector('dialog', { state: 'detached' });
  ok(store.size === 0 && await page.locator('#toasts .toast:has-text("已导入")').count() === 0, 'cancelling the preview writes nothing and shows no "done" message');

  // import without Antoine
  await preview(SAMPLE);
  await entry('Antoine').locator('input[type=checkbox]').uncheck();
  await page.click('#import-go');
  await page.waitForSelector('#toasts .toast:has-text("已导入")');
  const msg = await page.textContent('#toasts');
  ok(msg.includes('49 个汉字、12 个成语') && msg.includes('1 个已入库'), 'result message: 49 characters, 12 idioms, 1 skipped');
  await page.waitForSelector('.kid:has-text("Leo")');
  ok(await page.locator('.kid').count() === 2, 'Dory and Leo were created; Antoine (unticked) was not');
  ok((await page.textContent('.kid:has-text("Dory")')).includes('已入库 30 字') && (await page.textContent('.kid:has-text("Leo")')).includes('已入库 19 字'), 'home cards: Dory 30, Leo 19');
  const kids = JSON.parse(store.get('kids.json'));
  ok(kids.startWeek === '2026-10-25', 'week 1 = the first week of the sheet');
  const dory = JSON.parse(store.get(`kids/${kids.kids.find((k) => k.name === 'Dory').id}.json`));
  ok(dory.weeks.map((w) => w.start).join() === '2026-10-25,2026-11-01,2026-11-08' && dory.weeks[0].chars.join('') === '假辣酸贫纺炒缸锅烛扇', "Dory's weeks, in order, with the characters as in the sheet");
  const leo = JSON.parse(store.get(`kids/${kids.kids.find((k) => k.name === 'Leo').id}.json`));
  ok(leo.weeks[1].chars.join('') === '山水火土木金日月田' && leo.weeks[0].chars.includes('春'), 'Leo: 春 stays in week 1 only');
  ok(JSON.parse(store.get('idioms.json')).weeks.map((w) => w.items.length).join() === '6,6', 'idioms: 2 weeks of 6');

  // the imported data is there in the child's page
  await page.click('.kid:has-text("Dory")'); await page.waitForSelector('.weekbar');
  ok((await page.textContent('.wlabel strong')) === '第3周' && await page.locator('.cards .tzg').count() === 10, "Dory's page shows week 3 with its 10 characters");
  await gotoWeek(page, '2026-10-25');
  ok((await page.textContent('.wlabel strong')) === '第1周' && await page.locator('.cards .tzg').count() === 10 && await page.locator('.idiom').count() === 0, 'week 1 shows its characters; the idioms of the 成语 tab are saved (idioms.json) but not shown on the page');
  await page.click('button.back'); await page.waitForSelector('.kids');

  // importing the same file again: nothing new for Dory / Leo / 成语
  await preview(SAMPLE);
  t = await entry('Dory').textContent();
  ok(t.includes('其中新的 0 个') && t.includes('都已经有了'), 'the same file again: Dory has nothing new');
  ok(await entry('Dory').locator('input[type=checkbox]').isDisabled(), 'a tab without anything new cannot be ticked');
  await page.click('dialog button:not(.primary):has-text("取消")'); await page.waitForSelector('dialog', { state: 'detached' });

  // paste instead of a file: a tab copied from the sheet (tab-separated)
  await openManage(page); await page.click('#import-btn');
  await page.selectOption('#paste-target', 'Dory');
  await page.fill('#paste-text', '第1周-2026-10-25\t假\t辣\n');
  await page.click('#paste-go'); await page.waitForSelector('#import-go');
  ok((await entry('Dory').textContent()).includes('其中新的 0 个') && await page.locator('#import-go').isDisabled(), 'paste: characters already learned -> nothing to import, the button is off');
  await page.click('dialog button:not(.primary):has-text("取消")'); await page.waitForSelector('dialog', { state: 'detached' });
  await openManage(page); await page.click('#import-btn');
  await page.selectOption('#paste-target', 'Dory');
  await page.fill('#paste-text', '第4周-2026-11-15\t枣\t梨\t桃\t杏\t\t40\n');
  await page.click('#paste-go'); await page.waitForSelector('#import-go');
  ok((await entry('Dory').textContent()).includes('1 周，4 个汉字，其中新的 4 个'), 'paste: 4 new characters (the running total 40 in the last column is ignored)');
  await page.click('#import-go'); await page.waitForSelector('#toasts .toast:has-text("已导入：4 个汉字")');
  ok((await page.textContent('.kid:has-text("Dory")')).includes('已入库 34 字'), 'Dory now has 34');

  // not a spreadsheet
  fs.writeFileSync(OUT + 'bad.xlsx', 'this is not a zip file');
  await openManage(page); await page.click('#import-btn'); await page.setInputFiles('#import-file', OUT + 'bad.xlsx');
  await page.waitForFunction(() => document.querySelector('#import-err')?.textContent.includes('不是 .xlsx'));
  ok(await page.locator('dialog').count() === 1, 'a file that is not an .xlsx: says so and the window stays open');
  // an .xlsx written by other programs: text inside the cell ("inlineStr"), the date as an Excel number
  const serial = Math.round((Date.UTC(2026, 10, 22) - Date.UTC(1899, 11, 30)) / 86400000);
  const X = (s) => strToU8(`<?xml version="1.0" encoding="UTF-8"?>${s}`);
  fs.writeFileSync(OUT + 'inline.xlsx', Buffer.from(zipSync({
    '[Content_Types].xml': X('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': X('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Mia" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': X('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': X(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>${serial}</v></c><c r="B1" t="inlineStr"><is><t>猫</t></is></c><c r="C1" t="inlineStr"><is><r><t>狗</t></r></is></c><c r="D1" t="str"><v>鸟</v></c></row></sheetData></worksheet>`),
  })));
  await page.setInputFiles('#import-file', OUT + 'inline.xlsx'); await page.waitForSelector('#import-go');
  ok((await entry('Mia').textContent()).includes('1 周，3 个汉字，其中新的 3 个'), 'other writers: inline text, formula text and a date typed as an Excel number are understood');
  await page.click('dialog button:not(.primary):has-text("取消")'); await page.waitForSelector('dialog', { state: 'detached' });
  await page.reload(); await page.waitForSelector('#manage-mode');
  ok(!log.puts.includes('kids/') && store.size === 4, 'only kids.json, idioms.json and the two children were written (4 files)');
  await browser.close();

  // languages: the import window is translated
  for (const [locale, title, btn] of [['en-US', 'Import from Excel', 'Import from Excel'], ['fr-FR', 'Importer depuis Excel', 'Importer depuis Excel']]) {
    const t2 = await start(new Map(), { local: true, locale });
    await t2.page.evaluate(() => (location.hash = '#/settings')); await t2.page.waitForSelector('#manage-mode'); await require('./harness.cjs').adminOn(t2.page); await t2.page.waitForSelector('#import-btn');
    await t2.page.click('#import-btn'); await t2.page.waitForSelector('#import-file', { state: 'attached' });
    ok((await t2.page.textContent('dialog h2')) === title, locale + ': the import window is translated');
    await t2.page.setInputFiles('#import-file', SAMPLE); await t2.page.waitForSelector('#import-go');
    ok(!/[一-鿿]/.test((await t2.page.textContent('.entry >> nth=0')).replace(/Dory|Leo|Antoine/g, '')), locale + ': the preview has no Chinese UI text');
    await t2.page.screenshot({ path: OUT + `import-preview-${locale}.png` });
    await t2.browser.close();
  }
  await done();
})();
