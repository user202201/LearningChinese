// Makes every app icon from the one master drawing assets/icon/icon.svg (run: npm run icons). The master is the only thing to edit.
//   assets/icon/icon-1024.png   App Store / iOS app icon: 1024 x 1024, NO transparency (iOS refuses an alpha channel and rounds the corners itself)
//   public/apple-touch-icon.png 180 x 180: "Add to Home Screen" on iPhone / iPad
//   public/icon-192.png, icon-512.png   web app manifest;  public/favicon-32.png   browser tab;  public/favicon.svg   the drawing itself
// Also used by tests/e2e/15-app-icon.cjs to check that the files are in sync with the master.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUTPUTS = [
  [1024, 'assets/icon/icon-1024.png'],
  [180, 'public/apple-touch-icon.png'],
  [512, 'public/icon-512.png'],
  [192, 'public/icon-192.png'],
  [32, 'public/favicon-32.png'],
];

const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
/** an RGB PNG (colour type 2: no alpha channel at all) from raw RGBA pixels */
function rgbPng(size, rgba) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) { const i = (y * size + x) * 4, o = row + 1 + x * 3; raw[o] = rgba[i]; raw[o + 1] = rgba[i + 1]; raw[o + 2] = rgba[i + 2]; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** draws the master at every size; `outDir` (default: the project) is where the files go */
async function makeIcons(outDir = ROOT) {
  const svg = fs.readFileSync(path.join(ROOT, 'assets/icon/icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const written = [];
  try {
    for (const [size, file] of OUTPUTS) {
      const b64 = await page.evaluate(async ([svgText, px]) => {
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
        await img.decode();
        const c = document.createElement('canvas'); c.width = c.height = px;
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, px, px);
        const d = g.getImageData(0, 0, px, px).data; let s = '';
        for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
        return btoa(s);
      }, [svg, size]);
      const dest = path.join(outDir, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, rgbPng(size, Buffer.from(b64, 'base64')));
      written.push(dest);
    }
    const favicon = path.join(outDir, 'public/favicon.svg');
    fs.mkdirSync(path.dirname(favicon), { recursive: true });
    fs.writeFileSync(favicon, svg);
    written.push(favicon);
  } finally {
    await browser.close();
  }
  return written;
}
module.exports = { makeIcons, OUTPUTS };
if (require.main === module) makeIcons().then((w) => console.log('icons written:\n' + w.map((f) => '  ' + path.relative(ROOT, f)).join('\n')));
