import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), d = paras(after).flatMap(b => b.drawings);
  r.add("one picture", d.length === 1, d.length);
  if (!d.length) return r;
  r.add("text wraps around it", /^(square|tight|through)$/.test(d[0].wrap), d[0].wrap);
  r.add("on the right", d[0].halign === "right", d[0].halign);
  r.add("texts kept", keptInOrder(before, after), "");
  return r;
}
