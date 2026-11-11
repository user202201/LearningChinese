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
/** weeks: the idioms by week, the same for every child; pool: the whole library of idioms (in the order of the sheet it came from) the weekly ones are picked from; stories: the story of an idiom, typed by the adult (optional) */
export interface IdiomsFile { weeks: IdiomWeek[]; stories?: Record<string, string>; pool?: string[] }
/** idioms a week is meant to have */
export const IDIOMS_PER_WEEK = 6;

export const EMPTY_KIDS: KidsFile = { kids: [] };
export const EMPTY_KID: KidData = { weeks: [] };
export const EMPTY_IDIOMS: IdiomsFile = { weeks: [] };

/** the colours a child can choose from (all dark enough for white text: at least 3:1, checked by the tests) */
export const PALETTE = ["#f2545b", "#d6336c", "#e8590c", "#2f9e44", "#099268", "#0c8599", "#1c7ed6", "#4263eb", "#7950f2", "#ae3ec9"];
/** the colours given out to new children, one after the other */
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
  return { data: { ...all, weeks }, added: fresh.length };
}
/** every idiom that has a week */
export const usedIdioms = (all: IdiomsFile): Set<string> => new Set(all.weeks.flatMap((w) => w.items));
/** the library idioms that have no week yet (in library order) */
export function unusedIdioms(all: IdiomsFile): string[] {
  const used = usedIdioms(all);
  return (all.pool ?? []).filter((x) => !used.has(x));
}
function shuffled<T>(list: readonly T[], rnd: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** tops the week up to `count` idioms with random ones from the library that have no week yet (nothing when it is full or the library is used up) */
export function fillWeek(all: IdiomsFile, start: string, count = IDIOMS_PER_WEEK, rnd: () => number = Math.random): { data: IdiomsFile; added: string[] } {
  const have = all.weeks.find((w) => w.start === start)?.items.length ?? 0;
  const pick = shuffled(unusedIdioms(all), rnd).slice(0, Math.max(0, count - have));
  if (!pick.length) return { data: all, added: [] };
  return { data: addIdioms(all, start, pick).data, added: pick };
}
/** puts idioms into the weeks in order, `per` for each week (weeks that already have some are topped up); what does not fit is returned in `leftover` */
export function assignToWeeks(all: IdiomsFile, idioms: string[], weeks: string[], per = IDIOMS_PER_WEEK): { data: IdiomsFile; assigned: number; leftover: string[] } {
  const used = usedIdioms(all);
  const todo = idioms.filter((x, i) => !used.has(x) && idioms.indexOf(x) === i);
  let data = all, assigned = 0;
  for (const start of weeks) {
    const room = per - (data.weeks.find((w) => w.start === start)?.items.length ?? 0);
    if (room <= 0 || !todo.length) continue;
    const take = todo.splice(0, room);
    data = addIdioms(data, start, take).data;
    assigned += take.length;
  }
  return { data, assigned, leftover: todo };
}

/** what typing idioms by hand means: `learned` already have a week (not allowed again), `fromPool` are in the library and just get picked, `brandNew` are not in the library yet */
export interface IdiomCheck { learned: { item: string; start: string }[]; fromPool: string[]; brandNew: string[] }
export function classifyIdioms(all: IdiomsFile, items: string[]): IdiomCheck {
  const where = new Map<string, string>();
  for (const w of all.weeks) for (const c of w.items) if (!where.has(c) || w.start < where.get(c)!) where.set(c, w.start);
  const pool = new Set(all.pool ?? []);
  const out: IdiomCheck = { learned: [], fromPool: [], brandNew: [] };
  for (const x of items.filter((c, i) => items.indexOf(c) === i)) {
    const at = where.get(x);
    if (at !== undefined) out.learned.push({ item: x, start: at });
    else if (pool.has(x)) out.fromPool.push(x);
    else out.brandNew.push(x);
  }
  return out;
}
/** one wrong, missing, extra or swapped character apart (a typo of the other) */
function nearTypo(a: string, b: string): boolean {
  const A = [...a], B = [...b];
  if (Math.min(A.length, B.length) < 3 || Math.abs(A.length - B.length) > 1) return false;
  if (A.length === B.length) {
    const d = A.map((c, i) => (c === B[i] ? -1 : i)).filter((i) => i >= 0);
    return d.length === 1 || (d.length === 2 && d[1] === d[0] + 1 && A[d[0]] === B[d[1]] && A[d[1]] === B[d[0]]);
  }
  const [long, short] = A.length > B.length ? [A, B] : [B, A];
  return long.some((_, i) => long.filter((__, j) => j !== i).join("") === short.join(""));
}
/** idioms of the app (library or weeks) that look like a typo of `item`; nothing when `item` itself is known */
export function similarIdioms(all: IdiomsFile, item: string): string[] {
  const known = [...new Set([...(all.pool ?? []), ...usedIdioms(all)])];
  if (known.includes(item)) return [];
  return known.filter((k) => nearTypo(k, item)).slice(0, 3);
}
/** adds idioms to a week by hand: nothing at all when one of them is already learned; new ones are also added to the library (and so go to the sheet at the next sync) */
export function addIdiomsByHand(all: IdiomsFile, start: string, items: string[]): { data: IdiomsFile; added: number; check: IdiomCheck } {
  const check = classifyIdioms(all, items);
  if (check.learned.length || (!check.fromPool.length && !check.brandNew.length)) return { data: all, added: 0, check };
  const withPool = { ...all, pool: [...(all.pool ?? []), ...check.brandNew] };
  const r = addIdioms(withPool, start, [...check.fromPool, ...check.brandNew]);
  return { data: r.data, added: r.added, check };
}

/** gives the idioms of the app (library + weeks) that have no story yet the story of the built-in library; a story the user wrote is never replaced */
export function fillBuiltInStories(all: IdiomsFile, builtin: Record<string, string>, only?: string[]): { data: IdiomsFile; added: number; kept: number } {
  const known = new Set([...(all.pool ?? []), ...usedIdioms(all)]);
  const stories = { ...(all.stories ?? {}) };
  let added = 0, kept = 0;
  for (const [idiom, text] of Object.entries(builtin)) {
    if (!known.has(idiom) || (only && !only.includes(idiom))) continue;
    if (stories[idiom]?.trim()) { kept++; continue; }
    stories[idiom] = text;
    added++;
  }
  return { data: added ? { ...all, stories } : all, added, kept };
}

/** how many characters a text has, not counting punctuation, spaces and line breaks (letters and digits count; each Chinese character counts as one) */
export const countChars = (text: string): number => (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
/** the story of an idiom (an empty text removes it) */
export function setStory(all: IdiomsFile, idiom: string, text: string): IdiomsFile {
  const stories = { ...(all.stories ?? {}) };
  const t = text.trim();
  if (t) stories[idiom] = t; else delete stories[idiom];
  return { ...all, stories };
}

/** takes a character out of the week it is in (a week left empty disappears) */
export function removeChar(kid: KidData, ch: string): KidData {
  return { weeks: kid.weeks.map((w) => ({ ...w, chars: w.chars.filter((c) => c !== ch) })).filter((w) => w.chars.length > 0) };
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
