// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria();
  r.add("every section in landscape", after.secs.every(s => s.w > s.h), after.secs.map(s => s.w + "x" + s.h).join(","));
  r.add("text unchanged", JSON.stringify(after.final) === JSON.stringify(before.final), "");
  return r;
}
