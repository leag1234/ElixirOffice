// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {getEventListeners}=require('node:events');
// These SDK source contracts use a full owned upstream checkout, not the portable desktop test bundle.
const upstream=process.env.EO_UPSTREAM||path.join(os.homedir(),'elixiroffice/DocumentServer');
const source=fs.readFileSync(path.join(upstream,'sdkjs/common/clientpdf/wasm-pdf.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(prepareFS=async()=>({bytes:0,written:[]})){
 const workers=[];
 class Worker{
  constructor(){workers.push(this);this.terminations=0;}
  postMessage(job){this.job=job;}
  terminate(){this.terminations++;}
  reply(data){this.onmessage({data});}
 }
 const context={window:{location:{href:'https://example.invalid/example/local-assets/web-apps/apps/documenteditor/main/index.html'},EOWasmFonts:{prepareFS}},AscCommon:{ClientPdf:{unsupported:(code,detail)=>Object.assign(Error(detail||code),{code,eoUnsupported:true})}},Worker,URL,Uint8Array,DataView,Map,Set,Promise,setTimeout,clearTimeout};
 vm.runInNewContext(source,context);
 return {Writer:context.window.EOWasmPdf.Writer,workers};
}
async function begin(e,options={}){
 const writer=new e.Writer({getRawImage:async()=>null,...options});await writer.feed(new Uint8Array([202,203]));
 return {writer,pending:writer.finish()};
}
test('PDF worker progress is opt-in, does not resolve output, and tolerates observers',async()=>{
 const e=setup(),events=[];
 const {writer,pending}=await begin(e,{onProgress:value=>{events.push(value);if(value.stage==='initializing')throw Error('observer');}});
 let settled=false;pending.then(()=>settled=true);await tick();
 const worker=e.workers[0];assert.equal(worker.job.progress,true);
 for(const stage of ['loading-runtime','initializing','converting']){worker.reply({type:'progress',stage});await tick();assert.equal(settled,false);assert.equal(worker.terminations,0);}
 worker.reply({type:'progress',stage:'untrusted-stage'});
 const bytes=new Uint8Array(Buffer.from('%PDF-public-progress'));worker.reply({type:'result',bytes});
 assert.deepEqual(await pending,bytes);assert.deepEqual(events.map(e=>e.stage),['preparing','loading-runtime','initializing','converting']);
 assert.equal(worker.terminations,1);assert.equal(writer.parts.length,0);
 const legacy=await begin(e);await tick();assert.equal(e.workers[1].job.progress,false);e.workers[1].reply({bytes});await legacy.pending;
});
test('PDF worker cancellation terminates once, ignores late messages, releases state and retries fresh',async()=>{
 const e=setup(),abort=new AbortController(),events=[];
 const {writer,pending}=await begin(e,{signal:abort.signal,onProgress:e=>events.push(e)});
 const rejected=assert.rejects(pending,error=>error.name==='AbortError'&&error.code==='aborted');await tick();
 const first=e.workers[0];assert.equal(getEventListeners(abort.signal,'abort').length,1);
 first.reply({type:'progress',stage:'converting'});abort.abort();await rejected;
 assert.equal(first.terminations,1);assert.equal(getEventListeners(abort.signal,'abort').length,0);assert.equal(writer.parts.length,0);
 const count=events.length;first.reply({type:'progress',stage:'converting'});first.reply({bytes:new Uint8Array([1])});assert.equal(events.length,count);
 const retry=await begin(e,{signal:new AbortController().signal});await tick();
 assert.notEqual(e.workers[1],first);assert.notEqual(e.workers[1].job.stream,first.job.stream);
 e.workers[1].reply({bytes:new Uint8Array(Buffer.from('%PDF-retry'))});assert.match(Buffer.from(await retry.pending).toString(),/^%PDF-retry/);
});
test('cancellation during shared font preparation rejects promptly without creating a worker',async()=>{
 let finishFonts;const e=setup(()=>new Promise(resolve=>finishFonts=resolve)),abort=new AbortController();
 const {writer,pending}=await begin(e,{signal:abort.signal});const rejected=assert.rejects(pending,{name:'AbortError'});await tick();abort.abort();await rejected;
 assert.equal(e.workers.length,0);assert.equal(writer.parts.length,0);assert.equal(getEventListeners(abort.signal,'abort').length,0);
 finishFonts({bytes:0,written:[]});await tick();assert.equal(e.workers.length,0);
 const pre=new AbortController();pre.abort();const w=new e.Writer({signal:pre.signal});await assert.rejects(w.feed(new Uint8Array([202,203])),{name:'AbortError'});
});
test('malformed worker output fails closed and cleans up cancellation listeners',async()=>{
 const e=setup(),abort=new AbortController(),{pending}=await begin(e,{signal:abort.signal});const rejected=assert.rejects(pending,/invalid worker response/);await tick();
 e.workers[0].reply({type:'result'});await rejected;assert.equal(e.workers[0].terminations,1);assert.equal(getEventListeners(abort.signal,'abort').length,0);
});

test('actual Word capture cancels between pages without JS fallback and restores editor state',async()=>{
 const source=fs.readFileSync(path.join(upstream,'sdkjs/common/clientpdf/clientpdf.js'),'utf8'),abort=new AbortController(),events=[],drawn=[],loads=[];
 let ended=0,finished=0;
 class Memory{Seek(){}GetCurPosition(){return 0;}GetDataUint8(){return new Uint8Array();}ClearNoAttack(){}}
 class Renderer{constructor(){this.Memory=new Memory();}InitPicker(){}DocInfo(){}BeginPage(){}EndPage(){}AddHeadings(){}}
 class Writer{async feed(){}async finish(){finished++;return new Uint8Array(Buffer.from('%PDF-test'));}}
 const asc={CDocumentRenderer:Renderer,CMemory:Memory,g_oTextMeasurer:{m_oManager:{}},loadScript:(url,resolve)=>{loads.push(url);resolve();}};
 const window={AscCommon:asc,location:{href:'https://example.invalid/example/local-assets/web-apps/apps/documenteditor/main/index.html'},EOWasmPdf:{Writer}};
 const version='123456789abc-123456789abc-st';
 const context={window,AscCommon:asc,Asc:{},URL,Uint8Array,setTimeout,clearTimeout,fetch:async url=>({ok:true,json:async()=>String(url).endsWith('current.json')?{artifact_version:version}:{artifact_version:version,build_flags:{module_kind:'pdf'}}})};
 vm.runInNewContext(source,context);
 const logic={DrawPage:i=>drawn.push(i)},dd={m_lPagesCount:5,m_lCountCalculatePages:5,m_arrPages:Array.from({length:5},()=>({width_mm:210,height_mm:297})),m_oLogicDocument:logic,printedDocument:null};
 const api={WordControl:{m_oDrawingDocument:dd,m_oLogicDocument:logic},ShowParaMarks:true,asc_getCoreProps:()=>({}),watermarkDraw:{StartRenderer(){},DrawOnRenderer(){},EndRenderer(){ended++;}}};
 await assert.rejects(asc.ClientPdf.build(api,{signal:abort.signal,onProgress:e=>{events.push(e);if(e.completed===2)abort.abort();}}),{name:'AbortError'});
 assert.deepEqual(drawn,[0,1]);assert.deepEqual(events.map(e=>e.completed),[0,1,2]);assert(events.every(e=>e.total===5));
 assert.equal(api.ShowParaMarks,true);assert.equal(dd.printedDocument,null);assert.equal(ended,1);assert.equal(finished,0);
 assert.equal(loads.length,1);assert(loads[0].endsWith('wasm-pdf.js'));
 const result=await asc.ClientPdf.build(api,{});assert.equal(result.stats.backend,'wasm');assert.equal(finished,1);assert.equal(ended,2);
});

test('actual desktop slide adapter reports real pages and restores marks on cancel; workbook stays indeterminate',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../desktop/pdf.js'),'utf8'),events=[],drawn=[];let feeds=0,finishes=0;
 class Memory{GetCurPosition(){return 0;}GetDataUint8(){return new Uint8Array();}}
 class Renderer{constructor(){this.Memory=new Memory();}InitPicker(){}DocInfo(){}}
 class Writer{async feed(){feeds++;}async finish(){finishes++;return new Uint8Array(Buffer.from('%PDF-test'));}}
 const context={window:{},AscCommon:{ClientPdf:{getRawImage(){}},CDocumentRenderer:Renderer,CMemory:Memory,g_oTextMeasurer:{m_oManager:{}}},EOWasmPdf:{Writer},Asc:{c_oAscPrintType:{EntireWorkbook:1}},URL,location:{origin:'https://example.invalid'},setTimeout,fetch:async()=>({ok:true,json:async()=>({artifact_version:'public-runtime'})})};
 vm.runInNewContext(source,context);const abort=new AbortController();
 const api={ShowParaMarks:true,asc_getCoreProps:()=>({}),asc_nativePrintPagesCount:()=>4,asc_nativePrint:(_r,i)=>drawn.push(i)};
 await assert.rejects(context.window.EODesktopPdf(api,'pptx',{signal:abort.signal,onProgress:e=>{events.push(e);if(e.completed===2)abort.abort();}}),{name:'AbortError'});
 assert.deepEqual(drawn,[0,1]);assert.equal(api.ShowParaMarks,true);assert.equal(feeds,0);assert.equal(finishes,0);
 assert.deepEqual(events.map(e=>e.completed),[0,1,2]);assert(events.every(e=>e.total===4));
 const workbook=[];await context.window.EODesktopPdf({asc_nativePrint:()=>new Memory()},'xlsx',{onProgress:e=>workbook.push(e)});
 assert.equal(workbook.length,1);assert.equal(workbook[0].stage,'converting');assert.equal(workbook[0].cancellable,false);assert.equal(workbook[0].total,undefined);assert.equal(finishes,1);
});

