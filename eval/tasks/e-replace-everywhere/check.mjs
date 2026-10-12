// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), all = texts(after).join(" ");
  r.add("no 'Durand' left", !/Durand/.test(all), "");
  r.add("3 x 'Mme Martin'", (all.match(/Mme Martin/g) || []).length === 3, (all.match(/Mme Martin/g) || []).length);
  r.add("tracked", tracked(after, ["TextRem"]) && tracked(after, ["TextAdd"]), "");
  return r;
}
