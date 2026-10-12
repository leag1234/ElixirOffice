// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
const FR = /\b(le|la|les|des|nous|vous|et|est|sont|à|aux|du|une|doivent)\b/i, EN = /\b(the|and|to|of|we|will|at|must|are|is|back|bring|parents|museum|school)\b/i;
export function check(before, after, run) {
  const r = criteria(), A = paras(after).filter(b => b.text.trim()), B = paras(before).filter(b => b.text.trim());
  r.add("same number of paragraphs", A.length === B.length, A.length + "/" + B.length);
  if (A.length !== B.length) return r;
  r.add("same styles and bullets", A.every((b, i) => b.style === B[i].style && b.list === B[i].list), A.map(b => b.style + (b.list ? "*" : "")).join(","));
  r.add("every text changed", A.every((b, i) => norm(b.text) !== norm(B[i].text)), "");
  r.add("in English", A.every(b => !FR.test(b.text) || b.text.length < 25) && A.filter(b => EN.test(b.text)).length >= 4, A.map(b => b.text).join(" | ").slice(0, 300));
  r.add("tracked changes", tracked(after, ["TextRem"]) && tracked(after, ["TextAdd"]), "");
  return r;
}
