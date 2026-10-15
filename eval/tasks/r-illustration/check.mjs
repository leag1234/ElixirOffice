import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), P = paras(after), b = P[1] || {};
  r.add("a picture right after the title", P[0] && P[0].text === "Les probabilités avec des dés" && b.drawings && b.drawings.length === 1, JSON.stringify(b.drawings));
  if (!b.drawings || !b.drawings.length) return r;
  r.add("80 mm wide", near(b.drawings[0].w, 80, 2), b.drawings[0].w);
  r.add("aspect ratio kept (800x600)", near(b.drawings[0].h, 60, 2.5), b.drawings[0].h);
  r.add("centred", b.jc === "center" || b.drawings[0].halign === "center", b.jc + "/" + b.drawings[0].halign);
  r.add("texts kept", keptInOrder(before, after), "");
  return r;
}
