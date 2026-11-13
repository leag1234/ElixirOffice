// SPDX-License-Identifier: AGPL-3.0-only
// Convert one file with x2t.wasm under Node: node docx-roundtrip-x2t.mjs X2T_JS IN OUT FROM_FORMAT TO_FORMAT
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const [x2tJs, inp, outp, from, to] = process.argv.slice(2);
const create = createRequire(import.meta.url)(path.resolve(x2tJs));
const wasmModule = await WebAssembly.compile(fs.readFileSync(x2tJs.replace(/\.js$/, ".wasm")));
const mod = await create({ print() {}, printErr() {}, instantiateWasm(imports, done) { WebAssembly.instantiate(wasmModule, imports).then((i) => done(i)); return {}; } });
const FS = mod.FS; FS.mkdirTree("/w"); FS.mkdirTree("/tmp/w");
FS.writeFile("/w/in", fs.readFileSync(inp));
FS.writeFile("/task.xml", `<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>/w/in</m_sFileFrom><m_sFileTo>/w/out</m_sFileTo>${from ? `<m_nFormatFrom>${from}</m_nFormatFrom>` : ""}<m_nFormatTo>${to}</m_nFormatTo><m_bIsNoBase64>true</m_bIsNoBase64><m_sTempDir>/tmp/w</m_sTempDir></TaskQueueDataConvert>`);
let rc; try { rc = mod.callMain(["/task.xml"]); } catch (e) { rc = e?.status ?? String(e); }
if (rc !== 0) { console.error("x2t failed", rc); process.exit(1); }
fs.writeFileSync(outp, FS.readFile("/w/out"));