test('actual PDF worker keeps old callers single-response and emits only opt-in stage boundaries',async()=>{
 const source=fs.readFileSync(path.join(upstream,'sdkjs/common/clientpdf/wasm-worker.js'),'utf8');
 for(const enabled of [false,true]){
  const replies=[],calls=[],self={postMessage:value=>replies.push(value)},bytes=new Uint8Array(Buffer.from('%PDF-public-worker'));
  const context={self,performance:{now:()=>1},importScripts:()=>calls.push('script'),fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}),WebAssembly:{compile:async()=>({})},
   createX2t:async()=>({FS:{mkdirTree(){},writeFile(){},readFile:()=>bytes},callMain:()=>{calls.push('convert');return 0;},HEAPU8:new Uint8Array(1)}),Uint8Array};
  vm.runInNewContext(source,context);await self.onmessage({data:{progress:enabled,runtime:'https://example.invalid/',stream:new Uint8Array(),files:[]}});
  assert.deepEqual(replies.filter(e=>e.type==='progress').map(e=>e.stage),enabled?['loading-runtime','initializing','converting']:[]);
  assert.deepEqual(calls,['script','convert']);assert.equal(replies.at(-1).type,'result');assert.deepEqual(replies.at(-1).bytes,bytes);
  if(!enabled)assert.equal(replies.length,1);
 }
});
