import { buildSheet } from "./sheet";
import { buildStoryPages, fitStories } from "./storysheet";
import "./style.css";
import QRCode from "qrcode";
import * as api from "./api";
import * as M from "./model";
import { h, toast, modal, askText, confirmDlg } from "./ui";
import { LANGS, setLang, tr, type LangPref } from "./i18n";
import { ANIMAL_NAMES, animal, animalNamed, mascot } from "./art";
import { fileToAvatar, takePhoto } from "./photo";
import { loadPinyin, pinyinOf } from "./pinyin";
import * as G from "./game.ts";
import { openGame } from "./gameui";
import { scanQr } from "./scan";
import { readTable, readWorkbook, type SheetData } from "./xlsx";
import * as I from "./importer";
import syncScript from "../docs/google-sheet-sync/sync.gs?raw";   // the Google Sheets sync script, shown / copied from Settings

const app = document.getElementById("app")!;

// ---------- settings (only per-device conveniences; the learning data lives behind api.ts) ----------
interface Settings { lang: LangPref; pinyin: boolean; manage: boolean; gameSeconds: number }
const SETTINGS_KEY = "learn.settings.v1";
function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    return { lang: ["auto", "zh", "en", "fr"].includes(s.lang) ? s.lang : "auto", pinyin: !!s.pinyin, manage: !!s.manage, gameSeconds: Number.isFinite(s.gameSeconds) && s.gameSeconds >= 1 && s.gameSeconds <= 30 ? s.gameSeconds : 5 };
  } catch {
    return { lang: "auto", pinyin: false, manage: false, gameSeconds: 5 };
  }
}
const settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

// ---------- pinyin (optional; loaded only when needed, computed on this device) ----------
/** fills the pinyin of every `.py` element below `root` (when the pinyin library is available) */
async function fillPinyin(root: ParentNode) {
  await loadPinyin();
  root.querySelectorAll<HTMLElement>(".tzg").forEach((c) => {
    const py = c.querySelector(".py");
    if (py && !py.textContent) py.textContent = pinyinOf(c.dataset.ch ?? "");
  });
}

// ---------- shared pieces ----------
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const home = () => (location.hash = "#/");
/** after signing in / out or changing where the data lives: start again at the home screen */
const restart = () => {
  if (location.hash === "#/" || !location.hash) void route();
  else location.hash = "#/";
};

/**
 * Opens `open` on a DOUBLE tap / click (two taps close in time and place), not on a single one. Done by hand because a double tap is not a reliable
 * event on an iPad (Safari wants to zoom); works with a finger, a mouse and a pen. The keyboard (no double click there): Enter or Space.
 */
function doubleTap<T extends HTMLElement>(el: T, open: () => void): T {
  let t = 0, x = 0, y = 0;
  el.style.touchAction = "manipulation"; // no zoom on a double tap here
  el.addEventListener("pointerup", (e) => {
    if (e.timeStamp - t < 450 && Math.hypot(e.clientX - x, e.clientY - y) < 40) {
      t = 0;
      open();
    } else {
      t = e.timeStamp;
      x = e.clientX;
      y = e.clientY;
    }
  });
  el.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open()));
  return el;
}

/** manage mode: a red "−" at the corner of a character (like deleting an app on the iPhone); `onDelete` is called with the character */
const withDelete = (el: HTMLElement, ch: string, onDelete: (ch: string) => void) => {
  el.classList.add("managing");
  el.querySelector(".box")!.append(h("button", { class: "del", title: "删除这个汉字", "aria-label": "删除这个汉字", onclick: (e: Event) => { e.stopPropagation(); onDelete(ch); } }, "−"));
  return el;
};

/** a character in a 田字格 cell: pinyin line above, the character in a square with a dashed cross */
const cell = (ch: string) =>
  h("div", { class: "tzg", "data-ch": ch }, h("div", { class: "py" }), h("div", { class: "box" }, h("span", { class: "ch user" }, ch)));

function topBar(title: string, left?: HTMLElement, right?: HTMLElement) {
  return h("header", { class: "top plain" }, left ?? h("span", { class: "slot" }), h("h1", {}, title), right ?? h("span", { class: "slot" }));
}
/** the child's picture: a photo, a chosen animal, or (when nothing was chosen) an animal picked from the child's id */
const avatarEl = (k: M.Kid) => {
  const el = h("span", { class: "avatar" });
  if (k.avatar?.startsWith("data:image/")) el.append(h("img", { src: k.avatar, alt: "" }));
  else el.append(k.avatar?.startsWith("animal:") ? animalNamed(k.avatar.slice(7)) : animal(k.id));
  return el;
};
/** sets the stagger of the pop-in animation on a list of elements */
const stagger = <T extends HTMLElement>(els: T[]): T[] => {
  els.forEach((e, i) => e.style.setProperty("--i", String(Math.min(i, 14))));
  return els;
};
const backBtn = (to: string, label = "返回") => h("button", { class: "icon back", title: label, "aria-label": label, onclick: () => (location.hash = to) }, "‹");
/** the settings gear: drawn as a shape (the text character ⚙ is drawn by each device in its own, sometimes very old-fashioned, way) */
const gearSvg = () => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "gear"); s.innerHTML = '<path fill="currentColor" fill-rule="evenodd" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="M10.23 4.61 L10.64 1.89 L13.36 1.89 L13.77 4.61 L15.97 5.52 L18.19 3.89 L20.11 5.81 L18.48 8.03 L19.39 10.23 L22.11 10.64 L22.11 13.36 L19.39 13.77 L18.48 15.97 L20.11 18.19 L18.19 20.11 L15.97 18.48 L13.77 19.39 L13.36 22.11 L10.64 22.11 L10.23 19.39 L8.03 18.48 L5.81 20.11 L3.89 18.19 L5.52 15.97 L4.61 13.77 L1.89 13.36 L1.89 10.64 L4.61 10.23 L5.52 8.03 L3.89 5.81 L5.81 3.89 L8.03 5.52Z M12 8.6a3.4 3.4 0 1 0 0.01 0Z"/>'; return s; };
const gearBtn = () => h("button", { class: "icon gear-btn", title: "设置", "aria-label": "设置", onclick: () => (location.hash = "#/settings") }, gearSvg());

/**
 * A screen is loaded asynchronously. When the user goes somewhere else meanwhile (two quick taps), the slower, older load must not
 * paint over the newer screen: every route() starts a new epoch and a load that finds a newer epoch stops without showing anything.
 */
let epoch = 0;

function show(view: HTMLElement) {
  app.replaceChildren(view);
}
function showLoading() {
  show(h("div", { class: "center-msg" }, h("div", { class: "spin" }), h("p", {}, "正在加载…")));
}
function showError(e: unknown, retry: () => void) {
  if (e instanceof api.AuthExpired) return renderLogin(e.message);
  show(h("div", { class: "center-msg" }, h("p", { class: "err" }, errText(e)), h("div", { class: "row" }, h("button", { class: "primary", onclick: retry }, "重试"), h("button", { onclick: home }, "返回首页"))));
}

// ---------- state of the open screens ----------
let kidsFile: M.KidsFile = M.EMPTY_KIDS;
let idioms: M.IdiomsFile = M.EMPTY_IDIOMS;
const kidCache = new Map<string, M.KidData>();
let curWeek = "";
let curWeekKid = "";

async function loadShared() {
  [kidsFile, idioms] = await Promise.all([
    api.readJson<M.KidsFile>("kids.json").then((x) => x ?? M.EMPTY_KIDS),
    api.readJson<M.IdiomsFile>("idioms.json").then((x) => x ?? M.EMPTY_IDIOMS),
  ]);
  await autoPickIdioms();
}

/**
 * Every week the idioms of NEXT week are picked at random from the library (the idioms that have no week yet): done when the app opens, as soon as next week
 * has fewer than six. It is a read-modify-write, so two devices opening at the same moment do not pick twice.
 */
async function autoPickIdioms() {
  if (!idioms.pool?.length) return;
  const next = M.addDays(M.sundayOf(M.todayLocal()), 7);
  if ((idioms.weeks.find((w) => w.start === next)?.items.length ?? 0) >= M.IDIOMS_PER_WEEK || !M.unusedIdioms(idioms).length) return;
  try {
    let added = 0;
    const builtin = await loadBuiltInStories().catch(() => ({} as Record<string, string>));   // (the picked idioms get their built-in story at once)
    idioms = await api.update<M.IdiomsFile>("idioms.json", M.EMPTY_IDIOMS, (cur) => { const r = M.fillWeek(cur, next); added = r.added.length; return M.fillBuiltInStories(r.data, builtin, r.added).data; }, "pick idioms for next week");
    if (added) toast(`已为下一周随机选好 ${added} 个成语`);
  } catch { /* offline or no access right now: it is tried again the next time */ }
}
const loadKid = async (id: string) => {
  const d = (await api.readJson<M.KidData>(`kids/${id}.json`)) ?? M.EMPTY_KID;
  kidCache.set(id, d);
  return d;
};

