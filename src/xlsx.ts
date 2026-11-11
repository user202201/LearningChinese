/**
 * Reads an .xlsx workbook (Excel, or Google Sheets -> File -> Download -> Microsoft Excel) in the browser:
 * an .xlsx is a zip of XML files. Only what the import needs: sheet names and the values of the cells (text, numbers).
 */
import { strFromU8, unzipSync } from "fflate";

export type Cell = string | number | boolean | null;
export interface SheetData { name: string; rows: Cell[][] }

const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
/** "B" -> 1, "AA" -> 26 */
const colIndex = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
/** the text of a shared-string / inline-string element: all its <t> except phonetic hints (<rPh>) */
const textOf = (el: Element): string => {
  let s = "";
  for (const t of Array.from(el.getElementsByTagName("t"))) if (!t.closest("rPh")) s += t.textContent ?? "";
  return s;
};

export function readWorkbook(buf: ArrayBuffer): SheetData[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buf));
  } catch {
    throw new Error("读不了这个文件：它不是 .xlsx 表格。Google 表格请用 文件 → 下载 → Microsoft Excel (.xlsx)。");
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : null);
  const wb = text("xl/workbook.xml");
  if (!wb) throw new Error("读不了这个文件：它不是 .xlsx 表格。Google 表格请用 文件 → 下载 → Microsoft Excel (.xlsx)。");

  const rels = new Map<string, string>();
  const relsXml = text("xl/_rels/workbook.xml.rels");
  if (relsXml) for (const r of Array.from(xml(relsXml).getElementsByTagName("Relationship"))) rels.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");

  const shared: string[] = [];
  const ss = text("xl/sharedStrings.xml");
  if (ss) for (const si of Array.from(xml(ss).getElementsByTagName("si"))) shared.push(textOf(si));

  const out: SheetData[] = [];
  for (const sh of Array.from(xml(wb).getElementsByTagName("sheet"))) {
    if (sh.getAttribute("state") === "hidden" || sh.getAttribute("state") === "veryHidden") continue;
    const rid = sh.getAttributeNS(NS_REL, "id") ?? sh.getAttribute("r:id") ?? "";
    const target = rels.get(rid) ?? "";
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
    const data = text(path);
    if (!data) continue;
    const rows: Cell[][] = [];
    let rowNo = -1;
    for (const row of Array.from(xml(data).getElementsByTagName("row"))) {
      rowNo = row.hasAttribute("r") ? Number(row.getAttribute("r")) - 1 : rowNo + 1;
      let colNo = -1;
      for (const c of Array.from(row.getElementsByTagName("c"))) {
        const ref = /^([A-Z]+)/.exec(c.getAttribute("r") ?? "");
        colNo = ref ? colIndex(ref[1]) : colNo + 1;
        const t = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0]?.textContent ?? null;
        let val: Cell = null;
        if (t === "s") val = v === null ? null : shared[Number(v)] ?? null;
        else if (t === "inlineStr") val = textOf(c);
        else if (t === "str") val = v;
        else if (t === "b") val = v === "1";   // a checkbox (Google Sheets) or a TRUE / FALSE cell
        else if (t === "e") val = null;
        else if (v !== null && v !== "") val = Number.isNaN(Number(v)) ? v : Number(v);
        if (val === null || val === "") continue;   // (false is kept: an unticked box)
        (rows[rowNo] ??= [])[colNo] = val;
      }
    }
    out.push({ name: sh.getAttribute("name") ?? `Sheet${out.length + 1}`, rows: Array.from(rows, (r) => r ?? []) });
  }
  return out;
}

/** text copied from a spreadsheet (tab-separated, one line per row) or a .csv */
export function readTable(text: string): Cell[][] {
  const delim = text.includes("\t") ? "\t" : ",";
  return text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim()).map((l) => l.split(delim).map((x) => x.trim().replace(/^"(.*)"$/, "$1") || null));
}
