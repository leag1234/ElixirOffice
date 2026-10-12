// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria();
  r.add("every section is A5 portrait", after.secs.every(s => near(s.w, 148, 1.5) && near(s.h, 210, 1.5)), after.secs.map(s => s.w + "x" + s.h).join(","));
  const tw = Math.min(...after.secs.map(s => s.w - s.ml - s.mr));
  const pics = paras(after).flatMap(b => b.drawings);
  r.add("pictures fit the text column", pics.length > 0 && pics.every(d => d.w <= tw + 0.6), pics.map(d => d.w).join(",") + " <= " + tw.toFixed(1));
  const tables = after.final.filter(b => b.type === "table");
  r.add("tables fit the text column", tables.every(t => !t.widthMm || t.widthMm <= tw + 1.5), tables.map(t => t.widthMm).join(",") + " <= " + tw.toFixed(1));
  r.add("plausible page count (1-6)", after.pages >= 1 && after.pages <= 6, after.pages);
  r.add("all texts kept", keptInOrder(before, after), "");
  r.add("says how to print 2 per sheet", /(2|deux|two)\s*(pages?\s*)?(par|per|sur une?|on one|à la)\s*(feuille|sheet|page)|pages par feuille|livret|booklet/i.test(answerText(run)), answerText(run).slice(0, 200));
  return r;
}
