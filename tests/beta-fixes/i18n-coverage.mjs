#!/usr/bin/env node
// Locale coverage of the Mailings tab (all locales) and of the recent Word features (12 main locales).
//   node tests/beta-fixes/i18n-coverage.mjs [path to web-apps]   (default /srv/elixiroffice/DocumentServer/web-apps)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const root = process.argv[2] || path.join(os.homedir(), "elixiroffice/DocumentServer/web-apps");
const dir = path.join(root, "apps/documenteditor/main/locale");
const L = n => JSON.parse(fs.readFileSync(path.join(dir, n + ".json"), "utf8"));
const en = L("en");
const mailing = Object.keys(en).filter(k => k.startsWith("DE.Controllers.WordMailings."));
const main = ["fr", "de", "es", "it", "pt", "pt-pt", "nl", "ru", "pl", "ja", "zh"];
const recent = Object.keys(en).filter(k => /^DE\.Controllers\.(WordMailings|WordPanes|WordViews|ElixirDesign|ElixirInsert|ElixirReferences)\./.test(k) || k.startsWith("DE.Views.ElixirCommentMargin.") || k.startsWith("Common.Controllers.ElixirBrowserKeys."));
let fails = 0;
console.log("mailings keys", mailing.length, "recent keys", recent.length);
for (const f of fs.readdirSync(dir)) {
  const l = f.replace(".json", ""); if (l === "en") continue;
  const d = L(l);
  const missM = mailing.filter(k => !(k in d)).length;
  const missR = main.includes(l) ? recent.filter(k => !(k in d)).length : null;
  const same = mailing.filter(k => d[k] === en[k]).length;
  const bad = missM || missR;
  if (bad) fails++;
  console.log((bad ? "FAIL " : "PASS ") + l.padEnd(8) + "mailings missing " + missM + (missR === null ? "" : ", recent missing " + missR) + ", mailings identical to English " + same);
}
process.exit(fails ? 1 : 0);
