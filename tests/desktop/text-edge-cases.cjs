// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,editable,stop,root,fixture}=require('./harness.cjs'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await fs.mkdir(path.join(root,'tmp'),{recursive:true});
 const empty=path.join(root,'tmp/empty.txt');await fs.writeFile(empty,'');let env=await launch({file:empty,profile:'empty-text-'+Date.now()});
 try{
  assert.equal((await editable(env)).format,'docx');
  const output=await env.page.evaluate(async()=>{const {win,controller}=EOLocalSession,snap=await controller.snapshot();return Array.from(await win.EOWasmConvert.convert(snap.bytes,snap.format,'txt',{resources:snap.resources}))});
  assert(output.length<=4);assert.equal((await fs.stat(empty)).size,0);console.log('PASS empty TXT opens as converted copy and exports empty text');
 }finally{await stop(env)}
 env=await launch({file:await fixture('sample.xlsx'),profile:'active-csv-'+Date.now()});
 try{
  await editable(env);
  await env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand("Api.AddSheet('Public active CSV');var sheet=Api.GetSheet('Public active CSV');sheet.SetActive();sheet.GetRange('A1').SetValue('A456_ACTIVE_é');",true,resolve)));
  const result=await env.page.evaluate(async()=>{const {win,controller,api}=EOLocalSession,snap=await controller.snapshot(),bytes=await win.EOWasmConvert.convert(snap.bytes,snap.format,'csv',{resources:snap.resources});const xlsx=await win.EOWasmConvert.convert(snap.bytes,snap.format,'xlsx',{resources:snap.resources}),viaXlsx=await win.EOWasmConvert.convert(xlsx,'xlsx','csv');return {index:api.asc_getActiveWorksheetIndex(),text:new TextDecoder().decode(bytes),viaXlsx:new TextDecoder().decode(viaXlsx)}});
  console.log('CSV DIAGNOSTIC',JSON.stringify(result));assert(result.index>0);assert(result.text.includes('A456_ACTIVE_é'));console.log('PASS CSV exports active worksheet and preserves UTF-8');
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
