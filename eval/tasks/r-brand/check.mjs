import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
const close = (c, t) => c && c.every((v, i) => Math.abs(v - t[i]) <= 10);
export function check(before, after, run) {
  const r = criteria(), P = paras(after).filter(b => b.text.trim());
  const heads = P.filter(b => /^(Heading \d|Title)$/.test(b.style)), body = P.filter(b => b.style === "Normal");
  r.add("titles in Arial", heads.length >= 4 && heads.every(b => b.run && b.run.font === "Arial"), heads.map(b => b.run && b.run.font).join(","));
  r.add("titles in #1F3864", heads.every(b => b.run && close(b.run.color, [31, 56, 100])), heads.map(b => b.run && JSON.stringify(b.run.color)).join(","));
  r.add("body in Calibri 11", body.length >= 4 && body.every(b => b.run && b.run.font === "Calibri" && b.run.size === 11), body.map(b => b.run && b.run.font + " " + b.run.size).join(","));
  r.add("texts and styles unchanged", JSON.stringify(P.map(b => [b.style, b.text])) === JSON.stringify(paras(before).filter(b => b.text.trim()).map(b => [b.style, b.text])), "");
  r.add("tracked formatting, or style changes reported as not trackable", tracked(after, ["TextPr"]) || run.untrackedNote, "");
  return r;
}
