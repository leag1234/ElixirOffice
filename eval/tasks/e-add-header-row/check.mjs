// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
const DATA = [["The Little Prince", "Saint-Exupéry", "Emma"], ["Matilda", "Roald Dahl", "Noah"], ["Pinocchio", "Collodi", "Lina"]];
export function check(before, after, run) {
  const r = criteria(), t = after.final.find(b => b.type === "table");
  if (!r.add("the table is there", t, "")) return r;
  const h = t.cells[0] || [];
  r.add("new first row with 3 labels", t.cells.length === 4 && h.length === 3 && h.every(Boolean) && !DATA.some(d => d.join() === h.join()), h.join("|"));
  r.add("header marked (repeat or bold)", t.header || t.firstRowBold, t.header + "/" + t.firstRowBold);
  r.add("data rows kept in order", DATA.every((d, i) => (t.cells[i + 1] || []).join("|") === d.join("|")), "");
  return r;
}