// ---------- login ----------
function renderLogin(message = "") {
  const repo = h("input", { type: "text", value: api.lastRepo(), placeholder: "owner/LearningData", autocomplete: "off", autocapitalize: "off", spellcheck: false, "aria-label": "数据仓库（私有）" });
  const token = h("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off", "aria-label": "令牌" });
  const remember = h("input", { type: "checkbox", checked: true });
  const err = h("p", { class: "err" }, message);
  const btn = h("button", { class: "primary wide" }, "登录");
  const scan = h("button", { class: "scan wide", id: "scan-btn" }, "扫码登录");
  const signIn = async (tokenText: string, repoText: string) => {
    btn.disabled = scan.disabled = true;
    err.textContent = "";
    const done = toast("正在登录…", 0, true);
    try {
      await api.login(tokenText, repoText, remember.checked);
      done();
      toast("已登录");
      restart();
    } catch (e) {
      done();
      err.textContent = errText(e);
      btn.disabled = scan.disabled = false;
    }
  };
  const go = () => signIn(token.value, repo.value);
  btn.addEventListener("click", go);
  token.addEventListener("keydown", (e) => e.key === "Enter" && go());
  // scan the QR code shown by a device that is already signed in (Settings → Sign in on another device): no typing
  scan.addEventListener("click", async () => {
    err.textContent = "";
    try {
      const link = await scanQr(api.parseLink);
      if (link) await signIn(link.token, link.repo); // cancelled (null): no message
    } catch (e) {
      err.textContent = errText(e);
    }
  });
  show(
    h("div", { class: "login" }, h("div", { class: "card" },
      h("span", { class: "mascot" }, mascot()),
      h("h1", {}, "识字小助手"),
      h("p", { class: "muted" }, "记录孩子每周学的汉字和成语。数据保存在你自己的私有 GitHub 仓库里，只有你能看到。"),
      scan,
      h("p", { class: "muted small center" }, "在已经登录的设备上：设置 → 登录到其他设备，会出现二维码。"),
      h("div", { class: "or" }, "或者手动输入"),
      h("label", {}, "数据仓库（私有）", repo),
      h("label", {}, "令牌", token),
      h("label", { class: "check" }, remember, "保持登录"),
      err,
      btn,
      h("div", { class: "or" }, "或者"),
      h("button", { class: "wide", id: "local-btn", onclick: () => { api.useLocal(); restart(); } }, "在本机使用（不需要账号）"),
      h("p", { class: "muted small" }, "本机使用时，数据只保存在这台设备的浏览器里，不会上传。"),
    )),
  );
}

// ---------- home: the children ----------
async function renderHome() {
  const my = epoch;
  showLoading();
  try {
    await loadShared();
    await Promise.all(kidsFile.kids.map((k) => loadKid(k.id)));
  } catch (e) {
    return my === epoch ? showError(e, renderHome) : undefined;
  }
  if (my !== epoch) return; // the user went somewhere else meanwhile
  const hero = h("header", { class: "top hero home-hero" },
    h("span", { class: "mascot" }, mascot()),
    h("div", { class: "hero-text" }, h("h1", {}, "识字小助手"), h("p", {}, "今天学点什么？")),
    gearBtn());
  if (!kidsFile.kids.length) {
    // the very first time: nothing but one thing to do, in the middle of the screen
    return show(h("div", { class: "page" }, hero,
      h("main", { class: "scroll" }, h("div", { class: "narrow home-empty empty-home" },
        h("button", { class: "add-big", id: "add-kid-big", title: "添加孩子", "aria-label": "添加孩子", onclick: () => void addKid(renderHome) }, "＋"),
        h("p", {}, "还没有孩子，先添加一个吧。")))));
  }
  const list = h("div", { class: "kids" });
  for (const k of kidsFile.kids) {
    const n = M.allChars(kidCache.get(k.id) ?? M.EMPTY_KID).length;
    list.append(
      h("button", { class: "kid", style: `--kid:${k.color}`, onclick: () => (location.hash = `#/kid/${k.id}`) },
        avatarEl(k),
        h("span", { class: "kinfo" }, h("span", { class: "kname user" }, k.name), h("span", { class: "ksub" }, `已入库 ${n} 字`)),
        h("span", { class: "chev" }, "›")),
    );
  }
  stagger([...list.querySelectorAll<HTMLElement>(".kid")]);
  show(h("div", { class: "page" }, hero, h("main", { class: "scroll" }, h("div", { class: "narrow" }, list))));
}

