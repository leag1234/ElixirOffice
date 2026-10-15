import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), orig = texts(before), all = texts(after).map(norm);
  r.add("original worksheet kept at the top", orig.every((t, i) => all[i] === norm(t)), "");
  const added = paras(after).filter(b => b.text.trim()).slice(orig.length);
  r.add("an easier version added after it (>= 5 paragraphs)", added.length >= 5, added.length);
  r.add("the new version has a title saying what it is", added.some(b => /facile|niveau|simplifi|version|adapt|différenci|soutien/i.test(b.text) && (/^(Heading|Title)/.test(b.style) || (b.run && b.run.bold))), added.slice(0, 2).map(b => b.style + ":" + b.text).join(" | "));
  r.add("at least 3 exercises in it", added.filter(b => /exercice/i.test(b.text) || b.list === "numbered").length >= 3, "");
  r.add("tracked insertions", tracked(after, ["TextAdd", "ParaAdd"]), "");
  return r;
}
