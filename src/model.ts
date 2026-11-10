/**
 * The learning data and the rules on it (no screen, no storage here).
 *
 *   kids.json        { kids: [{id, name, color}], startWeek }   startWeek = first day of "week 1" (a Sunday)
 *   kids/<id>.json   { weeks: [{ start, chars: ["假", ...] }] }  characters of ONE child (each child learns different ones)
 *   idioms.json      { weeks: [{ start, items: ["一心一意", ...] }] }  idioms, the same for all children
 */
/** avatar: `animal:<name>` (a drawn animal), or a small photo as a data: URL; none = an animal chosen from the id */
export interface Kid { id: string; name: string; color: string; avatar?: string }
export interface KidsFile { kids: Kid[]; startWeek?: string }
export interface Week { start: string; chars: string[] }
export interface KidData { weeks: Week[] }
export interface IdiomWeek { start: string; items: string[] }
export interface IdiomsFile { weeks: IdiomWeek[] }

export const EMPTY_KIDS: KidsFile = { kids: [] };
export const EMPTY_KID: KidData = { weeks: [] };
export const EMPTY_IDIOMS: IdiomsFile = { weeks: [] };

/** a bright colour for each child (all dark enough for white text) */
export const KID_COLORS = ["#f2545b", "#1c7ed6", "#2f9e44", "#e8590c", "#7950f2", "#099268"];

// ---------- dates (always plain YYYY-MM-DD, computed in UTC so summer time cannot shift a week) ----------
const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export function parseDay(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
export const todayLocal = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};
/** the Sunday on or before the given day (a week runs Sunday – Saturday, like the user's sheet: 第1周-2026-10-25) */
export function sundayOf(s: string): string {
  const d = parseDay(s);
  if (isNaN(+d)) return s;
  return iso(new Date(+d - d.getUTCDay() * DAY));
}
export const addDays = (s: string, n: number): string => iso(new Date(+parseDay(s) + n * DAY));
/** "第N周" counted from the start week; 0 or less for weeks before it */
export function weekNo(start: string, anchor: string | undefined): number {
  if (!anchor) return 1;
  return Math.round((+parseDay(start) - +parseDay(anchor)) / (7 * DAY)) + 1;
}

// ---------- reading what the user typed ----------
const HAN = /\p{Script=Han}/u;
/** every Chinese character in a text, once each, in order (spaces, punctuation, digits and latin letters are dropped) */
export function parseChars(text: string): string[] {
  const out: string[] = [];
  for (const ch of Array.from(text)) if (HAN.test(ch) && !out.includes(ch)) out.push(ch);
  return out;
}
/** idioms separated by line breaks, spaces or , ， 、 ; ； (an item without any Chinese character is dropped) */
export function parseIdioms(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,，、;；。.]+/)) {
    const t = raw.trim();
    if (t && HAN.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

// ---------- "has this been learned already?" ----------
export interface Check { fresh: string[]; learned: { item: string; start: string }[]; inWeek: string[] }

/** Splits typed characters into new ones, ones learned in ANOTHER week (skipped on save) and ones already in this week. */
export function checkChars(kid: KidData, start: string, chars: string[]): Check {
  const where = new Map<string, string>();
  for (const w of kid.weeks) for (const c of w.chars) if (!where.has(c) || w.start < where.get(c)!) where.set(c, w.start);
  const res: Check = { fresh: [], learned: [], inWeek: [] };
  for (const c of chars) {
    const at = where.get(c);
    if (at === undefined) res.fresh.push(c);
    else if (at === start) res.inWeek.push(c);
    else res.learned.push({ item: c, start: at });
  }
  return res;
}
export function checkIdioms(all: IdiomsFile, start: string, items: string[]): Check {
  const where = new Map<string, string>();
  for (const w of all.weeks) for (const c of w.items) if (!where.has(c) || w.start < where.get(c)!) where.set(c, w.start);
  const res: Check = { fresh: [], learned: [], inWeek: [] };
  for (const c of items) {
    const at = where.get(c);
    if (at === undefined) res.fresh.push(c);
    else if (at === start) res.inWeek.push(c);
    else res.learned.push({ item: c, start: at });
  }
  return res;
}

/** adds the NEW characters to the week (created when missing); characters learned in another week are skipped. Returns how many were added. */
export function addChars(kid: KidData, start: string, chars: string[]): { data: KidData; added: number } {
  const { fresh } = checkChars(kid, start, chars);
  if (!fresh.length) return { data: kid, added: 0 };
  const weeks = kid.weeks.map((w) => ({ ...w, chars: [...w.chars] }));
  let w = weeks.find((x) => x.start === start);
  if (!w) weeks.push((w = { start, chars: [] }));
  w.chars.push(...fresh);
  weeks.sort((a, b) => a.start.localeCompare(b.start));
  return { data: { weeks }, added: fresh.length };
}
export function addIdioms(all: IdiomsFile, start: string, items: string[]): { data: IdiomsFile; added: number } {
  const { fresh } = checkIdioms(all, start, items);
  if (!fresh.length) return { data: all, added: 0 };
  const weeks = all.weeks.map((w) => ({ ...w, items: [...w.items] }));
  let w = weeks.find((x) => x.start === start);
  if (!w) weeks.push((w = { start, items: [] }));
  w.items.push(...fresh);
  weeks.sort((a, b) => a.start.localeCompare(b.start));
  return { data: { weeks }, added: fresh.length };
}

/** every character the child has learned, oldest week first */
export const allChars = (kid: KidData): string[] => kid.weeks.flatMap((w) => w.chars);
export const allIdioms = (all: IdiomsFile): string[] => all.weeks.flatMap((w) => w.items);
export const weekOf = (kid: KidData, start: string): Week | undefined => kid.weeks.find((w) => w.start === start);

/** the week that starts the numbering: the earliest entered week, unless the user had set an earlier one */
export function pickStartWeek(current: string | undefined, start: string): string {
  return !current || start < current ? start : current;
}

export function newKidId(): string {
  return "k" + Math.random().toString(36).slice(2, 8);
}
