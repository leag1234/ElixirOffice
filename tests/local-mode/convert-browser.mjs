// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE;
assert.ok(base&&!/:8080(?:\/|$)/.test(base),'explicit own EO_BASE required');
const fixtures=process.env.EO_LOCAL_FIXTURES,out=process.env.EO_LOCAL_OUT;
assert.ok(fixtures&&out,'EO_LOCAL_FIXTURES and EO_LOCAL_OUT required');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const dynamic=[];
 page.on('request',r=>{if(r.method()!=='GET'||/\/(doc\/|ConvertService|upload|coauthoring)/i.test(r.url()))dynamic.push(r.url());});
 page.on('websocket',w=>dynamic.push(w.url()));
 await page.goto(base+'/example/local.html');
 await page.addScriptTag({url:base+'/sdkjs/common/clientpdf/wasm-fonts.js'});
 await page.addScriptTag({url:base+'/sdkjs/common/wasm-convert/api.js'});
 const map={docx:'doct',odt:'doct',xlsx:'xlst',ods:'xlst',pptx:'pptt',odp:'pptt'};
 const report=[];
 for(const from of Object.keys(map)){
  const name=fs.readdirSync(fixtures).find(f=>f.endsWith('.'+from));
  assert.ok(name,'fixture '+from);
  const data=Array.from(fs.readFileSync(path.join(fixtures,name)));
  const result=await page.evaluate(async({data,from,to})=>{
   const start=performance.now(),progress=[];
   const input=new Uint8Array(data).buffer;
   const bin=await EOWasmConvert.convert(input,from,to,{onProgress:p=>progress.push(p.stage)});
   if(input.byteLength!==data.length)throw new Error('Caller input was detached');
   const sizes=bin.resources.map(f=>f.bytes.length);
   const back=await EOWasmConvert.convert(bin,to,from,{resources:bin.resources});
   if(bin.resources.some((f,i)=>f.bytes.length!==sizes[i]))throw new Error('Caller resources were detached');
   return {header:new TextDecoder().decode(bin.slice(0,25)),bytes:Array.from(back),resources:bin.resources.length,open:bin.stats,save:back.stats,totalMs:Math.round(performance.now()-start),progress};
  },{data,from,to:map[from]});
  assert.equal(result.bytes[0],80);assert.equal(result.bytes[1],75);
  fs.writeFileSync(path.join(out,'roundtrip.'+from),Buffer.from(result.bytes));
  delete result.bytes;report.push({from,...result});console.log('PASS',from,JSON.stringify(result));
 }
 await assert.rejects(page.evaluate(()=>EOWasmConvert.convert(new Uint8Array([1]),'unknown','docx')),/Unsupported conversion/);
 const cancelled=await page.evaluate(async()=>{
  const abort=new AbortController();abort.abort();
  try{await EOWasmConvert.convert(new Uint8Array([1]),'docx','doct',{signal:abort.signal});return false;}catch(e){return e.code==='cancelled';}
 });
 assert.equal(cancelled,true);
 const stopped=await page.evaluate(async()=>{
  const abort=new AbortController();
  try{await EOWasmConvert.convert(new Uint8Array([1]),'docx','doct',{signal:abort.signal,onProgress:()=>abort.abort()});return false;}catch(e){return e.code==='cancelled';}
 });
 assert.equal(stopped,true);
 const resourceError=await page.evaluate(async()=>{
  try{await EOWasmConvert.convert(new Uint8Array([1]),'doct','docx',{resources:[{path:'media/../escape',bytes:new Uint8Array([1])}]});return false;}catch(e){return /Invalid resource path/.test(e.message);}
 });
 assert.equal(resourceError,true);
 await assert.rejects(page.evaluate(()=>EOWasmConvert.convert(new Uint8Array([1]),'docx','doct',{resources:[{uncloneable:function(){}}]})),/cannot be sent to a worker/);
 assert.equal(page.workers().length,0,'no worker retained after a conversion or input error');assert.deepEqual(dynamic,[]);
 fs.writeFileSync(path.join(out,'conversion-report.json'),JSON.stringify(report,null,2));
 console.log('PASS six-format native conversion round trips, invalid format, cancellation, zero dynamic document-server requests');
}finally{await browser.close();}
