import "./style.css";
import QRCode from "qrcode";
import * as api from "./api";
import * as M from "./model";
import { h, toast, modal, askText, confirmDlg } from "./ui";
import { LANGS, setLang, type LangPref } from "./i18n";
import { animal, mascot } from "./art";
import { scanQr } from "./scan";
import { readTable, readWorkbook, type SheetData } from "./xlsx";
import * as I from "./importer";

const app = document.getElementById("app")!;

// ---------- settings (only per-device conveniences; the learning data lives behind api.ts) ----------
interface Settings { lang: LangPref; pinyin: boolean }
const SETTINGS_KEY = "learn.settings.v1";
function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    return { lang: ["auto", "zh", "en", "fr"].includes(s.lang) ? s.lang : "auto", pinyin: !!s.pinyin };
  } catch {
    return { lang: "auto", pinyin: false };
  }
}
const settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

// ---------- pinyin (optional; loaded only when needed, computed on this device) ----------
let pinyinFn: ((ch: string) => string) | null = null;
let pinyinLoading: Promise<void> | null = null;
function loadPinyin(): Promise<void> {
  return (pinyinLoading ??= import("pinyin-pro")
    .then((m) => { pinyinFn = (ch) => m.pinyin(ch); })
    .catch(() => { pinyinLoading = null; }));
}
/** fills the pinyin of every `.py` element below `root` (when the pinyin library is available) */
async function fillPinyin(root: ParentNode) {
  await loadPinyin();
  if (!pinyinFn) return;
  root.querySelectorAll<HTMLElement>(".tzg").forEach((c) => {
    const py = c.querySelector(".py");
    if (py && !py.textContent) py.textContent = pinyinFn!(c.dataset.ch ?? "");
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

/** a character in a 田字格 cell: pinyin line above, the character in a square with a dashed cross */
const cell = (ch: string) =>
  h("div", { class: "tzg", "data-ch": ch }, h("div", { class: "py" }), h("div", { class: "box" }, h("span", { class: "ch user" }, ch)));

function topBar(title: string, left?: HTMLElement, right?: HTMLElement) {
  return h("header", { class: "top plain" }, left ?? h("span", { class: "slot" }), h("h1", {}, title), right ?? h("span", { class: "slot" }));
}
const avatarEl = (id: string) => h("span", { class: "avatar" }, animal(id));
/** sets the stagger of the pop-in animation on a list of elements */
const stagger = <T extends HTMLElement>(els: T[]): T[] => {
  els.forEach((e, i) => e.style.setProperty("--i", String(Math.min(i, 14))));
  return els;
};
const backBtn = (to: string, label = "返回") => h("button", { class: "icon back", title: label, "aria-label": label, onclick: () => (location.hash = to) }, "‹");
const gearBtn = () => h("button", { class: "icon", title: "设置", "aria-label": "设置", onclick: () => (location.hash = "#/settings") }, "⚙");

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
  showLoading();
  try {
    await loadShared();
    await Promise.all(kidsFile.kids.map((k) => loadKid(k.id)));
  } catch (e) {
    return showError(e, renderHome);
  }
  const list = h("div", { class: "kids" });
  for (const k of kidsFile.kids) {
    const n = M.allChars(kidCache.get(k.id) ?? M.EMPTY_KID).length;
    list.append(
      h("button", { class: "kid", style: `--kid:${k.color}`, onclick: () => (location.hash = `#/kid/${k.id}`) },
        avatarEl(k.id),
        h("span", { class: "kinfo" }, h("span", { class: "kname user" }, k.name), h("span", { class: "ksub" }, `已学 ${n} 字`)),
        h("span", { class: "chev" }, "›")),
    );
  }
  if (!kidsFile.kids.length) list.append(h("p", { class: "empty" }, "还没有孩子，先添加一个吧。"));
  stagger([...list.querySelectorAll<HTMLElement>(".kid")]);
  show(
    h("div", { class: "page" },
      h("header", { class: "top hero home-hero" },
        h("span", { class: "mascot" }, mascot()),
        h("div", { class: "hero-text" }, h("h1", {}, "识字小助手"), h("p", {}, "今天学点什么？")),
        gearBtn()),
      h("main", { class: "scroll" }, h("div", { class: "narrow" }, list, h("button", { class: "primary wide", onclick: addKid }, "＋ 添加孩子"), h("button", { class: "wide", id: "import-btn", onclick: importFlow }, "从 Excel 导入"))),
    ),
  );
}

async function addKid() {
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
    renderHome();
  } catch (e) {
    done();
    toast(errText(e), 6000);
  }
}

// ---------- one child ----------
async function renderKid(id: string, tab: "week" | "learned") {
  showLoading();
  let kid: M.KidData;
  try {
    await loadShared();
    kid = await loadKid(id);
  } catch (e) {
    return showError(e, () => renderKid(id, tab));
  }
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
  const tabs = h("div", { class: "seg tabs" },
    h("button", { class: tab === "week" ? "on" : "", onclick: () => (location.hash = `#/kid/${id}`) }, "本周"),
    h("button", { class: tab === "learned" ? "on" : "", "data-tab": "learned", onclick: () => (location.hash = `#/kid/${id}/learned`) }, `已学 ${nChars}`),
  );
  show(
    h("div", { class: "page", style: `--kid:${k.color}` },
      h("header", { class: "top hero kid-hero" },
        backBtn("#/", "孩子"),
        h("h1", { class: "user-title" }, avatarEl(k.id), k.name),
        h("button", { class: "icon", title: "更多", "aria-label": "更多", onclick: () => kidMenu(k) }, "⋯")),
      h("div", { class: "tabs-row" }, tabs),
      body,
    ),
  );
  if (tab === "week") renderWeek(body, k, kid);
  else renderLearned(body, kid);
}

function renderWeek(body: HTMLElement, k: M.Kid, kid: M.KidData) {
  body.replaceChildren();
  const todayWeek = M.sundayOf(M.todayLocal());
  const no = M.weekNo(curWeek, kidsFile.startWeek);
  const w = M.weekOf(kid, curWeek);
  const iw = idioms.weeks.find((x) => x.start === curWeek);
  const go = (start: string) => {
    curWeek = start;
    renderWeek(body, k, kid);
  };
  // only forward: earlier weeks are in "Learned" (and can be reached by tapping the week's name)
  const bar = h("div", { class: "weekbar" },
    h("button", { class: "icon", title: "上一周", "aria-label": "上一周", disabled: curWeek <= todayWeek, onclick: () => go(M.addDays(curWeek, -7)) }, "‹"),
    h("button", { class: "wlabel", id: "week-pick", title: "选择周", "aria-label": "选择周", onclick: () => void pickWeek(kid).then((start) => start && go(start)) },
      h("strong", {}, `第${no}周`), h("span", { class: "muted" }, `${curWeek} ~ ${M.addDays(curWeek, 6)}`)),
    h("button", { class: "icon", title: "下一周", "aria-label": "下一周", onclick: () => go(M.addDays(curWeek, 7)) }, "›"),
  );
  const chars = w?.chars ?? [];
  const items = iw?.items ?? [];
  const plus = (id: string, focus: "chars" | "idioms") => h("button", { class: "plus", id, title: "录入这一周的内容", "aria-label": "录入这一周的内容", onclick: () => enterDialog(k, focus) }, "＋");
  const cards = chars.map((c, i) => {
    const el = cell(c);
    el.classList.add("tappable");
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.addEventListener("click", () => openViewer(chars, i, k.color));
    el.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), el.click()));
    return el;
  });
  const grid = h("div", { class: "cards" + (settings.pinyin ? " pinyin-on" : "") }, ...stagger(cards));
  body.append(
    h("div", { class: "narrow" },
      bar,
      curWeek === todayWeek ? null : h("button", { class: "link", onclick: () => go(todayWeek) }, "回到本周"),
      h("div", { class: "sec-row" }, h("h2", { class: "sec" }, `汉字（${chars.length}）`), chars.length ? plus("enter", "chars") : null),
      chars.length
        ? grid
        : h("div", { class: "add-empty" }, h("button", { class: "add-big", id: "enter", title: "录入这一周的内容", "aria-label": "录入这一周的内容", onclick: () => enterDialog(k, "chars") }, "＋"), h("p", {}, "点 ＋ 录入这一周的汉字")),
      h("div", { class: "sec-row" }, h("h2", { class: "sec idi" }, `成语（${items.length}）`), items.length ? plus("enter-idioms", "idioms") : null),
      items.length
        ? h("div", { class: "idioms" }, ...stagger(items.map((t) => h("span", { class: "idiom user" }, t))))
        : h("div", { class: "add-empty small" }, h("button", { class: "add-chip", id: "enter-idioms", title: "录入这一周的内容", "aria-label": "录入这一周的内容", onclick: () => enterDialog(k, "idioms") }, "＋")),
    ),
  );
  if (settings.pinyin) void fillPinyin(grid);
}

