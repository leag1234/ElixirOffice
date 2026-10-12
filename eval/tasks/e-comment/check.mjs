// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), c = after.comments;
  r.add("one comment added", c.length === before.comments.length + 1, c.length);
  r.add("it asks for a source", c.some(x => /source/i.test(x.text)), c.map(x => x.text).join(" | "));
  r.add("on the Paris paragraph", c.some(x => /Paris|inhabitants|1200/.test(x.quote)), c.map(x => x.quote).join(" | "));
  r.add("text unchanged", JSON.stringify(texts(after)) === JSON.stringify(texts(before)), "");
  return r;
}
