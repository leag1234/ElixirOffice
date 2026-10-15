import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
const H1 = ["1. Diagnostic", "2. Objectifs", "3. Actions et calendrier"];
const H2 = ["1.1 Résultats des évaluations", "1.2 Climat scolaire", "2.1 Lecture et écriture", "2.2 Mathématiques"];
export function check(before, after, run) {
  const r = criteria(), P = paras(after);
  const style = t => (P.find(b => norm(b.text) === t) || {}).style;
  r.add("section titles in Heading 1", H1.every(t => style(t) === "Heading 1"), H1.map(style).join(", "));
  r.add("sub-section titles in Heading 2", H2.every(t => style(t) === "Heading 2"), H2.map(style).join(", "));
  r.add("body paragraphs stay Normal", P.filter(b => b.text.length > 120).every(b => b.style === "Normal"), "");
  const toc = after.final.find(b => b.type === "blockLvlSdt" && b.toc);
  if (!r.add("a real table of contents field exists", toc, after.final.map(b => b.type).join(","))) return r;
  const e1 = toc.entries.filter(e => e.style === "toc 1").map(e => norm(e.text.split("\t")[0]));
  const e2 = toc.entries.filter(e => e.style === "toc 2").map(e => norm(e.text.split("\t")[0]));
  r.add("TOC level 1 entries = the 3 sections, in order", JSON.stringify(e1) === JSON.stringify(H1), e1.join(" | "));
  r.add("TOC level 2 entries = the 4 sub-sections, in order", JSON.stringify(e2) === JSON.stringify(H2), e2.join(" | "));
  const first = after.final.findIndex(b => b.type === "paragraph" && norm(b.text) === H1[0]);
  r.add("TOC placed before the first section", after.final.indexOf(toc) < first, after.final.indexOf(toc) + " < " + first);
  r.add("all texts kept", keptInOrder(before, after), "");
  r.add("headings recorded as tracked changes", tracked(after, ["ParaPr"]), "");
  return r;
}