/** every week that has something (and this week): choose one to look at */
function pickWeek(kid: M.KidData): Promise<string | null> {
  const todayWeek = M.sundayOf(M.todayLocal());
  const starts = [...new Set([...kid.weeks.map((x) => x.start), ...idioms.weeks.map((x) => x.start), todayWeek])].sort().reverse();
  return modal<string>((close) =>
    h("div", { class: "dlg" }, h("h2", {}, "选择周"),
      h("div", { class: "weeklist" }, ...starts.map((st) => {
        const nc = M.weekOf(kid, st)?.chars.length ?? 0;
        const ni = idioms.weeks.find((x) => x.start === st)?.items.length ?? 0;
        return h("button", { class: "weekrow" + (st === curWeek ? " on" : ""), "data-start": st, onclick: () => close(st) },
          h("strong", {}, `第${M.weekNo(st, kidsFile.startWeek)}周`),
          h("span", { class: "muted" }, st),
          st === todayWeek ? h("span", { class: "badge" }, "本周") : null,
          h("span", { class: "counts" }, `汉字 ${nc} · 成语 ${ni}`));
      })),
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
    h("div", { class: "vtop" }, count, close), stage, prev, next,
    h("p", { class: "vhint" }, "点击汉字显示 / 隐藏拼音，左右滑动切换"));
  const show = (dir = 0) => {
    const ch = chars[i];
    box.dataset.ch = ch;
    (box.querySelector(".ch") as HTMLElement).textContent = ch;
    (box.querySelector(".py") as HTMLElement).textContent = pinyinFn ? pinyinFn(ch) : "";
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
    document.querySelectorAll<HTMLElement>(".cards").forEach((g) => {
      g.classList.toggle("pinyin-on", settings.pinyin);
      if (settings.pinyin) void fillPinyin(g);
    });
  };
  prev.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  close.addEventListener("click", quit);
  let down: { x: number; y: number } | null = null;
  stage.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener("pointerup", (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) toggle();
  });
  stage.addEventListener("pointercancel", () => (down = null));
  document.addEventListener("keydown", onKey);
  document.body.append(root);
  show();
  void loadPinyin().then(() => show());
}

