// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Open one OpenDocument file in the packaged desktop app (own Xvfb display and profile), make a trivial edit
// away from the features, run the real save conversion and capture the bytes the app would write.
// usage: node odf-roundtrip-app.cjs INPUT EXECUTABLE OUTDIR XVFB PLAYWRIGHT
// Writes OUTDIR/roundtrip.<ext> (the converter output) and OUTDIR/roundtrip.json (guard verdict, timings).
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const [input,executableArg,outputArg,xvfbArg,playwrightArg]=process.argv.slice(2);
assert(input&&executableArg&&outputArg&&xvfbArg&&playwrightArg,'Usage: odf-roundtrip-app.cjs INPUT EXECUTABLE OUTDIR XVFB PLAYWRIGHT');
assert.equal(process.platform,'linux');
const output=path.resolve(outputArg);
process.env.EO_DESKTOP_ROOT=output;process.env.EO_TEST_FONT_DECLINED='1';process.env.EO_PLAYWRIGHT=path.resolve(playwrightArg);
const crypto=require('node:crypto');
const productRoot=path.resolve(__dirname,'../..');
const {launch,stop,editable}=require(path.join(productRoot,'tests/desktop/harness.cjs'));
const guard=require(path.join(productRoot,'desktop/package-guard.cjs'));
const MARK='EODESKTOP';
let env,display,displayLog,closing;
async function cleanup(){
 if(closing)return closing;
 closing=(async()=>{
  if(env)await stop(env).catch(()=>{});
  if(display){display.kill('SIGTERM');await new Promise(resolve=>{if(display.exitCode!==null)return resolve();display.once('exit',resolve);setTimeout(resolve,3000).unref()});}
  if(displayLog)await displayLog.close();
  await fs.rm(path.join(output,'profiles'),{recursive:true,force:true});
  await fs.rm(path.join(output,'input'),{recursive:true,force:true});
 })();return closing;
}
process.once('SIGTERM',()=>cleanup().finally(()=>process.exit(143)));
process.once('SIGINT',()=>cleanup().finally(()=>process.exit(130)));
(async()=>{
 const started=Date.now(),result={input:path.basename(input),status:'error'};
 await fs.mkdir(path.join(output,'input'),{recursive:true});
 const file=path.join(output,'input',path.basename(input));
 await fs.copyFile(input,file);
 const original=await fs.readFile(file);
 const ext=path.extname(file).slice(1);
 const originalObjects=guard.embeddedObjects(original);
 result.originalObjects=originalObjects;
 await fs.writeFile(path.join(output,'desktop.Xauthority'),'');
 displayLog=await fs.open(path.join(output,'display.log'),'w');
 display=cp.spawn(xvfbArg,['-screen','0','1360x960x24','-nolisten','tcp','-displayfd','1'],{stdio:['ignore','pipe',displayLog.fd]});
 try{
  const number=await new Promise((resolve,reject)=>{
   let data='';const timer=setTimeout(()=>reject(Error('Owned display startup timeout')),20000);
   const finish=(e,v)=>{clearTimeout(timer);e?reject(e):resolve(v)};
   display.stdout.on('data',c=>{data+=c;if(data.includes('\n'))finish(null,data.trim())});
   display.once('error',e=>finish(e));display.once('exit',code=>finish(Error('Owned display exited '+code)));
  });
  process.env.EO_DESKTOP_DISPLAY=':'+number;
  env=await launch({file,executable:path.resolve(executableArg),profile:'odf-'+crypto.randomUUID()});
  const ready=await editable(env);
  result.format=ready.format;assert.equal(result.format,ext);
  // let the document settle (layout, charts) before touching it
  await env.page.waitForTimeout(2500);
  if(process.env.ODF_PROBE_JS)result.probe=await env.page.evaluate(process.env.ODF_PROBE_JS).catch(e=>String(e.message));
  // capture every conversion the save path performs
  await env.page.evaluate(()=>{
   const win=EOLocalSession.win,real=win.EOWasmConvert.convert;window.__eoCalls=[];window.__eoOut=null;
   win.EOWasmConvert.convert=async function(input,from,to,options){
    const out=await real.call(this,input,from,to,options);
    const bytes=out&&(out.bytes||out.data||out);
    window.__eoCalls.push({from:String(from),to:String(to),inType:Object.prototype.toString.call(input),outType:Object.prototype.toString.call(out),size:bytes&&bytes.length});
    if(bytes&&bytes.length>4&&bytes[0]===80&&bytes[1]===75){window.__eoOut=Array.from(bytes);window.__eoIn=Array.from(input instanceof Uint8Array?input:new Uint8Array(input));window.__eoFrom=String(from);}
    return out;
   };
  });
  // trivial edit: type one character away from the features, then delete it again (history stays dirty)
  await env.page.evaluate(marker=>{
   const {api,format,win}=EOLocalSession;
   const chars=Array.from(marker,c=>c.codePointAt(0));
   if(format==='odt'||format==='docx'){
    const doc=api.WordControl.m_oLogicDocument;doc.MoveCursorToStartPos();api.asc_enterText(chars);
    for(let i=0;i<marker.length;i++)doc.Remove(-1,true);
   }else if(format==='odp'){
    const doc=api.WordControl.m_oLogicDocument,control=doc.GetCurrentController();
    let shape=null;for(const slide of doc.Slides){shape=slide.cSld.spTree.find(s=>s.txBody);if(shape)break;}
    if(!shape)throw Error('NO_SLIDE_TEXT');
    control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();api.asc_enterText(chars);
    for(let i=0;i<marker.length;i++)shape.txBody.content.Remove(-1,true);
   }else{
    const ws=api.wb.getWorksheet();
    ws.setSelection(new win.Asc.Range(200,2000,200,2000));
    api.asc_enterText(chars);api.asc_closeCellEditor();
    api.asc_emptyCells(win.Asc.c_oAscCleanOptions.All);
   }
  },'x').catch(e=>{result.editNote=String(e.message)});
  await env.page.waitForFunction(()=>EOLocalSession.controller.isModified(),null,{timeout:20000}).catch(()=>{result.editNote=(result.editNote||'')+' not-modified'});
  const frame=env.page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));
  const actionPath=path.join(productRoot,'tests/desktop/file-action.cjs');
  const saveStart=Date.now();
  const savePromise=require(actionPath)(env.page,'save').catch(e=>{result.actionError=String(e.message)});
  await savePromise;
  await env.page.waitForFunction(()=>window.__eoOut||window.EOLocalFailure,null,{timeout:120000});
  result.conversionMs=Date.now()-saveStart;
  const bytes=await env.page.evaluate(()=>window.__eoOut);
  assert(bytes,'No converted bytes: '+JSON.stringify(await env.page.evaluate(()=>({calls:window.__eoCalls,failure:window.EOLocalFailure}))));
  result.calls=await env.page.evaluate(()=>window.__eoCalls);
  const editorInput=await env.page.evaluate(()=>window.__eoIn);
  if(editorInput)await fs.writeFile(path.join(output,'editor-output.'+result.calls.find(c=>c.size)?.from),Buffer.from(editorInput));
  const rt=Buffer.from(bytes);
  await fs.writeFile(path.join(output,'roundtrip.'+ext),rt);
  result.roundtripObjects=guard.embeddedObjects(rt);
  result.guardRefused=originalObjects>0&&result.roundtripObjects<originalObjects;
  // did the app really write the file in place? (guard refusals leave a native dialog open and no write)
  await env.page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:result.guardRefused?4000:30000}).catch(()=>{});
  result.appSaved=!!(await env.page.evaluate(()=>window.EOLastSave).catch(()=>null));
  const after=await fs.readFile(file);
  result.writtenInPlace=Buffer.compare(after,original)!==0;
  if(result.writtenInPlace)await fs.writeFile(path.join(output,'inplace.'+ext),after);
  result.errors=env.errors;result.status='ok';
 }catch(error){result.error=String(error&&error.stack||error).slice(0,2000);}
 finally{result.totalMs=Date.now()-started;await fs.writeFile(path.join(output,'roundtrip.json'),JSON.stringify(result,null,1));await cleanup();}
})().catch(error=>{console.error(error);process.exitCode=1});
