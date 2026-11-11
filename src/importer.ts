/**
 * Turning a spreadsheet into weeks (no screen, no storage). The layout is the one the user already keeps in Google Sheets:
 *
 *   one tab per child (the tab's name is the child's name), one row per week:
 *   A = "第1周-2026-10-25" (the week and its first day)   B, C, D ... = the characters of that week   (L = running total: ignored)
 *   a tab called 成语 holds the idioms in the same shape (A = the week, B, C ... = one idiom per cell), OR (no dates at all) the whole library:
 *   A = one idiom per row, B = a tick box (ticked = used with the children already), C = a count made by the sheet (ignored),
 *   D = the week it was given ("第4周-2026-11-15", written by the sync script; empty the first time),
 *   E = the story of the idiom (typed by the user or written for him; the app keeps its own story when it has one)
 */
import * as M from "./model";
import type { Cell, SheetData } from "./xlsx";

export type Kind = "chars" | "idioms";
export interface WeekItems { start: string; items: string[] }
export interface Parsed { weeks: WeekItems[]; skippedRows: number[] }

/** a tab named 成语 / idioms holds idioms; every other tab is a child */
export const sheetKind = (name: string): Kind => (/成语|idiom/i.test(name) ? "idioms" : "chars");

const DATE = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/;
/** the first day written in a cell: "第1周-2026-10-25", "2026/10/25", or a date typed into Excel (a number of days since 1900) */
export function dateOf(c: Cell | undefined): string | null {
  if (typeof c === "number" && c > 20000 && c < 80000) return M.iso(new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000));
  if (typeof c !== "string") return null;
  const m = DATE.exec(c);
  if (!m) return null;
  const s = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return M.iso(M.parseDay(s)) === s ? s : null;
}

/** a 成语 tab without any week label in column A is the library (one idiom per row) */
export function isPoolSheet(rows: Cell[][]): boolean {
  if (rows.some((r) => dateOf(r[0]))) return false;
  return rows.filter((r) => typeof r[0] === "string" && /[\u4e00-\u9fff]{2,}/.test(r[0])).length >= 3;
}
export interface PoolRows { items: string[]; checked: string[]; weekOf: Record<string, string>; stories: Record<string, string>; filled: number; ignored: number[] }   // filled = rows with something in column A; ignored = row numbers that were not taken (doubles, headings, not an idiom)
const TICKED = /^(true|1|yes|y|是|已用|✓|✔|√)$/i;   // (what a ticked box becomes when the table was copied as text)
/** the library of a 成语 tab: every idiom of column A in order, and the ones whose box in column B is ticked */
export function parsePool(rows: Cell[][]): PoolRows {
  const items: string[] = [], checked: string[] = [], ignored: number[] = [], weekOf: Record<string, string> = {}, stories: Record<string, string> = {};
  let filled = 0;
  rows.forEach((r, i) => {
    const raw = r[0] === null || r[0] === undefined ? "" : String(r[0]).trim();
    if (!raw) return;
    filled++;
    const a = raw.replace(/\s+/g, "");
    if (!/[\u4e00-\u9fff]{2,}/.test(a) || /^(成语|idioms?)$/i.test(a) || items.includes(a)) { ignored.push(i + 1); return; }
    items.push(a);
    const b = r[1];
    const week = dateOf(r[3]);
    if (b === true || (typeof b === "number" && b === 1) || (typeof b === "string" && TICKED.test(b.trim())) || week) checked.push(a);   // (a week in column D means it was used, even if the box is empty)
    if (week) weekOf[a] = M.sundayOf(week);
    const story = typeof r[4] === "string" ? r[4].trim() : "";
    if (story) stories[a] = story;
  });
  return { items, checked, weekOf, stories, filled, ignored };
}
export interface PoolPlan { total: number; checked: number; weeks: string[]; assigned: number; leftover: number; fresh: number; unticked: number; removed: number; filled: number; ignored: number[]; fromSheetWeeks: number; storiesInSheet: number; storiesFilled: number; storiesKept: number }
/**
 * Importing the library RESETS the weeks of idioms: the old arrangement is wiped and rebuilt from the sheet, which wins. An idiom with a week in column D goes to
 * exactly that week (this is how the weeks written by the sync script come back); the other ticked ones are given weeks in the order of the sheet, `per` a week,
 * over `weeks`. Idioms that are not ticked (typed by hand, tests) lose their week and are not kept. The library and the stories are kept.
 * `removed` = idioms that had a week before and have none (or another) now - for the warning in the preview.
 */
