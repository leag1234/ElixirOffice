// Local fonts test (Playwright Chromium + Firefox): the browser sees real local fonts, the editor uses them
// after consent. Run on the host that has the test font installed (Fira Sans, see docs/localfonts.md):
//   EO_BASE=http://localhost:8082 [EO_INSECURE_BASE=http://192.0.2.10:8082] [EO_HTTPS_BASE=https://192.0.2.10:8443] \
//   node tests/localfonts/run.mjs
// Prints "ok"/"FAIL" lines and exits non-zero on any failure.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PW_DIR = process.env.PW_DIR || path.join(os.homedir(), "elixiroffice/pw");
const { chromium, firefox } = createRequire(path.join(PW_DIR, "package.json"))("playwright");
const BASE = process.env.EO_BASE || "http://localhost:8082";
const INSECURE = process.env.EO_INSECURE_BASE || "";
const HTTPS = process.env.EO_HTTPS_BASE || "";
const FONT_DIR = process.env.LF_FONT_DIR || path.join(os.homedir(), ".local/share/fonts/elixir-localfonts-test");
const TEST_FONT = "Fira Sans";
// EO_BASE may be the HTTPS front (Caddy, internal CA). Chromium then runs with a profile (HOME) whose NSS database trusts
// the CA (certutil from libnss3-tools, CERTUTIL=<path>), so the service worker and every request behave as for a tester
// who installed the certificate; without certutil it falls back to ignoreHTTPSErrors (the service worker then fails).
const CA = process.env.EO_CA_FILE || path.join(os.homedir(), "elixiroffice/lan-https/elixir-ca.crt");
const CERTUTIL = process.env.CERTUTIL || "certutil";
const NSS_ENV = { ...process.env, LD_LIBRARY_PATH: "/usr/lib/x86_64-linux-gnu" };
function trustedHome() {
  try { execFileSync(CERTUTIL, ["-H"], { stdio: "ignore", env: NSS_ENV }); } catch (e) { if (!e || e.code === "ENOENT") return null; }
  if (!fs.existsSync(CA)) return null;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "lf-trust-"));
  const db = path.join(home, ".pki/nssdb");
  fs.mkdirSync(db, { recursive: true });
  execFileSync(CERTUTIL, ["-d", "sql:" + db, "-N", "--empty-password"], { env: NSS_ENV });
  execFileSync(CERTUTIL, ["-d", "sql:" + db, "-A", "-t", "C,,", "-n", "Caddy Local Authority", "-i", CA], { env: NSS_ENV });
  // the user's fonts stay visible to the browser started with this HOME
  fs.mkdirSync(path.join(home, ".local/share"), { recursive: true });
  fs.symlinkSync(path.join(os.homedir(), ".local/share/fonts"), path.join(home, ".local/share/fonts"));
  return home;
}
const HTTPS_BASE = BASE.startsWith("https:");
const TRUST = HTTPS_BASE ? trustedHome() : null;
const IGN = HTTPS_BASE && !TRUST;
if (HTTPS_BASE) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";   // Node's own upload request only
const launchChromium = (o = {}) => chromium.launch({ ...o, env: { ...process.env, ...(TRUST ? { HOME: TRUST } : {}) } });

let fails = 0;
const ok = (what, v, extra) => { console.log((v ? "ok   " : "FAIL ") + what + (v || !extra ? "" : "  -> " + extra)); if (!v) fails++; };

const DOCX = path.join(os.tmpdir(), "localfonts-test.docx");
execFileSync("python3", [path.join(HERE, "mkdocx.py"), DOCX, TEST_FONT]);

async function upload(base, file = DOCX) {
  const fd = new FormData();
  fd.append("uploadedFile", new Blob([fs.readFileSync(file)]), path.basename(file));
  const r = await fetch(base + "/example/upload", { method: "POST", body: fd, headers: { Cookie: "uid=uid-1" } });
  const j = await r.json();
  if (!j.filename) throw new Error("upload failed: " + JSON.stringify(j));
  return j.filename;
}

