import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), P = paras(after);
  const ex = P.filter(b => /Exercice/.test(b.text));
  r.add("4 exercise titles", ex.length === 4, ex.length);
  const numbered = ex.every(b => b.list === "numbered");
  const nums = ex.map(b => (/(?:^|Exercice\s*(?:n°\s*)?)(\d+)/.exec(b.text) || [])[1]);
  const inText = nums.join(",") === "1,2,3,4";
  r.add("exercises numbered 1 to 4 (list numbering or text)", numbered || inText, numbered ? "list" : nums.join(","));
  r.add("other paragraphs not numbered", P.filter(b => !/Exercice/.test(b.text) && b.text.trim()).every(b => !b.list), "");
  r.add("instructions kept", keptInOrder(before, after, texts(before).filter(t => !/Exercice/.test(t))), "");
  return r;
}
