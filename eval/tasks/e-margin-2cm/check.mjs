// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria();
  r.add("all margins 20 mm", after.secs.every(s => [s.mt, s.mb, s.ml, s.mr].every(m => near(m, 20, 0.6))), after.secs.map(s => [s.mt, s.mb, s.ml, s.mr].join("/")).join(","));
  r.add("text unchanged", JSON.stringify(after.final) === JSON.stringify(before.final), "");
  return r;
}
