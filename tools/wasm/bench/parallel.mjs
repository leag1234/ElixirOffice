// Throughput with K independent x2t instances in worker threads (no
// SharedArrayBuffer needed: each worker has its own module and memory).
// usage: node parallel.mjs X2T_JS CORPUS_DIR K
import fs from "node:fs";
import path from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

if (isMainThread) {
  const [x2tJs, corpus, kArg] = process.argv.slice(2);
  const k = Number(kArg || 1);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = walk(corpus).filter((f) => f.endsWith(".docx")).sort();
  const wasm = await WebAssembly.compile(fs.readFileSync(x2tJs.replace(/\.js$/, ".wasm")));
  const t0 = performance.now();
  const jobs = files.slice();
  let done = 0;
  await Promise.all(Array.from({ length: k }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { x2tJs: path.resolve(x2tJs), wasm } });
    const next = () => { const f = jobs.shift(); if (f) w.postMessage(f); else { w.terminate(); resolve(); } };
    w.on("message", (m) => { if (m !== "ready") done++; next(); });
    w.on("error", reject);
  })));
  const ms = performance.now() - t0;
  console.log(`K=${k} files=${done} wall=${ms.toFixed(0)}ms throughput=${(done / ms * 1000).toFixed(2)} docx->doct/s`);
} else {
  const create = createRequire(import.meta.url)(workerData.x2tJs);
  const mod = await create({ print() {}, printErr() {}, instantiateWasm(imp, ok) { WebAssembly.instantiate(workerData.wasm, imp).then(ok); return {}; } });
  let n = 0;
  parentPort.on("message", (f) => {
    const dir = `/j${++n}`; mod.FS.mkdirTree(`${dir}/tmp`);
    mod.FS.writeFile(`${dir}/in.docx`, fs.readFileSync(f));
    mod.FS.writeFile(`${dir}/t.xml`, `<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>${dir}/in.docx</m_sFileFrom><m_sFileTo>${dir}/Editor.bin</m_sFileTo><m_nFormatTo>8193</m_nFormatTo><m_bIsNoBase64>true</m_bIsNoBase64><m_sTempDir>${dir}/tmp</m_sTempDir></TaskQueueDataConvert>`);
    try { mod.callMain([`${dir}/t.xml`]); } catch {}
    parentPort.postMessage("done");
  });
  parentPort.postMessage("ready");
}