/** asks for a name and adds the child; `after` shows the screen again */
async function addKid(after: () => void) {
  const name = await askText("添加孩子", "孩子的名字", "", "添加");
  if (!name) return; // cancelled: no message
  if (kidsFile.kids.some((k) => k.name.toLowerCase() === name.toLowerCase())) return toast("已经有同名的孩子了");
  const done = toast("正在保存…", 0, true);
  try {
    const id = M.newKidId();
    kidsFile = await api.update<M.KidsFile>("kids.json", M.EMPTY_KIDS, (cur) => {
      if (cur.kids.some((k) => k.name.toLowerCase() === name.toLowerCase())) return cur;
      return { ...cur, kids: [...cur.kids, { id, name, color: M.KID_COLORS[cur.kids.length % M.KID_COLORS.length] }] };
    }, `add ${id}`);
    done();
    toast(`已添加 ${name}`);
    after();
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

// ---------- one child ----------
async function renderKid(id: string, tab: "week" | "learned" | "game") {
  const my = epoch;
  showLoading();
  let kid: M.KidData;
  try {
    await loadShared();
    kid = await loadKid(id);
  } catch (e) {
    return my === epoch ? showError(e, () => renderKid(id, tab)) : undefined;
  }
  if (my !== epoch) return;
  const k = kidsFile.kids.find((x) => x.id === id);
  if (!k) {
    toast("找不到这个孩子");
    return home();
  }
  if (curWeekKid !== id || !curWeek) {
    curWeekKid = id;
    curWeek = M.sundayOf(M.todayLocal()); // opening a child always starts on the week we are in
  }
  const body = h("div", { class: tab === "learned" ? "learned-wrap" : "scroll" });
  const nChars = M.allChars(kid).length;
  const tabs = h("div", { class: "seg tabs" },   // Game | This week | Recorded: a child always opens in the middle one
    h("button", { class: tab === "game" ? "on" : "", "data-tab": "game", id: "tab-game", onclick: () => (location.hash = `#/kid/${id}/game`) }, "游戏"),
    h("button", { class: tab === "week" ? "on" : "", onclick: () => (location.hash = `#/kid/${id}`) }, "本周"),
    h("button", { class: tab === "learned" ? "on" : "", "data-tab": "learned", onclick: () => (location.hash = `#/kid/${id}/learned`) }, `已入库 ${nChars}`),
  );
  const page = (
    h("div", { class: "page", style: `--kid:${k.color}` },
      h("header", { class: "top hero kid-hero" },
        backBtn("#/", "孩子"),
        h("h1", { class: "user-title" },
          doubleTap(h("button", { class: "hero-avatar", id: "hero-avatar", title: "双击修改头像和颜色", "aria-label": "双击修改头像和颜色" }, avatarEl(k)), () => void changeAvatar(k, () => void route())), k.name),
        h("span", { class: "slot" })),
      h("div", { class: "tabs-row" }, tabs),
      body,
    )
  );
  // a swipe to the left / right goes to the next / previous tab (Game | This week | Recorded)
  const order: Tab3[] = ["game", "week", "learned"];
  let from: { x: number; y: number } | null = null;
  page.addEventListener("touchstart", (e) => { from = e.touches.length === 1 && !(e.target as HTMLElement).closest("dialog, input, textarea") ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  page.addEventListener("touchend", (e) => {
    if (!from || document.querySelector("dialog[open]")) return;
    const dx = e.changedTouches[0].clientX - from.x, dy = e.changedTouches[0].clientY - from.y;
    from = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const to = order[order.indexOf(tab) + (dx < 0 ? 1 : -1)];
    if (to) location.hash = to === "week" ? `#/kid/${id}` : `#/kid/${id}/${to}`;
  }, { passive: true });
  show(page);
  if (tab === "week") renderWeek(body, k, kid);
  else if (tab === "learned") renderLearned(body, k, kid);
  else void renderGameLobby(body, k, kid);
}

/** characters a week is meant to have: with this many the + is not offered any more */
const WEEKLY = 10;


type Tab3 = "week" | "learned" | "game";

function renderWeek(body: HTMLElement, k: M.Kid, kid: M.KidData) {
  body.replaceChildren();
  const todayWeek = M.sundayOf(M.todayLocal());
  const no = M.weekNo(curWeek, kidsFile.startWeek);
  const w = M.weekOf(kid, curWeek);
  const go = (start: string) => {
    curWeek = start;
    renderWeek(body, k, kid);
  };
  // back as far as the first week that has something (or this week); forward only as far as NEXT week (to prepare it), or as far as the last week that already has something
  const lowest = [todayWeek, ...kid.weeks.map((x) => x.start)].sort()[0];
  const highest = [M.addDays(todayWeek, 7), ...kid.weeks.map((x) => x.start)].sort().at(-1)!;
  const bar = h("div", { class: "weekbar" },
    h("button", { class: "icon", title: "上一周", "aria-label": "上一周", disabled: curWeek <= lowest, onclick: () => go(M.addDays(curWeek, -7)) }, "‹"),
    h("button", { class: "wlabel", id: "week-pick", title: "选择周", "aria-label": "选择周", onclick: () => void pickWeek(kid).then((start) => start && go(start)) },
      h("strong", {}, `第${no}周`), h("span", { class: "muted" }, `${curWeek} ~ ${M.addDays(curWeek, 6)}`)),
    h("button", { class: "icon", title: "下一周", "aria-label": "下一周", disabled: curWeek >= highest, onclick: () => go(M.addDays(curWeek, 7)) }, "›"),
  );
  const chars = w?.chars ?? [];
  const cards = chars.map((c, i) => {
    const el = cell(c);
    if (settings.manage) return withDelete(el, c, (ch) => void deleteChar(k, ch)); // manage mode: delete instead of opening the big view
    el.classList.add("tappable");
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.addEventListener("click", () => openViewer(chars, i, k.color));
    el.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), el.click()));
    return el;
  });
  const grid = h("div", { class: "cards" + (settings.pinyin ? " pinyin-on" : "") }, ...stagger(cards));
  body.append(
    h("div", { class: "narrow week-narrow" },
      manageBar(),
      bar,
      curWeek === todayWeek ? null : h("button", { class: "link", onclick: () => go(todayWeek) }, "回到本周"),
      h("div", { class: "sec-row" }, h("h2", { class: "sec" }, `汉字（${chars.length}）`),
        chars.length ? h("button", { class: "sheet-btn", id: "sheet-btn", onclick: () => { sheetWeek = curWeek; location.hash = `#/sheet/${k.id}`; } }, "字帖") : null,
        chars.length && chars.length < WEEKLY ? h("button", { class: "plus", id: "enter", title: "录入这一周的内容", "aria-label": "录入这一周的内容", onclick: () => enterDialog(k) }, "＋") : null),
      chars.length
        ? grid
        : h("div", { class: "add-empty" }, h("button", { class: "add-big", id: "enter", title: "录入这一周的内容", "aria-label": "录入这一周的内容", onclick: () => enterDialog(k) }, "＋"), h("p", {}, "点 ＋ 录入这一周的汉字")),
      // the idioms are the same for every child: one list, one story page (not one per child)
      h("button", { class: "primary wide", id: "idioms-btn", onclick: () => { idiomFrom = `#/kid/${k.id}`; idiomWeek = curWeek; idiomAll = false; idiomColor = k.color; location.hash = "#/idioms"; } }, "成语故事"),
    ),
  );
  if (settings.pinyin) void fillPinyin(grid);
}

// ---------- idioms (shared by every child): the list, and the story page of one idiom ----------
let sheetWeek = "";   // the week the practice sheet is made for
let idiomFrom = "";   // the child's page the list was opened from (where "back" goes)
let idiomWeek = "";   // the week that page was showing: the list shows only that week's idioms (and stories) ...
let idiomAll = false; // ... until "all idioms" is chosen
let idiomColor = "";  // the colour of the child it was opened from (the idiom pages wear it, like that child's own pages)

async function renderSheet(id: string) {
  const my = epoch;
  showLoading();
  const k = kidsFile.kids.find((x) => x.id === id) ?? (await loadShared(), kidsFile.kids.find((x) => x.id === id));
  if (!k) return home();
  let kid: M.KidData;
  try {
    kid = await loadKid(id);
  } catch (e) {
    return my === epoch ? showError(e, () => void renderSheet(id)) : undefined;
  }
  if (my !== epoch) return;
  const start = sheetWeek || curWeek || M.sundayOf(M.todayLocal());
  const chars = M.weekOf(kid, start)?.chars ?? [];
  const no = M.weekNo(start, kidsFile.startWeek);
  const paper = chars.length ? await buildSheet(chars) : null;
  if (my !== epoch) return;
  show(h("div", { class: "page sheet-page", style: `--kid:${k.color}` },
    h("header", { class: "top plain" }, backBtn(`#/kid/${id}`), h("h1", {}, `字帖 · 第${no}周`), h("span", { class: "slot" })),
    h("main", { class: "scroll sheet-scroll" },
      chars.length ? h("p", { class: "muted small center sheet-hint" }, "在打印窗口里选择“另存为 PDF”，就能保存和打印。") : null,
      paper ?? h("p", { class: "empty" }, "这一周还没有汉字。")),
    chars.length ? h("div", { class: "idiom-foot sheet-foot" }, h("button", { class: "primary wide", id: "sheet-print", onclick: () => window.print() }, "打印 / 保存为 PDF")) : null));
}

let storyWeek = "";   // the week whose stories are printed
async function renderStories() {
  const my = epoch;
  showLoading();
  try {
    await loadShared();
  } catch (e) {
    return my === epoch ? showError(e, () => void renderStories()) : undefined;
  }
  if (my !== epoch) return;
  const start = storyWeek || idiomWeek || M.sundayOf(M.todayLocal());
  const items = (idioms.weeks.find((w) => w.start === start)?.items ?? []).map((idiom) => ({ idiom, story: idioms.stories?.[idiom] ?? "" }));
  const no = M.weekNo(start, kidsFile.startWeek);
  const paper = await buildStoryPages(items);
  const note = h("div", { class: "muted small center story-note", id: "story-note" });
  const scale = h("div", { class: "story-scale" }, paper);
  show(h("div", { class: "page sheet-page", style: idiomColor ? `--kid:${idiomColor}` : "" },
    h("header", { class: "top plain" }, backBtn("#/idioms"), h("h1", {}, `故事打印 · 第${no}周`), h("span", { class: "slot" })),
    h("main", { class: "scroll sheet-scroll" }, items.length ? h("div", { class: "narrow story-wrap" }, note, scale) : h("p", { class: "empty" }, "这一周还没有成语。")),
    items.length ? h("div", { class: "idiom-foot sheet-foot" }, h("button", { class: "primary wide", id: "story-print", onclick: () => window.print() }, "打印 / 保存为 PDF")) : null));
  if (!items.length) return;
  // on screen the page is shown as wide as the screen allows (the printout always uses real mm / pt)
  const fit = () => { const w = scale.clientWidth; const pageW = paper.querySelector<HTMLElement>(".sp")!.offsetWidth; (paper.style as CSSStyleDeclaration & { zoom: string }).zoom = String(Math.min(1.6, w / pageW)); };
  fit();
  window.addEventListener("resize", fit);
  await document.fonts?.ready;
  const res = fitStories(paper);
  // no explaining labels: the only thing said is a warning, when a story is so long that the printout would cut it off
  const over = res.filter((r) => r.over).map((r) => r.idiom);
  if (over.length) note.append(h("div", { class: "warn" }, `太长，打印会被截断，请缩短：${over.join("、")}`));
}

/** the built-in stories (public/stories.json), read once */
let builtInStories: Promise<Record<string, string>> | null = null;
const loadBuiltInStories = (): Promise<Record<string, string>> =>
  (builtInStories ??= fetch(`${import.meta.env.BASE_URL}stories.json`).then(async (r) => {
    if (!r.ok) throw new Error("读不到自带的故事。");
    return ((await r.json()) as { stories: Record<string, string> }).stories;
  }).catch((e) => { builtInStories = null; throw e; }));

/** Settings: gives the idioms that have no story yet the story of the built-in library; never replaces one the user wrote */
async function fillBuiltInStories() {
  const done = toast("正在填入故事…", 0, true);
  try {
    const builtin = await loadBuiltInStories();
    let added = 0;
    idioms = await api.update<M.IdiomsFile>("idioms.json", M.EMPTY_IDIOMS, (cur) => { const x = M.fillBuiltInStories(cur, builtin); added = x.added; return x.data; }, "fill built-in stories");
    done();
    toast(added ? `已填入 ${added} 个成语故事` : "没有需要填的故事");
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

async function renderIdioms() {
  const my = epoch;
  showLoading();
  try {
    await loadShared();
  } catch (e) {
    return my === epoch ? showError(e, () => void renderIdioms()) : undefined;
  }
  if (my !== epoch) return;
  const only = !!idiomWeek && !idiomAll;     // this week only, or every week
  const items = idioms.weeks.filter((w) => w.items.length && (!only || w.start === idiomWeek));
  const count = items.reduce((n, w) => n + w.items.length, 0);
  // one idiom per line, in the same red-framed 田字格 cells (same size) as the recorded characters; tap a line for its story
  const row = (it: string) => {
    const r = h("div", { class: "idiom-card", role: "button", tabindex: "0", "data-idiom": it, style: `--n:${[...it].length}`, onclick: () => (location.hash = `#/idiom/${encodeURIComponent(it)}`) },
      ...[...it].map((c) => cell(c)));
    r.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), r.click()));
    return r;
  };
  const list = h("div", { class: "idiom-list" + (settings.pinyin ? " pinyin-on" : ""), id: "idiom-list" },
    ...items.flatMap((w) => [only ? null : h("h3", { class: "mini-h idiom-week" }, `第${M.weekNo(w.start, kidsFile.startWeek ?? w.start)}周`), ...w.items.map(row)]));
  const addTip = only ? "添加这一周的成语" : "添加成语";
  const head = h("div", { class: "sec-row" }, h("h2", { class: "sec" }, `成语（${count}）`),
    only && count > 0 ? h("button", { class: "sheet-btn", id: "story-print-btn", onclick: () => { storyWeek = idiomWeek; location.hash = "#/stories"; } }, "打印故事") : null,
    count > 0 && (!only || count < M.IDIOMS_PER_WEEK) ? h("button", { class: "plus", id: "idiom-add", title: addTip, "aria-label": addTip, onclick: () => void addIdiomsDialog() }, "＋") : null);
  const empty = h("div", { class: "add-empty", id: "idiom-empty" }, h("button", { class: "add-big", id: "idiom-add", title: addTip, "aria-label": addTip, onclick: () => void addIdiomsDialog() }, "＋"),
    h("p", {}, only ? "点 ＋ 添加这一周的成语" : "点 ＋ 添加成语"));
  // the same big button as on the week page; it stays at the bottom of the screen: only the idioms in the middle scroll
  const switchBtn = !idiomWeek ? null : h("button", { class: "primary wide", id: "idiom-scope", onclick: () => { idiomAll = !idiomAll; void renderIdioms(); } }, only ? "全部成语" : "只看这一周");
  show(h("div", { class: "page", style: idiomColor ? `--kid:${idiomColor}` : "" },
    topBar("成语故事", backBtn(idiomFrom || "#/")),
    count || idioms.pool?.length ? h("div", { class: "idiom-head" }, count ? head : null,
      idioms.pool?.length ? h("p", { class: "muted small idiom-pool", id: "idiom-pool" }, `成语库：共 ${idioms.pool.length} 个，还没用的 ${M.unusedIdioms(idioms).length} 个`) : null) : null,
    h("main", { class: "scroll idiom-scroll" }, h("div", { class: "narrow" }, count ? list : empty)),
    switchBtn ? h("div", { class: "idiom-foot" }, switchBtn) : null));
  if (settings.pinyin) void fillPinyin(list);
}

