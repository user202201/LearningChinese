/**
 * The game's rules (no screen, no storage): which characters are asked, in which order, and when a character is asked again.
 *
 * Spaced repetition with boxes (the Leitner method). Every character of a child has a card:
 *   box 0 = just failed (asked again tomorrow); box 1, 2, 3, 4, 5 = asked again after 1, 3, 7, 14, 30 days.
 * Answered right at the first try -> one box up (once per day); answered wrong -> box 0.
 * A session asks ALL characters of this week plus the earlier characters that are due (at most REVIEW_MAX), shuffled together;
 * what was answered wrong comes back at the end (at most MAX_ROUNDS - 1 more times).
 */
import { addDays, sundayOf, type KidData } from "./model.ts";

export interface Card { box: number; due: string; last?: string; right: number; wrong: number }
export interface Review { cards: Record<string, Card>; last?: { date: string; score: number; total: number; stars: number }; plays?: number }
export const EMPTY_REVIEW: Review = { cards: {} };

/** days until a character is asked again, by box (box 0: due the day after a miss) */
export const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = INTERVALS.length - 1;
/** at most this many earlier characters are mixed in per session */
export const REVIEW_MAX = 10;
/** the first round plus this many minus one rounds for the wrong ones */
export const MAX_ROUNDS = 4;

/** a question: the character, the week it was learned, whether it is a review of an earlier week */
export interface Q { ch: string; week: string; review: boolean }
/** what became of one character in a session: right at the first try? and (if not) right in a later round? */
export interface Result { ch: string; firstTry: boolean; fixed: boolean }

/** the week to play: the week that holds today if it has characters, otherwise the newest earlier week that has some; null when there is none */
export function gameWeek(kid: KidData, today: string): string | null {
  const now = sundayOf(today);
  const weeks = kid.weeks.filter((w) => w.chars.length && w.start <= now).map((w) => w.start).sort();
  return weeks.length ? weeks[weeks.length - 1] : null;
}

/**
 * The earlier characters (weeks before `week`) that should be asked today:
 *   1. the ones that are due (due date reached), the lowest box first (what was failed), then the most overdue first;
 *   2. then characters never asked yet, the newest week first.
 * At most `max`. `rnd` only breaks ties.
 */
export function pickReview(kid: KidData, review: Review, week: string, today: string, max = REVIEW_MAX, rnd: () => number = Math.random): Q[] {
  const seen = new Set<string>();
  const all: { q: Q; card?: Card }[] = [];
  for (const w of kid.weeks) {
    if (w.start >= week) continue;
    for (const ch of w.chars) if (!seen.has(ch)) { seen.add(ch); all.push({ q: { ch, week: w.start, review: true }, card: review.cards[ch] }); }
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const due = all.filter((x) => x.card && x.card.due <= today).sort((a, b) => a.card!.box - b.card!.box || cmp(a.card!.due, b.card!.due) || rnd() - 0.5);
  const fresh = all.filter((x) => !x.card).sort((a, b) => cmp(b.q.week, a.q.week) || rnd() - 0.5);
  return [...due, ...fresh].slice(0, max).map((x) => x.q);
}

/** shuffle (Fisher–Yates) */
export function shuffle<T>(list: readonly T[], rnd: () => number = Math.random): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** this week's characters and the review characters, shuffled together */
export function buildQueue(thisWeek: string[], week: string, review: Q[], rnd: () => number = Math.random): Q[] {
  return shuffle([...thisWeek.map((ch) => ({ ch, week, review: false })), ...review], rnd);
}

/** the card after one session: `firstTry` = right at the first try; `fixed` = (if not) right in a later round of the same session */
export function applyOutcome(card: Card | undefined, firstTry: boolean, fixed: boolean, today: string): Card {
  const c = card ?? { box: 0, due: today, right: 0, wrong: 0 };
  if (firstTry) {
    const box = c.last === today && c.box > 0 ? c.box : Math.min(c.box + 1, MAX_BOX);   // playing twice in one day does not climb twice
    return { ...c, box, due: addDays(today, INTERVALS[box]), last: today, right: c.right + 1 };
  }
  return { ...c, box: 0, due: addDays(today, fixed ? 1 : 0), last: today, wrong: c.wrong + 1 };
}
export const starsFor = (score: number, total: number): number => (total === 0 ? 0 : score / total >= 0.9 ? 3 : score / total >= 0.6 ? 2 : 1);

/** adds the results of a session; `summary` (a finished session) is kept as "last time" */
export function applyResults(r: Review, results: Result[], today: string, summary?: { score: number; total: number }): Review {
  const cards = { ...r.cards };
  for (const x of results) cards[x.ch] = applyOutcome(cards[x.ch], x.firstTry, x.fixed, today);
  return { ...r, cards, plays: (r.plays ?? 0) + 1, last: summary ? { date: today, score: summary.score, total: summary.total, stars: starsFor(summary.score, summary.total) } : r.last };
}
