// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), a = answerText(run), n = (a.match(/\b\d+\b/g) || []).map(Number);
  r.add("answers 25 words (+-2)", n.some(x => x >= 23 && x <= 27), a.slice(0, 200));
  r.add("document unchanged", unchanged(before, after), "");
  return r;
}
