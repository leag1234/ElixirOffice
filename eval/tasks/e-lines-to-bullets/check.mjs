import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
const L = ["une trousse complète", "un cahier de brouillon", "une règle de 30 cm", "des crayons de couleur"];
export function check(before, after, run) {
  const r = criteria(), P = paras(after);
  const it = L.map(t => P.find(b => norm(b.text).replace(/^[-–•]\s*/, "").replace(/[;.,]$/, "").toLowerCase() === t));
  r.add("the 4 lines are bullets", it.every(b => b && b.list === "bullet"), it.map(b => b && b.list).join(","));
  r.add("the lines around are not", P.filter(b => /^(Voici|Merci|Liste)/.test(b.text)).every(b => !b.list), "");
  return r;
}
