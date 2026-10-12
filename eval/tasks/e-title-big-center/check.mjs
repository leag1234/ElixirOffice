// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), b = paras(after)[0];
  r.add("title text unchanged", b.text === "La récitation de la semaine", b.text);
  r.add("centred", b.jc === "center", b.jc);
  r.add("big (>= 16 pt)", b.run && b.run.size >= 16, b.run && b.run.size);
  r.add("other paragraphs unchanged", JSON.stringify(paras(after).slice(1).map(x => [x.text, x.jc, x.style])) === JSON.stringify(paras(before).slice(1).map(x => [x.text, x.jc, x.style])), "");
  r.add("tracked", tracked(after, ["ParaPr", "TextPr"]), "");
  return r;
}
