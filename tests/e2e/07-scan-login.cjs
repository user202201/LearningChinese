// "Scan to sign in": the login screen has a camera scan so that nobody has to type a long token. A pretend camera shows a real QR code
// (drawn on a canvas, decoded by the app's own scanner). Also: a wrong QR code, a refused camera, a wrong token inside a valid code, the camera is switched off again.
const QRCode = require('qrcode');
const { start, checks, REPO, URL } = require('./harness.cjs');
const { ok, done } = checks();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const link = (t) => `${URL}#/link/${b64({ t, r: REPO })}`;
const camera = ({ png, mode }) => {
  navigator.mediaDevices.getUserMedia = async () => {
    if (mode === 'denied') throw new DOMException('denied', 'NotAllowedError');
    const img = new Image(); img.src = png; await img.decode();
    const c = document.createElement('canvas'); c.width = 480; c.height = 480; const g = c.getContext('2d');
    const draw = () => { g.fillStyle = '#fff'; g.fillRect(0, 0, 480, 480); g.drawImage(img, 60, 60, 360, 360); };
    draw(); setInterval(draw, 100);
    return (window.__stream = c.captureStream(15));
  };
};
const open = async (text, mode = 'ok', opts = {}) => {
  const png = text ? await QRCode.toDataURL(text, { margin: 4, width: 360 }) : '';
  return start(new Map(), { noLogin: true, init: camera, initArg: { png, mode }, ...opts });
};
const cameraOff = (page) => page.evaluate(() => !window.__stream || window.__stream.getTracks().every((t) => t.readyState === 'ended'));

(async () => {
  // 1. a good code signs in, without typing anything
  let t = await open(link('good'));
  await t.page.waitForSelector('#scan-btn');
  ok(await t.page.locator('.login input[type=password]').inputValue() === '', 'the token field is empty: nothing was typed');
  await t.page.click('#scan-btn');
  await t.page.waitForSelector('.empty-home', { timeout: 15000 });
  ok(true, 'scanning a good sign-in code signs in and shows the home screen');
  ok(await t.page.locator('dialog').count() === 0, 'the scan window closed by itself');
  ok(await cameraOff(t.page), 'the camera is switched off again');
  ok(!(t.page.url().includes('good')), 'the token is not left in the address bar');
  await t.page.reload(); await t.page.waitForSelector('.empty-home');
  ok(true, 'stays signed in after a reload');
  await t.browser.close();

  // 2. some other QR code: told so, keeps looking; cancel = camera off, no message, not signed in
  t = await open('https://example.com/not-ours');
  await t.page.click('#scan-btn');
  await t.page.waitForSelector('dialog .scan-video');
  await t.page.waitForFunction(() => document.querySelector('#scan-hint')?.textContent.includes('不是本应用'), null, { timeout: 15000 });
  ok(true, 'a QR code of something else: "this is not a sign-in code"');
  await t.page.click('dialog button');
  await t.page.waitForSelector('dialog', { state: 'detached' });
  ok(await t.page.locator('.login').count() === 1 && await t.page.locator('#toasts .toast').count() === 0, 'cancelling: still on the login screen, no message');
  ok(await cameraOff(t.page), 'cancelling switches the camera off');
  await t.browser.close();

  // 3. camera refused
  t = await open('', 'denied');
  await t.page.click('#scan-btn');
  await t.page.waitForFunction(() => document.querySelector('.login .err')?.textContent.includes('相机权限'));
  ok(await t.page.locator('dialog').count() === 0 && await t.page.locator('input[type=password]').count() === 1, 'camera refused: says why, and typing in is still possible');
  await t.browser.close();

  // 4. a valid code with a bad token inside: the normal error, buttons usable again
  t = await open(link('expired'));
  await t.page.click('#scan-btn');
  await t.page.waitForFunction(() => document.querySelector('.login .err')?.textContent.includes('令牌无效'), null, { timeout: 15000 });
  ok(!(await t.page.locator('#scan-btn').isDisabled()), 'a code with a bad token: error shown and the scan button works again');
  await t.browser.close();

  // 5. other languages: the scan window has no Chinese left
  for (const [locale, word] of [['en-US', 'Sign in by scanning'], ['fr-FR', 'Se connecter en scannant']]) {
    t = await open('https://example.com/x', 'ok', { locale });
    ok((await t.page.textContent('#scan-btn')).includes(word), locale + ': the scan button is translated');
    await t.page.click('#scan-btn'); await t.page.waitForSelector('dialog .scan-video');
    ok(!/[一-鿿]/.test(await t.page.textContent('dialog')), locale + ': the scan window has no Chinese text');
    await t.page.screenshot({ path: (process.env.D || 'tests/out/work/') + `scan-${locale}.png` });
    await t.browser.close();
  }
  await done();
})();