export function applyPool(all: M.IdiomsFile, rows: PoolRows, weeks: string[]): { data: M.IdiomsFile; plan: PoolPlan } {
  const pool = [...(all.pool ?? [])];
  let fresh = 0;
  for (const x of rows.items) if (!pool.includes(x)) { pool.push(x); fresh++; }
  let data: M.IdiomsFile = { ...all, weeks: [], pool };
  let fromSheetWeeks = 0;
  for (const x of rows.checked) {
    const w = rows.weekOf[x];
    if (w) { data = M.addIdioms(data, w, [x]).data; fromSheetWeeks++; }
  }
  const r = M.assignToWeeks(data, rows.checked, weeks);
  const before = new Map(all.weeks.flatMap((w) => w.items.map((x) => [x, w.start] as const)));
  const after = new Map(r.data.weeks.flatMap((w) => w.items.map((x) => [x, w.start] as const)));
  const removed = [...before].filter(([x, w]) => after.get(x) !== w).length;
  // stories: the sheet's story fills an idiom that has none in the app; a story the app already has (written or edited in the app) is never replaced
  const stories = { ...(all.stories ?? {}) };
  let storiesFilled = 0, storiesKept = 0;
  for (const [x, text] of Object.entries(rows.stories)) {
    if (!stories[x]?.trim()) { stories[x] = text; storiesFilled++; } else if (stories[x] !== text) storiesKept++;
  }
  if (storiesFilled) r.data = { ...r.data, stories };
  const placed = new Set(after.keys());
  return { data: r.data, plan: { total: rows.items.length, checked: rows.checked.length, weeks, assigned: r.assigned, leftover: r.leftover.length, fresh, unticked: pool.filter((x) => !placed.has(x)).length, removed, filled: rows.filled, ignored: rows.ignored, fromSheetWeeks, storiesInSheet: Object.keys(rows.stories).length, storiesFilled, storiesKept } };
}

export function parseSheet(rows: Cell[][], kind: Kind): Parsed {
  const byWeek = new Map<string, string[]>();
  const skippedRows: number[] = [];
  rows.forEach((row, i) => {
    const start = dateOf(row[0]);
    const rest = row.slice(1).filter((c): c is string => typeof c === "string");
    const found = kind === "chars" ? M.parseChars(rest.join("")) : rest.flatMap((c) => M.parseIdioms(c));
    if (!start) {
      if (i > 0 && found.length) skippedRows.push(i + 1); // (the first row is usually a heading)
      return;
    }
    const week = M.sundayOf(start);
    const list = byWeek.get(week) ?? [];
    for (const x of found) if (!list.includes(x)) list.push(x);
    byWeek.set(week, list);
  });
  const weeks = [...byWeek].filter(([, items]) => items.length).map(([start, items]) => ({ start, items })).sort((a, b) => a.start.localeCompare(b.start));
  return { weeks, skippedRows };
}

export interface Applied<T> { data: T; added: number; skipped: number; present: number }
/**
 * adds the weeks oldest first, so a character that appears twice stays in the earliest week.
 * `skipped` = learned in ANOTHER week (not added); `present` = already in that same week (nothing to do)
 */
export function applyChars(kid: M.KidData, weeks: WeekItems[]): Applied<M.KidData> {
  let data = kid, added = 0, skipped = 0, present = 0;
  for (const w of weeks) {
    const c = M.checkChars(data, w.start, w.items);
    skipped += c.learned.length;
    present += c.inWeek.length;
    const r = M.addChars(data, w.start, w.items);
    data = r.data;
    added += r.added;
  }
  return { data, added, skipped, present };
}
export function applyIdioms(all: M.IdiomsFile, weeks: WeekItems[]): Applied<M.IdiomsFile> {
  let data = all, added = 0, skipped = 0, present = 0;
  for (const w of weeks) {
    const c = M.checkIdioms(data, w.start, w.items);
    skipped += c.learned.length;
    present += c.inWeek.length;
    const r = M.addIdioms(data, w.start, w.items);
    data = r.data;
    added += r.added;
  }
  return { data, added, skipped, present };
}

/** what importing one tab would do (for the preview) */
export interface Entry {
  name: string;
  kind: Kind;
  parsed: Parsed;
  exists: boolean;   // the child already exists (a new child is created otherwise)
  added: number;
  skipped: number;
  present: number;
  total: number;
  pool?: PoolPlan;   // a library tab (see isPoolSheet): what importing it does
}
export function plan(sheets: SheetData[], kids: M.KidsFile, kidData: (id: string) => M.KidData, idioms: M.IdiomsFile, poolWeeks: string[] = []): Entry[] {
  return sheets.map((s) => {
    const kind = sheetKind(s.name);
    if (kind === "idioms" && isPoolSheet(s.rows)) {
      const rows = parsePool(s.rows);
      const r = applyPool(idioms, rows, poolWeeks);
      return { name: s.name, kind, parsed: { weeks: [], skippedRows: [] }, exists: true, added: JSON.stringify(r.data) === JSON.stringify(idioms) ? 0 : Math.max(1, r.plan.fresh + r.plan.assigned + r.plan.fromSheetWeeks + r.plan.removed + r.plan.storiesFilled), skipped: 0, present: rows.items.length - r.plan.fresh, total: rows.items.length, pool: r.plan };
    }
    const parsed = parseSheet(s.rows, kind);
    const total = parsed.weeks.reduce((n, w) => n + w.items.length, 0);
    if (kind === "idioms") {
      const r = applyIdioms(idioms, parsed.weeks);
      return { name: s.name, kind, parsed, exists: true, added: r.added, skipped: r.skipped, present: r.present, total };
    }
    const kid = kids.kids.find((k) => k.name.toLowerCase() === s.name.trim().toLowerCase());
    const r = applyChars(kid ? kidData(kid.id) : M.EMPTY_KID, parsed.weeks);
    return { name: s.name, kind, parsed, exists: !!kid, added: r.added, skipped: r.skipped, present: r.present, total };
  });
}
