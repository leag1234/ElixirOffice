// SPDX-License-Identifier: AGPL-3.0-only
// One real production Wasm module per selected-FS proof job.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const [runtime,directory]=process.argv.slice(2);
const compiled=await WebAssembly.compile(fs.readFileSync(path.join(runtime,'x2t.wasm')));
const factory=createRequire(import.meta.url)(path.join(runtime,'x2t.js'));
if(typeof factory!=='function')throw Error('Production runtime has no Node factory');
const messages=[];
const mod=await factory({noInitialRun:true,print:line=>messages.push(line),printErr:line=>messages.push(line),
 instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(compiled,imports);receive(instance,compiled);return instance.exports;}});
const FS=mod.FS;for(const name of ['/p','/fonts','/tmp/pdf'])FS.mkdirTree(name);
FS.writeFile('/p/in.bin',fs.readFileSync(path.join(directory,'drawing.bin')));
FS.writeFile('/font_selection.bin',fs.readFileSync(path.join(directory,'font_selection.bin')));
for(const name of fs.readdirSync(path.join(directory,'fonts')))FS.writeFile('/fonts/'+name,fs.readFileSync(path.join(directory,'fonts',name)));
FS.writeFile('/task.xml','<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert>'+
 '<m_sFileFrom>/p/in.bin</m_sFileFrom><m_sFileTo>/p/out.pdf</m_sFileTo>'+
 '<m_nFormatFrom>8196</m_nFormatFrom><m_nFormatTo>513</m_nFormatTo>'+
 '<m_bIsNoBase64>true</m_bIsNoBase64><m_sFontDir>/fonts</m_sFontDir><m_sTempDir>/tmp/pdf</m_sTempDir></TaskQueueDataConvert>');
let rc;const start=performance.now();
try{rc=mod.callMain(['/task.xml']);}catch(error){if(typeof error.status==='number')rc=error.status;else throw error;}
let output;try{output=FS.readFile('/p/out.pdf');}catch{}
const report={runtime,case:path.basename(directory),rc,pdfBytes:output?.length||0,ms:performance.now()-start,heapBytes:mod.HEAPU8.length,messages};
fs.writeFileSync(path.join(directory,'wasm-result.json'),JSON.stringify(report,null,2)+'\n');
if(rc!==0||!output||Buffer.from(output.subarray(0,5)).toString()!=='%PDF-')throw Error(JSON.stringify(report));
fs.writeFileSync(path.join(directory,'output.pdf'),output);console.log(JSON.stringify({...report,messages:messages.length}));
