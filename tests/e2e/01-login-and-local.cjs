// Sign-in: wrong token, public repository refused, read-only token refused, good token, link (QR) sign-in, sign out, this-device mode.
const { start, checks, REPO } = require('./harness.cjs');
const jsQR = require('jsqr');
const { ok, done } = checks();
(async () => {
  const { browser, page } = await start(new Map(), { noLogin: true });
  await page.waitForSelector('.login');
  ok(await page.locator('.login input[type=password]').count() === 1, 'login screen shows a token field');
  await page.fill('input[type=text]', REPO); await page.fill('input[type=password]', 'bad'); await page.click('button.primary');
  await page.waitForSelector('.login .err:not(:empty)');
  ok((await page.textContent('.login .err')).includes('令牌无效'), 'wrong token: says so');
  await page.fill('input[type=text]', 'nonsense'); await page.fill('input[type=password]', 'good'); await page.click('button.primary');
  await page.waitForFunction(() => document.querySelector('.login .err')?.textContent.includes('owner/name'));
  ok(true, 'bad repository name: says so');
  await page.fill('input[type=text]', 'demo/ReadOnly'); await page.click('button.primary');
  await page.waitForFunction(() => document.querySelector('.login .err')?.textContent.includes('写权限'));
  ok(true, 'token without write access: refused');

  // a public repository must be refused on a real host (on localhost it is allowed for development)
  const pub = await start(new Map(), { noLogin: true, url: 'http://app.test:5173/' });
  await pub.page.waitForSelector('.login');
  await pub.page.fill('input[type=text]', 'demo/PublicRepo'); await pub.page.fill('input[type=password]', 'good'); await pub.page.click('button.primary');
  await pub.page.waitForFunction(() => document.querySelector('.login .err')?.textContent.includes('公开'));
  ok(true, 'public repository: refused (learning records would be visible to everyone)');
  await pub.browser.close();

  await page.fill('input[type=text]', REPO); await page.fill('input[type=password]', 'good'); await page.click('button.primary');
  await page.waitForSelector('.empty');
  ok((await page.textContent('.empty')).includes('还没有孩子'), 'good token: home screen, no children yet');
  await page.reload();
  await page.waitForSelector('.empty');
  ok(true, 'stays signed in after reload');

  // QR link for another device
  await page.click('button[title=设置]'); await page.click('#qr-btn'); await page.waitForSelector('img.qr');
  const link = await page.getAttribute('img.qr', 'data-link');
  const px = await page.evaluate(async () => {
    const img = document.querySelector('img.qr'); await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, d: Array.from(g.getImageData(0, 0, c.width, c.height).data) };
  });
  const code = jsQR(new Uint8ClampedArray(px.d), px.w, px.h);
  ok(code && code.data === link, 'QR code decodes to the sign-in link');
  ok(/#\/link\//.test(link), 'the token travels in the #fragment of the link (browsers never send it to a server)');

  const other = await browser.newContext({ viewport: { width: 500, height: 800 } });
  await other.route('https://api.github.com/**', async (route) => {
    const p = new URL(route.request().url()).pathname; const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const j = (o, s = 200) => route.fulfill({ status: s, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
    if (p === '/repos/' + REPO) return j({ permissions: { push: true }, default_branch: 'main', private: true });
    if (p === '/user') return j({ login: 't' });
    return j({ message: 'Not Found' }, 404);
  });
  const p2 = await other.newPage();
  await p2.goto(link);
  await p2.waitForSelector('.empty');
  ok(!(await p2.url()).includes('/link/'), 'link sign-in: lands on the home screen and the token is gone from the address bar');

  // sign out
  await page.click('dialog button.primary');
  await page.click('text=退出登录'); await page.click('dialog button.danger, dialog button.primary >> text=退出');
  await page.waitForSelector('.login');
  ok(true, 'sign out: back to the login screen');
  await page.reload(); await page.waitForSelector('.login');
  ok(true, 'signed out stays signed out');
  ok(page.url().endsWith('#/') || !page.url().includes('settings'), 'after signing out the address is the home screen, not Settings');

  // this-device mode: no account, nothing leaves the device
  let outside = 0;
  page.on('request', (r) => { if (/api\.github\.com/.test(r.url())) outside++; });
  await page.click('text=在本机使用（不需要账号）'); await page.waitForSelector('.empty');
  ok(outside === 0, 'this-device mode: no request to GitHub');
  await page.reload(); await page.waitForSelector('.empty');
  ok(true, 'this-device mode survives a reload');
  await done(browser);
})();
