// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const runtime=process.env.EO_X2T_RELEASE,upstream=process.env.EO_UPSTREAM,fixtures=process.env.EO_PASSWORD_FIXTURES;
assert(runtime&&upstream&&fixtures,'Explicit owned runtime/upstream/public fixture paths required');
const policy=require('../../desktop/password.cjs');
const factory=require(path.join(runtime,'x2t.js')),wasm=fs.readFileSync(path.join(runtime,'x2t.wasm'));
const password='é😀<&>"\r\n\t'+crypto.randomBytes(16).toString('hex'),other=crypto.randomBytes(16).toString('hex');
async function job(from,to,bytes,options={},desktop=false){
 const messages=[],context={performance,WebAssembly,Uint8Array,ArrayBuffer,Response,URL,Number,Map,
  self:{location:{href:'https://office.example.invalid/sdkjs/common/wasm-convert/worker.js'},postMessage(value){messages.push(value)}},
  importScripts(url){if(url.endsWith('password-options.js'))vm.runInContext(fs.readFileSync(path.join(upstream,'sdkjs/common/wasm-convert/password-options.js'),'utf8'),context);else context.createX2t=factory},
  fetch:async()=>new Response(wasm,{headers:{'Content-Type':'application/wasm'}})};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(desktop?path.join(__dirname,'../../desktop/legacy-worker.js'):path.join(upstream,'sdkjs/common/wasm-convert/worker.js'),'utf8'),context);
 await context.self.onmessage({data:{from,to,bytes:new Uint8Array(bytes),runtime:runtime+'/',files:[],resources:[],...options}});
 return messages.findLast(value=>!value.progress);
}
(async()=>{
 let count=0;
 for(const desktop of [false,true])for(const [office,odf,bin]of [['docx','odt','doct'],['xlsx','ods','xlst'],['pptx','odp','pptt']]){
  const source=fs.readFileSync(path.join(fixtures,'new.'+office)),opened=await job(office,bin,source,{},desktop);assert(opened.bytes,'plain fixture opens');
  for(const format of [office,odf]){
   const protectedFile=await job(bin,format,opened.bytes,{savePassword:password},desktop);assert(protectedFile.bytes,'encryption produces bytes');
   if(format===office)assert.equal(Buffer.from(protectedFile.bytes.subarray(0,8)).toString('hex'),'d0cf11e0a1b11ae1','Office output is encrypted compound file');
   assert(policy.encrypted(protectedFile.bytes,format),'Native encrypted-input detection');
   assert(policy.validate(protectedFile.bytes,format,{protected:true,remove:false},{recoveryLocked:true}).length,'Native encrypted Save validator accepts');
   assert.throws(()=>policy.validate(protectedFile.bytes,format,{protected:false,remove:false},{}),/requested password/);
   const missing=await job(format,bin,protectedFile.bytes,{},desktop);assert.equal(missing.code,'password-required');assert.equal(missing.nativeStatus,90);assert(!missing.bytes);
   const wrong=await job(format,bin,protectedFile.bytes,{openPassword:other},desktop);assert.equal(wrong.code,'password-incorrect');assert.equal(wrong.nativeStatus,91);assert(!wrong.bytes);
   const correct=await job(format,bin,protectedFile.bytes,{openPassword:password},desktop);assert(correct.bytes&&!correct.error,'correct password opens');
   const changed=await job(bin,format,correct.bytes,{savePassword:other},desktop);assert(changed.bytes);
   assert.equal((await job(format,bin,changed.bytes,{openPassword:password},desktop)).code,'password-incorrect');
   assert((await job(format,bin,changed.bytes,{openPassword:other},desktop)).bytes);
   const removed=await job(bin,format,correct.bytes,{},desktop);assert(removed.bytes);assert((await job(format,bin,removed.bytes,{},desktop)).bytes,'Remove by omission');
   assert.throws(()=>policy.validate(removed.bytes,format,{protected:false,remove:false},{protected:true,recoveryLocked:true}),/explicit Remove/);
   assert(policy.validate(removed.bytes,format,{protected:false,remove:true},{protected:true,recoveryLocked:true}).length);
   const empty=await job(bin,format,correct.bytes,{savePassword:''},desktop);assert.equal(empty.code,'password-options');assert(!empty.bytes,'Empty Protect/Change fails uniformly');
   const invalid=await job(bin,format,correct.bytes,{savePassword:'\u0000'+password},desktop);assert.equal(invalid.code,'password-options');assert(!invalid.bytes);
   for(const result of [protectedFile,missing,wrong,correct,changed,removed,empty,invalid]){
    const metadata={...result};delete metadata.bytes;delete metadata.resources;
    const encoded=JSON.stringify(metadata);assert(!encoded.includes(password)&&!encoded.includes(other),'no password in diagnostic metadata');
   }
   count++;console.log('PASS',desktop?'desktop-worker':'web-worker',format);
  }
 }
 console.log('PASS',count,'actual-runtime six-format worker password groups; no password/task/document bytes logged or stored');
})().catch(error=>{console.error('FAIL password worker gate:',error.code||error.name);process.exitCode=1});
