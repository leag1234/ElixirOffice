// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), P = paras(after).filter(b => b.text.trim());
  r.add("at least 8 paragraphs written", P.length >= 8, P.length);
  const ex = P.filter(b => /exercice|^\s*\d+[.)]/i.test(b.text) || b.list === "numbered");
  r.add("at least 3 exercises", ex.length >= 3, ex.length);
  const key = P.findIndex(b => /corrig/i.test(b.text));
  const exBefore = P.slice(0, Math.max(0, key)).filter(b => /exercice|^\s*\d+[.)]/i.test(b.text) || b.list === "numbered").length;
  r.add("an answer key after the exercises", key > 0 && exBefore >= 3 && key < P.length - 1, key + " / exercises before: " + exBefore);
  r.add("structured with heading styles", P.filter(b => /^(Heading \d|Title)$/.test(b.style)).length >= 2, P.map(b => b.style).join(","));
  r.add("about the topic (fractions)", P.some(b => /fraction|\d\/\d/.test(b.text)), "");
  r.add("at most 2 pages", after.pages <= 2, after.pages);
  r.add("inserted as tracked changes", tracked(after, ["TextAdd", "ParaAdd"]), "");
  return r;
}
