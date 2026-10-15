// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const upstream=process.env.EO_UPSTREAM||path.join(os.homedir(),'elixiroffice/DocumentServer');
const source=fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-local/PdfWriter.js'),'utf8');
let PdfMessages;vm.runInNewContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-local/PdfMessages.js'),'utf8'),{define:(_deps,factory)=>{PdfMessages=factory()}});

function setup(reply){
 let api,worker,revoked=0,posted=0;
 class FakeWorker{
  constructor(){worker=this}
  terminate(){this.closed=true}
  postMessage(job){posted++;this.job=job;setImmediate(()=>this.onmessage({data:reply}))}
 }
 const url={createObjectURL:()=> 'blob:public-proof',revokeObjectURL(){revoked++}};
 class URLClass extends URL{}Object.assign(URLClass,url);
 const context={window:{location:{href:'https://example.invalid/example/local-assets/web-apps/apps/pdfeditor/main/index.html'}},URL:URLClass,Blob,Worker:FakeWorker,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,define:(_deps,factory)=>{api=factory(PdfMessages)}};
 vm.runInNewContext(source,context);
 return {api,get worker(){return worker},stats:()=>({revoked,posted})};
}
const original=new Uint8Array(Buffer.from('%PDF-public-original'));
test('preservation worker copies inputs and closes after a validated policy response',async()=>{
 const e=setup({policy:{writable:true,reason:'',writer:'original-append'}});
 assert.equal((await e.api.inspect(original)).writable,true);
 assert.notEqual(e.worker.job.original,original);assert.deepEqual(e.worker.job.original,original);
 assert.equal(e.worker.job.inspect,true);assert.equal(e.worker.job.fonts.length,0);
 assert.equal(e.worker.closed,true);assert.equal(e.stats().revoked,1);
 assert.equal(e.worker.job.base,'https://example.invalid/example/local-assets/sdkjs/common/clientpdf/runtime/');
});
test('pre-aborted preservation jobs never post document bytes',async()=>{
 const e=setup({}),abort=new AbortController();abort.abort();
 await assert.rejects(e.api.write(original,null,{signal:abort.signal}),/cancelled/);
 assert.equal(e.stats().posted,0);assert.equal(e.worker.closed,true);assert.equal(e.stats().revoked,1);
});
test('preservation refuses malformed worker responses and propagates failures',async()=>{
 for(const reply of [{policy:{}},{error:'checksum mismatch'}]){
  const e=setup(reply);await assert.rejects(e.api.inspect(original),/Invalid PDF policy|checksum mismatch/);
  assert.equal(e.worker.closed,true);
 }
 const e=setup({policy:{writable:true}});await assert.rejects(e.api.write(original,null),/Invalid preserved PDF/);
});
test('writer returns validated PDF bytes; oversized jobs fail before a worker',async()=>{
 const bytes=new Uint8Array(Buffer.from('%PDF-public-copy')),e=setup({bytes});
 assert.deepEqual(await e.api.write(original,null),bytes);
 const large=setup({});await assert.rejects(large.api.write({length:128*1024*1024+1},null),/128 MiB/);
 assert.equal(large.stats().posted,0);assert.equal(large.worker,undefined);
});
