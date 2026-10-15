import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), t = after.final.find(b => b.type === "table");
  if (!r.add("the table is there", t, "")) return r;
  r.add("header row stays first", (t.cells[0] || []).join("|") === "Name|Age|Group", (t.cells[0] || []).join("|"));
  const names = t.cells.slice(1).map(c => c[0]);
  r.add("rows sorted by name", names.join(",") === "Adam,Hugo,Lina,Mila,Zoé", names.join(","));
  r.add("rows kept whole", t.cells.slice(1).map(c => c.join("|")).sort().join(";") === ["Adam|10|A", "Hugo|10|B", "Lina|9|C", "Mila|9|A", "Zoé|9|B"].join(";"), t.cells.slice(1).map(c => c.join("|")).join(";"));
  return r;
}
