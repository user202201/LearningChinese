/** Pinyin of one character, made on this device (pinyin-pro is loaded only when it is first needed). */
let fn: ((ch: string) => string) | null = null;
let loading: Promise<void> | null = null;

export function loadPinyin(): Promise<void> {
  return (loading ??= import("pinyin-pro")
    .then((m) => { fn = (ch) => m.pinyin(ch); })
    .catch(() => { loading = null; }));
}
/** the pinyin of a character, or "" while the library is not loaded (call loadPinyin() first) */
export const pinyinOf = (ch: string): string => (fn ? fn(ch) : "");
