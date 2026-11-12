// Children's pictures, chosen in Settings: a drawn animal (12 to choose from), a photo from the photo library (cut to a small centred square),
// or a new photo with the camera. Also: a file that is not a picture, a refused camera, cancelling, the camera is switched off again,
// the picture follows the child everywhere (Settings, home, the child's page) and to a second device (it lives in kids.json).
const zlib = require('zlib');
const { start, checks, addKid, openKid, openManage, goHome } = require('./harness.cjs');
const { ok, done } = checks();

// a PNG made on the spot (no picture files needed): left half red, right half blue, 400 x 300 (not square on purpose)
const crc = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return (b) => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PHOTO = png(400, 300, (x) => (x < 200 ? [220, 30, 30] : [30, 30, 220]));

// a pretend camera that shows a green picture
const camera = ({ mode }) => {
  navigator.mediaDevices.getUserMedia = async () => {
    if (mode === 'denied') throw new DOMException('denied', 'NotAllowedError');
    const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d');
    const draw = () => { g.fillStyle = '#18a33a'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.fillRect(280, 200, 80, 80); };
    draw(); setInterval(draw, 100);
    return (window.__stream = c.captureStream(15));
  };
};
const cameraOff = (page) => page.evaluate(() => !window.__stream || window.__stream.getTracks().every((t) => t.readyState === 'ended'));
const pixel = (page, sel, x, y) => page.$eval(sel, async (img, [px, py]) => {
  await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); return { w: img.naturalWidth, h: img.naturalHeight, rgb: Array.from(g.getImageData(px, py, 1, 1).data).slice(0, 3) };
}, [x, y]);
/** every picture on the screen must be small and round-sized (a photo is 192 px big inside, an animal a 64 unit drawing: neither may blow up) */
const sizesOk = async (page, what) => { const w = await page.$$eval('.avatar', (e) => e.map((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })); ok(w.length > 0 && w.every(([a, b]) => a >= 30 && a <= 80 && a === b), `pictures have a sensible size (${what}: ${w.map((x) => x.join('x')).join(', ')})`); };
const art = (page, where) => page.$eval(where + ' .avatar svg', (s) => s.dataset.art).catch(() => null);