function track(page) {
  const t = { errors: [], requests: [], bodies: [], frames: [] };
  page.on("pageerror", e => t.errors.push("pageerror " + e));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) t.errors.push("console " + m.text().slice(0, 200)); });
  // /elixir-ai/config.json: server-managed AI settings, absent on a bare dev instance (unrelated)
  page.on("response", r => { if (r.status() >= 400 && !/favicon|\.map$|elixir-ai\/config\.json/.test(r.url())) t.errors.push(r.status() + " " + r.url().slice(0, 120)); });
  page.on("request", r => {
    t.requests.push(r.method() + " " + r.url());
    const b = r.postDataBuffer();
    if (b) t.bodies.push(b);
  });
  page.on("websocket", ws => {
    ws.on("framesent", f => t.frames.push(Buffer.from(f.payload)));
  });
  return t;
}

async function openEditor(page, base, name) {
  await page.goto(`${base}/example/editor?fileName=${encodeURIComponent(name)}`, { waitUntil: "load" });
  let frame;
  for (let i = 0; i < 400 && !frame; i++) {
    frame = page.frames().find(f => f.url().includes("/documenteditor/main/"));
    if (!frame) await page.waitForTimeout(250);
  }
  if (!frame) throw new Error("editor frame not found");
  await frame.waitForFunction(() => { try { return DE.getController("Main")._isDocReady === true; } catch (e) { return false; } }, null, { timeout: 90000 });
  await frame.waitForTimeout(1500);
  return frame;
}

// first line width of each paragraph, line counts and the font the engine picked for each paragraph
const measure = f => f.evaluate(() => {
  const d = Asc.editor.WordControl.m_oLogicDocument;
  return d.GetAllParagraphs({ All: true }).slice(0, 8).map(p => ({
    lines: p.Lines.length,
    w0: Math.round(p.Lines[0].Ranges[0].W * 100) / 100,
    font: AscFonts.g_fontApplication.GetFontInfoName(p.GetFirstRunPr().RFonts.Ascii.Name)
  }));
});
const bar = f => f.evaluate(() => { const b = document.querySelector(".elx-lf-bar"); return b ? b.innerText.replace(/\s+/g, " ") : null; });

