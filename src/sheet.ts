/**
 * Practice sheet (字帖) of the week's characters, made on the device (nothing is sent anywhere): per character a block with the pinyin, the number of
 * strokes and the strokes one by one in writing order, then a row of 田字格 cells: the character in black, traced (light) copies and empty cells to write in.
 * Stroke data: Make Me a Hanzi (Arphic Public License), public/strokes/*.json made by scripts/make-strokes.mjs. The printout is the browser's own
 * (window.print: "Save as PDF" in the print window), the CSS of the page is in style.css (.sheet).
 */
import { h } from "./ui";
import { loadPinyin, pinyinOf } from "./pinyin";

const SVG = "http://www.w3.org/2000/svg";
const buckets = new Map<string, Promise<Record<string, string[]> | null>>();

/** the strokes (outlines, in writing order) of a character, or null when there is no data for it */
export async function strokesOf(ch: string): Promise<string[] | null> {
  const key = (ch.codePointAt(0)! >> 8).toString(16);
  if (!buckets.has(key)) {
    buckets.set(key, fetch(`${import.meta.env.BASE_URL}strokes/${key}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    if (!(await buckets.get(key))) buckets.delete(key);   // (not found / offline: try again next time)
  }
  return (await buckets.get(key))?.[ch] ?? null;
}

/** the first `upTo` strokes as one picture; the newest one in `hi` colour, the earlier ones in `ink` (Make Me a Hanzi drawing: 1024 x 1024, y upwards) */
export function strokeSvg(strokes: string[], opts: { upTo?: number; ink?: string; hi?: string } = {}): SVGSVGElement {
  const n = opts.upTo ?? strokes.length;
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("viewBox", "0 0 1024 1024");
  s.setAttribute("aria-hidden", "true");
  const g = document.createElementNS(SVG, "g");
  g.setAttribute("transform", "translate(0 900) scale(1 -1)");
  strokes.slice(0, n).forEach((d, i) => {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", opts.hi && opts.upTo !== undefined && i === n - 1 ? opts.hi : opts.ink ?? "currentColor");
    g.append(p);
  });
  s.append(g);
  return s;
}

/** 12 cells per row: the character, then traced copies and empty cells, one after the other (6 to trace, 5 to write freely) */
const PATTERN = ["model", "trace", "", "trace", "", "trace", "", "trace", "", "trace", "", "trace"] as const;
export const shuffle = <T,>(list: readonly T[], rnd: () => number = Math.random): T[] => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** characters to READ (not to write), printed small beside the frame at the left and right of a row (no boxes): this week's on the left, last week's on the right */
export interface Recognise { left: string[]; right: string[] }

/** one block = the row of one character to write (`ch` null: a row with only empty cells); with `rec` a character to read stands beside the frame at each side */
async function block(ch: string | null, rec?: { l: string; r: string }): Promise<HTMLElement> {
  const strokes = ch ? await strokesOf(ch) : null;
  const head = h("div", { class: "zb-head" },
    h("span", { class: "zb-py" }, ch ? pinyinOf(ch) : ""),
    h("span", { class: "zb-n" }, strokes ? `${strokes.length}画` : ""),
    h("span", { class: "zb-steps" }, ...(strokes ? strokes.map((_, i) => strokeSvg(strokes, { upTo: i + 1, ink: "#2d2230", hi: "var(--kid)" })) : [])));
  const cells = PATTERN.map((kind) => {
    const c = h("div", { class: "zc" + (kind && ch ? " " + kind : "") });
    if (kind && ch) c.append(strokes ? strokeSvg(strokes) : h("span", { class: "zc-ch user" }, ch));
    return c;
  });
  const read = (c: string, side: string) => h("div", { class: `zr ${side}`, "data-read": c }, c ? h("span", { class: "zr-ch user" }, c) : null);
  // the characters to read stand beside the row of cells (at the height of the writing cells), outside the frame
  return h("div", { class: "zb" + (rec ? " zb-rec" : ""), "data-ch": ch ?? "" },
    head, h("div", { class: "zb-row" }, ...cells, ...(rec ? [read(rec.l, "zr-l"), read(rec.r, "zr-r")] : [])));
}

/** the whole sheet: a row for each character to write; `rec` (optional): the characters to read, beside the rows at the left / right (the rows themselves are the usual ones) */
export async function buildSheet(chars: string[], rec?: Recognise): Promise<HTMLElement> {
  await loadPinyin();
  const rows = rec ? Math.max(chars.length, rec.left.length, rec.right.length) : chars.length;
  const blocks = await Promise.all(Array.from({ length: rows }, (_, i) => block(chars[i] ?? null, rec ? { l: rec.left[i] ?? "", r: rec.right[i] ?? "" } : undefined)));
  return h("div", { class: "sheet" + (rec ? " sheet-read" : ""), id: "sheet" },
    h("div", { class: "sheet-top" }, h("span", {}, "姓名："), h("span", {}, "年　　月　　日")),
    ...blocks);
}
