/**
 * All data access of the app goes through this file (CLAUDE.md rule 4): `readJson` / `update`.
 * Two places can hold the data: a PRIVATE GitHub repository (default; the browser talks to the GitHub REST API directly
 * with a fine-grained token that only has Contents access to that one repo) or this device (localStorage, no account).
 * Another backend (offline cache, on-device database for the iOS app) can be added here without touching the UI.
 */
export interface Auth {
  token: string;
  repo: string; // owner/name
  branch?: string;
  user?: string;
}

const AUTH_KEY = "learn.auth.v1";
const MODE_KEY = "learn.storage";
const REPO_KEY = "learn.lastRepo";
const LOCAL_PREFIX = "learn.local.";

// ---------- storage mode: GitHub or this device ----------
export function isLocal(): boolean {
  try { return localStorage.getItem(MODE_KEY) === "local"; } catch { return false; }
}
export function useLocal() {
  try { localStorage.setItem(MODE_KEY, "local"); } catch { /* private mode: works until the tab is closed */ }
  try { void navigator.storage?.persist?.(); } catch { /* ask the browser not to clear it */ }
}
export function leaveLocal() {
  try { localStorage.removeItem(MODE_KEY); } catch { /* ignore */ }
}

// ---------- sign-in ----------
function readAuth(store: Storage): Auth | null {
  try {
    const a = JSON.parse(store.getItem(AUTH_KEY) ?? "null");
    return a?.token && a?.repo ? a : null;
  } catch {
    return null;
  }
}
/** "Stay signed in" lives in localStorage; otherwise only in sessionStorage (gone when the tab closes). */
export const getAuth = (): Auth | null => readAuth(sessionStorage) ?? readAuth(localStorage);
export const isPersistent = (): boolean => readAuth(localStorage) !== null;
export const lastRepo = (): string => { try { return localStorage.getItem(REPO_KEY) ?? ""; } catch { return ""; } };
/** signed in (GitHub) or using this device */
export const isSignedIn = (): boolean => isLocal() || getAuth() !== null;
export function logout() {
  for (const st of [localStorage, sessionStorage]) {
    try { st.removeItem(AUTH_KEY); } catch { /* ignore */ }
  }
  shas.clear();
}

