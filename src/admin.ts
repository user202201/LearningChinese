// The admin password: asked for when Admin mode is switched on (set the first time). Kept ON THIS DEVICE only, as a salted hash (never the password itself).
// This keeps children away from delete / import / sign-out; it is not a security boundary against someone who owns the device (they can clear the browser data).
const KEY = "learn.admin.v1";
interface Stored { salt: string; hash: string }

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hashPw(pw: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const key = await subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    return hex(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256));
  }
  // an insecure context without Web Crypto: a plain (weaker) mixing, so the feature still works
  let a = 0x811c9dc5;
  for (const c of salt + "|" + pw) { a ^= c.charCodeAt(0); a = Math.imul(a, 0x01000193) >>> 0; }
  return "f" + a.toString(16);
}

const read = (): Stored | null => { try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); return s && s.salt && s.hash ? s : null; } catch { return null; } };

export const hasAdminPassword = () => !!read();
export const MIN_LEN = 4;

export async function setAdminPassword(pw: string): Promise<void> {
  const salt = hex(globalThis.crypto?.getRandomValues(new Uint8Array(16)) ?? new Uint8Array(16).map(() => Math.random() * 256));
  const hash = await hashPw(pw, salt);
  try { localStorage.setItem(KEY, JSON.stringify({ salt, hash })); } catch { /* private mode */ }
}

export async function checkAdminPassword(pw: string): Promise<boolean> {
  const s = read();
  return !!s && (await hashPw(pw, s.salt)) === s.hash;
}
