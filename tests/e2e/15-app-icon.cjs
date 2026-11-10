// The app icon: drawn once (assets/icon/icon.svg), every size made from it (npm run icons). Checks what the App Store / iPhone / browsers need:
// the right sizes, NO transparency (iOS refuses an alpha channel), the picture fills the whole square (iOS rounds the corners itself), nothing important too
// near the edges, every file is in sync with the master drawing, the page links them, the manifest points at real files, a small size still shows the face.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');
const { makeIcons } = require('../../scripts/make-icons.cjs');
const { checks, URL } = require('./harness.cjs');
const { ok, done } = checks();
const ROOT = path.resolve(__dirname, '../..');
const FILES = [['assets/icon/icon-1024.png', 1024], ['public/apple-touch-icon.png', 180], ['public/icon-512.png', 512], ['public/icon-192.png', 192], ['public/favicon-32.png', 32]];
const ihdr = (f) => { const b = fs.readFileSync(path.join(ROOT, f)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], type: b[25], sig: b.subarray(1, 4).toString() }; };

(async () => {
  for (const [f, size] of FILES) {
    const h = ihdr(f);
    ok(h.sig === 'PNG' && h.w === size && h.h === size, `${f}: a PNG of ${size} x ${size}`);
    ok(h.type === 2, `${f}: colour type 2 (RGB): no alpha channel, so no transparency (iOS refuses it)`);
  }
  ok(fs.statSync(path.join(ROOT, 'public/favicon.svg')).size === fs.statSync(path.join(ROOT, 'assets/icon/icon.svg')).size, 'the browser tab icon (favicon.svg) is the master drawing');
  ok(!!require(path.join(ROOT, 'package.json')).scripts.icons, 'npm run icons makes all of them from the master');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const load = (f) => page.evaluate(async (data) => { const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return { w: c.width, h: c.height, d: Array.from(g.getImageData(0, 0, c.width, c.height).data) }; }, fs.readFileSync(path.join(ROOT, f)).toString('base64'));

  // --- the 1024 picture itself
  const big = await load('assets/icon/icon-1024.png');
  const px = (x, y) => { const i = (y * big.w + x) * 4; return [big.d[i], big.d[i + 1], big.d[i + 2], big.d[i + 3]]; };
  const corners = [px(0, 0), px(1023, 0), px(0, 1023), px(1023, 1023)];
  ok(corners.every((c) => c[3] === 255 && c[0] > 200 && c[2] < 200 && c[0] + c[1] + c[2] < 700), 'the picture fills the whole square, corners included (orange, not white or empty): ' + corners.map((c) => c.slice(0, 3).join(',')).join(' | '));
  const R = 1024 * 0.2237 * 0.94;           // iOS cuts the corners with a rounded square; keep a little distance from the cut
  const cut = (x, y) => { const dx = Math.max(1024 * 0.2237 - x, x - (1024 - 1024 * 0.2237), 0), dy = Math.max(1024 * 0.2237 - y, y - (1024 - 1024 * 0.2237), 0); return Math.hypot(dx, dy) > R; };
  let important = 0, cutOff = 0;            // the red frame, the dark face, the yellow pencil and its pink eraser: everything that matters
  for (let y = 0; y < big.h; y += 2) for (let x = 0; x < big.w; x += 2) {
    const i = (y * big.w + x) * 4, r = big.d[i], g = big.d[i + 1], b = big.d[i + 2];
    const frame = r > 215 && g > 60 && g < 110 && b > 70 && b < 120, dark = r < 70 && g < 60 && b < 80, yellow = r > 240 && g > 195 && g < 225 && b < 90, pink = r > 240 && g > 125 && g < 160 && b > 150 && b < 180;
    if (frame || dark || yellow || pink) { important++; if (cut(x, y)) cutOff++; }
  }
  ok(important > 5000 && cutOff === 0, `nothing important (mascot, pencil) falls in the corners that iOS cuts off (${important / 1} sampled pixels, ${cutOff} cut)`);
  const mid = px(512, 640);
  ok(mid[0] > 240 && mid[1] > 240 && mid[2] > 240, 'the middle of the mascot is white paper (the 田字格)');
  const colors = new Set(); for (let i = 0; i < big.d.length; i += 4 * 997) colors.add(`${big.d[i] >> 5},${big.d[i + 1] >> 5},${big.d[i + 2] >> 5}`);
  ok(colors.size > 25, 'a colourful picture, not a flat square (' + colors.size + ' colour groups)');

  // --- a small size still shows the face
  const small = await load('public/favicon-32.png');
  let dark = 0; for (let i = 0; i < small.d.length; i += 4) if (small.d[i] < 90 && small.d[i + 1] < 90 && small.d[i + 2] < 100) dark++;
  ok(dark >= 3 && dark < 120, 'at 32 px the dark eyes and smile are still there (' + dark + ' dark pixels)');

  // --- in sync with the master: draw everything again and compare
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
  await makeIcons(tmp);
  for (const [f] of FILES) {
    const a = await load(f);
    const b = await page.evaluate(async (data) => { const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return Array.from(g.getImageData(0, 0, c.width, c.height).data); }, fs.readFileSync(path.join(tmp, f)).toString('base64'));
    let sum = 0; for (let i = 0; i < a.d.length; i++) sum += Math.abs(a.d[i] - b[i]);
    ok(sum / a.d.length < 1.5, `${f} is in sync with assets/icon/icon.svg (mean difference ${(sum / a.d.length).toFixed(2)}; if this fails run: npm run icons)`);
  }
  await browser.close();

  // --- what the browser sees: the links in the page, the manifest and the files it names
  const b2 = await chromium.launch(); const p2 = await b2.newPage();
  await p2.goto(URL, { waitUntil: 'networkidle' }); await p2.waitForTimeout(500);
  const links = await p2.$$eval('link[rel]', (e) => e.map((l) => [l.rel, l.getAttribute('href'), l.getAttribute('sizes')]));
  ok(links.some((l) => l[0] === 'apple-touch-icon' && /apple-touch-icon\.png$/.test(l[1])), 'the page offers the iPhone / iPad home-screen icon (apple-touch-icon)');
  ok(links.some((l) => l[0] === 'manifest') && links.some((l) => l[0] === 'icon' && /\.svg$/.test(l[1])) && links.some((l) => l[0] === 'icon' && /favicon-32\.png$/.test(l[1])), 'and the web app manifest, the tab icon (svg) and a 32 px png');
  ok((await p2.$eval('meta[name=theme-color]', (e) => e.content)) === '#f76707', 'the browser bar colour is the app orange');
  const man = await (await fetch(new globalThis.URL('manifest.webmanifest', URL))).json();
  ok(man.name === '识字小助手' && man.display === 'standalone' && man.start_url === './' && /^#[0-9a-f]{6}$/i.test(man.theme_color), 'the manifest: name, standalone, start page, colours');
  let allThere = true, types = [];
  for (const icon of man.icons) { const r = await fetch(new globalThis.URL(icon.src, new globalThis.URL('manifest.webmanifest', URL))); types.push(r.status + ' ' + (r.headers.get('content-type') || '')); if (!r.ok) allThere = false; }
  ok(allThere, 'every icon named in the manifest is served: ' + types.join(', '));
  ok(!man.icons.some((i) => i.purpose && i.purpose.includes('maskable')), 'no icon is declared "maskable" (the pencil near the corner would be cut by round masks)');
  await b2.close();
  await done();
})();
