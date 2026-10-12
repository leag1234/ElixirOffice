// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), top = texts(after).slice(0, 3).join(" | ");
  r.add("a 'Nom' field near the top", /nom/i.test(top), top);
  r.add("a 'Date' field near the top", /date/i.test(top), top);
  r.add("evaluation kept", keptInOrder(before, after), "");
  r.add("tracked insertion", tracked(after, ["TextAdd", "ParaAdd"]), "");
  return r;
}
