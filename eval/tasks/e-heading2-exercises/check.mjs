// SPDX-License-Identifier: AGPL-3.0-only
import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
export function check(before, after, run) {
  const r = criteria(), P = paras(after);
  const ex = P.filter(b => /^Exercice/.test(b.text));
  r.add("the 4 exercise titles in Heading 2", ex.length === 4 && ex.every(b => b.style === "Heading 2"), ex.map(b => b.style).join(","));
  r.add("instructions stay Normal", P.filter(b => b.text.length > 25 && !/^Exercice|^Fiche/.test(b.text)).every(b => b.style === "Normal"), "");
  r.add("texts kept", keptInOrder(before, after), "");
  r.add("tracked", tracked(after, ["ParaPr"]), "");
  return r;
}
