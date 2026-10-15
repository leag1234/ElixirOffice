import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria();
  r.add("a PAGE field in the footer", after.secs[0].footerHasPage, after.secs[0].footer);
  r.add("body unchanged", JSON.stringify(texts(after)) === JSON.stringify(texts(before)), "");
  return r;
}