async function main() {
  const name = await upload(BASE);
  const fontBytes = fs.readFileSync(path.join(FONT_DIR, "FiraSans-Regular.ttf"));
  const sig = fontBytes.subarray(8192, 8192 + 48);   // inside the glyph data: must never appear in any request

  // ---- 1. Chromium, local-fonts granted: invitation, consent, layout, font box, privacy ----------------
  const browser = await launchChromium();
  const context = await browser.newContext({ ignoreHTTPSErrors: IGN, viewport: { width: 1440, height: 900 }, permissions: ["local-fonts"] });
  const page = await context.newPage();
  const t = track(page);
  let f = await openEditor(page, BASE, name);
  ok("secure context and queryLocalFonts", await f.evaluate(() => isSecureContext && typeof queryLocalFonts === "function"));
  const b1 = await bar(f);
  ok("info bar appears and names the missing font", !!b1 && b1.includes(TEST_FONT) && /Use my fonts/.test(b1), b1);
  const before = await measure(f);
  ok("before consent: the server substitute is used", before[0].font !== TEST_FONT, JSON.stringify(before[0]));
  await page.screenshot({ path: path.join(os.tmpdir(), "lf-before.png") });
  const noListBefore = await f.evaluate(() => Common.ElixirLocalFonts.count === 0 && !Common.ElixirLocalFonts.fonts);
  ok("nothing read before consent (list of local fonts not requested)", noListBefore);

  await f.click(".elx-lf-btn.primary");
  await f.waitForFunction(() => Common.ElixirLocalFonts.status === "on", null, { timeout: 30000 });
  await f.waitForTimeout(1500);
  const after = await measure(f);
  ok("after consent: the engine uses the local font", after[0].font === TEST_FONT && after[1].font === TEST_FONT, JSON.stringify(after));
  ok("after consent: layout follows the real font (width and line count change)", after[0].w0 !== before[0].w0 && after[0].lines !== before[0].lines, JSON.stringify([before[0], after[0]]));
  ok("bold italic face used (not the regular one)", after[1].w0 !== before[1].w0);
  ok("a font installed nowhere keeps the substitute", after[3].font !== TEST_FONT);
  const w4 = after.slice(4, 8).map(x => x.w0);
  ok("regular, bold, italic and bold italic are four different faces", new Set(w4).size === 4 && w4.every((w, i) => w !== before[4 + i].w0), JSON.stringify([w4, before.slice(4, 8).map(x => x.w0)]));
  ok("consent remembered", await f.evaluate(() => localStorage.getItem("elixir.localfonts.consent") === "1"));
  const msg = await bar(f);
  ok("result message names the applied font", !!msg && msg.includes(TEST_FONT) && /applied/i.test(msg), msg);
  await page.screenshot({ path: path.join(os.tmpdir(), "lf-after.png") });
  const pixels = await (async () => {
    const a = fs.readFileSync(path.join(os.tmpdir(), "lf-before.png")), b = fs.readFileSync(path.join(os.tmpdir(), "lf-after.png"));
    return !a.equals(b);
  })();
  ok("page pixels differ before/after", pixels);

  // font box: the font is listed, marked, previewed in itself
  const fb = await f.evaluate(() => {
    const st = DE.getController("Common.Controllers.Fonts").getCollection("Common.Collections.Fonts");
    const names = st.pluck("name");
    const c = Common.ElixirLocalFonts.thumbnail("Fira Sans", 300, 28, 300, 28);
    const d = c.getContext("2d").getImageData(0, 0, 300, 28).data;
    let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ink++;
    return { listed: names.includes("Fira Sans"), dup: names.length - new Set(names).size, local: Common.ElixirLocalFonts.isLocal("Fira Sans"), ink };
  });
  ok("font box lists the local font once", fb.listed && fb.dup === 0, JSON.stringify(fb));
  ok("font box preview drawn with the mark 'On this computer'", fb.local && fb.ink > 200);
  // open the list and look at the Fira Sans row
  await f.evaluate(() => $(".combobox.fonts").first().find(".dropdown-toggle").first().click());
  await f.waitForTimeout(600);
  const pos = await f.evaluate(() => {
    const ul = $(".combobox.fonts.open ul.dropdown-menu").first();
    const names = DE.getController("Common.Controllers.Fonts").getCollection("Common.Collections.Fonts").pluck("name");
    const idx = names.indexOf("Fira Sans");
    ul.scrollTop(Math.max(0, idx * 28 - 120));
    ul.trigger("scroll");
    return idx;
  });
  await f.waitForTimeout(900);
  await page.screenshot({ path: path.join(os.tmpdir(), "lf-fontbox.png") });
  const rowHasCanvas = await f.evaluate(idx => $(".combobox.fonts.open ul.dropdown-menu li:has(a.font-item)").eq(idx).find("canvas").length > 0, pos);
  ok("font box row of the local font is drawn", rowHasCanvas);
  await page.keyboard.press("Escape");

  // File > Options: switch and status
  await f.evaluate(() => $("#toolbar a[data-tab=file]").click());
  await f.waitForTimeout(600);
  await f.evaluate(() => $("#fm-btn-settings").click());
  await f.waitForTimeout(800);
  const st1 = await f.evaluate(() => ({ text: $("#elx-lf-status").text(), checked: $("#elx-lf-chb").hasClass("checked") || $("#elx-lf-chb input").prop("checked") || $("#elx-lf-chb .checkbox-indeterminate").length === 0 && $("#elx-lf-chb").find(".checked").length > 0 }));
  ok("Options: status says on", /fonts of this computer are available/i.test(st1.text), st1.text);
  await page.screenshot({ path: path.join(os.tmpdir(), "lf-options.png") });
  await page.keyboard.press("Escape");

  // privacy: no request carries the font, no request leaves the origin, no websocket frame carries it
  const leaked = [...t.bodies, ...t.frames].some(b => b.includes(sig));
  ok("no request or websocket frame carries font bytes", !leaked);
  const hosts = new Set(t.requests.map(r => new URL(r.split(" ")[1]).host));
  ok("no request leaves the origin", hosts.size === 1, [...hosts].join(","));
  ok("no console error or page error", t.errors.length === 0, t.errors.slice(0, 4).join(" | "));

  // ---- 1b. variable font (named instances) and collection (face index) ------------------------------------------
  {
    const VF = path.join(os.tmpdir(), "localfonts-variable.docx");
    execFileSync("python3", [path.join(HERE, "mkdocx.py"), VF, "Ubuntu Sans"]);
    const nv = await upload(BASE, VF);
    const b = await launchChromium();
    const c = await b.newContext({ ignoreHTTPSErrors: IGN, viewport: { width: 1440, height: 900 }, permissions: ["local-fonts"] });
    const p = await c.newPage();
    const tv = track(p);
    const fr = await openEditor(p, BASE, nv);
    await fr.click(".elx-lf-btn.primary");
    await fr.waitForFunction(() => Common.ElixirLocalFonts.status === "on", null, { timeout: 30000 });
    await fr.waitForTimeout(2500);
    const m = await measure(fr);
    const info = await fr.evaluate(() => { const i = AscFonts.g_font_infos[AscFonts.g_map_font_index["Ubuntu Sans"]]; return [i.faceIndexR, i.faceIndexB]; });
    ok("variable font: Ubuntu Sans used by the engine", m[4].font === "Ubuntu Sans", JSON.stringify(m[4]));
    ok("variable font: bold is the real bold instance (wider), not the regular weight", m[5].w0 > m[4].w0 * 1.03 && (info[1] >> 16) > 0, JSON.stringify([m[4].w0, m[5].w0, info]));
    ok("variable font: no error", tv.errors.length === 0, tv.errors.join("|"));
    await b.close();
  }
  {
    const KR = path.join(os.tmpdir(), "localfonts-ttc.docx");
    execFileSync("python3", [path.join(HERE, "mkdocx.py"), KR, "Noto Sans CJK KR"]);
    const nk = await upload(BASE, KR);
    const b = await launchChromium();
    const c = await b.newContext({ ignoreHTTPSErrors: IGN, viewport: { width: 1440, height: 900 }, permissions: ["local-fonts"] });
    const p = await c.newPage();
    const fr = await openEditor(p, BASE, nk);
    await fr.click(".elx-lf-btn.primary");
    await fr.waitForFunction(() => Common.ElixirLocalFonts.status === "on", null, { timeout: 30000 });
    await fr.waitForTimeout(3000);
    const fi = await fr.evaluate(() => { const i = AscFonts.g_font_infos[AscFonts.g_map_font_index["Noto Sans CJK KR"]]; return i ? i.faceIndexR & 0xFFFF : -1; });
    const fj = await fr.evaluate(() => { const i = AscFonts.g_font_infos[AscFonts.g_map_font_index["Noto Sans CJK JP"]]; return i ? i.faceIndexR & 0xFFFF : -1; });
    ok("collection: the face of the .ttc is found by its name (KR != JP)", fi >= 0 && fj >= 0 && fi !== fj, JSON.stringify([fi, fj]));
    await b.close();
  }

  // ---- 2. reopen: consent given, no gesture: right layout from the first paint ------------------------
  await page.goto("about:blank");
  f = await openEditor(page, BASE, name);
  const again = await measure(f);
  ok("reopen: local font used from the first layout, no bar", again[0].font === TEST_FONT && again[0].w0 === after[0].w0 && (await bar(f)) === null, JSON.stringify(again[0]));
  ok("reopen: font box has the local font", await f.evaluate(() => DE.getController("Common.Controllers.Fonts").getCollection("Common.Collections.Fonts").pluck("name").includes("Fira Sans")));
  ok("reopen: no console error", t.errors.length === 0, t.errors.slice(0, 4).join(" | "));

  // choosing another local font later (not requested by the document): loaded on demand, then used (own copy of the document)
  await page.goto("about:blank");
  f = await openEditor(page, BASE, await upload(BASE));
  const beforePick = await measure(f);
  await f.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.SelectAll(); Asc.editor.put_TextPrFontName("Ubuntu Sans"); });
  await f.waitForFunction(() => { const i = AscFonts.g_font_infos[AscFonts.g_map_font_index["Ubuntu Sans"]]; return i && AscFonts.g_font_files[i.indexR].Status === 0; }, null, { timeout: 15000 });
  await f.waitForTimeout(1500);
  const picked = await measure(f);
  ok("a local font picked later is loaded on demand and used", picked[0].font === "Ubuntu Sans" && picked[0].w0 !== beforePick[0].w0, JSON.stringify([beforePick[0], picked[0]]));
  await f.evaluate(() => { Asc.editor.WordControl.m_oLogicDocument.RemoveSelection(); });


  // ---- 3. switch off in Options: next opening uses the server fonts again ------------------------------
  await f.evaluate(() => Common.ElixirLocalFonts.disable());
  await page.goto("about:blank");
  f = await openEditor(page, BASE, name);
  const off = await measure(f);
  ok("consent withdrawn: server fonts again, bar offered again", off[0].font !== TEST_FONT && !!(await bar(f)));
  await browser.close();

  // ---- 4. permission denied -----------------------------------------------------------------------------
  {
    const b = await launchChromium();
    const c = await b.newContext({ ignoreHTTPSErrors: IGN, viewport: { width: 1440, height: 900 } });   // local-fonts not granted: the browser would prompt; headless denies
    const p = await c.newPage();
    const tt = track(p);
    const fr = await openEditor(p, BASE, name);
    await fr.click(".elx-lf-btn.primary");
    await fr.waitForTimeout(2500);
    const m = await bar(fr);
    ok("permission refused: clear message, no error", !!m && /refused|Access|read the fonts/i.test(m) && tt.errors.length === 0, m + " " + tt.errors.join("|"));
    ok("permission refused: layout unchanged", (await measure(fr))[0].font !== TEST_FONT);
    ok("permission refused: no consent stored", await fr.evaluate(() => localStorage.getItem("elixir.localfonts.consent") !== "1"));
    await b.close();
  }

  // ---- 5. insecure context (http on a LAN address) -----------------------------------------------------
  if (INSECURE) {
    const b = await launchChromium();
    const c = await b.newContext({ ignoreHTTPSErrors: IGN, viewport: { width: 1440, height: 900 }, permissions: ["local-fonts"] });
    const p = await c.newPage();
    const tt = track(p);
    const n2 = await upload(INSECURE);
    const fr = await openEditor(p, INSECURE, n2);
    ok("http: not a secure context", (await fr.evaluate(() => isSecureContext)) === false);
    const m = await bar(fr);
    ok("http: one-line explanation with the way out, no button to try", !!m && /HTTPS/.test(m) && !/Use my fonts/.test(m), m);
    ok("http: no error", tt.errors.length === 0, tt.errors.join("|"));
    await b.close();
  }

  // ---- 6. Firefox: API missing -------------------------------------------------------------------------------
  try {
    const b = await firefox.launch();
    const c = await b.newContext({ ignoreHTTPSErrors: HTTPS_BASE, viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    const tt = track(p);
    const fr = await openEditor(p, BASE, name);
    const m = await bar(fr);
    ok("firefox: explanation (Chrome or Edge, desktop app), not an error", !!m && /Chrome or Edge/.test(m) && !/Use my fonts/.test(m), m);
    ok("firefox: no console or page error", tt.errors.length === 0, tt.errors.join("|"));
    await b.close();
  } catch (e) { console.log("skip firefox: " + String(e).slice(0, 100)); }

  // ---- 7. HTTPS front (Caddy, internal CA) ---------------------------------------------------------------------
  if (HTTPS) {
    const b = await launchChromium();
    const c = await b.newContext({ ignoreHTTPSErrors: true, permissions: ["local-fonts"] });
    const p = await c.newPage();
    await p.goto(HTTPS + "/welcome/");
    ok("https front: secure context with queryLocalFonts", await p.evaluate(() => isSecureContext && typeof queryLocalFonts === "function"));
    await b.close();
    // a browser profile that trusts the root certificate: no certificate exception, the chain is checked up to the CA
    const th = trustedHome();
    if (th) {
      const b2 = await chromium.launch({ env: { ...process.env, HOME: th } });
      const c2 = await b2.newContext({ permissions: ["local-fonts"] });   // no ignoreHTTPSErrors: only the root is trusted
      const p2 = await c2.newPage();
      const resp = await p2.goto(HTTPS + "/welcome/");
      const sd = await resp.securityDetails();
      ok("https front, root trusted: valid chain from the Caddy internal CA, no exception", !!sd && /Caddy Local Authority/.test(sd.issuer || ""), JSON.stringify(sd));
      ok("https front, root trusted: secure context with queryLocalFonts", await p2.evaluate(() => isSecureContext && typeof queryLocalFonts === "function"));
      await b2.close();
      fs.rmSync(th, { recursive: true, force: true });
    } else console.log("skip trusted-profile check: no certutil (libnss3-tools) or no CA file");
  }
  // ---- 8. Excel and PowerPoint share the hook ------------------------------------------------------------------
  for (const [ext, dir, ns] of [["xlsx", "spreadsheeteditor", "SSE"], ["pptx", "presentationeditor", "PE"]]) {
    const b = await launchChromium();
    const c = await b.newContext({ ignoreHTTPSErrors: IGN, viewport: { width: 1440, height: 900 }, permissions: ["local-fonts"] });
    const p = await c.newPage();
    const tt = track(p);
    await p.goto(`${BASE}/example/editor?fileExt=${ext}`, { waitUntil: "load" });
    let fr;
    for (let i = 0; i < 400 && !fr; i++) { fr = p.frames().find(x => x.url().includes(`/${dir}/main/`)); if (!fr) await p.waitForTimeout(250); }
    await fr.waitForFunction(n => { try { return window[n].getController("Main")._isDocReady === true; } catch (e) { return false; } }, ns, { timeout: 90000 });
    await fr.waitForTimeout(1500);
    ok(`${ext}: local fonts module present, nothing read before consent`, await fr.evaluate(() => !!Common.ElixirLocalFonts && Common.ElixirLocalFonts.count === 0));
    // a new workbook uses Calibri (missing on the server: invitation); a new deck only fonts the server has (no bar)
    const b8 = await bar(fr);
    if (ext === "xlsx") ok(`${ext}: invitation bar offered`, !!b8 && /Use my fonts/.test(b8), b8);
    else ok(`${ext}: no bar when the server has every font of the document`, b8 === null, b8);
    if (b8) await fr.click(".elx-lf-btn.primary");
    else await fr.evaluate(n => Common.ElixirLocalFonts.enable(window[n].getController("Viewport").getApi()), ns);
    await fr.waitForFunction(() => Common.ElixirLocalFonts.status === "on", null, { timeout: 30000 });
    ok(`${ext}: fonts registered and listed in the font box`, await fr.evaluate(n => window[n].getController("Common.Controllers.Fonts").getCollection("Common.Collections.Fonts").pluck("name").includes("Fira Sans"), ns));
    await fr.evaluate(() => $("#toolbar a[data-tab=file]").click());
    await fr.waitForTimeout(700);
    await fr.evaluate(() => $("#fm-btn-settings").click());
    await fr.waitForTimeout(900);
    ok(`${ext}: File > Options has the switch and its status`, await fr.evaluate(() => $("#elx-lf-chb").length > 0 && /fonts of this computer are available/i.test($("#elx-lf-status").text())), await fr.evaluate(() => $("#elx-lf-status").text()));
    ok(`${ext}: no console or page error`, tt.errors.length === 0, tt.errors.join("|"));
    await b.close();
  }
  console.log(fails ? `${fails} failed check(s)` : "0 failed checks");
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
