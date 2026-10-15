// Owner-run only: real installed browsers via their native WebDriver servers.
// This is independent of Playwright WebKit, which is not installed Safari.
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
assert.equal(process.platform,'darwin','Run only on the owner Mac');
const [file,out]=process.argv.slice(2),base=process.env.EO_BASE;
assert.ok(file&&path.isAbsolute(file)&&out&&base,'absolute public DOCX fixture, output folder and EO_BASE required');
const url=new URL(base);assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.port!=='8080','explicit own tunnel required');
fs.mkdirSync(out,{recursive:true});
const browsers=[
 {name:'chrome',driver:process.env.EO_CHROME_DRIVER||'chromedriver',port:19441,args:p=>['--port='+p]},
 {name:'safari',driver:process.env.EO_SAFARI_DRIVER||'/usr/bin/safaridriver',port:19442,args:p=>['--port',String(p)]},
 {name:'firefox',driver:process.env.EO_FIREFOX_DRIVER||'geckodriver',port:19443,args:p=>['--port',String(p)]},
];
let failures=0;
for(const config of browsers){
 let driver,session;const report={browser:config.name,fixture:path.basename(file),realNativeBrowser:true};
 const endpoint='http://127.0.0.1:'+config.port;
 async function request(method,route,body){
  const response=await fetch(endpoint+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(200000)});
  const data=await response.json();if(!response.ok||data.value?.error)throw new Error(data.value?.message||'WebDriver HTTP '+response.status);return data.value;
 }
 async function command(route,body){return request('POST','/session/'+session+route,body);}
 async function execute(script,args=[]){return command('/execute/sync',{script,args});}
 try{
  await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(config.port,'127.0.0.1',()=>probe.close(resolve));});
  const log=fs.openSync(path.join(out,config.name+'-driver.log'),'w');
  let startError;driver=spawn(config.driver,config.args(config.port),{stdio:['ignore',log,log]});fs.closeSync(log);driver.on('error',e=>{startError=e;});
  for(let i=0;i<50;i++){
   if(startError)throw startError;
   if(driver.exitCode!==null)throw new Error('Driver exited before readiness');
   try{await request('GET','/status');break;}catch(e){if(i===49)throw e;await new Promise(r=>setTimeout(r,200));}
  }
  const created=await request('POST','/session',{capabilities:{alwaysMatch:{browserName:config.name}}});
  session=created.sessionId;report.capabilities=created.capabilities;
  await command('/timeouts',{script:180000,pageLoad:90000,implicit:0});
  await command('/url',{url:base+'/example/local.html'});
  const input=await command('/element',{using:'css selector',value:'#file'});
  await command('/element/'+input['element-6066-11e4-a52e-4f735466cecf']+'/value',{text:file,value:Array.from(file)});
  for(let i=0;i<180;i++){
   const state=await execute('return {ready:!!window.EOLocalSession,error:window.EOLocalFailure};');
   if(state.error)throw new Error(state.error);if(state.ready)break;
   if(i===179)throw new Error('Local editor did not become ready');await new Promise(r=>setTimeout(r,500));
  }
  report.open=await execute('return {stats:EOLocalSession.stats,format:EOLocalSession.format};');
  const frame=await command('/element',{using:'css selector',value:'iframe'});await command('/frame',{id:frame});
  if(process.env.EO_MAC_EXPECT_PAGES)for(let i=0;i<180;i++){if(await execute('return DE.getController("Main").api.WordControl.m_oLogicDocument.Pages.length>=arguments[0];',[Number(process.env.EO_MAC_EXPECT_PAGES)]))break;if(i===179)throw new Error('Full pagination timeout');await new Promise(r=>setTimeout(r,500));}
  report.editor=await execute('var a=DE.getController("Main").api;return {ready:a.isDocumentLoadComplete,offline:a.DocInfo.get_OfflineApp(),pages:a.WordControl.m_oDrawingDocument.m_lPagesCount};');
  assert.equal(report.editor.ready,true);assert.equal(report.editor.offline,true);
  if(process.env.EO_MAC_EXPECT_PAGES)assert.equal(report.editor.pages,Number(process.env.EO_MAC_EXPECT_PAGES));
  await execute('DE.getController("Main").api.WordControl.m_oLogicDocument.MoveCursorToStartPos();DE.getController("Main").api.asc_enterText([87,52,77,65,67]);');
  await command('/frame',{id:null});
  report.save=await command('/execute/async',{script:'var done=arguments[arguments.length-1];EOLocalSession.controller.save().then(function(bytes){done({bytes:bytes.length,zip:bytes[0]===80&&bytes[1]===75,modified:EOLocalSession.controller.isModified()});},function(e){done({error:e.message});});',args:[]});
  assert.ok(report.save.zip);assert.ok(report.save.bytes>0);assert.equal(report.save.error,undefined);assert.equal(report.save.modified,false);
  // Hosted public fixture upload is separate from the preceding local probe.
  const uploadForm=new FormData();
  uploadForm.append('uploadedFile',new Blob([fs.readFileSync(file)]),path.basename(file));
  const uploaded=await fetch(base+'/example/upload',{method:'POST',body:uploadForm,signal:AbortSignal.timeout(90000)});
  assert.equal(uploaded.status,200);const entry=await uploaded.json();assert.ok(entry.filename);
  await command('/url',{url:base+'/example/editor?fileName='+encodeURIComponent(entry.filename)+'&lang=en'});
  let hostedFrame;
  for(let i=0;i<180;i++){
   try{hostedFrame=await command('/element',{using:'css selector',value:'iframe[name=frameEditor]'});break;}catch(e){if(i===179)throw e;await new Promise(r=>setTimeout(r,500));}
  }
  await command('/frame',{id:hostedFrame});
  for(let i=0;i<240;i++){
   if(await execute('try {var a=DE.getController("Main").api,l=a.WordControl.m_oLogicDocument,d=a.WordControl.m_oDrawingDocument;return a.isDocumentLoadComplete && (!arguments[0] || (l.Pages.length===arguments[0] && d.m_lPagesCount===arguments[0] && d.m_lCountCalculatePages>=arguments[0] && !(l.FullRecalc&&l.FullRecalc.Id)));}catch(e){return false;}',[Number(process.env.EO_MAC_EXPECT_PAGES||0)]))break;
   if(i===239)throw new Error('Hosted editor pagination timeout');await new Promise(r=>setTimeout(r,500));
  }
  await execute('AscCommon.ClientPdf.last=null;editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType.PDF));');
  for(let i=0;i<360;i++){
   report.pdf=await execute('return AscCommon.ClientPdf.last;');
   if(report.pdf?.backend==='wasm'&&report.pdf.pages)break;
   if(report.pdf?.error||report.pdf?.fallbacks)throw new Error('Native PDF fallback: '+JSON.stringify(report.pdf));
   if(i===359)throw new Error('Native PDF timeout');await new Promise(r=>setTimeout(r,500));
  }
  assert.equal(report.pdf.backend,'wasm');assert.ok(report.pdf.worker&&!report.pdf.error&&!report.pdf.fallbacks);
  if(process.env.EO_MAC_EXPECT_PAGES)assert.equal(report.pdf.pages,Number(process.env.EO_MAC_EXPECT_PAGES));
  report.status='pass';console.log('PASS native',config.name,JSON.stringify(report.editor));
 }catch(e){report.status='fail';report.error=e.message;failures++;console.error('FAIL native',config.name,e.message);}
 finally{
  if(session)try{await request('DELETE','/session/'+session);}catch{}
  if(driver)driver.kill('SIGTERM');
  fs.writeFileSync(path.join(out,config.name+'.json'),JSON.stringify(report,null,2));
 }
}
if(failures)process.exitCode=1;
