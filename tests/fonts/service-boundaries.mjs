// SPDX-License-Identifier: AGPL-3.0-only
// Failure-path gate: selected budgets, opt-out/regrant epochs and sparse oversized files.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),product=path.resolve(new URL('../..',import.meta.url).pathname);
const sdk=process.env.EO_SDKJS,work=process.env.EO_FONT_WORK;assert(sdk&&work);
const source=await fs.readFile(path.join(sdk,'common/clientpdf/wasm-fonts.js'),'utf8');
let epoch=0,allowed=true,changeDuringRead=false;
const a=new Uint8Array(100*1024*1024),b=new Uint8Array(100*1024*1024);
const files=['a','b'].map(Id=>({Id,localFontData:{fileId:Id},Status:-1}));
const infos=files.map(file=>({isLocalFont:true,GetFontID:()=>({file,faceIndex:0})}));
const window={AscFonts:{g_font_infos:infos,g_map_font_index:{A:0,B:1}},
 Common:{ElixirLocalFonts:{hasConsent:()=>allowed,desktopPolicy:{epoch:()=>epoch}}},
 eoDesktop:{fontConsent(){throw Error('Must not prompt');},fontPermission:async()=>allowed},
 AscCommon:{g_font_loader:{},ClientPdf:{fonts:{get:async name=>{
  if(changeDuringRead){epoch+=2;changeDuringRead=false;}
  return {key:name.toLowerCase()+'#0',fileKey:name.toLowerCase(),faceIndex:0,bytes:name==='A'?a:b};
 }}}}};
vm.runInNewContext(source,{window,Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URL,Map,Set});
const service=window.EOWasmFonts;
const result=await service.ensureFonts([{name:'A',style:0},{name:'B',style:0},{name:'B',style:1}]);
assert.equal(result.written.length,1);assert.equal(result.missing.length,2);assert.equal(result.bytes,100*1024*1024);
assert(result.missing.every(entry=>/192 MiB/.test(entry.reason)),'Failed file reservation must not bypass the cap for a later style');
changeDuringRead=true;
const stale=await service.ensureFonts([{name:'A',style:0}]);assert.equal(stale.written.length,0);assert.match(stale.missing[0].reason,/consent changed/);
const {Fonts}=require(path.join(product,'desktop/fonts.cjs'));
const directory=path.join(work,'boundary-fixtures');await fs.mkdir(directory,{recursive:true});
const large=path.join(directory,'oversized.ttf');const handle=await fs.open(large,'w');await handle.truncate(129*1024*1024);await handle.close();
try{
 const fonts=new Fonts();fonts.allowed=[directory];fonts.configure({bundleIdentity:'oversize'});
 const index=await fonts.index();assert.equal(index.system.length,0);assert.equal(index.stats.skipped,1);
 fonts.files.set('oversized',{real:large});await assert.rejects(fonts.read('oversized'),/128 MiB/);fonts.clear();
}finally{await fs.rm(directory,{recursive:true,force:true});}
const {build}=require(path.join(product,'desktop/font-index-worker.cjs'));
const metadataDirectory=path.join(work,'metadata-boundary');
await fs.mkdir(metadataDirectory,{recursive:true});
try{
 await assert.rejects(build({roots:[],cacheDir:metadataDirectory,bundleIdentity:'x'.repeat(33*1024*1024)}),/metadata exceeds 32 MiB/);
 assert.deepEqual(await fs.readdir(metadataDirectory),[],'Oversized generated metadata must not leave a cache or partial file');
 const recovered=await build({roots:[],cacheDir:metadataDirectory,bundleIdentity:'normal'});
 assert.equal(recovered.system.length,0);
 const cache=path.join(metadataDirectory,'index-v3.json');
 assert.equal(JSON.parse(await fs.readFile(cache,'utf8')).version,3);assert((await fs.stat(cache)).size<=32*1024*1024);
}finally{await fs.rm(metadataDirectory,{recursive:true,force:true});}
console.log('PASS generated metadata write cap/no partial file/recovery');
console.log('PASS prospective selected-byte cap/repeated-style rejection/revocation+regrant epoch/sparse129MiB skip+read rejection');
