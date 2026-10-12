// SPDX-License-Identifier: AGPL-3.0-only
// Client-side PDF bench (docs/client-pdf.md): for each .docx, open it in the editor of a running
// instance, export the PDF twice through the interface's Download as PDF code path:
//   <out>/client/<id>.pdf  made in the browser (sdkjs common/clientpdf), nothing sent to the server
//   <out>/server/<id>.pdf  same command with the client path switched off (the server writes it)
// and record timings, sizes and every request sent during the client export (<out>/bench.json).
// Compare afterwards with tools/client-pdf/gate.sh (SSIM, page counts, text, fonts, size, uploads).
//
// Private corpus (--private, EO_PRIVATE_CORPUS=1, or a path containing "corpus-private"): ids are
// anonymous (anon.mjs), uploads are named by id, and no file name or title is printed or stored.
//
// Usage: EO_BASE=http://localhost:8084 node tools/client-pdf/bench.mjs [--private] <out dir> <file.docx|corpus dir> [...]
//        (PW_MODULE: path of playwright's index.mjs, default $EO_WORK/pw/node_modules/playwright/index.mjs)
import fs from "fs";
import path from "path";
import os from "os";
import { anonId, isPrivate, makeScrubber } from "./anon.mjs";

const PW = process.env.PW_MODULE || path.join(os.homedir(), "elixiroffice/pw/node_modules/playwright/index.mjs");
const base = process.env.EO_BASE || "http://localhost:8084";
const argv = process.argv.slice(2);
const [out, ...inputs] = argv.filter((a) => a !== "--private");
if (!out || !inputs.length) { console.error("usage: bench.mjs [--private] <out dir> <docx|dir>..."); process.exit(2); }
const ids = (process.env.IDS || "").split(",").filter(Boolean);
const priv = argv.includes("--private") || inputs.some((p) => isPrivate(p));
let scrub = (t) => String(t);

function collect(input) {
  const st = fs.statSync(input);
  const root = st.isFile() ? path.dirname(input) : input;
  const files = st.isFile() ? [input]
    : fs.readdirSync(input, { recursive: true }).map((f) => path.join(input, f)).filter((f) => f.endsWith(".docx")).sort();
  return files.map((file) => ({ file, rel: path.relative(root, file).split(path.sep).join("/") }));
}
const idOf = (e) => (priv ? anonId(e.rel) : path.basename(e.file).split(/[-.]/)[0]);
// Private runs: drop any key that could carry a title or a name (sdkjs statistics, for instance).
const stripNames = (o) => (Array.isArray(o) ? o.map(stripNames)
  : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => !/title|file|name|path/i.test(k)).map(([k, v]) => [k, stripNames(v)]))
  : o);

async function main() {
  const { chromium } = await import(PW);
  const entries = inputs.flatMap(collect);
  scrub = priv ? makeScrubber(entries.map((e) => e.rel)) : (t) => String(t);
  let files = entries;
  if (ids.length) files = files.filter((e) => ids.includes(idOf(e)));
  fs.mkdirSync(path.join(out, "client"), { recursive: true });
  fs.mkdirSync(path.join(out, "server"), { recursive: true });

  const browser = await chromium.launch({ args: ["--disable-gpu"] });
  const results = [];
  for (const entry of files) {
    const { file } = entry;
    const id = idOf(entry), res = { id };
    if (!priv) res.file = path.basename(file);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(scrub(String(e)).slice(0, 300)));
    try {
      const up = await ctx.request.post(base + "/example/upload", { multipart: { uploadedFile: {
        name: priv ? id + ".docx" : path.basename(file),
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: fs.readFileSync(file) } } });
      const j = await up.json();
      if (j.error) throw new Error("upload: " + j.error);
      await page.goto(`${base}/example/editor?fileName=${encodeURIComponent(j.filename)}&lang=en`, { waitUntil: "load" });
      const frame = await (await page.waitForSelector("iframe[name=frameEditor]", { timeout: 90000 })).contentFrame();
      await frame.waitForFunction(() => {
        const e = window.editor, w = e && e.WordControl, dd = w && w.m_oDrawingDocument, ld = w && w.m_oLogicDocument;
        return dd && ld && dd.m_lPagesCount > 0 && dd.m_lCountCalculatePages >= dd.m_lPagesCount && !(ld.FullRecalc && ld.FullRecalc.Id) && !e.isLongAction();
      }, null, { timeout: 120000, polling: 500 });
      await page.waitForTimeout(1500);
      res.pages = await frame.evaluate(() => window.editor.WordControl.m_oDrawingDocument.m_lPagesCount);

      const exportPdf = async (client) => {
        await frame.evaluate((c) => window.AscCommon.ClientPdf.setEnabled(c), client);
        const reqs = [];
        const onReq = (r) => { const b = r.postDataBuffer(); reqs.push({ url: r.url().slice(0, 160), method: r.method(), bytes: b ? b.length : 0 }); };
        ctx.on("request", onReq);
        const t0 = Date.now();
        const [dl] = await Promise.all([
          page.waitForEvent("download", { timeout: 180000 }),
          frame.evaluate(() => window.editor.asc_DownloadAs(new window.Asc.asc_CDownloadOptions(window.Asc.c_oAscFileType.PDF))),
        ]);
        const target = path.join(out, client ? "client" : "server", id + ".pdf");
        await dl.saveAs(target);
        ctx.off("request", onReq);
        const ms = Date.now() - t0;
        const last = client ? await frame.evaluate(() => window.AscCommon.ClientPdf.last) : null;
        return { ms, bytes: fs.statSync(target).size, requests: reqs, stats: last };
      };
      res.server = await exportPdf(false);
      res.client = await exportPdf(true);
      await frame.evaluate(() => window.AscCommon.ClientPdf.setEnabled(true));
      const uploads = res.client.requests.filter((r) => r.method !== "GET" || r.bytes > 0);
      res.client.uploads = uploads.length;
      res.client.uploadBytes = uploads.reduce((a, r) => a + r.bytes, 0);
      if (res.client.stats && res.client.stats.error) res.fallback = scrub(res.client.stats.error);
      if (priv && res.client.stats) res.client.stats = stripNames(res.client.stats);
    } catch (e) {
      res.error = scrub(String(e && e.message || e)).slice(0, 400);
    }
    res.pageErrors = errors;
    results.push(res);
    const c = res.client || {}, s = res.server || {};
    console.log(scrub(id + " " + (res.error ? "ERROR " + res.error : `pages ${res.pages} client ${c.ms}ms ${c.bytes}B (writer ${c.stats && c.stats.totalMs}ms) server ${s.ms}ms ${s.bytes}B uploads ${c.uploads}${res.fallback ? " FALLBACK " + res.fallback : ""}`)));
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, "bench.json"), scrub(JSON.stringify(results, null, 1)));
}

main().catch((e) => {
  console.error(scrub(e && e.stack || e));
  process.exit(1);
});
