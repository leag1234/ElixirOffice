import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
const ITEMS = [["Lucas", "14/20", "Très bien"], ["Emma", "17/20", "Excellent"], ["Noah", "11/20", "Assez bien"], ["Chloé", "15/20", "Très bien"]];
export function check(before, after, run) {
  const r = criteria(), t = after.final.filter(b => b.type === "table");
  if (!r.add("one table", t.length === 1, t.length)) return r;
  const T = t[0];
  r.add("5 rows x 3 columns", T.cells.length === 5 && T.cells.every(c => c.length === 3), T.cells.length);
  const h = T.cells[0] || [];
  r.add("header row with labels (not a data row)", h.length === 3 && h.every(Boolean) && !ITEMS.some(i => i.join() === h.join()), h.join("|"));
  r.add("header marked (repeat or bold)", T.header || T.firstRowBold, T.header + "/" + T.firstRowBold);
  r.add("data rows = the items in order", ITEMS.every((it, i) => (T.cells[i + 1] || []).join("|") === it.join("|")), T.cells.slice(1).map(c => c.join("/")).join("; "));
  r.add("list gone, other text kept", !texts(after).some(x => /Lucas –/.test(x)) && texts(after).includes("Prochaine dictée lundi."), "");
  return r;
}
