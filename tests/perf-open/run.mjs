// D4 open-time probe. Injected input is CDP; viewer-frame is a paint proxy.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const a=Object.fromEntries(process.argv.slice(2).map((s,i,x)=>s.startsWith('--')?[s.slice(2),x[i+1]]:null).filter(Boolean));
const {chromium}=createRequire(process.env.PW_PACKAGE||path.join(os.homedir(),'elixiroffice/pw/package.json'))(process.env.PW_MODULE||'playwright');
if(new URL(a.base||a.url).port==='8080')throw Error('Use an owned instance, not :8080');
const out=path.resolve(a.out);
if(fs.existsSync(path.join(out,'profile')))throw Error('Use a fresh output directory for each profile pair');
fs.mkdirSync(out,{recursive:true});
const trace=a.trace==='1', throttle=+(a.throttle||1);
const ctx=await chromium.launchPersistentContext(path.join(out,'profile'),{
 headless:a.headful!=='1', executablePath:a.chrome||undefined, channel:a.chrome?undefined:'chromium',
 viewport:{width:1280,height:900}, args:['--no-first-run','--no-default-browser-check','--disable-background-networking','--password-store=basic','--ozone-platform=x11']
});
await ctx.addInitScript(()=>{
 const epoch=()=>performance.timeOrigin+performance.now();
 const p=window.__openPerf={spans:[],events:[],keys:[],visible:null,visibleFrame:null};
 const di=CanvasRenderingContext2D.prototype.drawImage;
 CanvasRenderingContext2D.prototype.drawImage=function(...args){
  const r=di.apply(this,args);
  if(this.canvas?.id==='id_viewer'&&!p.visible){p.visible=epoch();requestAnimationFrame(()=>p.visibleFrame=epoch());}
  return r;
 };
 addEventListener('keydown',e=>p.keys.push({key:e.key,t:performance.timeOrigin+e.timeStamp,
  pages:window.Asc?.editor?.WordControl?.m_oDrawingDocument?.m_lCountCalculatePages,
  background:!!window.Asc?.editor?.WordControl?.m_oLogicDocument?.FullRecalc?.Id}),true);
 addEventListener('message',e=>{try{const d=typeof e.data==='string'?JSON.parse(e.data):e.data;if(d?.event)p.events.push([d.event,epoch()]);}catch{}});
 const installed=new Set();
 let readerWrapped=false;
 const wrap=(obj,name,label)=>{
  if(!obj||typeof obj[name]!=='function'||installed.has(label))return;
  const f=obj[name];obj[name]=function(...args){const t=epoch();try{return f.apply(this,args);}
   finally{if(p.spans.length<10000)p.spans.push({name:label,t,d:epoch()-t});}};installed.add(label);
 };
 const timer=setInterval(()=>{
  const A=window.Asc?.asc_docs_api?.prototype,D=window.AscWord?.CDocument?.prototype;
  for(const n of ['OpenDocumentFromBin','asyncFontsDocumentEndLoaded','asyncImagesDocumentEndLoaded','onEndLoadFile'])
   wrap(A,n,n);
  for(const n of ['Recalculate','ContinueRecalculationLoop','Recalculate_Page'])
   wrap(D,n,n);
  if(!readerWrapped&&window.AscCommonWord?.BinaryFileReader){
   const Original=AscCommonWord.BinaryFileReader;
   function Reader(...args){
    const reader=Reflect.construct(Original,args,new.target===Reader?Original:new.target);
    for(const name of ['Read','ReadFromStream','ReadMainTable','PostLoadPrepare']){
     const method=reader[name];if(typeof method!=='function')continue;
     reader[name]=function(...values){const t=epoch();try{return method.apply(this,values);}
      finally{p.spans.push({name:'BinaryFileReader.'+name,t,d:epoch()-t});}};
    }
    return reader;
   }
   Reader.prototype=Original.prototype;Object.setPrototypeOf(Reader,Original);
   AscCommonWord.BinaryFileReader=Reader;readerWrapped=true;
  }
  wrap(window.AscCommonWord?.BinaryFileReader?.prototype,'Read','BinaryFileReader.Read');
  wrap(window.AscCommonWord?.BinaryFileReader?.prototype,'ReadMainTable','BinaryFileReader.ReadMainTable');
  if(readerWrapped&&installed.size>=7)clearInterval(timer);
 },5);
});
const page=ctx.pages()[0]||await ctx.newPage(),cdp=await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});
const requests=[];cdp.on('Network.requestWillBeSent',e=>requests.push({id:e.requestId,url:e.request.url,t:e.wallTime*1000}));
cdp.on('Network.responseReceived',e=>{const r=requests.findLast(x=>x.id===e.requestId);if(r){r.status=e.response.status;r.cache=!!(e.response.fromDiskCache||e.response.fromServiceWorker);}});
cdp.on('Network.loadingFinished',e=>{const r=requests.findLast(x=>x.id===e.requestId);if(r){r.bytes=e.encodedDataLength;r.endMonotonic=e.timestamp}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
let uploaded;
if(a.doc){const fd=new FormData();fd.append('uploadedFile',new Blob([fs.readFileSync(a.doc)]),'d4-'+Date.now()+'.docx');
 const j=await(await fetch(a.base+'/example/upload',{method:'POST',body:fd})).json();if(!j.filename)throw Error(JSON.stringify(j));uploaded=j.filename;}
let url=a.url||a.base+'/example/editor?fileName='+encodeURIComponent(uploaded);
try{
 for(let visit=0;visit<+(a.visits||3);visit++){
  if(a.doc&&visit>0){
   await fetch(a.base+'/example/file?filename='+encodeURIComponent(uploaded),{method:'DELETE'});
   const fd=new FormData();fd.append('uploadedFile',new Blob([fs.readFileSync(a.doc)]),'d4-'+Date.now()+'.docx');
   const j=await(await fetch(a.base+'/example/upload',{method:'POST',body:fd})).json();if(!j.filename)throw Error(JSON.stringify(j));
   uploaded=j.filename;url=a.base+'/example/editor?fileName='+encodeURIComponent(uploaded);
  }
  if(trace){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:500});await cdp.send('Profiler.start');
   await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});}
  const loadBefore=os.loadavg();
  await page.goto(url,{waitUntil:'commit'});
  const t0=await page.evaluate(()=>performance.timeOrigin);
  let frame,accepted;
  const stop=Date.now()+180000;
  while(Date.now()<stop){
   frame=page.frames().find(f=>/documenteditor\/main/.test(f.url()));
   if(frame){
    const ready=await frame.evaluate(()=>{
     const api=window.Asc?.editor, input=window.AscCommon?.g_inputContext?.HtmlArea||document.getElementById('area_id');
     if(!api?.WordControl?.m_oLogicDocument||!input||!api.isDocumentModified)return false;
     if(api.isDocumentModified())return 'modified';
     if(!api.isDocumentLoadComplete)return false;
     api.asc_enableKeyEvents(true);input.focus();return document.activeElement===input;
    }).catch(()=>false);
    if(ready==='modified')throw Error('Unexpected modification before accepted probe');
    if(ready){
     await page.keyboard.press('z');
     accepted=await frame.evaluate(()=>Asc.editor.isDocumentModified()?__openPerf.keys.at(-1):null);
     if(accepted)break;
    }
   }
   await page.waitForTimeout(20);
  }
  if(!accepted)throw Error('No accepted key');
  if(trace){const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(out,visit+'.cpuprofile'),JSON.stringify(profile));}
  const typed=[];
  const beforeText=await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs({All:true}).map(p=>p.GetText()).join(''));
  for(let i=0;i<100;i++){
   const start=Date.now();
   const state=await frame.evaluate(()=>({n:__openPerf.keys.length,bg:!!Asc.editor.WordControl.m_oLogicDocument.FullRecalc.Id}));
   await page.keyboard.press('a');
   const latency=await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const key=__openPerf.keys.at(-1);resolve({ms:performance.timeOrigin+performance.now()-key.t,key});}))));
   typed.push({...latency,backgroundAtSend:state.bg});
   await page.waitForTimeout(Math.max(0,100-(Date.now()-start)));
  }
  const afterText=await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs({All:true}).map(p=>p.GetText()).join(''));
  const inserted=afterText.length-beforeText.length;
  const typingValidation={inserted,exact:inserted===100&&afterText.replace('a'.repeat(100),'')===beforeText};
  if(!typingValidation.exact)throw Error('Typing did not insert exactly 100 characters');
  await frame.waitForFunction(()=>{const a=Asc.editor,d=a.WordControl.m_oDrawingDocument,l=a.WordControl.m_oLogicDocument;
   return d.m_lPagesCount>0&&d.m_lCountCalculatePages>=d.m_lPagesCount&&!l.FullRecalc.Id;},null,{timeout:180000});
  const frames=[];
  for(const f of page.frames())frames.push(await f.evaluate(()=>({url:location.href,perf:__openPerf,conversion:window.benchConversion,
   resources:performance.getEntriesByType('resource').map(r=>({url:r.name,t:performance.timeOrigin+r.startTime,end:performance.timeOrigin+r.responseEnd,bytes:r.encodedBodySize})),
   pages:window.Asc?.editor?.WordControl?.m_oDrawingDocument?.m_lPagesCount})).catch(()=>null));
  const rec={method:'D4 v2: fresh document per navigation; one text validation outside typing loop',url,t0,visit,throttle,accepted,typed,typingValidation,frames,requests,errors,loadBefore,loadAfter:os.loadavg()};
  if(trace){
   const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');
   const {stream}=await done;let data='';for(;;){const x=await cdp.send('IO.read',{handle:stream});data+=x.base64Encoded?Buffer.from(x.data,'base64').toString():x.data;if(x.eof)break;}
   await cdp.send('IO.close',{handle:stream});fs.writeFileSync(path.join(out,visit+'.trace.json'),data);
  }
  fs.writeFileSync(path.join(out,visit+'.json'),JSON.stringify(rec,null,2));
  const ed=frames.find(f=>f?.pages);console.log(JSON.stringify({visit,visible:ed?.perf.visibleFrame-t0,editable:accepted.t-t0,pages:ed?.pages,background:typed.filter(t=>t.backgroundAtSend).length,inserted}));
 }
}finally{await ctx.close();if(uploaded)await fetch(a.base+'/example/file?filename='+encodeURIComponent(uploaded),{method:'DELETE'});}
