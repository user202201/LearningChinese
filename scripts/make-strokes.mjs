// Builds public/strokes/<xx>.json: the stroke outlines (in writing order) of the 6763 characters of GB2312 (everyday Chinese), from the open data of
// "Make Me a Hanzi" (npm: hanzi-writer-data, Arphic Public License, see public/strokes/ARPHICPL.TXT). One file per 256 code points, loaded only when a
// practice sheet needs it. Run: node scripts/make-strokes.mjs   (needs: npm i -D hanzi-writer-data; the output is committed)
import fs from "node:fs";
import path from "node:path";

const root = new URL("../", import.meta.url).pathname;
const src = path.join(root, "node_modules/hanzi-writer-data");
const out = path.join(root, "public/strokes");
// the GB2312 characters: the same list the tests use (GBK decoding of the two-byte codes 0xB0A1 .. 0xF7FE)
const dec = new TextDecoder("gb2312");
const chars = [];
for (let hi = 0xb0; hi <= 0xf7; hi++) for (let lo = 0xa1; lo <= 0xfe; lo++) { const c = dec.decode(new Uint8Array([hi, lo])); if (c.length === 1 && /[一-鿿]/.test(c)) chars.push(c); }

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const buckets = new Map();
let n = 0, missing = 0;
for (const c of chars) {
  const f = path.join(src, `${c}.json`);
  if (!fs.existsSync(f)) { missing++; continue; }
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const key = (c.codePointAt(0) >> 8).toString(16);
  if (!buckets.has(key)) buckets.set(key, {});
  buckets.get(key)[c] = d.strokes.map((s) => s.replace(/\s+/g, " "));   // only the outlines: the order of the array is the writing order
  n++;
}
for (const [k, v] of buckets) fs.writeFileSync(path.join(out, `${k}.json`), JSON.stringify(v));
fs.copyFileSync(path.join(src, "ARPHICPL.TXT"), path.join(out, "ARPHICPL.TXT"));
fs.writeFileSync(path.join(out, "README.txt"), "Stroke outlines (in writing order) from Make Me a Hanzi (https://github.com/skishore/makemeahanzi), via the npm package hanzi-writer-data.\nLicense: Arphic Public License (ARPHICPL.TXT). Made by scripts/make-strokes.mjs.\n");
console.log(`${n} characters in ${buckets.size} files (${missing} of the list have no data)`);