function renderLearned(body: HTMLElement, kid: M.KidData) {
  const chars = M.allChars(kid);
  const nIdioms = M.allIdioms(idioms).length;
  const head = h("div", { class: "learned-head" },
    h("div", { class: "big" }, h("strong", { id: "count" }, String(chars.length)), " 字"),
    h("div", { class: "muted" }, `成语 ${nIdioms} 个`),
    h("div", { class: "muted small" }, "点击屏幕显示 / 隐藏拼音"),
  );
  const grid = h("div", { class: "grid" + (settings.pinyin ? " pinyin-on" : ""), id: "grid" }, ...stagger(chars.map(cell)));
  const scroller = h("div", { class: "scroll", id: "learned-scroll" }, head, chars.length ? grid : h("p", { class: "empty" }, "还没有学过的字，先去“本周”录入吧。"));
  // a tap anywhere on the screen (not a scroll) shows / hides the pinyin
  scroller.addEventListener("click", () => {
    settings.pinyin = !settings.pinyin;
    saveSettings();
    grid.classList.toggle("pinyin-on", settings.pinyin);
    if (settings.pinyin) void fillPinyin(grid);
  });
  body.replaceChildren(scroller);
  if (settings.pinyin) void fillPinyin(grid);
}

async function kidMenu(k: M.Kid) {
  const what = await modal<"rename" | "delete">((close) =>
    h("div", { class: "dlg" }, h("h2", { class: "user-title" }, k.name),
      h("button", { class: "wide", onclick: () => close("rename") }, "修改名字"),
      h("button", { class: "wide danger", onclick: () => close("delete") }, "删除这个孩子"),
      h("button", { class: "wide", onclick: () => close(null) }, "取消")));
  if (what === "rename") {
    const name = await askText("修改名字", "孩子的名字", k.name, "保存");
    if (!name || name === k.name) return;
    if (kidsFile.kids.some((x) => x.id !== k.id && x.name.toLowerCase() === name.toLowerCase())) return toast("已经有同名的孩子了");
    const done = toast("正在保存…", 0, true);
    try {
      kidsFile = await api.update<M.KidsFile>("kids.json", M.EMPTY_KIDS, (cur) => ({ ...cur, kids: cur.kids.map((x) => (x.id === k.id ? { ...x, name } : x)) }), `rename ${k.id}`);
      done();
      toast("已修改名字");
      route();
    } catch (e) {
      done();
      toast(errText(e), 6000);
    }
  } else if (what === "delete") {
    const nChars = M.allChars(kidCache.get(k.id) ?? M.EMPTY_KID).length;
    const yes = await confirmDlg("删除这个孩子？", `${k.name} 的 ${nChars} 个汉字和学习记录会被删除，不能恢复。（成语是大家共用的，不受影响。）`, "删除", true);
    if (!yes) return; // cancelled: no "done" message
    const done = toast("正在删除…", 0, true);
    try {
      await api.update<M.KidsFile>("kids.json", M.EMPTY_KIDS, (cur) => ({ ...cur, kids: cur.kids.filter((x) => x.id !== k.id) }), `remove ${k.id}`);
      await api.remove(`kids/${k.id}.json`, `remove ${k.id}`);
      kidCache.delete(k.id);
      done();
      toast(`已删除 ${k.name}`);
      home();
    } catch (e) {
      done();
      toast(errText(e), 6000);
    }
  }
}

