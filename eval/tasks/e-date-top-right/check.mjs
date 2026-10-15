import { criteria, paras, texts, norm, unchanged, keptInOrder, answerText, near, tracked } from "../../tools/checks.mjs";
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export function check(before, after, run) {
  const r = criteria(), d = new Date(), dd = d.getDate(), mm = d.getMonth() + 1, yy = d.getFullYear();
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const isDate = t => new RegExp("\\b" + dd + "(er)?\\s+" + MOIS[mm - 1], "i").test(t) || new RegExp(MONTHS[mm - 1] + "\\s+" + dd + "\\b", "i").test(t) || t.includes(String(dd).padStart(2, "0") + "/" + String(mm).padStart(2, "0") + "/" + yy) || t.includes(dd + "/" + mm + "/" + yy) || t.includes(yy + "-" + String(mm).padStart(2, "0"));
  const first = paras(after)[0];
  const inBody = first && isDate(first.text) && first.jc === "right";
  const inHeader = after.secs.some(s => isDate(s.header));
  r.add("today's date at the top, right aligned (or in the header)", inBody || inHeader, first && first.text + " / " + first.jc + " / header: " + after.secs[0].header);
  r.add("letter kept", keptInOrder(before, after), "");
  return r;
}
