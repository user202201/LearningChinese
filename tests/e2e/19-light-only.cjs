// Light only: the app has no dark mode (learning characters is done in a bright place, especially by children), and it tells the browser so, so that
// phones that darken web pages by themselves ("auto dark", "force dark") leave it alone. Checks: the page declares light only (meta + CSS), there is no
// dark-mode rule anywhere, and a phone in dark mode shows exactly the same picture (mascot with its eyes and mouth, the dotted background, colours).
const { start, checks, addKid, openKid } = require('./harness.cjs');
const { ok, done } = checks();
const fs = require('fs');
const path = require('path');
const OUT = process.env.D || 'tests/out/work/';
const shot = async (scheme) => {
  const { browser, page } = await start(new Map(), { local: true, today: '2026-11-08', colorScheme: scheme, viewport: { width: 390, height: 780 } });
  await page.waitForSelector('#add-kid-big'); await page.waitForTimeout(400);
  const home = await page.screenshot();
  const info = await page.evaluate(() => ({
    meta: document.querySelector('meta[name=color-scheme]')?.content, scheme: getComputedStyle(document.documentElement).colorScheme,
    dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    bg: getComputedStyle(document.body).backgroundColor, bgImg: getComputedStyle(document.body).backgroundImage.slice(0, 40),
    text: getComputedStyle(document.body).color,
  }));
  await addKid(page, 'Dory'); await openKid(page, 'Dory');
  const kid = await page.screenshot();
  await page.emulateMedia({ media: 'print' });
  info.print = await page.evaluate(() => ({ scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor, img: getComputedStyle(document.body).backgroundImage, filter: getComputedStyle(document.body).filter }));
  await browser.close();
  return { home, kid, info };
};
(async () => {
  const light = await shot('light'), dark = await shot('dark');
  ok(dark.info.dark === true && light.info.dark === false, 'the test phone really is in dark mode (prefers-color-scheme: dark) in the second run');
  ok(/only light/.test(dark.info.meta || '') && /(only light|light only)/.test(dark.info.scheme), 'the page declares "only light" to the browser (meta tag and CSS color-scheme: ' + dark.info.meta + ' / ' + dark.info.scheme + ')');
  ok(/only light|light only/.test(dark.info.print.scheme) && dark.info.print.bg === 'rgb(255, 255, 255)' && dark.info.print.img === 'none' && dark.info.print.filter === 'none', 'printing from a phone in dark mode: the paper is white, no background picture, no filter, light only (' + JSON.stringify(dark.info.print) + ')');
  const css = fs.readFileSync(path.resolve(__dirname, '../../src/style.css'), 'utf8');
  ok(!/prefers-color-scheme\s*:\s*dark/.test(css) && !/color-scheme\s*:[^;]*dark/.test(css), 'no dark-mode rule in the style sheet (and none is planned: one look for everybody)');
  ok(dark.info.bg === light.info.bg && dark.info.text === light.info.text && dark.info.bgImg === light.info.bgImg, 'background and text colours are the same in dark mode (' + dark.info.bg + ' / ' + dark.info.text + ')');
  const same = (a, b) => Buffer.compare(a, b) === 0;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT + 'light-only-home-dark.png', dark.home); fs.writeFileSync(OUT + 'light-only-kid-dark.png', dark.kid);
  ok(same(light.home, dark.home), 'the first screen (mascot with eyes and mouth, dotted background) looks exactly the same in dark mode');
  ok(same(light.kid, dark.kid), "a child's page looks exactly the same in dark mode");
  await done();
})();
