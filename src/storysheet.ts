/**
 * Print sheet of the idiom stories of a week: THREE stories on a page, an A4 page printed on both sides holds the week's six. Each story is a block: the idiom
 * as a plain line of the same size as the story (no 田字格, no pinyin), then the story in 14 pt. A story that is too long for its third of the page gets a smaller type (down to 11 pt) instead of
 * being cut off; one that is still too long is marked (the screen shows a warning, the printout is cut at the block). The printout is the browser's own
 * (window.print: "Save as PDF" in the print window); sizes are in mm / pt so that what is printed is what is said here.
 */
import { h } from "./ui";

export const STORY_PT = 14;          // the type size the user asked for
export const STORY_MIN_PT = 11;      // the smallest size a long story may shrink to
export const PER_PAGE = 3;

export interface StoryItem { idiom: string; story: string }

function block(it: StoryItem): HTMLElement {
  const paras = it.story.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => h("p", { class: "user" }, p));
  return h("div", { class: "sb", "data-idiom": it.idiom },
    h("p", { class: "sb-title user" }, it.idiom),
    h("div", { class: "sb-text" }, ...(paras.length ? paras : [h("p", { class: "sb-none" }, "")])));
}

/** pages of three blocks; an empty block keeps the place when a page is not full */
export async function buildStoryPages(items: StoryItem[]): Promise<HTMLElement> {
  const pages: HTMLElement[] = [];
  for (let i = 0; i < Math.max(items.length, 1); i += PER_PAGE) {
    const blocks = items.slice(i, i + PER_PAGE).map(block);
    while (blocks.length < PER_PAGE) blocks.push(h("div", { class: "sb sb-empty" }));
    pages.push(h("section", { class: "sp", "data-page": String(pages.length + 1) }, ...blocks));
  }
  return h("div", { class: "story-sheet", id: "story-sheet" }, ...pages);
}

export interface Fit { idiom: string; chars: number; pt: number; over: boolean }
/** shrinks the type of every block whose story does not fit, down to STORY_MIN_PT; call when the sheet is on screen (needs layout). Returns what happened to each block. */
export function fitStories(root: HTMLElement): Fit[] {
  const out: Fit[] = [];
  root.querySelectorAll<HTMLElement>(".sb[data-idiom]").forEach((b) => {
    const text = b.querySelector<HTMLElement>(".sb-text")!;
    let pt = STORY_PT;
    b.style.fontSize = `${pt}pt`;                       // (the idiom line and the story always have the same size)
    while (text.scrollHeight > text.clientHeight + 0.5 && pt > STORY_MIN_PT) { pt -= 0.5; b.style.fontSize = `${pt}pt`; }
    const over = text.scrollHeight > text.clientHeight + 0.5;
    b.classList.toggle("sb-over", over);
    b.dataset.pt = String(pt);
    out.push({ idiom: b.dataset.idiom ?? "", chars: (text.textContent ?? "").replace(/[\s\p{P}]/gu, "").length, pt, over });
  });
  return out;
}