// ---------- entering a week ----------
async function enterDialog(k: M.Kid, focus: "chars" | "idioms" = "chars") {
  const kid = kidCache.get(k.id) ?? M.EMPTY_KID;
  const date = h("input", { type: "date", value: curWeek, "aria-label": "这一周的第一天（周日）" });
  const label = h("div", { class: "muted small" });
  const chars = h("textarea", { rows: 3, placeholder: "把这一周的汉字粘贴或输入在这里，空格、标点会自动去掉", "aria-label": "汉字" });
  const idi = h("textarea", { rows: 3, placeholder: "成语，每行一个（或用空格、逗号分开）", "aria-label": "成语" });
  const note1 = h("div", { class: "note", id: "note-chars" });
  const note2 = h("div", { class: "note", id: "note-idioms" });
  const save = h("button", { class: "primary" }, "保存");
  const weekStart = () => M.sundayOf(date.value || M.todayLocal());
  const learnedText = (list: { item: string; start: string }[]) =>
    list.map((x) => `${x.item}（第${M.weekNo(x.start, kidsFile.startWeek ?? weekStart())}周）`).join("、");
  const refresh = () => {
    const start = weekStart();
    label.textContent = `这一周：第${M.weekNo(start, M.pickStartWeek(kidsFile.startWeek, start))}周，${start} 起`;
    const c = M.checkChars(kid, start, M.parseChars(chars.value));
    const i = M.checkIdioms(idioms, start, M.parseIdioms(idi.value));
    const typedC = c.fresh.length + c.learned.length + c.inWeek.length;
    const typedI = i.fresh.length + i.learned.length + i.inWeek.length;
    note1.replaceChildren();
    note2.replaceChildren();
    if (typedC) note1.append(h("div", {}, `共 ${typedC} 个汉字，新的 ${c.fresh.length} 个`));
    if (c.learned.length) note1.append(h("div", { class: "warn" }, `已学过，保存时会跳过：${learnedText(c.learned)}`));
    if (c.inWeek.length) note1.append(h("div", { class: "muted" }, `这一周已经有了：${c.inWeek.join("")}`));
    if (typedI) note2.append(h("div", {}, `共 ${typedI} 个成语，新的 ${i.fresh.length} 个`));
    if (i.learned.length) note2.append(h("div", { class: "warn" }, `已学过，保存时会跳过：${learnedText(i.learned)}`));
    if (i.inWeek.length) note2.append(h("div", { class: "muted" }, `这一周已经有了：${i.inWeek.join("、")}`));
    save.disabled = c.fresh.length + i.fresh.length === 0;
  };
  for (const el of [date, chars, idi]) el.addEventListener("input", refresh);
  refresh();
  const ok = await modal<boolean>((close) => {
    save.addEventListener("click", () => close(true));
    queueMicrotask(() => (focus === "idioms" ? idi : chars).focus());
    return h("div", { class: "dlg wide-dlg" }, h("h2", {}, "录入这一周的内容"),
      h("label", {}, "这一周的第一天（周日）", date), label,
      h("label", {}, "汉字", chars), note1,
      h("label", {}, "成语（所有孩子共用）", idi), note2,
      h("div", { class: "row end" }, h("button", { onclick: () => close(null) }, "取消"), save));
  });
  if (!ok) return; // cancelled: no message
  const start = weekStart();
  const typedChars = M.parseChars(chars.value);
  const typedIdioms = M.parseIdioms(idi.value);
  const done = toast("正在保存…", 0, true);
  try {
    let addedC = 0, addedI = 0, skipped = 0;
    const newKid = await api.update<M.KidData>(`kids/${k.id}.json`, M.EMPTY_KID, (cur) => {
      const r = M.addChars(cur, start, typedChars);
      addedC = r.added;
      skipped = typedChars.length - r.added - M.checkChars(cur, start, typedChars).inWeek.length;
      return r.data;
    }, `${k.id} ${start}`);
    kidCache.set(k.id, newKid);
    if (typedIdioms.length) {
      idioms = await api.update<M.IdiomsFile>("idioms.json", M.EMPTY_IDIOMS, (cur) => {
        const r = M.addIdioms(cur, start, typedIdioms);
        addedI = r.added;
        skipped += typedIdioms.length - r.added - M.checkIdioms(cur, start, typedIdioms).inWeek.length;
        return r.data;
      }, `idioms ${start}`);
    }
    kidsFile = await api.update<M.KidsFile>("kids.json", M.EMPTY_KIDS, (cur) => {
      const sw = M.pickStartWeek(cur.startWeek, start);
      return sw === cur.startWeek ? cur : { ...cur, startWeek: sw };
    }, "start week");
    curWeek = start;
    done();
    toast(skipped ? `已保存：新增 ${addedC} 个汉字、${addedI} 个成语；另有 ${skipped} 个已学过，已跳过` : `已保存：新增 ${addedC} 个汉字、${addedI} 个成语`, 5000);
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
      h("p", { class: "muted" }, "每个孩子一个标签页（标签页的名字就是孩子的名字），每行一周：第一列是“第1周-2026-10-25”，后面是这一周的汉字。标签页“成语”放成语，格式一样。"),
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
      if (!n) lines.push(h("div", { class: "warn" }, "没有认出内容。第一列要写成“第1周-2026-10-25”，后面是汉字。"));
      else {
        lines.push(h("div", {}, e.kind === "idioms" ? `${n} 周，${e.total} 个成语，其中新的 ${e.added} 个` : `${n} 周，${e.total} 个汉字，其中新的 ${e.added} 个`));
        if (e.skipped) lines.push(h("div", { class: "warn" }, `已学过，会跳过：${e.skipped} 个（同一个字出现在多周时，只留最早的一周）`));
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
  const entries = I.plan(sheets, kidsFile, (id) => kidCache.get(id) ?? M.EMPTY_KID, idioms);
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
    toast(skipped ? `已导入：${chars} 个汉字、${idiomsAdded} 个成语；另有 ${skipped} 个已学过，已跳过` : `已导入：${chars} 个汉字、${idiomsAdded} 个成语`, 6000);
    void renderHome();
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
function renderSettings() {
  const lang = h("div", { class: "seg" },
    ...([["auto", "自动"], ...LANGS] as [LangPref, string][]).map(([v, name]) =>
      h("button", { class: settings.lang === v ? "on" : "", onclick: () => { settings.lang = v; saveSettings(); setLang(v); renderSettings(); } }, name)),
  );
  const pinyin = h("input", { type: "checkbox", checked: settings.pinyin, onchange: (e: Event) => { settings.pinyin = (e.target as HTMLInputElement).checked; saveSettings(); } });
  const a = api.getAuth();
  const account = api.isLocal()
    ? h("div", { class: "card" }, h("h3", {}, "数据保存位置"), h("p", {}, "这台设备（浏览器）里，不会上传。换设备或清除浏览器数据会丢失。"),
        h("button", { class: "wide", onclick: () => { api.leaveLocal(); restart(); } }, "改用 GitHub 私有仓库"))
    : h("div", { class: "card" }, h("h3", {}, "数据保存位置"), h("p", {}, "GitHub：", h("span", { class: "user" }, a?.repo ?? "")),
        h("button", { class: "wide", id: "qr-btn", onclick: showQr }, "登录到其他设备（二维码）"),
        h("button", { class: "wide danger", onclick: signOut }, "退出登录"));
  show(
    h("div", { class: "page" },
      topBar("设置", backBtn("#/", "完成")),
      h("main", { class: "scroll" }, h("div", { class: "narrow" },
        h("div", { class: "card" }, h("h3", {}, "语言"), lang),
        h("div", { class: "card" }, h("label", { class: "check" }, pinyin, "显示拼音（在“本周”和“已学”里）"), h("p", { class: "muted small" }, "拼音在本机生成，不联网。多音字只显示最常见的读音。")),
        account,
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
  const kid = /^#\/kid\/([\w-]+)(?:\/(learned))?$/.exec(hash);
  if (kid) return renderKid(kid[1], kid[2] ? "learned" : "week");
  if (hash === "#/settings") return renderSettings();
  return renderHome();
}

setLang(settings.lang);
window.addEventListener("hashchange", () => void route());
void route();
