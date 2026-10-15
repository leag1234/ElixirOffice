// Client-side PDF export test (Playwright Chromium). Run on the host that has the local test font
// (Fira Sans, docs/localfonts.md section 5) and poppler-utils; pdfjs-dist installed next to playwright:
//   EO_BASE=https://localhost:8446 [EO_HTTP_BASE=http://192.0.2.10:8084] node tests/client-pdf/run.mjs
// EO_BASE must be a secure context (HTTPS, or http://localhost) so that "Use my fonts" can work;
// EO_HTTP_BASE (optional) is a plain-HTTP address of the same instance (not a secure context).
// Checks: File > Download as > PDF makes the PDF in the browser (no request carries the document or the
// fonts), the PDF opens in pdf.js and pdftoppm, has its text and embedded fonts, uses the local font
// when "Use my fonts" is on; Print gets a PDF made in the browser; the server fallback works and says
// why; the Options switch sends PDFs to the server; plain HTTP works too.
// Prints "ok"/"FAIL" lines and exits non-zero on any failure.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PW_DIR = process.env.PW_DIR || path.join(os.homedir(), "elixiroffice/pw");
const req = createRequire(path.join(PW_DIR, "package.json"));
const { chromium } = req("playwright");
const pdfjs = await import(pathToFileURL(path.join(PW_DIR, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
const BASE = process.env.EO_BASE || "https://localhost:8446";
const HTTP = process.env.EO_HTTP_BASE || "";
const FONT_DIR = process.env.LF_FONT_DIR || path.join(os.homedir(), ".local/share/fonts/elixir-localfonts-test");
const TEST_FONT = "Fira Sans";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "client-pdf-"));

let fails = 0;
const ok = (what, v, extra) => { console.log((v ? "ok   " : "FAIL ") + what + (v || extra === undefined ? "" : "  -> " + extra)); if (!v) fails++; };
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8" }); } catch (e) { return ""; } };

const DOCX = path.join(TMP, "client-pdf-localfont.docx");
execFileSync("python3", [path.join(ROOT, "tests/localfonts/mkdocx.py"), DOCX, TEST_FONT]);
const CORPUS_DOC = path.join(ROOT, "corpus/provisional/admin/a03-note-de-service.docx");   // image, Wingdings bullets, link, tables

// upload through the browser context: the example app keeps one storage folder per client address
async function upload(ctx, base, file) {
  const r = await ctx.request.post(base + "/example/upload", { multipart: { uploadedFile: {
    name: path.basename(file), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: fs.readFileSync(file) } } });
  const j = await r.json();
  if (!j.filename) throw new Error("upload failed: " + JSON.stringify(j));
  return j.filename;
}

function track(page) {
  const t = { on: false, errors: [], requests: [], responses: [], bodies: [], frames: [] };
  page.on("pageerror", e => t.errors.push("pageerror " + e));
  page.on("request", r => {
    if (!t.on) return;
    const b = r.postDataBuffer();
    t.requests.push({ method: r.method(), url: r.url(), bytes: b ? b.length : 0 });
    if (b) t.bodies.push(b);
  });
  page.on("response", r => { if (t.on) t.responses.push({ url: r.url(), headers: r.headers() }); });
  page.on("websocket", ws => ws.on("framesent", f => { if (t.on) t.frames.push(Buffer.from(f.payload)); }));
  return t;
}

async function openEditor(page, base, name) {
  await page.goto(`${base}/example/editor?fileName=${encodeURIComponent(name)}&lang=en`, { waitUntil: "load" });
  let frame;
  for (let i = 0; i < 400 && !frame; i++) {
    frame = page.frames().find(f => f.url().includes("/documenteditor/main/"));
    if (!frame) await page.waitForTimeout(250);
  }
  if (!frame) throw new Error("editor frame not found");
  await frame.waitForFunction(() => { try { return DE.getController("Main")._isDocReady === true; } catch (e) { return false; } }, null, { timeout: 90000 });
  await frame.waitForFunction(() => {
    const w = window.editor.WordControl, dd = w.m_oDrawingDocument, ld = w.m_oLogicDocument;
    return dd.m_lPagesCount > 0 && dd.m_lCountCalculatePages >= dd.m_lPagesCount && !(ld.FullRecalc && ld.FullRecalc.Id);
  }, null, { timeout: 60000, polling: 300 });
  await frame.waitForTimeout(1000);
  return frame;
}

// File > Download as > PDF, through the interface
async function downloadFromMenu(page, f, file) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }),
    (async () => {
      await f.evaluate(() => $("#toolbar a[data-tab=file]").click());
      await f.waitForTimeout(500);
      await f.evaluate(() => $("#fm-btn-download").click());
      await f.waitForTimeout(500);
      await f.evaluate(() => $(".btn-doc-format[format=" + Asc.c_oAscFileType.PDF + "]:visible").first().click());
    })(),
  ]);
  await dl.saveAs(file);
  return file;
}
async function downloadApi(page, f, file) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }),
    f.evaluate(() => window.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.PDF))),
  ]);
  await dl.saveAs(file);
  return file;
}

