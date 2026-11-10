/** Small DOM helpers: element builder, the one message band (toast) and dialogs. */

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...kids: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if ((k.startsWith("data-") || k.startsWith("aria-")) && v !== undefined && v !== false) el.setAttribute(k, String(v));
    else if (v !== undefined && v !== false) (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const k of kids) if (k) el.append(k);
  return el;
}

/**
 * The one place where the app tells you what is going on (CLAUDE.md rule 10): a message in the top band, above everything
 * (also above dialogs). `working` = something is still in progress (spinner, stays until closed with the returned function,
 * then the result is shown with a normal toast). Messages are tap-to-dismiss.
 */
export const toast = (msg: string, ms = 3500, working = false): (() => void) => {
  if (working) {
    const same = [...document.querySelectorAll("#toasts .toast.working")].find((x) => x.textContent === msg);
    if (same) return () => same.remove();
  }
  const t = h("div", { class: "toast" + (working ? " working" : "") }, ...(working ? [h("div", { class: "spin small" })] : []), h("span", {}, msg));
  t.addEventListener("click", () => t.remove());
  let box = document.getElementById("toasts");
  if (!box) {
    box = h("div", { id: "toasts" });
    box.setAttribute("popover", "manual"); // top layer: stays visible above open dialogs
    document.body.append(box);
  }
  box.append(t);
  try {
    box.hidePopover?.();
    box.showPopover?.();
  } catch { /* browsers without popover: the fixed position still shows it */ }
  if (!working) setTimeout(() => t.remove(), ms);
  return () => t.remove();
};

/** A modal dialog. `build` gets a `close(result)` function and returns the content. Resolves with what was passed to close (`null` = cancelled). */
export function modal<T>(build: (close: (v: T | null) => void) => HTMLElement): Promise<T | null> {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: "center" });
    let result: T | null = null;
    const close = (v: T | null) => {
      result = v;
      dlg.close();
    };
    dlg.append(build(close));
    dlg.addEventListener("close", () => {
      dlg.remove();
      resolve(result);
    });
    dlg.addEventListener("cancel", () => (result = null)); // Esc
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Asks for a line of text. `null` when cancelled. */
export const askText = (title: string, label: string, initial = "", okText = "确定"): Promise<string | null> =>
  modal<string>((close) => {
    const input = h("input", { type: "text", value: initial, maxLength: 20, autocomplete: "off", "aria-label": label });
    const ok = h("button", { class: "primary", onclick: () => input.value.trim() && close(input.value.trim()) }, okText);
    input.addEventListener("keydown", (e) => e.key === "Enter" && ok.click());
    queueMicrotask(() => input.focus());
    return h("div", { class: "dlg" }, h("h2", {}, title), h("label", {}, label, input), h("div", { class: "row end" }, h("button", { onclick: () => close(null) }, "取消"), ok));
  });

/** A yes / no question. Resolves true only when confirmed. */
export const confirmDlg = async (title: string, message: string, okText: string, danger = false): Promise<boolean> =>
  !!(await modal<boolean>((close) =>
    h("div", { class: "dlg confirm" }, h("h2", {}, title), h("p", {}, message),
      h("div", { class: "row end" }, h("button", { onclick: () => close(null) }, "取消"), h("button", { class: danger ? "danger" : "primary", onclick: () => close(true) }, okText)))));
