// Cold/warm open+save benchmark of x2t.wasm on one file (run once per file).
// usage: node --expose-gc bench_synth.mjs X2T_JS FILE FONTS_DIR [RUNS]
// cold  = fresh process: compile + first instance (+fonts) + first conversion
// warm  = median of RUNS conversions, each on a fresh instance of the compiled module
//         (the production mode: one instance per conversion); inst_ms is reported apart
// Prints one JSON line: times in ms, wasm linear memory and process peak RSS in MB.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const [x2tJs, file, fontsDir, runsArg] = process.argv.slice(2);
const runs = Number(runsArg || 5);
const FMT = { docx: 0x41, xlsx: 0x101, doct: 0x2001, xlst: 0x2002 };
const ext = path.extname(file).slice(1), canvas = ext === "docx" ? "doct" : "xlst";
const T0 = performance.now();
const createX2t = createRequire(import.meta.url)(path.resolve(x2tJs));
const wasmModule = await WebAssembly.compile(fs.readFileSync(x2tJs.replace(/\.js$/, ".wasm")));
const compileMs = performance.now() - T0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const fonts = [];
for (const f of ["AllFonts.js", "font_selection.bin"]) for (const d of ["/fonts", ""]) fonts.push([`${d}/${f}`, fs.readFileSync(path.join(fontsDir, f))]);
const root = path.join(fontsDir, "root");
for (const f of walk(root)) fonts.push(["/" + path.relative(root, f).split(path.sep).join("/"), fs.readFileSync(f)]);

async function instance() {
  const t = performance.now();
  const mod = await createX2t({ print() {}, printErr() {}, instantiateWasm(i, done) { WebAssembly.instantiate(wasmModule, i).then((x) => done(x)); return {}; } });
  for (const [p, d] of fonts) { mod.FS.mkdirTree(path.posix.dirname(p)); mod.FS.writeFile(p, d); }
  return [mod, performance.now() - t];
}
function convert(mod, src, dst, fmt) {
  const FS = mod.FS; FS.mkdirTree("/tmp/x");
  FS.writeFile("/task.xml", `<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>${src}</m_sFileFrom><m_sFileTo>${dst}</m_sFileTo><m_nFormatTo>${fmt}</m_nFormatTo><m_bIsNoBase64>true</m_bIsNoBase64><m_sAllFontsPath>/fonts/AllFonts.js</m_sAllFontsPath><m_sTempDir>/tmp/x</m_sTempDir></TaskQueueDataConvert>`);
  const t = performance.now(); let rc;
  try { rc = mod.callMain(["/task.xml"]); } catch (e) { rc = typeof e?.status === "number" ? e.status : "exc:" + (e?.message || e); }
  return [performance.now() - t, rc];
}
const mem = (m) => m.HEAPU8.length / 1048576;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const input = fs.readFileSync(file);
const back = ext;
const res = { file: path.basename(file), ext, compile_ms: compileMs };

// cold
let [mod, inst] = await instance();
res.cold_init_ms = compileMs + inst;
mod.FS.writeFile(`/in.${ext}`, input);
let [ms, rc] = convert(mod, `/in.${ext}`, "/Editor.bin", FMT[canvas]);
res.cold_open_ms = ms; res.rc_open = rc; res.mem_open_mb = mem(mod);
const bin = mod.FS.readFile("/Editor.bin"); res.bin_bytes = bin.length;
[ms, rc] = convert(mod, "/Editor.bin", `/out.${back}`, FMT[back]);
res.cold_save_ms = ms; res.rc_save = rc; res.mem_save_mb = mem(mod);
res.out_bytes = mod.FS.stat(`/out.${back}`).size;

// warm: fresh instance per conversion
const o = [], s = [], io = [];
for (let r = 0; r < runs; r++) {
  mod = null; globalThis.gc?.();
  let [m, i] = await instance(); io.push(i);
  m.FS.writeFile(`/in.${ext}`, input);
  o.push(convert(m, `/in.${ext}`, "/Editor.bin", FMT[canvas])[0]);
  m = null; globalThis.gc?.();
  [m, i] = await instance();
  m.FS.writeFile("/Editor.bin", bin);
  s.push(convert(m, "/Editor.bin", `/out.${back}`, FMT[back])[0]);
  mod = m;
}
res.warm_open_ms = med(o); res.warm_save_ms = med(s); res.inst_ms = med(io);
res.warm_open_all = o.map((x) => +x.toFixed(0)); res.warm_save_all = s.map((x) => +x.toFixed(0));
res.rss_peak_mb = process.resourceUsage().maxRSS / 1024;
for (const k in res) if (typeof res[k] === "number") res[k] = +res[k].toFixed(1);
console.log(JSON.stringify(res));