async function pdfjsInfo(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    text += tc.items.map(x => x.str).join("") + "\n";
  }
  const meta = await doc.getMetadata();
  return { pages: doc.numPages, text, producer: meta.info && meta.info.Producer, title: meta.info && meta.info.Title };
}
const producer = file => (sh("pdfinfo", [file]).match(/^Producer:\s*(.*)$/m) || [])[1] || "";
const fontsOf = file => sh("pdffonts", [file]).split("\n").slice(2).filter(Boolean).map(l => { const p = l.trim().split(/\s+/); return { name: p[0], emb: p[p.length - 5] === "yes", uni: p[p.length - 3] === "yes" }; });
function rasterOk(file) {
  const out = path.join(TMP, path.basename(file, ".pdf"));
  sh("pdftoppm", ["-r", "50", "-png", file, out]);
  return fs.readdirSync(TMP).filter(x => x.startsWith(path.basename(out) + "-") && x.endsWith(".png")).length;
}

async function main() {
  const fontBytes = fs.readFileSync(path.join(FONT_DIR, "FiraSans-Regular.ttf"));
  const sig = fontBytes.subarray(8192, 8192 + 48);   // inside the glyph data: must never appear in any request
  const browser = await chromium.launch();

  // ---- 1. secure context, "Use my fonts" on: File > Download as > PDF -----------------------------------------
  {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true, viewport: { width: 1440, height: 900 }, permissions: ["local-fonts"] });
    await ctx.addInitScript(() => { try { localStorage.setItem("elixir.localfonts.consent", "1"); } catch (e) { /* */ } });
    const page = await ctx.newPage();
    const t = track(page);
    const f = await openEditor(page, BASE, await upload(ctx, BASE, DOCX));
    await f.waitForFunction(() => Common.ElixirLocalFonts.status === "on", null, { timeout: 30000 }).catch(() => {});
    ok("local fonts on (secure context, consent)", await f.evaluate(() => Common.ElixirLocalFonts.status === "on"));
    const used = await f.evaluate(() => AscFonts.g_fontApplication.GetFontInfoName(Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs({ All: true })[0].GetFirstRunPr().RFonts.Ascii.Name));
    ok("the screen uses the local font", used === TEST_FONT, used);
    const startup = await f.evaluate(() => !!window.EOPdf || !!window.fontkit || !!window.EOWasmPdf);
    ok("PDF libraries not loaded at startup (lazy)", !startup);

    t.on = true;
    const file = await downloadFromMenu(page, f, path.join(TMP, "localfont.pdf"));
    t.on = false;
    const st = await f.evaluate(() => window.AscCommon.ClientPdf.last);
    ok("File > Download as > PDF made in the browser", st && !st.error && st.pages >= 1, JSON.stringify(st));
    ok("wasm is the default backend", st && st.backend === "wasm" && st.worker && !st.fallbacks, JSON.stringify(st));
    ok("lazy worker/module requested on first export", t.requests.some(r => /wasm-worker.js/.test(r.url)) && t.requests.some(r => /x2t.wasm/.test(r.url)));
    if (process.env.EO_EXPECT_WASM_ENCODING) {
      ok("wasm response has expected encoding and MIME", t.responses.some(r => /x2t\.wasm/.test(r.url) && r.headers["content-encoding"] === process.env.EO_EXPECT_WASM_ENCODING && r.headers["content-type"] === "application/wasm"));
    }
    ok("JS writer and fontkit remain unloaded on wasm success", await f.evaluate(() => !window.EOPdf && !window.fontkit));
    const fonts = fontsOf(file);
    ok("the local font is embedded in the PDF", fonts.some(x => /Fira/.test(x.name) && x.emb) && st.fonts.some(x => x.name === TEST_FONT && x.source === "local"), JSON.stringify(fonts));
    ok("every font embedded, with ToUnicode", fonts.length > 0 && fonts.every(x => x.emb && x.uni), JSON.stringify(fonts));
    const info = await pdfjsInfo(file);
    ok("pdf.js opens it and extracts the text", info.pages >= 1 && /Les enfants de la classe de CM1/.test(info.text), info.text.slice(0, 120));
    ok("pdftoppm renders every page", rasterOk(file) === info.pages);
    ok("pdftotext gives the text", /trois quarts/.test(sh("pdftotext", [file, "-"])));
    const posts = t.requests.filter(r => r.method !== "GET" || r.bytes > 0);
    ok("no request with a body during the export", posts.length === 0, JSON.stringify(posts.slice(0, 3)));
    const docText = Buffer.from("trois quarts");
    const leaked = [...t.bodies, ...t.frames].some(b => b.includes(sig) || b.includes(docText));
    ok("no request or websocket frame carries the document or font bytes", !leaked);
    const hosts = new Set(t.requests.map(r => new URL(r.url).host));
    ok("no request leaves the origin", hosts.size <= 1, [...hosts].join(","));
    ok("no page error", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
    await ctx.close();
  }

  // ---- 2. corpus document: Wingdings bullets, image, link; Print; fallback; Options switch -------------------
  {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const t = track(page);
    const f = await openEditor(page, BASE, await upload(ctx, BASE, CORPUS_DOC));
    t.on = true;
    const file = await downloadFromMenu(page, f, path.join(TMP, "a03.pdf"));
    t.on = false;
    const st = await f.evaluate(() => window.AscCommon.ClientPdf.last);
    ok("corpus document: client PDF with image and links", st && !st.error && st.images >= 1 && st.links >= 1, JSON.stringify(st && { images: st.images, links: st.links, error: st.error }));
    ok("corpus document: no request with a body", t.requests.filter(r => r.method !== "GET" || r.bytes > 0).length === 0);
    const links = sh("pdfinfo", ["-url", file]);
    ok("hyperlink annotation present", /URI/.test(links) || /http/.test(links), links.slice(0, 200));
    const txt = sh("pdftotext", [file, "-"]);
    ok("text of the corpus document extracted", /NOTE DE SERVICE/i.test(txt), txt.slice(0, 80));

    // Print: the editor receives a PDF made in the browser (blob: URL in the print frame)
    await f.evaluate(() => { window.__printUrl = null; window.editor.asc_registerCallback("asc_onPrintUrl", u => { window.__printUrl = u; }); });
    await f.evaluate(() => window.editor.asc_Print(new Asc.asc_CDownloadOptions(null, true)));
    await f.waitForFunction(() => !!window.__printUrl, null, { timeout: 60000 }).catch(() => {});
    const pu = await f.evaluate(async () => {
      const u = window.__printUrl;
      if (!u) return null;
      const b = new Uint8Array(await (await fetch(u)).arrayBuffer());
      return { url: u.slice(0, 5), head: String.fromCharCode.apply(null, b.slice(0, 8)), len: b.length };
    });
    ok("Print gets a PDF made in the browser (blob: URL)", pu && pu.url === "blob:" && pu.head.startsWith("%PDF-") && pu.len > 1000, JSON.stringify(pu));

    // Worker failure falls back locally to JS; the server is reached only if JS also fails.
    await f.evaluate(() => { window.__Worker = window.Worker; window.Worker = function () { throw new Error("worker blocked by test"); }; });
    t.requests = []; t.on = true;
    const js = await downloadApi(page, f, path.join(TMP, "worker-fallback.pdf"));
    t.on = false;
    const jsStats = await f.evaluate(() => AscCommon.ClientPdf.last);
    ok("worker failure falls back to JS", jsStats && jsStats.backend === "js" && jsStats.fallbacks[0].reason === "wasm-worker", JSON.stringify(jsStats));
    ok("JS fallback still uploads nothing", t.requests.every(r => r.method === "GET" && r.bytes === 0) && producer(js) === "ElixirOffice");
    await f.evaluate(() => { window.Worker = window.__Worker; });

    // fallback: an image the browser cannot read -> the server makes the PDF, the interface says why
    await f.evaluate(() => { const o = window.__origFetch = window.fetch; window.fetch = function (u, opt) { if (/\/media\//.test(String(u))) return Promise.reject(new TypeError("blocked by test")); return o.apply(this, arguments); }; });
    const fb = await downloadApi(page, f, path.join(TMP, "fallback.pdf"));
    const last = await f.evaluate(() => window.AscCommon.ClientPdf.last);
    const bar = await f.evaluate(() => { const b = document.querySelector(".elx-cp-bar"); return b ? b.innerText : null; });
    ok("fallback: a PDF is still produced (by the server)", last && last.error && fs.statSync(fb).size > 1000, producer(fb));
    ok("fallback: the reason is known (image)", last && last.code === "image", JSON.stringify(last));
    ok("fallback: explicit message shown", !!bar && /server/i.test(bar), bar);
    await f.evaluate(() => { window.fetch = window.__origFetch || window.fetch; });

    // Options switch off: the server makes the PDF
    await f.evaluate(() => window.AscCommon.ClientPdf.setEnabled(false));
    const off = await downloadApi(page, f, path.join(TMP, "off.pdf"));
    ok("switch off: the server makes the PDF", fs.statSync(off).size > 1000 && producer(off) !== "ElixirOffice", producer(off));
    await f.evaluate(() => window.AscCommon.ClientPdf.setEnabled(true));
    await f.evaluate(() => { $("#toolbar a[data-tab=file]").click(); setTimeout(() => $("#fm-btn-settings").click(), 300); });
    await f.waitForTimeout(1500);
    ok("File > Options shows the switch", await f.evaluate(() => $("#elx-cp-chb").length === 1 && /browser/i.test($("#elx-cp-chb").text())));
    ok("no page error", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
    await ctx.close();
  }

  // Missing runtime: one probe per session, direct JS exports, no failed workers.
  {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    await ctx.route('**/runtime/current.json', route => route.fulfill({ status: 404, body: '' }));
    const page = await ctx.newPage(), t = track(page);
    const f = await openEditor(page, BASE, await upload(ctx, BASE, DOCX));
    t.on = true;
    for (let i = 0; i < 2; i++) {
      await downloadApi(page, f, path.join(TMP, 'no-runtime-' + i + '.pdf'));
      const st = await f.evaluate(() => AscCommon.ClientPdf.last);
      ok('missing runtime: direct JS export ' + (i + 1), st && st.backend === 'js' && !st.fallbacks && !st.error, JSON.stringify(st));
    }
    t.on = false;
    ok('missing runtime: presence probe cached for session', t.requests.filter(r => /runtime\/current.json/.test(r.url)).length === 1);
    ok('missing runtime: no worker or wasm module request', !t.requests.some(r => /wasm-worker|wasm-pdf|x2t\.(wasm|js)/.test(r.url)));
    ok('missing runtime: no upload or page error', t.requests.every(r => r.method === 'GET' && r.bytes === 0) && t.errors.length === 0);
    await ctx.close();
  }

  // ---- 3. plain HTTP (not a secure context): the PDF is still made in the browser ---------------------------
  if (HTTP) {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const t = track(page);
    const f = await openEditor(page, HTTP, await upload(ctx, HTTP, CORPUS_DOC));
    ok("HTTP: not a secure context", await f.evaluate(() => !isSecureContext));
    t.on = true;
    const file = await downloadFromMenu(page, f, path.join(TMP, "http.pdf"));
    t.on = false;
    ok("HTTP: client PDF", await f.evaluate(() => AscCommon.ClientPdf.last.backend === "wasm" && !AscCommon.ClientPdf.last.error));
    ok("HTTP: no request with a body", t.requests.filter(r => r.method !== "GET" || r.bytes > 0).length === 0);
    ok("HTTP: fonts embedded", fontsOf(file).every(x => x.emb));
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? fails + " failed checks" : "0 failed checks");
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