async function addIdiomsDialog() {
  const date = h("input", { type: "date", value: idiomWeek || M.sundayOf(M.todayLocal()), "aria-label": "这一周的第一天（周日）" });
  const text = h("textarea", { rows: 3, placeholder: "把成语粘贴或输入在这里，空格、逗号、换行都可以分开", "aria-label": "成语" });
  const save = h("button", { class: "primary", id: "idiom-save" }, "保存");
  const note = h("div", { class: "note", id: "idiom-check" });
  const r = await modal<string[]>((close) => {
    // what is typed is checked at once: an idiom that was already learned can not be saved; one that is in the library is simply picked; a new one goes into the library
    const check = () => {
      const list = M.parseIdioms(text.value);
      const c = M.classifyIdioms(idioms, list);
      note.replaceChildren();
      if (c.learned.length) note.append(h("div", { class: "warn" }, `已经学过了，不能保存：${c.learned.map((x) => `${x.item}（第${M.weekNo(x.start, kidsFile.startWeek ?? x.start)}周）`).join("、")}`));
      else if (list.length) note.append(h("div", { class: "muted" }, `成语库里有 ${c.fromPool.length} 个，新成语 ${c.brandNew.length} 个（会加进成语库，同步时也会加到你的表格）`));
      // "did you mean ...": a new idiom that looks like a typo of one the app already has
      for (const x of c.brandNew) {
        for (const y of M.similarIdioms(idioms, x)) {
          const week = idioms.weeks.find((w) => w.items.includes(y));
          note.append(h("div", { class: "similar", "data-typo": x },
            h("span", {}, `「${x}」和已有的「${y}」很像，是不是想写「${y}」？`), week ? h("span", { class: "muted" }, ` ${`已学：第${M.weekNo(week.start, kidsFile.startWeek ?? week.start)}周`}`) : null,
            h("button", { class: "mini", "data-fix": y, onclick: () => { text.value = text.value.split(x).join(y); check(); } }, `改成「${y}」`)));
        }
      }
      save.disabled = !list.length || c.learned.length > 0;
    };
    text.addEventListener("input", check);
    check();
    save.addEventListener("click", () => { const l = M.parseIdioms(text.value); if (l.length && !M.classifyIdioms(idioms, l).learned.length) close(l); });
    return h("div", { class: "dlg" }, h("h2", {}, "添加成语"), h("label", { class: "muted small" }, "这一周的第一天（周日）"), date, text, note,
      h("div", { class: "row end" }, h("button", { onclick: () => close(null) }, "取消"), save));
  });
  if (!r) return; // cancelled: no "done" message
  const start = M.sundayOf(date.value || M.todayLocal());
  const done = toast("正在保存…", 0, true);
  try {
    let added = 0, blocked = 0;
    idioms = await api.update<M.IdiomsFile>("idioms.json", M.EMPTY_IDIOMS, (cur) => { const x = M.addIdiomsByHand(cur, start, r); added = x.added; blocked = x.check.learned.length; return x.data; }, "add idioms");
    done();
    toast(blocked ? "有的成语已经学过了，没有保存" : added ? `已添加 ${added} 个成语` : "这些成语已经在列表里了");
    void renderIdioms();
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

async function renderIdiom(name: string) {
  const my = epoch;
  showLoading();
  try {
    await Promise.all([loadShared(), loadPinyin()]);
  } catch (e) {
    return my === epoch ? showError(e, () => void renderIdiom(name)) : undefined;
  }
  if (my !== epoch) return;
  const story = idioms.stories?.[name] ?? "";
  const chars = [...name];
  const row = h("div", { class: "idiom-chars pinyin-on", id: "idiom-chars", style: `--n:${chars.length}` }, ...chars.map((c) => cell(c)));
  show(h("div", { class: "page", style: idiomColor ? `--kid:${idiomColor}` : "" },
    topBar("成语故事", backBtn("#/idioms")),
    h("main", { class: "scroll" }, h("div", { class: "narrow" },
      row,
      story
        ? h("p", { class: "story user", id: "idiom-story" }, story)
        : h("p", { class: "empty", id: "idiom-nostory" }, "还没有故事。点“编辑故事”写一个。"),
      h("button", { class: "wide", id: "story-edit", onclick: () => void editStory(name, story) }, "编辑故事")))));
  void fillPinyin(row);
}

async function editStory(name: string, current: string) {
  const text = h("textarea", { rows: 8, placeholder: "把这个成语的故事写在这里", "aria-label": "故事" }) as HTMLTextAreaElement;
  text.value = current;
  const counter = h("p", { class: "muted small story-count", id: "story-count" });
  const count = () => { counter.textContent = tr("{0} 字（不含标点）").replace("{0}", String(M.countChars(text.value))); };
  text.addEventListener("input", count);
  count();
  const r = await modal<{ t: string }>((close) =>
    h("div", { class: "dlg" }, h("h2", {}, "编辑故事"), h("p", { class: "user-title" }, name), text, counter,
      h("div", { class: "row end" }, h("button", { onclick: () => close(null) }, "取消"), h("button", { class: "primary", id: "story-save", onclick: () => close({ t: text.value }) }, "保存"))));
  if (!r) return; // cancelled: no "done" message
  const done = toast("正在保存…", 0, true);
  try {
    idioms = await api.update<M.IdiomsFile>("idioms.json", M.EMPTY_IDIOMS, (cur) => M.setStory(cur, name, r.t), `story ${name}`);
    done();
    toast("已保存故事");
    void renderIdiom(name);
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

/** every week that has characters (and this week): choose one to look at */
function pickWeek(kid: M.KidData): Promise<string | null> {
  const todayWeek = M.sundayOf(M.todayLocal());
  const starts = [...new Set([...kid.weeks.map((x) => x.start), todayWeek])].sort().reverse();
  return modal<string>((close) =>
    h("div", { class: "dlg" }, h("h2", {}, "选择周"),
      h("div", { class: "weeklist" }, ...starts.map((st) =>
        h("button", { class: "weekrow" + (st === curWeek ? " on" : ""), "data-start": st, onclick: () => close(st) },
          h("strong", {}, `第${M.weekNo(st, kidsFile.startWeek)}周`),
          h("span", { class: "muted" }, st),
          st === todayWeek ? h("span", { class: "badge" }, "本周") : null,
          h("span", { class: "counts" }, `${M.weekOf(kid, st)?.chars.length ?? 0} 个汉字`)))),
      h("button", { class: "wide", onclick: () => close(null) }, "取消")));
}

// ---------- full-screen character (tap a character of the week) ----------
/** the character, as large as the screen allows; left / right (buttons, swipe, arrow keys) go to the neighbours; a tap on it shows / hides the pinyin */
function openViewer(chars: string[], start: number, color: string) {
  let i = start;
  const box = cell(chars[i]);
  const count = h("span", { class: "vcount" });
  const prev = h("button", { class: "vnav prev", id: "viewer-prev", title: "上一个", "aria-label": "上一个" }, "‹");
  const next = h("button", { class: "vnav next", id: "viewer-next", title: "下一个", "aria-label": "下一个" }, "›");
  const close = h("button", { class: "vclose", id: "viewer-close", title: "关闭", "aria-label": "关闭" }, "×");
  const stage = h("div", { class: "vstage" }, box);
  const root = h("div", { class: "viewer" + (settings.pinyin ? " pinyin-on" : ""), id: "viewer", role: "dialog", "aria-modal": "true", style: `--kid:${color}` },
    h("div", { class: "vtop" }, count, close), stage,
    h("div", { class: "vbar" }, prev, h("p", { class: "vhint" }, "点汉字显示 / 隐藏拼音；点屏幕左边 / 右边，或左右滑动，切换汉字"), next));
  const show = (dir = 0) => {
    const ch = chars[i];
    box.dataset.ch = ch;
    (box.querySelector(".ch") as HTMLElement).textContent = ch;
    (box.querySelector(".py") as HTMLElement).textContent = pinyinOf(ch);
    count.textContent = `${i + 1} / ${chars.length}`;
    prev.disabled = i === 0;
    next.disabled = i === chars.length - 1;
    if (dir) { box.classList.remove("from-left", "from-right"); void box.offsetWidth; box.classList.add(dir > 0 ? "from-right" : "from-left"); }
  };
  const move = (d: number) => {
    const n = Math.min(chars.length - 1, Math.max(0, i + d));
    if (n === i) return;
    i = n;
    show(d);
  };
  const toggle = () => {
    settings.pinyin = !settings.pinyin;
    saveSettings();
    root.classList.toggle("pinyin-on", settings.pinyin);
    if (settings.pinyin) void loadPinyin().then(() => show());
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") move(1);
    else if (e.key === "ArrowLeft") move(-1);
    else if (e.key === "Escape") quit();
  };
  const quit = () => {
    document.removeEventListener("keydown", onKey);
    root.remove();
    // the pinyin choice may have been changed in here: the cards behind follow it
    document.querySelectorAll<HTMLElement>(".cards, .grid").forEach((g) => {
      g.classList.toggle("pinyin-on", settings.pinyin);
      if (settings.pinyin) void fillPinyin(g);
    });
  };
  prev.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  close.addEventListener("click", quit);
  // The whole screen is the control: a tap on the 田字格 shows / hides the pinyin; a tap anywhere else goes to the previous character (left half of the
  // screen) or the next one (right half), so nobody has to hit a small button; a swipe left / right does the same. The buttons stay as they were.
  let down: { x: number; y: number } | null = null;
  root.addEventListener("pointerdown", (e) => { down = (e.target as Element).closest("button") ? null : { x: e.clientX, y: e.clientY }; });
  root.addEventListener("pointerup", (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) return move(dx < 0 ? 1 : -1);
    if (Math.abs(dx) >= 12 || Math.abs(dy) >= 12) return;
    const t = e.target as Element;
    if (t.closest(".box")) toggle();
    else if (!t.closest(".vtop, .vhint")) move(e.clientX < window.innerWidth / 2 ? -1 : 1);
  });
  root.addEventListener("pointercancel", () => (down = null));
  document.addEventListener("keydown", onKey);
  document.body.append(root);
  show();
  void loadPinyin().then(() => show());
}

function renderLearned(body: HTMLElement, k: M.Kid, kid: M.KidData) {
  const chars = M.allChars(kid);
  const head = h("div", { class: "learned-head" },
    h("div", { class: "count-row" },
      h("span", {}),
      h("div", { class: "big" }, h("strong", { id: "count" }, String(chars.length)), " 字"),
      chars.length ? h("button", { class: "selftest", id: "selftest", onclick: (e: Event) => { e.stopPropagation(); selfTest(k, kid); } }, "自测") : h("span", {})),
    h("div", { class: "muted small" }, "点汉字放大；点空白处显示 / 隐藏拼音"),
  );
  const cells = chars.map((c) => (settings.manage ? withDelete(cell(c), c, (ch) => void deleteChar(k, ch)) : cell(c)));
  const grid = h("div", { class: "grid" + (settings.pinyin ? " pinyin-on" : ""), id: "grid" }, ...stagger(cells));
  const scroller = h("div", { class: "scroll", id: "learned-scroll" }, h("div", { class: "narrow" }, manageBar()), head, chars.length ? grid : h("p", { class: "empty" }, "还没有入库的字，先去“本周”录入吧。"));
  // a tap on a character opens the big view of it (then back / forward through all the recorded characters, like on the week page);
  // a tap anywhere else on the screen (not a scroll) shows / hides the pinyin
  const tap = (target: HTMLElement) => {
    if (target.closest("button")) return;   // (the self-test button and the red − have their own job)
    const tzg = target.closest<HTMLElement>(".tzg");
    if (tzg && !settings.manage) return openViewer(chars, Math.max(0, chars.indexOf(tzg.dataset.ch ?? "")), k.color);
    settings.pinyin = !grid.classList.contains("pinyin-on");   // (from what is on screen, so the tap always does what it looks like)
    saveSettings();
    grid.classList.toggle("pinyin-on", settings.pinyin);
    if (settings.pinyin) void fillPinyin(grid);
  };
  // A tap is recognised from the finger itself (pointer down + up without moving), not only from the "click" the browser makes of it afterwards:
  // an iPad may drop that click (it is busy deciding about a double-tap zoom). The click still works (keyboard, mouse, older browsers) but never counts twice.
  let down: { x: number; y: number; t: number } | null = null, lastTap = -1e9;
  scroller.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: e.timeStamp }; });
  scroller.addEventListener("pointerup", (e) => {
    const d = down;
    down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || e.timeStamp - d.t > 700) return;   // a scroll or a long press is not a tap
    lastTap = e.timeStamp;
    tap(e.target as HTMLElement);
  });
  scroller.addEventListener("pointercancel", () => { down = null; });
  scroller.addEventListener("click", (e) => { if (e.timeStamp - lastTap > 800) tap(e.target as HTMLElement); });
  body.replaceChildren(scroller);
  if (settings.pinyin) void fillPinyin(grid);
}

