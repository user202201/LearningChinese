/**
 * Turning a spreadsheet into weeks (no screen, no storage). The layout is the one the user already keeps in Google Sheets:
 *
 *   one tab per child (the tab's name is the child's name), one row per week:
 *   A = "第1周-2026-10-25" (the week and its first day)   B, C, D ... = the characters of that week   (L = running total: ignored)
 *   a tab called 成语 holds the idioms in the same shape (A = the week, B, C ... = one idiom per cell)
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
}
export function plan(sheets: SheetData[], kids: M.KidsFile, kidData: (id: string) => M.KidData, idioms: M.IdiomsFile): Entry[] {
  return sheets.map((s) => {
    const kind = sheetKind(s.name);
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
