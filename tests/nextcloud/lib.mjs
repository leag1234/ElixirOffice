// Helpers of the Nextcloud suites (docs/storage.md): a local Nextcloud started by
// tools/nextcloud-app/setup.sh and an ElixirOffice document server.
//   NC_BASE   Nextcloud as the browser sees it (default http://localhost:8191)
//   NC_ENV    secrets written by setup.sh (default ~/.config/elixiroffice/nc-dev.env)
//   EO_BASE   ElixirOffice instance (default http://localhost:8190)
// Passwords are read from NC_ENV and never printed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import zlib from "node:zlib";

export const NC = process.env.NC_BASE || "http://localhost:8191";
export const EO = process.env.EO_BASE || "http://localhost:8190";
const PW_DIR = process.env.PW_DIR || path.join(os.homedir(), "elixiroffice/pw");
export const { chromium } = createRequire(path.join(PW_DIR, "package.json"))("playwright");
const ENV = process.env.NC_ENV || path.join(os.homedir(), ".config/elixiroffice/nc-dev.env");

export function password(user) {
  const m = fs.readFileSync(ENV, "utf8").match(new RegExp("^NC_" + user.toUpperCase() + "_PASSWORD=(.*)$", "m"));
  if (!m) throw new Error("no password for " + user + " in " + ENV);
  return m[1].trim();
}
const auth = (user) => "Basic " + Buffer.from(user + ":" + password(user)).toString("base64");

export async function dav(user, method, p, body, headers = {}, base = NC) {
  const url = base + "/remote.php/dav/files/" + encodeURIComponent(user) + p.split("/").map(encodeURIComponent).join("/");
  return fetch(url, { method, body, headers: { Authorization: auth(user), ...headers } });
}
export async function fileId(user, p, base = NC) {
  const r = await dav(user, "PROPFIND", p, `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/><d:getetag/></d:prop></d:propfind>`, { Depth: "0" }, base);
  const x = await r.text();
  return { id: (x.match(/<oc:fileid>(\d+)</) || [])[1], etag: (x.match(/<d:getetag>([^<]+)</) || [])[1] };
}
export async function ocs(user, method, p, form, base = NC) {
  const r = await fetch(base + "/ocs/v2.php" + p + (p.includes("?") ? "&" : "?") + "format=json", {
    method, headers: { Authorization: auth(user), "OCS-APIRequest": "true", ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  return r.json();
}
export async function share(owner, p, withUser, base = NC) {
  return ocs(owner, "POST", "/apps/files_sharing/api/v1/shares", { path: p, shareType: "0", shareWith: withUser, permissions: "31" }, base);
}

export async function newPage(browser, errors, name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 1366, height: opts.h || 860 }, locale: opts.locale || "en-US" });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(name + " pageerror: " + String(e).slice(0, 300)));
  return { ctx, page };
}

// sign in on the Nextcloud login page (the only place a password is typed)
export async function ncLogin(page, user, base = NC) {
  await page.goto(base + "/index.php/login", { waitUntil: "domcontentloaded" });
  await page.fill("input[name=user]", user);
  await page.fill("input[name=password]", password(user));
  await Promise.all([page.waitForURL(u => !String(u).includes("/login"), { timeout: 60000 }), page.press("input[name=password]", "Enter")]);
}

export async function editorFrame(page, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const f of page.frames()) {
      if (/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url())) {
        try {
          const ok = await f.evaluate(() => { try { return window.DE ? DE.getController("Main")._isDocReady === true : false; } catch (e) { return false; } });
          if (ok) return f;
        } catch (e) { /* navigating */ }
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error("editor not ready");
}


// builder-API code through api.callCommand (as the AI harness does)
export async function cmd(f, source) {
  return f.evaluate(src => new Promise(resolve => Asc.editor.callCommand(src, true, r => resolve(r))), source);
}
export async function docText(f) {
  return cmd(f, `(function(){var d=Api.GetDocument(),t=[];for(var i=0;i<d.GetElementsCount();i++){var e=d.GetElement(i);if(e.GetText)t.push(e.GetText());}return t.join("\\n");})()`);
}
export async function typeAtStart(page, f, text) {
  await f.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.RemoveSelection(); d.MoveCursorToStartPos(); });
  await f.evaluate(() => { const ta = document.getElementById("area_id"); ta && ta.focus(); });
  await page.keyboard.type(text, { delay: 15 });
}
// names of the users the editor shows as editing this document
export async function coUsers(f) {
  return f.evaluate(() => {
    try {
      return DE.getCollection("Common.Collections.Users").models.filter(m => m.get("online")).map(m => m.get("username"));
    } catch (e) { return ["ERR " + e]; }
  });
}
// text of word/document.xml of a .docx (minimal zip reader, no dependency)
export function docxText(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return "";
  const n = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), nlen = buf.readUInt16LE(off + 28),
      xlen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32), local = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nlen);
    if (name === "word/document.xml") {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      const xml = (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
      return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "");
    }
    off += 46 + nlen + xlen + clen;
  }
  return "";
}
export async function davText(user, p, base = NC) {
  const r = await dav(user, "GET", p, undefined, {}, base);
  return docxText(Buffer.from(await r.arrayBuffer()));
}
export async function waitFor(fn, timeout = 60000, step = 1500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await new Promise(r => setTimeout(r, step));
  }
  return null;
}
// upstream brand names visible in a page or frame (text, titles, labels)
export async function brandLeaks(f) {
  return f.evaluate(() => {
    const re = /euro-?office|onlyoffice|nextcloud office/i, hits = [];
    if (re.test(document.title)) hits.push("title: " + document.title);
    const text = document.body ? document.body.innerText : "";
    (text.match(new RegExp(".{0,30}(" + re.source + ").{0,30}", "gi")) || []).forEach(m => hits.push("text: " + m));
    document.querySelectorAll("[title],[aria-label],[placeholder]").forEach(el => {
      ["title", "aria-label", "placeholder"].forEach(a => { const v = el.getAttribute(a); if (v && re.test(v)) hits.push(a + ": " + v); });
    });
    return hits.slice(0, 10);
  });
}
export function report(results, errors) {
  let fails = 0;
  for (const [what, ok, detail] of results) { if (!ok) fails++; console.log((ok ? "ok   " : "FAIL ") + what + (detail ? "  (" + detail + ")" : "")); }
  if (errors.length) console.log("page errors:\n  " + errors.slice(0, 10).join("\n  "));
  console.log(`${results.length - fails}/${results.length} passed`);
  return fails;
}
