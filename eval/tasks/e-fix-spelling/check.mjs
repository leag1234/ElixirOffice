// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), all = norm(texts(after).join(" "));
  r.add("'sont aller' -> 'sont allés'", /sont allés/.test(all) && !/sont aller\b/.test(all), "");
  r.add("'Ils on' -> 'Ils ont'", /Ils ont beaucoup/.test(all), "");
  r.add("'apris' -> 'appris'", /appris/.test(all) && !/\bapris\b/.test(all), "");
  r.add("'des question' -> 'des questions'", /des questions/.test(all), "");
  r.add("'c'est très bien passée' -> 's'est'", /s'est très bien passée/.test(all), "");
  r.add("same paragraphs and styles", JSON.stringify(paras(after).map(b => b.style)) === JSON.stringify(paras(before).map(b => b.style)), "");
  r.add("tracked", tracked(after, ["TextRem"]), "");
  return r;
}
