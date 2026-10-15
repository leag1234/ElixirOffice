// UI polish checks (docs/ui.md, "Finitions") in Chromium, Firefox and WebKit at 1440x900, 2x:
//  - start page rail: no label text overflows its box or the rail (several languages,
//    disconnected and connected), account avatar fully visible;
//  - editor title bar avatar fully visible (Word, Excel, PowerPoint);
//  - ribbon group labels: baseline >= 4 px above the ribbon bottom border, descenders clear of
//    it, dialog launchers centred on the label line (every tab of the three editors).
// Optional screenshots: --shots <dir> --tag <before|after>.
//   EO_BASE      instance (default http://localhost:8080)
//   BROWSERS     comma list (default chromium,firefox,webkit)
//   NC_LOGIN_URL Nextcloud for the connected checks (default http://172.17.0.1:8191, local test
//                server of tests/nextcloud; NC_USER default alice); NC=0 skips them
// Usage: node tests/polish/ui-polish.mjs [--shots dir --tag after]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.EO_BASE || "http://localhost:8080";
const pw = createRequire(path.join(process.env.PW_DIR || path.join(os.homedir(), "elixiroffice/pw"), "package.json"))("playwright");
const BROWSERS = (process.env.BROWSERS || "chromium,firefox,webkit").split(",");
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const SHOTS = arg("--shots"), TAG = arg("--tag") || "shot";
const NC_SERVER = process.env.NC_LOGIN_URL || "http://172.17.0.1:8191";
const NC_USER = process.env.NC_USER || "alice";
const DOCS = {
  word: { file: "corpus/provisional/teachers/t01-fiche-fractions-cm1.docx", frame: "/documenteditor/main/", app: "DE" },
  excel: { file: "tests/fixtures/xlsx/c01-sales-report.xlsx", frame: "/spreadsheeteditor/main/", app: "SSE" },
  powerpoint: { file: "tests/fixtures/pptx/p01-cours-photosynthese.pptx", frame: "/presentationeditor/main/", app: "PE" },
};
const res = [];
const ok = (what, v, detail) => { res.push([what, !!v, detail]); console.log((v ? "ok   " : "FAIL ") + what + (detail && !v ? "  " + detail : "")); };
SHOTS && fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (page, name, clip) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${TAG}-${name}.png`), timeout: 120000, animations: "disabled", ...(clip ? { clip } : {}) });

async function upload(file) {
  const fd = new FormData();
  fd.append("uploadedFile", new Blob([fs.readFileSync(path.join(REPO, file))]), path.basename(file));
  const r = await fetch(BASE + "/example/upload", { method: "POST", body: fd });
  const j = await r.json();
  if (!j.filename) throw new Error("upload failed: " + JSON.stringify(j));
  return j.filename;
}

// an element fully visible: inside the viewport and every clipping ancestor (with a margin)
const VISIBLE = `(el, margin) => {
  if (!el) return "missing";
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return "too small " + r.width + "x" + r.height;
  if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return "outside the viewport " + JSON.stringify(r);
  for (let a = el.parentElement; a; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX === "visible" && cs.overflowY === "visible" && cs.clipPath === "none") continue;
    const p = a.getBoundingClientRect();
    if (r.left < p.left + margin - .5 || r.right > p.right - margin + .5 || r.top < p.top + margin - .5 || r.bottom > p.bottom - margin + .5)
      return "clipped by " + a.tagName + "." + String(a.className).slice(0, 40) + " " + JSON.stringify([p.left, p.top, p.right, p.bottom]) + " vs " + JSON.stringify([r.left, r.top, r.right, r.bottom]);
  }
  return "";
}`;

async function checkHome(page, label, bn) {
  const out = await page.evaluate(`(() => {
    const visible = ${VISIBLE};
    const rail = document.querySelector(".rail"), rr = rail.getBoundingClientRect();
    const errs = [];
    for (const item of rail.querySelectorAll(".rail-item")) {
      const ir = item.getBoundingClientRect();
      if (ir.left < rr.left - .5 || ir.right > rr.right + .5) errs.push("item outside rail: " + item.textContent.trim());
      for (const el of item.querySelectorAll("span")) {
        if (el.scrollWidth > el.clientWidth + 1) errs.push("overflow: " + el.textContent.trim() + " " + el.scrollWidth + ">" + el.clientWidth);
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode());) {
          const rg = document.createRange(); rg.selectNodeContents(n);
          for (const q of rg.getClientRects()) {
            if (q.left < ir.left - .5 || q.right > ir.right + .5 || q.left < rr.left || q.right > rr.left + rail.clientWidth + .5)
              errs.push("text outside its box: " + n.textContent.trim() + " " + JSON.stringify([q.left, q.right, ir.left, ir.right]));
          }
        }
      }
    }
    return { errs, avatar: visible(document.querySelector("#account-btn .avatar"), 0), ring: visible(document.querySelector("#account-btn"), 0),
      labels: [...rail.querySelectorAll(".rail-item span")].map(s => s.textContent.trim()) };
  })()`);
  ok(`${bn} start page ${label}: rail labels fit (${out.labels.join(" | ")})`, !out.errs.length, out.errs.join("; "));
  ok(`${bn} start page ${label}: avatar fully visible`, !out.avatar && !out.ring, out.avatar || out.ring);
}

// first visit: the page asks for a name; "Skip" saves the choice and reloads
async function skipProfile(page) {
  if (!(await page.evaluate(() => document.getElementById("profile-dialog") && document.getElementById("profile-dialog").open))) return;
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#profile-skip")]);
  await page.waitForTimeout(400);
}

async function connect(ctx, page) {
  const pass = fs.readFileSync(path.join(os.homedir(), ".config/elixiroffice/nc-dev.env"), "utf8").match(new RegExp("^NC_" + NC_USER.toUpperCase() + "_PASSWORD=(.*)$", "m"))[1].trim();
  await page.goto(BASE + "/example/?lang=en#connect", { waitUntil: "load" });
  await page.waitForTimeout(500);
  await skipProfile(page);
  if (!(await page.isVisible("#connect-server"))) await page.click("#connect-card [data-connect]");
  await page.fill("#connect-server", NC_SERVER);
  const [popup] = await Promise.all([ctx.waitForEvent("page"), page.click("#connect-submit")]);
  await popup.waitForURL(/login\/v2\/flow/, { timeout: 30000 });
  await popup.getByRole("button", { name: /log in/i }).first().click();
  await popup.waitForSelector("input[name=user]", { timeout: 30000 });
  await popup.fill("input[name=user]", NC_USER);
  await popup.fill("input[name=password]", pass);
  await popup.press("input[name=password]", "Enter");
  await popup.getByRole("button", { name: /grant access/i }).click({ timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById("connect-card") || document.getElementById("connect-card").hidden, null, { timeout: 60000 });
  await page.waitForLoadState("load");
}

// ribbon labels of the active tab
const LABELS = `(() => {
  const visible = ${VISIBLE};
  const bc = document.querySelector("#toolbar .box-controls");
  const bcr = bc.getBoundingClientRect(), bcs = getComputedStyle(bc);
  const inner = bcr.bottom - parseFloat(bcs.borderBottomWidth);
  const cv = document.createElement("canvas").getContext("2d");
  const rows = [];
  for (const g of document.querySelectorAll("#toolbar .box-panels > .panel.active > .group.group-label-owner")) {
    const gr = g.getBoundingClientRect();
    if (!gr.width || !g.offsetParent) continue;
    const a = getComputedStyle(g, "::after");
    if (a.display === "none" || a.content === "none") continue;
    const h = parseFloat(a.height), lh = parseFloat(a.lineHeight) || h, top = gr.bottom - parseFloat(a.bottom || 0) - h;
    cv.font = a.fontWeight + " " + a.fontSize + " " + a.fontFamily;
    const text = g.getAttribute("data-label") || "";
    const m = cv.measureText(text + "gjpqy");
    const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
    const lineTop = top + (h - lh) / 2;            // label box: single line, vertically centred
    const baseline = lineTop + (lh - (asc + desc)) / 2 + asc;
    const ink = baseline + m.actualBoundingBoxDescent;
    const row = { text, baselineGap: +(inner - baseline).toFixed(2), inkGap: +(inner - ink).toFixed(2), ribbonBottom: inner };
    const l = g.querySelector(":scope > .group-launcher");
    if (l && l.offsetParent) {
      const lr = l.getBoundingClientRect();
      row.launcherDy = +(((lr.top + lr.bottom) / 2) - (lineTop + lh / 2)).toFixed(2);
      row.launcherClip = visible(l, 0);
    }
    rows.push(row);
  }
  return rows;
})()`;

async function openEditor(page, kind, name) {
  const d = DOCS[kind];
  await page.goto(`${BASE}/example/editor?fileName=${encodeURIComponent(name)}&lang=en`, { waitUntil: "load" });
  let f;
  for (let i = 0; i < 400 && !f; i++) { f = page.frames().find(x => x.url().includes(d.frame)); if (!f) await page.waitForTimeout(250); }
  await f.waitForFunction((app) => { try { return window[app].getController("Main")._isDocReady === true; } catch (e) { return false; } }, d.app, { timeout: 120000 });
  await f.waitForTimeout(2000);
  return f;
}

async function checkEditor(page, bn, kind, name) {
  const f = await openEditor(page, kind, name);
  const av = await f.evaluate(`(() => { const v = ${VISIBLE}; const el = document.querySelector(".elx-account-btn"); return el ? v(el, 0) : "missing"; })()`);
  ok(`${bn} ${kind}: title bar avatar fully visible`, !av, av);
  await shot(page, `${bn}-${kind}`);
  await shot(page, `${bn}-${kind}-ribbon`, { x: 0, y: 0, width: 1000, height: 190 });
  const tabs = await f.evaluate(() => [...document.querySelectorAll("#toolbar .ribtab")].filter(t => t.offsetParent && !t.classList.contains("x-lone")).map(t => t.querySelector("a[data-tab]")).filter(Boolean).map(a => a.getAttribute("data-tab")).filter(t => t !== "file"));
  const bad = [], seen = [];
  let minB = 99, maxB = 0, minInk = 99;
  for (const t of tabs) {
    await f.evaluate((t) => { const a = document.querySelector(`#toolbar a[data-tab="${t}"]`); a && a.click(); }, t);
    await f.waitForTimeout(350);
    const rows = await f.evaluate(LABELS);
    for (const r of rows) {
      seen.push(r.text);
      minB = Math.min(minB, r.baselineGap); maxB = Math.max(maxB, r.baselineGap); minInk = Math.min(minInk, r.inkGap);
      if (r.baselineGap < 4 || r.baselineGap > 9) bad.push(`${t}/${r.text}: baseline ${r.baselineGap}px above the border`);
      if (r.inkGap < 2) bad.push(`${t}/${r.text}: descenders ${r.inkGap}px from the border`);
      if (r.launcherDy !== undefined && Math.abs(r.launcherDy) > 1.5) bad.push(`${t}/${r.text}: launcher off the label line by ${r.launcherDy}px`);
      if (r.launcherClip) bad.push(`${t}/${r.text}: launcher ${r.launcherClip}`);
    }
  }
  ok(`${bn} ${kind}: ${seen.length} group labels on ${tabs.length} tabs, baseline ${minB}-${maxB}px, descenders >= ${minInk}px above the border, launchers aligned`, seen.length > 5 && !bad.length, bad.slice(0, 6).join("; "));
  await f.evaluate(() => { const a = document.querySelector(`#toolbar a[data-tab="home"]`); a && a.click(); });
}

