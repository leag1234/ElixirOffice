import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria();
  r.add("input was longer than one page", before.pages > 1, before.pages);
  r.add("now one page", after.pages === 1, after.pages);
  r.add("all texts kept, in order", keptInOrder(before, after) && texts(after).length === texts(before).length, texts(after).length);
  const sizes = paras(after).filter(b => b.text.length > 100 && b.run).map(b => b.run.size);
  r.add("body text stays readable (>= 9 pt)", sizes.every(s => s >= 9), sizes.join(","));
  return r;
}
