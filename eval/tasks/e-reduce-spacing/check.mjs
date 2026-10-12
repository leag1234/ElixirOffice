// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), body = paras(after).filter(b => b.text.length > 100);
  r.add("space after every body paragraph reduced (< 18 pt)", body.length === 5 && body.every(b => b.spaceAfter < 360 && b.spaceAfter >= 0), body.map(b => b.spaceAfter).join(","));
  r.add("texts unchanged", JSON.stringify(texts(after)) === JSON.stringify(texts(before)), "");
  r.add("tracked", tracked(after, ["ParaPr"]), "");
  return r;
}