const names = {};
for (const k of Object.keys(DOCS)) names[k] = await upload(DOCS[k].file);
let state = null;
for (const bn of BROWSERS) {
  const browser = await pw[bn].launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (const lang of ["en", "fr", "de"]) {
      await page.goto(`${BASE}/example/?lang=${lang}`, { waitUntil: "load" });
      await page.waitForTimeout(400);
      await skipProfile(page);
      await checkHome(page, lang, bn);
      if (lang === "en") { await shot(page, `${bn}-home`); await shot(page, `${bn}-home-rail`, { x: 0, y: 0, width: 240, height: 640 }); await shot(page, `${bn}-home-avatar`, { x: 1200, y: 0, width: 240, height: 64 }); }
    }
    for (const k of Object.keys(DOCS)) await checkEditor(page, bn, k, names[k]);
    await ctx.close();
    if (process.env.NC !== "0") {
      const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...(state ? { storageState: state } : {}) });
      const p2 = await c2.newPage();
      if (!state) { await connect(c2, p2); state = await c2.storageState(); }
      for (const lang of ["en", "fr"]) {
        await p2.goto(`${BASE}/example/?lang=${lang}#cloud`, { waitUntil: "load" });
        await p2.waitForTimeout(1200);
        await checkHome(p2, "connected " + lang, bn);
        if (lang === "en") { await shot(p2, `${bn}-home-connected`); await shot(p2, `${bn}-home-connected-rail`, { x: 0, y: 0, width: 240, height: 640 }); }
      }
      // connected: the avatar is the Nextcloud picture
      for (const k of Object.keys(DOCS)) {
        const f = await openEditor(p2, k, names[k]);
        const av = await f.evaluate(`(() => { const v = ${VISIBLE}; const el = document.querySelector(".elx-account-btn"); if (!el) return "missing";
          const img = el.querySelector("img, .color-user-name"); return v(el, 0) || (img ? v(img, 0) : ""); })()`);
        ok(`${bn} ${k} connected: title bar avatar (picture) fully visible`, !av, av);
        await shot(p2, `${bn}-${k}-connected-titlebar`, { x: 1040, y: 0, width: 400, height: 80 });
      }
      await c2.close();
    }
  } catch (e) { ok(`${bn}: runner ${String(e).slice(0, 300)}`, false); }
  await browser.close();
}
const failed = res.filter(r => !r[1]).length;
console.log(`POLISH: ${res.length - failed}/${res.length} passed`);
process.exit(failed ? 1 : 0);
