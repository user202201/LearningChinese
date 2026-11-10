// Settings -> "Sync to Google Sheets": the card, the button that copies the sync script (exactly the file docs/google-sheet-sync/sync.gs), the box to copy by hand
// when the browser refuses the clipboard, the link to the step-by-step guide, translations.
const fs = require('fs');
const path = require('path');
const { start, checks, addKid, openSettings, URL } = require('./harness.cjs');
const { ok, done } = checks();
const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../docs/google-sheet-sync/sync.gs'), 'utf8');
const ORIGIN = new globalThis.URL(URL).origin;
(async () => {
  const { browser, page, ctx } = await start(new Map(), { local: true, today: '2026-11-10', viewport: { width: 820, height: 1180 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  await addKid(page, 'Dory'); await openSettings(page);
  ok(await page.locator('.card:has(#copy-sync) h3').count() === 1, 'Settings has a "Sync to Google Sheets" card');
  const href = await page.getAttribute('#sync-steps', 'href');
  ok(/\/docs\/google-sheet-sync\/README\.md$/.test(href) && (await page.getAttribute('#sync-steps', 'target')) === '_blank' && (await page.getAttribute('#sync-steps', 'rel')).includes('noopener'), 'a link to the step-by-step guide that opens in a new tab: ' + href);
  await page.click('#copy-sync');
  await page.waitForSelector('#toasts .toast:has-text("已复制")');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip === SCRIPT, 'the button puts exactly the script file on the clipboard (' + clip.length + ' characters)');
  ok(clip.includes('function onOpen()') && clip.includes('function syncAuto()') && !/user202201|github_pat_[A-Za-z0-9_]{20,}/.test(clip), 'it is the whole script, and has no personal data or token in it');
  await page.screenshot({ path: (process.env.D || 'tests/out/work/') + 'sync-card.png' });

  // the browser refuses the clipboard: a box with the script to copy by hand
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('not allowed')); });
  await page.waitForTimeout(6300);   // (the first "copied" message stays for 6 seconds)
  await page.click('#copy-sync');
  await page.waitForSelector('dialog #sync-script');
  ok(await page.$eval('#sync-script', (e) => e.value) === SCRIPT && await page.$eval('#sync-script', (e) => e.readOnly), 'clipboard refused: a read-only box shows the whole script to copy by hand');
  ok(await page.locator('#toasts .toast:has-text("已复制")').count() === 0, 'and no false "copied" message');
  await page.click('dialog button.primary'); await page.waitForSelector('dialog', { state: 'detached' });
  await browser.close();

  for (const [locale, title, copy] of [['en-US', 'Sync to Google Sheets', 'Copy the sync script'], ['fr-FR', 'Synchroniser avec Google Sheets', 'Copier le script de synchronisation']]) {
    const t = await start(new Map(), { local: true, locale, today: '2026-11-10', viewport: { width: 390, height: 844 } });
    await addKid(t.page, 'Dory'); await openSettings(t.page);
    const card = await t.page.textContent('.card:has(#copy-sync)');
    ok(card.includes(title) && (await t.page.textContent('#copy-sync')) === copy && !/[一-鿿]/.test(card), locale + ': the card is translated (' + title + ')');
    const fits = await t.page.$eval('.card:has(#copy-sync)', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('button, a')].every((b) => { const x = b.getBoundingClientRect(); return x.left >= r.left - 1 && x.right <= r.right + 1; }) && document.documentElement.scrollWidth <= innerWidth; });
    ok(fits, locale + ': the card fits a phone screen');
    await t.browser.close();
  }
  await done();
})();
