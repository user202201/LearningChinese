// Checks a list of idiom stories against the rules (see CLAUDE.md, rule 27): at most 150 characters (punctuation counted), only characters of the everyday list
// (GB2312 level 1), plain text. Input: a TSV file "idiom<TAB>story" per line, or public/stories.json. Usage: node scripts/check-stories.mjs stories.tsv
import fs from "node:fs";

const file = process.argv[2] ?? new URL("../public/stories.json", import.meta.url).pathname;
const text = fs.readFileSync(file, "utf8");
const stories = file.endsWith(".json")
  ? JSON.parse(text).stories
  : Object.fromEntries(text.split(/\r?\n/).filter((l) => l.trim()).map((l) => { const i = l.indexOf("\t"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const dec = new TextDecoder("gb2312");
const level1 = new Set();
for (let hi = 0xb0; hi <= 0xd7; hi++) for (let lo = 0xa1; lo <= 0xfe; lo++) { const c = dec.decode(new Uint8Array([hi, lo])); if (c.length === 1 && /[一-鿿]/.test(c)) level1.add(c); }

let bad = 0;
for (const [idiom, s] of Object.entries(stories)) {
  const problems = [];
  if (s.length > 150) problems.push(`${s.length} characters (max 150)`);
  if (s.length < 60) problems.push(`only ${s.length} characters`);
  const out = [...s].filter((c) => /[一-鿿]/.test(c) && !level1.has(c));
  if (out.length) problems.push(`not everyday characters: ${[...new Set(out)].join("")}`);
  if (/[a-zA-Z0-9\n]/.test(s)) problems.push("Latin letters, digits or line breaks");
  if (problems.length) { bad++; console.log(`✗ ${idiom}: ${problems.join("; ")}`); }
}
console.log(`${Object.keys(stories).length} stories checked, ${bad} with problems`);
process.exit(bad ? 1 : 0);
