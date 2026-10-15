// Benchmark x2t.wasm under Node: office -> editor format -> office, per file.
// usage: node bench_wasm.mjs X2T_JS CORPUS_DIR OUT_DIR [RUNS] [FONTS_DIR]
// Files live only in the module's in-memory FS (same as in a browser).
// Writes OUT_DIR/wasm.csv: file,step,run,ms,heap_mb,rc,out_bytes
// FRESH=1: a new module instance per conversion (from the compiled module),
// the "inst_ms" column then holds the instantiation cost.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const [x2tJs, corpus, out, runsArg, fontsDir] = process.argv.slice(2);
const runs = Number(runsArg || 3);
const FMT = { docx: 0x41, odt: 0x43, pptx: 0x81, odp: 0x83, xlsx: 0x101, ods: 0x103, doct: 0x2001, xlst: 0x2002, pptt: 0x2003 };
const CANVAS = { docx: "doct", odt: "doct", xlsx: "xlst", ods: "xlst", pptx: "pptt", odp: "pptt" };
const BACK = { doct: "docx", xlst: "xlsx", pptt: "pptx" };

const fresh = process.env.FRESH === "1";
const t0 = performance.now();
const createX2t = createRequire(import.meta.url)(path.resolve(x2tJs));
const wasmModule = await WebAssembly.compile(fs.readFileSync(x2tJs.replace(/\.js$/, ".wasm")));
const compileMs = performance.now() - t0;
const newInstance = () => createX2t({
  print: () => {}, printErr: () => {},
  instantiateWasm(imports, done) { WebAssembly.instantiate(wasmModule, imports).then((i) => done(i)); return {}; },
});
let mod = await newInstance();
const initMs = performance.now() - t0;
let FS = mod.FS;

// Optional fonts: AllFonts.js + font_selection.bin + the font files, copied
// into /fonts (AllFonts.js must reference /fonts/... paths).
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
let fontsXml = "";
// FONTS_DIR layout: AllFonts.js, font_selection.bin, root/<absolute font paths>
const fontFiles = [];
if (fontsDir) {
  // x2t reads font_selection.bin from its "process directory" (/ in the module FS)
  for (const f of ["AllFonts.js", "font_selection.bin"]) for (const d of ["/fonts", ""]) fontFiles.push([`${d}/${f}`, fs.readFileSync(path.join(fontsDir, f))]);
  const root = path.join(fontsDir, "root");
  for (const f of walk(root)) fontFiles.push(["/" + path.relative(root, f).split(path.sep).join("/"), fs.readFileSync(f)]);
}
function loadFonts() {
  if (!fontsDir) return;
  for (const [p, data] of fontFiles) { FS.mkdirTree(path.posix.dirname(p)); FS.writeFile(p, data); }
  fontsXml = "<m_sAllFontsPath>/fonts/AllFonts.js</m_sAllFontsPath>";
}
loadFonts();
let instMs = 0;
async function maybeFresh(files) {
  if (!fresh) return;
  const keep = files.map((p) => { try { return [p, FS.readFile(p)]; } catch { return null; } }).filter(Boolean);
  const t = performance.now();
  mod = await newInstance(); FS = mod.FS; loadFonts();
  instMs = performance.now() - t;
  for (const [p, d] of keep) { FS.mkdirTree(path.posix.dirname(p)); FS.writeFile(p, d); }
}

let seq = 0;
function rmTree(p) {
  for (const n of FS.readdir(p)) {
    if (n === "." || n === "..") continue;
    const q = `${p}/${n}`;
    if (FS.isDir(FS.stat(q).mode)) rmTree(q); else FS.unlink(q);
  }
  FS.rmdir(p);
}
function convert(src, dst, fmt) {
  // one private temp dir per conversion, as the server does
  const tmp = `/tmp/x2t-${++seq}`;
  FS.mkdirTree(tmp);
  FS.writeFile("/task.xml",
    `<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>${src}</m_sFileFrom>` +
    `<m_sFileTo>${dst}</m_sFileTo><m_nFormatTo>${fmt}</m_nFormatTo><m_bIsNoBase64>true</m_bIsNoBase64>` +
    `${fontsXml}<m_sTempDir>${tmp}</m_sTempDir></TaskQueueDataConvert>`);
  const t = performance.now();
  let rc;
  try { rc = mod.callMain(["/task.xml"]); } catch (e) { rc = typeof e?.status === "number" ? e.status : `exc:${e?.message || e}`; }
  const ms = performance.now() - t;
  try { rmTree(tmp); } catch {}
  return [ms, rc];
}

const files = walk(corpus).filter((f) => CANVAS[path.extname(f).slice(1)]).sort();
fs.mkdirSync(out, { recursive: true });
const rows = [["file", "step", "run", "ms", "heap_mb", "rc", "out_bytes", "inst_ms"], ["(init)", "compile", 0, compileMs.toFixed(1), 0, 0, 0, 0], ["(init)", "compile+instantiate", 0, initMs.toFixed(1), 0, 0, 0, 0]];
const heap = () => (mod.wasmMemory?.buffer?.byteLength ?? mod.HEAPU8?.length ?? 0) / 1048576;
const size = (p) => { try { return FS.stat(p).size; } catch { return 0; } };

for (const f of files) {
  const ext = path.extname(f).slice(1), canvas = CANVAS[ext];
  const stem = path.relative(corpus, f).split(path.sep).join("__");
  const input = fs.readFileSync(f);
  for (let r = 0; r < runs; r++) {
    const bin = `/w/${stem}/Editor.bin`, back = `/w/${stem}/back.${BACK[canvas]}`;
    await maybeFresh([]);
    FS.mkdirTree(`/w/${stem}`);
    FS.writeFile(`/w/${stem}/in.${ext}`, input);
    for (const p of [bin, back]) { try { FS.unlink(p); } catch {} }
    let [ms, rc] = convert(`/w/${stem}/in.${ext}`, bin, FMT[canvas]);
    rows.push([stem, `${ext}->${canvas}`, r, ms.toFixed(1), heap().toFixed(0), rc, size(bin), instMs.toFixed(1)]);
    await maybeFresh([bin]);
    FS.mkdirTree(`/w/${stem}`);
    [ms, rc] = convert(bin, back, FMT[BACK[canvas]]);
    rows.push([stem, `${canvas}->${BACK[canvas]}`, r, ms.toFixed(1), heap().toFixed(0), rc, size(back), instMs.toFixed(1)]);
  }
  const od = path.join(out, "wasm", stem);
  fs.mkdirSync(od, { recursive: true });
  for (const n of FS.readdir(`/w/${stem}`)) if (n !== "." && n !== ".." && !n.startsWith("in.") && FS.isFile(FS.stat(`/w/${stem}/${n}`).mode)) fs.writeFileSync(path.join(od, n), FS.readFile(`/w/${stem}/${n}`));
  try { FS.unlink(`/w/${stem}/in.${ext}`); } catch {}
}
rows.push(["(process)", "rss_peak_mb", 0, 0, (process.resourceUsage().maxRSS / 1024).toFixed(0), 0, 0, 0]);
fs.writeFileSync(path.join(out, "wasm.csv"), rows.map((r) => r.join(",")).join("\n") + "\n");
console.log(`compile ${compileMs.toFixed(0)} ms, init ${initMs.toFixed(0)} ms, heap ${heap().toFixed(0)} MB, wrote ${path.join(out, "wasm.csv")}`);