(async () => {
  const store = new Map();
  let mode = 'ok';
  const { browser, page } = await start(store, { init: camera, initArg: { mode }, today: '2026-11-10' });
  await addKid(page, 'Dory'); await addKid(page, 'Leo');
  await openManage(page);
  const row = (n) => `.kidrow:has-text("${n}")`;
  ok(await page.locator('.kidrow .avatar svg').count() === 2, 'every child has a picture from the start (a drawn animal)');
  await sizesOk(page, 'Settings, animals');
  const leoBefore = await art(page, row('Leo'));

  // --- an animal from the list
  await page.click(`${row('Dory')} .change-avatar`);
  await page.waitForSelector('dialog .animals');
  ok(await page.locator('dialog .animals button').count() === 12, 'the list has 12 animals');
  ok(await page.locator('dialog #avatar-file').count() === 1 && await page.locator('dialog #take-photo').count() === 1, 'and "from the photo library" and "take a photo"');
  await page.screenshot({ path: (process.env.D || 'tests/out/work/') + 'avatar-dialog.png' });
  await page.click('dialog [data-animal=owl]');
  ok((await art(page, 'dialog .avatar-now')) === 'owl', 'the choice shows in the preview at once (nothing is saved yet)');
  await page.click('#avatar-done');
  await page.waitForSelector('#toasts .toast:has-text("已更换头像")');
  ok((await art(page, row('Dory'))) === 'owl', 'the chosen animal (owl) shows in Settings');
  ok(JSON.parse(store.get('kids.json')).kids[0].avatar === 'animal:owl', 'and is saved with the child (kids.json)');
  await sizesOk(page, 'Settings, after choosing an animal');
  ok((await art(page, row('Leo'))) === leoBefore && JSON.parse(store.get('kids.json')).kids[1].avatar === undefined, 'the other child is not changed');
  await goHome(page);
  const gear = await page.evaluate(() => { const b = document.querySelector('button[aria-label="设置"]'); const r = b.getBoundingClientRect(), s = b.querySelector('svg')?.getBoundingClientRect(); return { text: b.textContent.trim(), svg: !!s, dx: s ? s.left + s.width / 2 - (r.left + r.width / 2) : 99, dy: s ? s.top + s.height / 2 - (r.top + r.height / 2) : 99, size: s ? s.width : 0 }; });
  ok(gear.svg && gear.text === '' && Math.abs(gear.dx) < 1 && Math.abs(gear.dy) < 1 && gear.size >= 22, 'the settings gear is a drawn shape (not the text character ⚙, which each device draws in its own old way), centred in its button');
  ok((await art(page, '.kid:has-text("Dory")')) === 'owl', 'the home screen shows it');
  await openKid(page, 'Dory');
  ok((await art(page, '.kid-hero')) === 'owl', "the child's own page shows it");

  // --- a photo from the photo library, cut to a centred square
  await openManage(page);
  await page.click(`${row('Dory')} .change-avatar`); await page.waitForSelector('dialog .animals');
  ok(await page.locator('dialog [data-animal=owl].on').count() === 1, 'the dialog marks the animal that is in use');
  await page.setInputFiles('#avatar-file', { name: 'me.png', mimeType: 'image/png', buffer: PHOTO });
  await page.waitForSelector('dialog .avatar-now img');
  await page.click('#avatar-done');
  await page.waitForSelector(`${row('Dory')} .avatar img`);
  const left = await pixel(page, `${row('Dory')} .avatar img`, 20, 96), right = await pixel(page, `${row('Dory')} .avatar img`, 172, 96);
  await sizesOk(page, 'Settings, with a photo');
  ok(left.w === 192 && left.h === 192, 'the photo becomes a 192 x 192 square: ' + left.w + ' x ' + left.h);
  ok(left.rgb[0] > 150 && left.rgb[2] < 100 && right.rgb[2] > 150 && right.rgb[0] < 100, 'the middle of the picture is kept: red on the left, blue on the right (' + left.rgb + ' / ' + right.rgb + ')');
  const kids = JSON.parse(store.get('kids.json'));
  ok(kids.kids[0].avatar.startsWith('data:image/jpeg;base64,') && kids.kids[0].avatar.length < 40000, 'it is saved with the child as a small JPEG (' + Math.round(kids.kids[0].avatar.length / 1024) + ' KB)');
  await goHome(page);
  ok(await page.locator('.kid:has-text("Dory") .avatar img').count() === 1, 'the photo is on the home screen');
  await sizesOk(page, 'home, with a photo');
  await openKid(page, 'Dory');
  ok(await page.locator('.kid-hero .avatar img').count() === 1, "and on the child's page");
  await sizesOk(page, "the child's page, with a photo");

  // --- not a picture
  await openManage(page);
  await page.click(`${row('Dory')} .change-avatar`); await page.waitForSelector('dialog .animals');
  await page.setInputFiles('#avatar-file', { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('this is not a picture') });
  await page.waitForFunction(() => document.querySelector('#avatar-err')?.textContent.includes('打不开'));
  ok(await page.locator('dialog').count() === 1, 'a file that is not a picture: says so, the window stays open');

  // --- the camera: cancelling, a refused camera, a photo
  const beforeCam = store.get('kids.json');
  await page.click('#take-photo'); await page.waitForSelector('dialog .scan-video'); await page.waitForTimeout(400);
  await page.click('dialog:last-of-type button:has-text("取消")');
  await page.waitForFunction(() => document.querySelectorAll('dialog').length === 1);
  ok(await cameraOff(page), 'cancelling the camera switches it off');
  ok((await page.$$eval('dialog .animals', (e) => e.length)) === 1 && store.get('kids.json') === beforeCam, 'and returns to the picture window; nothing was saved');
  await page.click('#take-photo'); await page.waitForSelector('dialog .scan-video'); await page.waitForTimeout(500);
  await page.click('#shutter');
  await page.waitForFunction(() => document.querySelectorAll('dialog').length === 1);      // (the camera window closed, the picture window stays)
  await page.waitForSelector('dialog .avatar-now img');
  await page.click('#avatar-done');
  await page.waitForFunction(() => !document.querySelector('dialog') && !document.querySelector('#toasts .toast.working'));
  ok(await cameraOff(page), 'after the photo the camera is switched off');
  const shot = await pixel(page, `${row('Dory')} .avatar img`, 20, 20);
  ok(shot.w === 192 && shot.rgb[1] > 120 && shot.rgb[0] < 80, 'the camera photo is the new picture (green: ' + shot.rgb + ')');
  await page.screenshot({ path: (process.env.D || 'tests/out/work/') + 'avatar-settings.png' });

  // --- a refused camera
  const denied = await start(new Map(), { init: camera, initArg: { mode: 'denied' }, local: true });
  await addKid(denied.page, 'Mia'); await openManage(denied.page);
  await denied.page.click('.change-avatar'); await denied.page.waitForSelector('dialog .animals');
  await denied.page.click('#take-photo');
  await denied.page.waitForFunction(() => document.querySelector('#avatar-err')?.textContent.includes('相机权限'));
  ok(await denied.page.locator('dialog').count() === 1, 'camera refused: says why, the picture window stays open (animals and photo library still possible)');
  await denied.page.click('dialog [data-animal=pig]'); await denied.page.click('#avatar-done'); await denied.page.waitForSelector('#toasts .toast:has-text("已更换头像")');
  ok((await art(denied.page, '.kidrow')) === 'pig', 'and an animal can be chosen after that');
  await denied.browser.close();

  // --- cancelling: nothing happens, nothing is said
  await page.waitForTimeout(3600);
  const saved = store.get('kids.json');
  await page.click(`${row('Leo')} .change-avatar`); await page.waitForSelector('dialog .animals');
  await page.click('#avatar-cancel'); await page.waitForSelector('dialog', { state: 'detached' });
  ok(store.get('kids.json') === saved && await page.locator('#toasts .toast').count() === 0, 'cancelling the picture window changes nothing and shows no message');

  // --- a second device sees the picture (it lives in kids.json)
  const b = await start(store, { today: '2026-11-10' });
  ok(await b.page.locator('.kid:has-text("Dory") .avatar img').count() === 1, 'a second device sees the photo');
  await b.browser.close();
  await browser.close();

  // --- languages
  for (const [locale, lib, cam] of [['en-US', 'Choose from the photo library', 'Take a photo'], ['fr-FR', 'Choisir dans la photothèque', 'Prendre une photo']]) {
    const t = await start(new Map(), { local: true, locale, init: camera, initArg: { mode: 'ok' } });
    await addKid(t.page, 'Mia'); await openManage(t.page);
    await t.page.click('.change-avatar'); await t.page.waitForSelector('dialog .animals');
    ok((await t.page.textContent('dialog .filebtn')).includes(lib) && (await t.page.textContent('#take-photo')) === cam, locale + ': the picture window is translated');
    await t.page.click('#take-photo'); await t.page.waitForSelector('dialog .scan-video');
    ok(!/[一-鿿]/.test(await t.page.textContent('dialog:last-of-type')), locale + ': the camera window has no Chinese text');
    await t.browser.close();
  }
  await done();
})();