/** self-test: SELF_TEST random characters out of all the recorded ones, asked like the game (the adult ticks / crosses); practice only: nothing is saved */
const SELF_TEST = 30;
function selfTest(k: M.Kid, kid: M.KidData) {
  const queue: G.Q[] = G.shuffle(M.allChars(kid)).slice(0, SELF_TEST).map((ch) => ({ ch, week: kid.weeks.find((w) => w.chars.includes(ch))?.start ?? "", review: false }));
  openGame({
    color: k.color,
    seconds: settings.gameSeconds,
    queue,
    onSave: async () => {},   // (a test is not a practice session: the memory-curve cards are left alone)
    onAgain: () => selfTest(k, kid),
    onClose: () => void route(),
  });
}

/** shown while manage mode is on: says so and turns it off again */
function manageBar(): HTMLElement | null {
  if (!settings.manage) return null;
  return h("div", { class: "managebar" }, h("span", {}, "管理模式：点汉字右上角的红色“−”删除"),
    h("button", { class: "mini", id: "manage-off", onclick: () => { settings.manage = false; saveSettings(); void route(); } }, "完成"));
}

async function deleteChar(k: M.Kid, ch: string) {
  const yes = await confirmDlg("删除这个汉字？", `把“${ch}”从这个孩子的记录里删除？`, "删除", true);
  if (!yes) return; // cancelled: no "done" message
  const done = toast("正在删除…", 0, true);
  try {
    kidCache.set(k.id, await api.update<M.KidData>(`kids/${k.id}.json`, M.EMPTY_KID, (cur) => M.removeChar(cur, ch), `delete ${k.id}`));
    done();
    toast(`已删除“${ch}”`);
    void route();
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

async function renameKid(k: M.Kid) {
  const name = await askText("修改名字", "孩子的名字", k.name, "保存");
  if (!name || name === k.name) return; // cancelled: no message
  if (kidsFile.kids.some((x) => x.id !== k.id && x.name.toLowerCase() === name.toLowerCase())) return toast("已经有同名的孩子了");
  const done = toast("正在保存…", 0, true);
  try {
    kidsFile = await api.update<M.KidsFile>("kids.json", M.EMPTY_KIDS, (cur) => ({ ...cur, kids: cur.kids.map((x) => (x.id === k.id ? { ...x, name } : x)) }), `rename ${k.id}`);
    done();
    toast("已修改名字");
    void renderSettings();
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

async function deleteKid(k: M.Kid) {
  const nChars = M.allChars(kidCache.get(k.id) ?? (await loadKid(k.id).catch(() => M.EMPTY_KID))).length;
  const yes = await confirmDlg("删除这个孩子？", `${k.name} 的 ${nChars} 个汉字和学习记录会被删除，不能恢复。`, "删除", true);
  if (!yes) return; // cancelled: no "done" message
  const done = toast("正在删除…", 0, true);
  try {
    kidsFile = await api.update<M.KidsFile>("kids.json", M.EMPTY_KIDS, (cur) => ({ ...cur, kids: cur.kids.filter((x) => x.id !== k.id) }), `remove ${k.id}`);
    await api.remove(`kids/${k.id}.json`, `remove ${k.id}`);
    await api.remove(`kids/${k.id}.review.json`, `remove ${k.id}`);   // the game's progress goes with the child
    kidCache.delete(k.id);
    done();
    toast(`已删除 ${k.name}`);
    void renderSettings();
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

/**
 * The window for a child's picture AND colour (from Settings, or by tapping the picture at the top of the child's own page):
 * every choice is shown at once in the preview, and saved only with "Done" ("Cancel" changes nothing). `after` shows the screen again.
 */
async function changeAvatar(k: M.Kid, after: () => void) {
  let avatar = k.avatar, color = k.color;
  const picked = await modal<boolean>((close) => {
    const err = h("p", { class: "err", id: "avatar-err" });
    const preview = h("div", { class: "avatar-now" });
    const animals = h("div", { class: "animals" });
    const swatches = h("div", { class: "swatches" });
    const draw = () => {
      preview.style.setProperty("--kid", color);
      animals.style.setProperty("--kid", color);
      preview.replaceChildren(avatarEl({ ...k, avatar, color }), h("span", { class: "user" }, k.name));
      animals.querySelectorAll<HTMLElement>("button.animal").forEach((b) => b.classList.toggle("on", avatar === `animal:${b.dataset.animal}`));
      swatches.querySelectorAll<HTMLElement>("button.swatch").forEach((b) => b.classList.toggle("on", color === b.dataset.color));
    };
    for (const c of M.PALETTE) {
      swatches.append(h("button", { class: "swatch", "data-color": c, style: `background:${c}`, title: c, "aria-label": c, onclick: () => { color = c; draw(); } }));
    }
    for (const name of ANIMAL_NAMES) {
      animals.append(h("button", { class: "animal", "data-animal": name, title: name, "aria-label": name, onclick: () => { avatar = `animal:${name}`; draw(); } }, animalNamed(name)));
    }
    const file = h("input", { type: "file", accept: "image/*", id: "avatar-file", hidden: true });
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      err.textContent = "";
      try {
        avatar = await fileToAvatar(f);
        draw();
      } catch (e) {
        err.textContent = errText(e);
      }
      file.value = "";
    });
    draw();
    return h("div", { class: "dlg wide-dlg" }, h("h2", {}, "头像和颜色"),
      preview,
      h("h3", { class: "mini-h" }, "颜色"), swatches,
      h("h3", { class: "mini-h" }, "头像"), animals,
      h("label", { class: "filebtn" }, "从相册选择", file),
      h("button", { class: "wide", id: "take-photo", onclick: async () => {
        err.textContent = "";
        try {
          const photo = await takePhoto();
          if (photo) {
            avatar = photo;
            draw();
          }
        } catch (e) {
          err.textContent = errText(e);
        }
      } }, "拍照"),
      err,
      h("div", { class: "row end sticky" }, h("button", { id: "avatar-cancel", onclick: () => close(null) }, "取消"), h("button", { class: "primary", id: "avatar-done", onclick: () => close(true) }, "完成")));
  });
  if (!picked) return; // cancelled: nothing changes, nothing is said
  const newAvatar = avatar !== k.avatar, newColor = color !== k.color;
  if (!newAvatar && !newColor) return; // "Done" without a change
  const done = toast("正在保存…", 0, true);
  try {
    kidsFile = await api.update<M.KidsFile>("kids.json", M.EMPTY_KIDS, (cur) => ({ ...cur, kids: cur.kids.map((x) => (x.id === k.id ? { ...x, avatar, color } : x)) }), `look ${k.id}`);
    done();
    toast(newAvatar && newColor ? "已更换头像和颜色" : newAvatar ? "已更换头像" : "已更换颜色");
    after();
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

// ---------- the game ----------
const reviewPath = (id: string) => `kids/${id}.review.json`;

/** what a finished (or left) game changes: the cards of the characters that were asked, and "last time" */
async function saveGame(k: M.Kid, results: G.Result[], score: number, total: number, finished: boolean) {
  const done = toast("正在保存…", 0, true);
  try {
    await api.update<G.Review>(reviewPath(k.id), G.EMPTY_REVIEW, (cur) => G.applyResults(cur, results, M.todayLocal(), finished ? { score, total } : undefined), `game ${k.id}`);
    done();
    toast("已记录这次练习");
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

/** the questions of today's game: all characters of the week + the earlier ones that are due (by the memory curve), shuffled */
function gameQueue(kid: M.KidData, review: G.Review): { queue: G.Q[]; week: string | null; thisWeek: number; again: number } {
  const week = G.gameWeek(kid, M.todayLocal());
  if (!week) return { queue: [], week: null, thisWeek: 0, again: 0 };
  const thisChars = M.weekOf(kid, week)?.chars ?? [];
  const rev = G.pickReview(kid, review, week, M.todayLocal());
  return { queue: G.buildQueue(thisChars, week, rev), week, thisWeek: thisChars.length, again: rev.length };
}

function playGame(k: M.Kid, queue: G.Q[]) {
  openGame({
    color: k.color,
    seconds: settings.gameSeconds,
    queue,
    onSave: (results, score, total, finished) => saveGame(k, results, score, total, finished),
    onAgain: () => void startGame(k),
    onClose: () => void route(),
  });
}
/** a new game from the newest data (after "play again") */
async function startGame(k: M.Kid) {
  try {
    const kid = await loadKid(k.id);
    const review = (await api.readJson<G.Review>(reviewPath(k.id))) ?? G.EMPTY_REVIEW;
    const q = gameQueue(kid, review).queue;
    if (q.length) playGame(k, q);
    else void route();
  } catch (e) {
    toast(errText(e), 6000);
    void route();
  }
}

/** the "Game" tab: what will be asked today, the countdown, the start button */
async function renderGameLobby(body: HTMLElement, k: M.Kid, kid: M.KidData) {
  const my = epoch;
  body.replaceChildren(h("div", { class: "center-msg" }, h("div", { class: "spin" })));
  let review: G.Review;
  try {
    review = (await api.readJson<G.Review>(reviewPath(k.id))) ?? G.EMPTY_REVIEW;
  } catch (e) {
    if (my !== epoch) return;
    return void body.replaceChildren(h("div", { class: "center-msg" }, h("p", { class: "err" }, errText(e)), h("button", { class: "primary", onclick: () => void renderGameLobby(body, k, kid) }, "重试")));
  }
  if (my !== epoch) return;
  const g = gameQueue(kid, review);
  const start = h("button", { class: "primary wide", id: "game-start", disabled: g.queue.length === 0, onclick: () => playGame(k, gameQueue(kid, review).queue) }, "开始游戏");
  body.replaceChildren(h("div", { class: "narrow lobby" },
    h("div", { class: "lobby-hero" }, h("span", { class: "mascot big" }, mascot()), h("h2", {}, "准备好了吗？")),
    g.queue.length ? null : h("p", { class: "empty" }, "还没有汉字，先到“本周”录入吧。"),
    h("div", { class: "lobby-go" }, start)));
}

// ---------- entering a week ----------
async function enterDialog(k: M.Kid) {
  const kid = kidCache.get(k.id) ?? M.EMPTY_KID;
  const date = h("input", { type: "date", value: curWeek, "aria-label": "这一周的第一天（周日）" });
  const label = h("div", { class: "muted small" });
  const chars = h("textarea", { rows: 3, placeholder: "把这一周的汉字粘贴或输入在这里，空格、标点会自动去掉", "aria-label": "汉字" });
  const note1 = h("div", { class: "note", id: "note-chars" });
  const save = h("button", { class: "primary" }, "保存");
  const weekStart = () => M.sundayOf(date.value || M.todayLocal());
  const learnedText = (list: { item: string; start: string }[]) =>
    list.map((x) => `${x.item}（第${M.weekNo(x.start, kidsFile.startWeek ?? weekStart())}周）`).join("、");
  const refresh = () => {
    const start = weekStart();
    label.textContent = `这一周：第${M.weekNo(start, M.pickStartWeek(kidsFile.startWeek, start))}周，${start} 起`;
    const c = M.checkChars(kid, start, M.parseChars(chars.value));
    const typedC = c.fresh.length + c.learned.length + c.inWeek.length;
    note1.replaceChildren();
    if (typedC) note1.append(h("div", {}, `共 ${typedC} 个汉字，新的 ${c.fresh.length} 个`));
    if (c.learned.length) note1.append(h("div", { class: "warn" }, `已入库，保存时会跳过：${learnedText(c.learned)}`));
    if (c.inWeek.length) note1.append(h("div", { class: "muted" }, `这一周已经有了：${c.inWeek.join("")}`));
    save.disabled = c.fresh.length === 0;
  };
  for (const el of [date, chars]) el.addEventListener("input", refresh);
  refresh();
  const ok = await modal<boolean>((close) => {
    save.addEventListener("click", () => close(true));
    queueMicrotask(() => chars.focus());
    return h("div", { class: "dlg wide-dlg" }, h("h2", {}, "录入这一周的内容"),
      h("label", {}, "这一周的第一天（周日）", date), label,
      h("label", {}, "汉字", chars), note1,
      h("div", { class: "row end" }, h("button", { onclick: () => close(null) }, "取消"), save));
  });
  if (!ok) return; // cancelled: no message
  const start = weekStart();
  const typedChars = M.parseChars(chars.value);
  const done = toast("正在保存…", 0, true);
  try {
    let added = 0, skipped = 0;
    const newKid = await api.update<M.KidData>(`kids/${k.id}.json`, M.EMPTY_KID, (cur) => {
      const r = M.addChars(cur, start, typedChars);
      added = r.added;
      skipped = typedChars.length - r.added - M.checkChars(cur, start, typedChars).inWeek.length;
      return r.data;
    }, `${k.id} ${start}`);
    kidCache.set(k.id, newKid);
    kidsFile = await api.update<M.KidsFile>("kids.json", M.EMPTY_KIDS, (cur) => {
      const sw = M.pickStartWeek(cur.startWeek, start);
      return sw === cur.startWeek ? cur : { ...cur, startWeek: sw };
    }, "start week");
    curWeek = start;
    done();
    toast(skipped ? `已保存：新增 ${added} 个汉字；另有 ${skipped} 个已入库，已跳过` : `已保存：新增 ${added} 个汉字`, 5000);
    route();
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

// ---------- import from a spreadsheet (Excel / Google Sheets) ----------
/** step 1: choose the .xlsx file (all tabs are read) or paste the cells of one tab */
function pickSheets(): Promise<SheetData[] | null> {
  return modal<SheetData[]>((close) => {
    const err = h("p", { class: "err", id: "import-err" });
    const file = h("input", { type: "file", accept: ".xlsx", id: "import-file", hidden: true });
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      err.textContent = "";
      try {
        close(readWorkbook(await f.arrayBuffer()));
      } catch (e) {
        err.textContent = errText(e);
        file.value = "";
      }
    });
    const target = h("select", { id: "paste-target", "aria-label": "粘贴到" },
      ...kidsFile.kids.map((k) => h("option", { value: k.name, class: "user" }, k.name)), h("option", { value: "成语" }, "成语"));
    const paste = h("textarea", { rows: 4, id: "paste-text", placeholder: "在表格里选中这个标签页的内容，复制后粘贴到这里", "aria-label": "表格内容" });
    const go = h("button", { id: "paste-go", onclick: () => {
      const rows = readTable(paste.value);
      if (!rows.length) return void (err.textContent = "还没有粘贴内容");
      close([{ name: target.value, rows }]);
    } }, "预览");
    return h("div", { class: "dlg wide-dlg" }, h("h2", {}, "从 Excel 导入"),
      h("p", { class: "muted" }, "每个孩子一个标签页（标签页的名字就是孩子的名字），每行一周：第一列是“第1周-2026-10-25”，后面是这一周的汉字。标签页“成语”会被保存起来，暂时不在孩子的页面里显示。"),
      h("p", { class: "muted small" }, "在 Google 表格里：文件 → 下载 → Microsoft Excel (.xlsx)，然后选择下载的文件。"),
      h("label", { class: "filebtn" }, "选择 Excel 文件", file),
      h("div", { class: "or" }, "或者粘贴一个标签页的内容"),
      h("label", {}, "粘贴到", target), paste, go,
      err,
      h("button", { class: "wide", onclick: () => close(null) }, "取消"));
  });
}

/** step 2: what would happen, tab by tab; the user chooses what to import */
function previewImport(entries: I.Entry[]): Promise<I.Entry[]> {
  return modal<I.Entry[]>((close) => {
    const checks = entries.map((e) => h("input", { type: "checkbox", checked: e.added > 0, disabled: e.added === 0 }));
    const go = h("button", { class: "primary", id: "import-go" }, "导入");
    const sync = () => (go.disabled = !entries.some((e, i) => checks[i].checked && e.added > 0));
    checks.forEach((c) => c.addEventListener("change", sync));
    sync();
    go.addEventListener("click", () => close(entries.filter((_, i) => checks[i].checked && entries[i].added > 0)));
    const rows = entries.map((e, i) => {
      const n = e.parsed.weeks.length;
      const lines: (HTMLElement | null)[] = [];
      if (e.pool) {
        const q = e.pool;
        lines.push(h("div", {}, `成语库：${q.total} 个成语，其中 ${q.checked} 个已勾选`));
        lines.push(h("div", { class: "muted" }, `表格 A 列有 ${q.filled} 行内容，认出 ${q.total} 个成语`));
        if (q.ignored.length) lines.push(h("div", { class: "warn" }, `有 ${q.ignored.length} 行没有算进去（重复的、标题或不是成语），第 ${q.ignored.slice(0, 8).join("、")} 行${q.ignored.length > 8 ? " …" : ""}`));
        if (q.fromSheetWeeks) lines.push(h("div", {}, `表格 D 列写了周的 ${q.fromSheetWeeks} 个成语，回到表格里写的那一周`));
        if (q.assigned) lines.push(h("div", {}, `没写周的已勾选成语按表格顺序分配到 ${q.weeks.length} 周，每周 ${M.IDIOMS_PER_WEEK} 个（${q.weeks.map((w) => w.slice(5).replace("-", "\u2011")).join("、")}）`));
        if (q.removed) lines.push(h("div", { class: "warn" }, `现有周里的 ${q.removed} 个成语会被冲掉，按表格重新安排（以表格为准）`));
        if (q.leftover) lines.push(h("div", { class: "warn" }, `还有 ${q.leftover} 个已勾选的放不下，留在成语库里`));
        lines.push(h("div", { class: "muted" }, `还没有分配到周的 ${q.unticked} 个留在成语库里，以后每周自动随机选 ${M.IDIOMS_PER_WEEK} 个放进下一周`));
      } else if (!n) lines.push(h("div", { class: "warn" }, "没有认出内容。第一列要写成“第1周-2026-10-25”，后面是汉字。"));
      else if (!e.pool) {
        lines.push(h("div", {}, e.kind === "idioms" ? `${n} 周，${e.total} 个成语，其中新的 ${e.added} 个` : `${n} 周，${e.total} 个汉字，其中新的 ${e.added} 个`));
        if (e.skipped) lines.push(h("div", { class: "warn" }, `已入库，会跳过：${e.skipped} 个（同一个字出现在多周时，只留最早的一周）`));
        if (e.present && !e.added && !e.skipped) lines.push(h("div", { class: "muted" }, "都已经有了"));
        else if (e.present) lines.push(h("div", { class: "muted" }, `已经有了：${e.present} 个`));
      }
      if (e.parsed.skippedRows.length) lines.push(h("div", { class: "warn" }, `有 ${e.parsed.skippedRows.length} 行没认出日期，已忽略（第 ${e.parsed.skippedRows.slice(0, 8).join("、")} 行）`));
      return h("div", { class: "entry" },
        h("label", { class: "check" }, checks[i], h("strong", { class: "user" }, e.name),
          e.kind === "chars" && !e.exists ? h("span", { class: "badge" }, "新建孩子") : null),
        ...lines);
    });
    return h("div", { class: "dlg wide-dlg" }, h("h2", {}, "导入预览"), ...rows,
      h("div", { class: "row end" }, h("button", { onclick: () => close(null) }, "取消"), go));
  }).then((r) => r ?? []);
}

async function importFlow() {
  const sheets = await pickSheets();
  if (!sheets) return; // cancelled: no message
  if (!sheets.length) return void toast("这个文件里没有表格内容");
  // the library's ticked idioms go to the weeks that have started (every week with characters, up to this week) and to NEXT week (prepared in advance)
  await Promise.all(kidsFile.kids.filter((k) => !kidCache.has(k.id)).map((k) => loadKid(k.id).catch(() => M.EMPTY_KID)));
  const thisWeek = M.sundayOf(M.todayLocal());
  const started = new Set<string>([...kidsFile.kids.flatMap((k) => (kidCache.get(k.id)?.weeks ?? []).filter((w) => w.chars.length).map((w) => w.start)), ...idioms.weeks.map((w) => w.start)].filter((x) => x <= thisWeek));
  if (!started.size) started.add(thisWeek);
  const poolWeeks = [...started].sort().concat(M.addDays(thisWeek, 7));
  const entries = I.plan(sheets, kidsFile, (id) => kidCache.get(id) ?? M.EMPTY_KID, idioms, poolWeeks);
  const chosen = await previewImport(entries);
  if (!chosen.length) return; // cancelled, or nothing new: no "done" message
  const done = toast("正在导入…", 0, true);
  try {
    const firstWeek = chosen.flatMap((e) => e.parsed.weeks.map((w) => w.start)).sort()[0];
    const ids = new Map<string, string>();
    kidsFile = await api.update<M.KidsFile>("kids.json", M.EMPTY_KIDS, (cur) => {
      ids.clear();
      const kids = cur.kids.slice();
      for (const e of chosen.filter((x) => x.kind === "chars")) {
        const name = Array.from(e.name.trim()).slice(0, 20).join("");
        let k = kids.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (!k) kids.push((k = { id: M.newKidId(), name, color: M.KID_COLORS[kids.length % M.KID_COLORS.length] }));
        ids.set(e.name, k.id);
      }
      return { ...cur, kids, startWeek: M.pickStartWeek(cur.startWeek, firstWeek) };
    }, "import: children");
    let chars = 0, idiomsAdded = 0, skipped = 0;
    for (const e of chosen) {
      if (e.kind === "chars") {
        const id = ids.get(e.name)!;
        let added = 0, skip = 0;
        kidCache.set(id, await api.update<M.KidData>(`kids/${id}.json`, M.EMPTY_KID, (cur) => {
          const r = I.applyChars(cur, e.parsed.weeks);
          added = r.added; skip = r.skipped;
          return r.data;
        }, `import: ${id}`));
        chars += added; skipped += skip;
      } else if (e.pool) {
        const rows = I.parsePool(sheets.find((x) => x.name === e.name)!.rows);
        let added = 0;
        idioms = await api.update<M.IdiomsFile>("idioms.json", M.EMPTY_IDIOMS, (cur) => {
          const r = I.applyPool(cur, rows, poolWeeks);
          added = r.plan.assigned;
          return r.data;
        }, "import: idiom library");
        idiomsAdded += added;
      } else {
        let added = 0, skip = 0;
        idioms = await api.update<M.IdiomsFile>("idioms.json", M.EMPTY_IDIOMS, (cur) => {
          const r = I.applyIdioms(cur, e.parsed.weeks);
          added = r.added; skip = r.skipped;
          return r.data;
        }, "import: idioms");
        idiomsAdded += added; skipped += skip;
      }
    }
    done();
    toast(skipped ? `已导入：${chars} 个汉字、${idiomsAdded} 个成语；另有 ${skipped} 个已入库，已跳过` : `已导入：${chars} 个汉字、${idiomsAdded} 个成语`, 6000);
    restart(); // (the import is started from Settings: show the children)
  } catch (e) {
    done();
    toast(errText(e), 8000);
  }
}

// ---------- app updates (a web app on the iPad home screen has no reload button) ----------
/** Forget the cached copies of the app and load the newest one. The sign-in and the data on this device are kept. */
async function hardRefresh() {
  const done = toast("正在更新…", 0, true);
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch { /* no service worker */ }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch { /* no cache storage */ }
  void done;
  // a changed query string also skips the browser's own HTTP cache for index.html
  location.replace(`${location.pathname}?r=${Date.now()}${location.hash}`);
}
/** the build id of the newest version on the site (written at every build, see vite.config.ts); null when it cannot be read */
async function latestBuild(): Promise<string | null> {
  try {
    const r = await fetch(new URL(`version.json?t=${Date.now()}`, document.baseURI), { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { build?: unknown };
    return typeof j.build === "string" ? j.build : null;
  } catch {
    return null;
  }
}
let updateBanner: HTMLElement | null = null;
function showUpdateBanner() {
  if (updateBanner?.isConnected) return;
  updateBanner = h("div", { class: "updatebar", id: "update-bar" }, h("span", {}, "有新版本可用"), h("button", { class: "primary", id: "update-now", onclick: () => void hardRefresh() }, "立即更新"));
  document.body.append(updateBanner);
  document.body.classList.add("has-update"); // (leaves room under the last button)
}
/** @param quiet automatic checks say nothing unless there is a new version */
async function checkUpdate(quiet = false) {
  const done = quiet ? () => {} : toast("正在检查更新…", 0, true);
  const b = await latestBuild();
  done();
  if (b === null) return void (quiet || toast("检查更新失败，请检查网络"));
  if (b !== __BUILD__) {
    showUpdateBanner();
    if (!quiet) toast("有新版本可用，请点下方的“立即更新”", 6000);
  } else if (!quiet) toast("已是最新版本");
}
if (!__MOBILE__ && import.meta.env.PROD) {
  // look for a new version when the app opens, when it comes back to the front, and every 5 minutes (never reloads by itself: you may be typing)
  setTimeout(() => void checkUpdate(true), 3000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void checkUpdate(true); });
  setInterval(() => void checkUpdate(true), 5 * 60_000);
}

// ---------- settings ----------
async function renderSettings() {
  const my = epoch;
  showLoading();
  try {
    await loadShared();
  } catch (e) {
    return my === epoch ? showError(e, () => void renderSettings()) : undefined;
  }
  if (my !== epoch) return;
  const lang = h("div", { class: "seg" },
    ...([["auto", "自动"], ...LANGS] as [LangPref, string][]).map(([v, name]) =>
      h("button", { class: settings.lang === v ? "on" : "", onclick: () => { settings.lang = v; saveSettings(); setLang(v); void renderSettings(); } }, name)),
  );
  const secs = h("div", { class: "secs", id: "game-secs" }, ...[3, 5, 8, 10, 15].map((n) =>
    h("button", { class: "secbtn" + (n === settings.gameSeconds ? " on" : ""), "data-sec": String(n), onclick: () => {
      settings.gameSeconds = n;
      saveSettings();
      secs.querySelectorAll<HTMLElement>("button.secbtn").forEach((b) => b.classList.toggle("on", b.dataset.sec === String(n)));
    } }, `${n} 秒`)));
  const pinyin = h("input", { type: "checkbox", checked: settings.pinyin, onchange: (e: Event) => { settings.pinyin = (e.target as HTMLInputElement).checked; saveSettings(); } });
  const manage = h("input", { type: "checkbox", id: "manage-mode", checked: settings.manage, onchange: (e: Event) => { settings.manage = (e.target as HTMLInputElement).checked; saveSettings(); } });
  const a = api.getAuth();
  const account = api.isLocal()
    ? h("div", { class: "card" }, h("h3", {}, "数据保存位置"), h("p", {}, "这台设备（浏览器）里，不会上传。换设备或清除浏览器数据会丢失。"),
        h("button", { class: "wide", onclick: () => { api.leaveLocal(); restart(); } }, "改用 GitHub 私有仓库"))
    : h("div", { class: "card" }, h("h3", {}, "数据保存位置"), h("p", {}, "GitHub：", h("span", { class: "user" }, a?.repo ?? "")),
        h("button", { class: "wide", id: "qr-btn", onclick: showQr }, "登录到其他设备（二维码）"),
        h("button", { class: "wide danger", onclick: signOut }, "退出登录"));
  // the children: not something done every day, so it lives here and not on the home screen
  const rows = kidsFile.kids.map((k) =>
    h("div", { class: "kidrow", "data-kid": k.id, style: `--kid:${k.color}` },
      h("button", { class: "avatar-btn", title: "修改头像和颜色", "aria-label": "修改头像和颜色", onclick: () => void changeAvatar(k, () => void renderSettings()) }, avatarEl(k)),
      h("span", { class: "kname user" }, k.name),
      h("div", { class: "kidact" },
        h("button", { class: "mini rename", onclick: () => void renameKid(k) }, "修改名字"),
        h("button", { class: "mini change-avatar", onclick: () => void changeAvatar(k, () => void renderSettings()) }, "头像和颜色"),
        h("button", { class: "mini danger delete", onclick: () => void deleteKid(k) }, "删除"))));
  const kids = h("div", { class: "card" }, h("h3", {}, "孩子"), ...rows,
    h("button", { class: "wide", id: "add-kid", onclick: () => void addKid(() => void renderSettings()) }, "＋ 添加孩子"),
    h("button", { class: "wide", id: "import-btn", onclick: importFlow }, "从 Excel 导入"));
  show(
    h("div", { class: "page" },
      topBar("设置", backBtn("#/", "完成")),
      h("main", { class: "scroll" }, h("div", { class: "narrow" },
        kids,
        h("div", { class: "card" }, h("label", { class: "check" }, manage, "管理模式"),
          h("p", { class: "muted small" }, "打开后，“本周”和“已入库”里每个汉字的右上角会出现红色“−”，点一下就能删除这个汉字。用完请关掉。")),
        h("div", { class: "card" }, h("h3", {}, "倒计时"), secs),
        h("div", { class: "card" }, h("h3", {}, "语言"), lang),
        h("div", { class: "card", id: "story-lib" }, h("h3", {}, "成语故事库"), h("p", { class: "muted small" }, "App 里自带了一批简单的成语小故事（150 字以内，用小学生认识的字）。点下面的按钮，把还没有故事的成语填上；你自己写的故事不会被改动。"),
          h("button", { class: "wide", id: "fill-stories", onclick: () => void fillBuiltInStories() }, "把自带的故事填进成语")),
        // the stroke data of the practice sheets is under the Arphic Public License, which asks for this notice and the license text to travel with the app
        h("div", { class: "card", id: "credits" }, h("h3", {}, "致谢"), h("p", { class: "muted small" }, "笔顺数据来自 Make Me a Hanzi（Arphic Public License）。"),
          h("a", { class: "link", id: "license-link", href: `${import.meta.env.BASE_URL}strokes/ARPHICPL.TXT`, target: "_blank", rel: "noopener" }, "查看许可证")),
        h("div", { class: "card" }, h("label", { class: "check" }, pinyin, "显示拼音（在“本周”和“已入库”里）"), h("p", { class: "muted small" }, "拼音在本机生成，不联网。多音字只显示最常见的读音。")),
        account,
        h("div", { class: "card" }, h("h3", {}, "同步到 Google 表格"),
          h("p", { class: "muted small" }, "在 Google 表格里加一小段脚本，它会每周六、周日晚上各一次，自动把你在这里新加的汉字填进表格里对应孩子、对应那一周的空格，你在这里删掉的字也会从表格里清掉（你在表格里手动录的内容不会被改动，这里的数据也不会被改动）。请在电脑上设置，大约 10 分钟，只做一次。"),
          h("button", { class: "wide", id: "copy-sync", onclick: () => void copySyncScript() }, "复制同步脚本"),
          h("a", { class: "linkbtn", id: "sync-steps", href: SYNC_STEPS_URL, target: "_blank", rel: "noopener" }, "查看详细步骤")),
        h("div", { class: "card" }, h("h3", {}, "应用"),
          ...(__MOBILE__ ? [] : [
            h("button", { class: "wide", id: "check-update", onclick: () => void checkUpdate() }, "检查更新"),
            h("button", { class: "wide", id: "hard-refresh", title: "一直显示旧版本时使用，不会退出登录", onclick: () => void hardRefresh() }, "强制刷新（清除缓存）"),
          ]),
          h("p", { class: "muted small center" }, `版本 ${__BUILD__}`)),
      )),
    ),
  );
}

/** where the step-by-step description of the Google Sheets sync is (the default branch of the public code repository) */
const SYNC_STEPS_URL = "https://github.com/user202201/LearningChinese/blob/HEAD/docs/google-sheet-sync/README.md";

/** puts the Google Sheets sync script on the clipboard; when the browser does not allow it, shows it in a box to copy by hand */
async function copySyncScript() {
  try {
    await navigator.clipboard.writeText(syncScript);
    toast("已复制。请到 Google 表格的 Apps Script 里粘贴（步骤见“查看详细步骤”）", 6000);
  } catch {
    await modal<boolean>((close) => {
      const box = h("textarea", { readOnly: true, rows: 10, id: "sync-script", "aria-label": "同步脚本" });
      box.value = syncScript;
      box.addEventListener("focus", () => box.select());
      return h("div", { class: "dlg wide-dlg" }, h("h2", {}, "同步脚本"), h("p", { class: "muted" }, "没能自动复制：请点一下下面的框，全选后复制。"), box,
        h("div", { class: "row end" }, h("button", { class: "primary", onclick: () => close(true) }, "完成")));
    });
  }
}

async function signOut() {
  if (!(await confirmDlg("退出登录？", "这台设备上保存的令牌会被删除，数据仍然在 GitHub 上。", "退出"))) return;
  api.logout();
  toast("已退出登录");
  restart();
}

async function showQr() {
  const a = api.getAuth();
  if (!a) return;
  const link = api.makeLoginLink(a);
  const url = await QRCode.toDataURL(link, { margin: 2, width: 320 });
  await modal<boolean>((close) =>
    h("div", { class: "dlg" }, h("h2", {}, "登录到其他设备"),
      h("p", {}, "在新设备的登录页点“扫码登录”扫描，或直接用手机相机扫描。"),
      h("img", { class: "qr", src: url, alt: "QR", "data-link": link }),
      h("p", { class: "warn small" }, "二维码里含有令牌，只给自己的设备扫，不要截图发给别人。"),
      h("button", { class: "wide primary", onclick: () => close(true) }, "完成")));
}

// ---------- routing ----------
async function route() {
  epoch++;
  const hash = location.hash;
  const link = api.parseLink(hash);
  if (link) {
    // a sign-in link (QR code): sign in, then go to the home screen
    history.replaceState(null, "", location.pathname);
    const done = toast("正在登录…", 0, true);
    try {
      await api.login(link.token, link.repo, true);
      done();
      toast("已登录");
    } catch (e) {
      done();
      return renderLogin(errText(e));
    }
    return home();
  }
  if (!api.isSignedIn()) return renderLogin();
  if (!/^#\/kid\//.test(hash)) { curWeek = ""; curWeekKid = ""; }
  const kid = /^#\/kid\/([\w-]+)(?:\/(learned|game))?$/.exec(hash);
  if (kid) return renderKid(kid[1], kid[2] === "learned" ? "learned" : kid[2] === "game" ? "game" : "week");
  const sheet = /^#\/sheet\/([\w-]+)$/.exec(hash);
  if (sheet) return void renderSheet(sheet[1]);
  if (hash === "#/idioms") return void renderIdioms();
  if (hash === "#/stories") return void renderStories();
  const idiom = /^#\/idiom\/(.+)$/.exec(hash);
  if (idiom) return void renderIdiom(decodeURIComponent(idiom[1]));
  if (hash === "#/settings") return void renderSettings();
  return renderHome();
}

// No double-tap zoom, anywhere. On an iPad Safari (which shows pages like a desktop) "touch-action" is not enough, so the second tap of a double tap is
// cancelled here (same place, within 350 ms); pointer events still arrive, so our own taps keep working. Pinching stays possible, to get back from a zoom.
let lastEnd = -1e9, lastX = 0, lastY = 0;
document.addEventListener("touchend", (e) => {
  const t = e.changedTouches[0];
  const quick = e.timeStamp - lastEnd < 350 && Math.hypot(t.clientX - lastX, t.clientY - lastY) < 40;
  lastEnd = e.timeStamp; lastX = t.clientX; lastY = t.clientY;
  if (quick && e.cancelable && !(e.target as Element).closest("button, input, textarea, select, a, dialog")) e.preventDefault();
}, { passive: false });

setLang(settings.lang);
window.addEventListener("hashchange", () => void route());
void route();
