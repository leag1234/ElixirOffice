// SPDX-License-Identifier: AGPL-3.0-only
// PDF writing in x2t.wasm from the sdkjs drawing-command stream (bin2pdf,
// design B of docs/client-pdf.md): the same input the browser prototype uses.
// usage: node bench_pdf.mjs X2T_JS STREAM_DIR OUT_DIR FONTS_DIR [RUNS]
// STREAM_DIR holds <name>.bin files (raw asc_nativeGetPDF output) and, optionally,
// <name>/media/* (the document images the stream refers to).
// Writes OUT_DIR/<name>.wasm.pdf and OUT_DIR/pdf.csv: file,run,ms,rc,pdf_bytes
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const [x2tJs, dir, out, fontsDir, runsArg] = process.argv.slice(2);
const runs = Number(runsArg || 3);
const mod = await createRequire(import.meta.url)(path.resolve(x2tJs))(process.env.DEBUG ? {} : { print() {}, printErr() {} });
const FS = mod.FS;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of ["AllFonts.js", "font_selection.bin"]) { FS.mkdirTree("/fonts"); const d = fs.readFileSync(path.join(fontsDir, f)); FS.writeFile(`/fonts/${f}`, d); FS.writeFile(`/${f}`, d); }
// x2t reads font_selection.bin from its "process directory", which is / in the module FS
const root = path.join(fontsDir, "root");
for (const f of walk(root)) { const p = "/" + path.relative(root, f).split(path.sep).join("/"); FS.mkdirTree(path.posix.dirname(p)); FS.writeFile(p, fs.readFileSync(f)); }
fs.mkdirSync(out, { recursive: true });
const rows = [["file", "run", "ms", "rc", "pdf_bytes"]];
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".bin")).sort()) {
  const name = f.slice(0, -4);
  FS.mkdirTree(`/p/${name}`); FS.mkdirTree(`/tmp/p-${name}`);
  FS.writeFile(`/p/${name}/in.bin`, fs.readFileSync(path.join(dir, f)));
  // images referenced by the stream (media/imageN.png) are resolved next to the input
  const media = path.join(dir, name, "media");
  if (fs.existsSync(media)) { FS.mkdirTree(`/p/${name}/media`); for (const m of fs.readdirSync(media)) FS.writeFile(`/p/${name}/media/${m}`, fs.readFileSync(path.join(media, m))); }
  FS.writeFile("/task.xml", `<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>/p/${name}/in.bin</m_sFileFrom>` +
    `<m_sFileTo>/p/${name}/out.pdf</m_sFileTo><m_nFormatFrom>8196</m_nFormatFrom><m_nFormatTo>513</m_nFormatTo><m_bIsNoBase64>true</m_bIsNoBase64>` +
    `<m_sAllFontsPath>/fonts/AllFonts.js</m_sAllFontsPath><m_sTempDir>/tmp/p-${name}</m_sTempDir></TaskQueueDataConvert>`);
  for (let r = 0; r < runs; r++) {
    try { FS.unlink(`/p/${name}/out.pdf`); } catch {}
    const t = performance.now();
    let rc; try { rc = mod.callMain(["/task.xml"]); } catch (e) { rc = typeof e?.status === "number" ? e.status : `exc:${e?.message || e}`; }
    const ms = performance.now() - t;
    let size = 0; try { size = FS.stat(`/p/${name}/out.pdf`).size; } catch {}
    rows.push([name, r, ms.toFixed(1), rc, size]);
  }
  try { fs.writeFileSync(path.join(out, `${name}.wasm.pdf`), FS.readFile(`/p/${name}/out.pdf`)); } catch {}
}
fs.writeFileSync(path.join(out, "pdf.csv"), rows.map((r) => r.join(",")).join("\n") + "\n");
console.log(rows.map((r) => r.join(",")).join("\n"));
