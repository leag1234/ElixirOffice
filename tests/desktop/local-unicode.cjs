// SPDX-License-Identifier: AGPL-3.0-only
// Actual pinned converter; synthetic public Unicode, no private corpus.
'use strict';
const {launch,editable,stop,root,fixture}=require('./harness.cjs'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const marker='A456_UNICODE é Ελληνικά 中文 😀';
const failures=[];
(async()=>{
 const directory=path.join(root,'tmp/unicode');await fs.mkdir(directory,{recursive:true});let env=await launch({file:await fixture('sample.docx'),profile:'unicode-word-'+Date.now()});
 try{
  await editable(env);
  await env.page.evaluate(marker=>{const api=EOLocalSession.api;api.WordControl.m_oLogicDocument.MoveCursorToStartPos();api.asc_enterText(Array.from(marker+' ',c=>c.codePointAt(0)))},marker);
  for(const format of ['txt','rtf']){
   const bytes=await env.page.evaluate(async format=>{const {win,controller}=EOLocalSession,snap=await controller.snapshot();return Array.from(await win.EOWasmConvert.convert(snap.bytes,snap.format,format,{resources:snap.resources}))},format);
   const buffer=Buffer.from(bytes);await fs.writeFile(path.join(directory,'public.'+format),buffer);
   if(format==='txt')assert(new TextDecoder('utf-8',{fatal:true}).decode(buffer).includes(marker));
   console.log('PASS actual Word Unicode export',format,buffer.length);
  }
 }finally{await stop(env)}
 for(const format of ['txt','rtf']){
  const source=path.join(directory,'public.'+format),before=await fs.readFile(source);env=await launch({file:source,profile:'unicode-open-'+format+'-'+Date.now()});
  try{await editable(env);const text=await env.page.evaluate(()=>EOLocalSession.api.WordControl.m_oLogicDocument.GetAllParagraphs().map(p=>p.GetText()).join('\n'));console.log('UNICODE IMPORT DIAGNOSTIC',format,JSON.stringify(text.slice(0,100)));const roundtrip=await env.page.evaluate(async()=>{const {controller,win}=EOLocalSession,snap=await controller.snapshot();return Array.from(await win.EOWasmConvert.convert(snap.bytes,snap.format,'txt',{resources:snap.resources}))});const decoded=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(roundtrip));console.log('UNICODE REEXPORT DIAGNOSTIC',format,JSON.stringify(decoded.slice(0,100)));try{assert(decoded.includes(marker))}catch(error){failures.push({format,error:String(error)});console.error('FAIL actual Unicode roundtrip',format,JSON.stringify(decoded.slice(0,100)))}assert.deepEqual(await fs.readFile(source),before);if(!failures.some(value=>value.format===format))console.log('PASS actual converted-copy Unicode open',format)}
  finally{await stop(env)}
 }
 env=await launch({file:await fixture('sample.xlsx'),profile:'unicode-csv-'+Date.now()});
 try{
  await editable(env);await env.page.evaluate(marker=>new Promise(resolve=>EOLocalSession.api.callCommand("Api.AddSheet('Public UTF8');var sheet=Api.GetSheet('Public UTF8');sheet.SetActive();sheet.GetRange('A1').SetValue("+JSON.stringify(marker)+");",true,resolve)),marker);
  const result=await env.page.evaluate(async()=>{const {win,controller,api}=EOLocalSession,snap=await controller.snapshot();return {index:api.asc_getActiveWorksheetIndex(),bytes:Array.from(await win.EOWasmConvert.convert(snap.bytes,snap.format,'csv',{resources:snap.resources}))}});
  assert(result.index>0);const bytes=Buffer.from(result.bytes);assert(new TextDecoder('utf-8',{fatal:true}).decode(bytes).includes(marker));await fs.writeFile(path.join(directory,'public.csv'),bytes);
  console.log('PASS actual UTF8 CSV active-sheet Unicode export',result.index,bytes.length);
 }finally{await stop(env)}
 const source=path.join(directory,'public.csv'),before=await fs.readFile(source);env=await launch({file:source,profile:'unicode-open-csv-'+Date.now()});
 try{
  await editable(env);
  const value=await env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand("Api.GetActiveSheet().GetRange('A1').GetValue();",true,resolve)));
  assert.equal(value,marker);assert.deepEqual(await fs.readFile(source),before);console.log('PASS actual converted-copy CSV Unicode open');
 }finally{await stop(env)}
assert.deepEqual(failures,[],'Unicode format roundtrip failures');
})().catch(error=>{console.error(error);process.exitCode=1});