/** A link that signs another device in: the token travels in the URL #fragment (never sent to any server). */
export function makeLoginLink(a: Auth): string {
  const payload = btoa(JSON.stringify({ t: a.token, r: a.repo })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${location.origin}${location.pathname}#/link/${payload}`;
}
export function parseLink(text: string): { token: string; repo: string } | null {
  const m = text.match(/#\/link\/([\w-]+)/);
  if (!m) return null;
  try {
    const o = JSON.parse(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")));
    return o.t && o.r ? { token: o.t, repo: o.r } : null;
  } catch {
    return null;
  }
}

export class AuthExpired extends Error {}
/** An API failure with what GitHub said about it (shown to the user, not swallowed). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public detail = "") {
    super(message);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function headers(a: Auth): HeadersInit {
  return { Authorization: `Bearer ${a.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
}

async function gh(a: Auth, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response | undefined;
  let why = "";
  // a dropped connection (phone on cellular / flaky Wi-Fi) is retried before giving up
  for (let i = 0; i < 3 && !res; i++) {
    try {
      res = await fetch(url, init);
    } catch (e) {
      why = e instanceof Error ? e.message : String(e);
      await sleep(600 * (i + 1));
    }
  }
  if (!res) throw new ApiError(`网络请求失败（${why || "未知"}）：网络断了或被拦截，数据没有保存。`, 0);
  if (res.status === 401) {
    logout();
    throw new AuthExpired("登录已失效，请重新登录");
  }
  return res;
}

/** Validate token + repo, then remember them on this device. */
export async function login(token: string, repo: string, remember = true): Promise<Auth> {
  const link = parseLink(token);
  if (link) ({ token, repo } = link);
  repo = repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
  token = token.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("仓库格式应为 owner/name");
  if (!token) throw new Error("请输入令牌");
  const a: Auth = { token, repo };
  const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: headers(a) });
  if (r.status === 401) throw new Error("令牌无效或已过期");
  if (r.status === 404) throw new Error("找不到该仓库，或令牌没有访问它的权限");
  if (!r.ok) throw new Error(`GitHub 返回 ${r.status}`);
  const info = (await r.json()) as { permissions?: { push?: boolean }; default_branch: string; private: boolean };
  if (!info.permissions?.push) throw new Error("令牌没有该仓库的写权限（需要 Contents: Read and write）");
  if (!info.private && !location.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
    throw new Error("该仓库是公开的，学习记录会被所有人看到。请使用私有仓库。");
  }
  a.branch = info.default_branch;
  // not another app's data: the piano app keeps its scores in scores/ inbox/ pdfs/ — this app would mix its files into that repository
  const root = await fetch(`https://api.github.com/repos/${repo}/contents?ref=${encodeURIComponent(a.branch)}`, { headers: headers(a) });
  if (root.ok) {
    const items = (await root.json()) as { name: string; type: string }[];
    if (Array.isArray(items) && items.some((i) => i.type === "dir" && ["scores", "inbox", "pdfs"].includes(i.name))) {
      throw new Error("这是钢琴练习项目的谱子仓库，不能用来存识字数据。请换一个专门的私有仓库（例如 LearningData）。");
    }
  }
  const u = await fetch("https://api.github.com/user", { headers: headers(a) });
  if (u.ok) a.user = ((await u.json()) as { login: string }).login;
  logout();
  leaveLocal();
  (remember ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify(a));
  try { localStorage.setItem(REPO_KEY, repo); } catch { /* ignore */ }
  return a;
}

function need(): Auth {
  const a = getAuth();
  if (!a) throw new AuthExpired("请先登录");
  return a;
}
const contentsUrl = (a: Auth, path: string) =>
  `https://api.github.com/repos/${a.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
const refQ = (a: Auth) => `?ref=${encodeURIComponent(a.branch ?? "main")}`;

// UTF-8 <-> base64 (btoa/atob only handle Latin-1)
function toB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// the sha of the version we last read, per file (GitHub needs it to accept a change)
const shas = new Map<string, string>();

async function ghRead(path: string): Promise<{ text: string; sha: string } | null> {
  const a = need();
  const r = await gh(a, contentsUrl(a, path) + refQ(a), { headers: headers(a), cache: "no-store" });
  if (r.status === 404) {
    shas.delete(path);
    return null;
  }
  if (!r.ok) throw new ApiError(`读取失败（${r.status}）`, r.status);
  const j = (await r.json()) as { sha: string; content?: string };
  shas.set(path, j.sha);
  return { text: fromB64(j.content ?? ""), sha: j.sha };
}

async function ghWrite(path: string, text: string, sha: string | undefined, message: string): Promise<void> {
  const a = need();
  const body: Record<string, unknown> = { message, content: toB64(text), branch: a.branch ?? "main" };
  if (sha) body.sha = sha;
  const r = await gh(a, contentsUrl(a, path), { method: "PUT", headers: { ...headers(a), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) throw new ApiError("conflict", r.status);
  if (!r.ok) {
    let detail = "";
    try { detail = ((await r.json()) as { message?: string }).message ?? ""; } catch { /* not JSON */ }
    throw new ApiError(`保存失败（${r.status}）${detail ? `：${detail}` : ""}`, r.status, detail);
  }
  const j = (await r.json().catch(() => ({}))) as { content?: { sha?: string } };
  if (j.content?.sha) shas.set(path, j.content.sha);
}

// ---------- public API ----------
/** Read one JSON file; `null` when it does not exist yet. */
export async function readJson<T>(path: string): Promise<T | null> {
  if (isLocal()) {
    try {
      const s = localStorage.getItem(LOCAL_PREFIX + path);
      return s ? (JSON.parse(s) as T) : null;
    } catch {
      return null;
    }
  }
  const f = await ghRead(path);
  return f ? (JSON.parse(f.text) as T) : null;
}

/**
 * Read-modify-write one JSON file: reads the newest version (or `init` when there is none), applies `change`, saves.
 * When another device changed the file in between (GitHub answers 409 / 422) it reads again and re-applies `change`,
 * so edits from two devices are merged instead of overwritten.
 */
export async function update<T>(path: string, init: T, change: (cur: T) => T, message = "update"): Promise<T> {
  if (isLocal()) {
    const cur = (await readJson<T>(path)) ?? structuredClone(init);
    const next = change(cur);
    try {
      localStorage.setItem(LOCAL_PREFIX + path, JSON.stringify(next));
    } catch {
      throw new Error("本机存储已满或被浏览器禁止，数据没有保存。");
    }
    return next;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const f = await ghRead(path);
    const cur = f ? (JSON.parse(f.text) as T) : structuredClone(init);
    const next = change(cur);
    try {
      await ghWrite(path, JSON.stringify(next, null, 2) + "\n", f?.sha, message);
      return next;
    } catch (e) {
      if (e instanceof ApiError && e.message === "conflict" && attempt < 3) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      if (e instanceof ApiError && e.message === "conflict") throw new Error("另一台设备正在同时修改，请稍后再试。");
      throw e;
    }
  }
  throw new Error("保存失败");
}

/** Delete one file (nothing happens when it does not exist). */
export async function remove(path: string, message = "delete"): Promise<void> {
  if (isLocal()) {
    try { localStorage.removeItem(LOCAL_PREFIX + path); } catch { /* ignore */ }
    return;
  }
  const f = await ghRead(path);
  if (!f) return;
  const a = need();
  const r = await gh(a, contentsUrl(a, path), {
    method: "DELETE",
    headers: { ...headers(a), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha: f.sha, branch: a.branch ?? "main" }),
  });
  if (!r.ok && r.status !== 404) throw new ApiError(`删除失败（${r.status}）`, r.status);
  shas.delete(path);
}
