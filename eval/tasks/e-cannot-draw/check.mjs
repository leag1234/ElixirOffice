// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria();
  r.add("says it cannot (cannot_do)", run.cannotDo, run.status + " / " + run.summary);
  r.add("one-click suggestion offered", !!run.suggestion, run.suggestion);
  r.add("document unchanged", unchanged(before, after), "");
  return r;
}
