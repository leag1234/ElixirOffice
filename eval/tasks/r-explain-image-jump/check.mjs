// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), a = answerText(run);
  r.add("explains with the size / remaining space", /(place|espace|hauteur|haute|grande|tient pas|tenir|rentre|bas de (la )?page|reste|suffisa|space|room|fit|tall|mm)/i.test(a), a.slice(0, 240));
  r.add("the document is not changed", unchanged(before, after), "");
  return r;
}
