// SPDX-License-Identifier: AGPL-3.0-only
const {launch,stop,editable,root,sleep,fixture}=require('./harness.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const report=[],marker=process.env.EO_EDIT_MARKER||'EODESKTOP',cjkGate=process.env.EO_CJK_GATE==='1',display=process.env.EO_DESKTOP_DISPLAY||':0';
function keys(env,action,value,{window}={}) {
 const result=cp.spawnSync('python3',[path.join(root,'tests/desktop/native-input.py'),action,...(value?[value]:[])],{cwd:root,env:{...process.env,DISPLAY:display,XAUTHORITY:path.join(root,'desktop.Xauthority'),EO_NATIVE_PID:String(env.application.pid),EO_NATIVE_IDENTITY:JSON.stringify(env.nativeIdentity),...(window?{EO_NATIVE_WINDOW:window}:{})},encoding:'utf8',timeout:20000});
 assert.equal(result.status,0,result.stderr||result.stdout);
}
function text(file) {
 return cp.execFileSync('python3',['-c',"import sys,zipfile,xml.etree.ElementTree as E;z=zipfile.ZipFile(sys.argv[1]);print(' '.join(''.join(E.fromstring(z.read(n)).itertext()) for n in z.namelist() if n.endswith('.xml')))",file],{encoding:'utf8'});
}
async function edit(env) {
 await env.page.evaluate(marker=>{
  const {api,win,format}=EOLocalSession;
  if(['docx','odt'].includes(format))api.WordControl.m_oLogicDocument.MoveCursorToStartPos();
  if(['pptx','odp'].includes(format)){
   const doc=api.WordControl.m_oLogicDocument,control=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(shape=>shape.txBody);
   if(!shape)throw Error('No editable slide text');
   control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();
  }
  api.asc_enterText(Array.from(marker,char=>char.codePointAt(0)));
  if(['xlsx','ods'].includes(format))api.asc_closeCellEditor();
 },marker);
 await env.page.waitForFunction(()=>EOLocalSession.controller.isModified());
 await env.page.waitForFunction(marker=>{const bytes=new Uint8Array(EOLocalSession.controller.serialize()),needle=Array.from(marker).flatMap(c=>[c.charCodeAt(0),0]);return bytes.some((_value,index)=>needle.every((value,j)=>bytes[index+j]===value))},marker);
}
async function cjkSnapshot(env) {
 const frame=env.page.frames().find(f=>/\/(?:document|spreadsheet|presentation)editor\/main\//.test(f.url()));assert(frame,'Editor frame missing');
 await frame.waitForFunction(()=>window.AscFonts?.FontPickerByCharacter?.getFontBySymbol);
 const snapshot=await frame.evaluate(()=>({
  picks:[[0x3042,'JP'],[0x3105,'TC'],[0x4e00,'SC'],[0xac00,'KR']].map(([cp,region])=>[region,AscFonts.FontPickerByCharacter.getFontBySymbol(cp)]),
  pages:typeof Asc.editor.getCountPages==='function'?Asc.editor.getCountPages():null
 }));
 assert.equal(await env.page.evaluate(()=>eoDesktop.fontPermission()),false,'Computer fonts must stay disabled');
 assert.deepEqual(snapshot.picks,[['JP','Elixir Fallback CJK JP'],['TC','Elixir Fallback CJK TC'],['SC','Elixir Fallback CJK SC'],['KR','Elixir Fallback CJK KR']]);
 return snapshot;
}
function nativeDialogs(env,expectedTitle) {
 const xenv={...process.env,DISPLAY:display,XAUTHORITY:path.join(root,'desktop.Xauthority')};
 let list=cp.execFileSync('xprop',['-root','_NET_CLIENT_LIST'],{env:xenv,encoding:'utf8',timeout:3000}).match(/0x[0-9a-f]+/g)||[];
 if(!list.length&&process.env.EO_XVFB_PID)list=Array.from(cp.execFileSync('xwininfo',['-root','-tree'],{env:xenv,encoding:'utf8',timeout:3000}).matchAll(/^\s+(0x[0-9a-f]+)\s/gm),match=>match[1]);
 const own=new RegExp('= '+env.application.pid+'(?:\\n|$)'),found=[];
 for(const id of [...new Set(list)].filter(id=>parseInt(id,16)>1)){
  try{
   const info=cp.execFileSync('xwininfo',['-id',id],{env:xenv,encoding:'utf8',timeout:3000,stdio:['ignore','pipe','pipe']});
   if(!info.includes('Map State: IsViewable'))continue;
   const properties=cp.execFileSync('xprop',['-id',id,'_NET_WM_PID','WM_TRANSIENT_FOR','_NET_WM_WINDOW_TYPE'],{env:xenv,encoding:'utf8',timeout:3000,stdio:['ignore','pipe','pipe']});
   const parent=/WM_TRANSIENT_FOR.*?(0x[0-9a-f]+)/.exec(properties);
   if(!parent||!properties.includes('_NET_WM_WINDOW_TYPE_DIALOG'))continue;
   const name=cp.execFileSync('xprop',['-id',id,'WM_NAME'],{env:xenv,encoding:'utf8',timeout:3000,stdio:['ignore','pipe','pipe']});
   if(expectedTitle&&!name.includes('= "'+expectedTitle+'"'))continue;
   if(own.test(properties)&&name.includes('= "Print document PDF"'))continue;
   const owner=cp.execFileSync('xprop',['-id',parent[1],'_NET_WM_PID'],{env:xenv,encoding:'utf8',timeout:3000,stdio:['ignore','pipe','pipe']});
   if(own.test(owner)&&own.test(properties))found.push(id);
  }catch(error){if(!String(error.stderr||error.message).includes('BadWindow'))throw error;}
 }
 return found;
}
async function modal(env,expectedTitle) {
 for(let attempt=0;attempt<300;attempt++){
  const failure=await env.page.evaluate(()=>window.EOLocalFailure);if(failure)throw Error(failure);
  const found=nativeDialogs(env,expectedTitle);assert(found.length<=1,'Ambiguous mapped owned native dialogs');
  if(found.length){keys(env,'focus',found[0],{window:found[0]});return found[0]}
  await sleep(200);
 }
 throw Error('Own native dialog not found: '+JSON.stringify({state:await env.page.evaluate(()=>({failure:window.EOLocalFailure,message:document.getElementById('message').textContent,pdf:window.EOLastPdf})),errors:env.errors,requests:env.requests.slice(-12)}));
}
async function roundtrip(format,entry='argument') {
 const source=['odt','ods','odp'].includes(format)?'sample-from-x2t.'+format:'sample.'+format;
 const target=await fixture(source);
 await fs.unlink(target.replace(/\.[^.]+$/,'.pdf')).catch(error=>{if(error.code!=='ENOENT')throw error});
 await fs.chmod(target,0o664);
 const env=await launch({file:entry==='argument'?target:undefined,profile:entry+'-'+format+'-'+Date.now()});
 try{
  if(entry==='drop'){
   const cdp=await env.page.context().newCDPSession(env.page);
   for(const type of ['dragEnter','dragOver','drop'])await cdp.send('Input.dispatchDragEvent',{type,x:500,y:20,data:{items:[],files:[target],dragOperationsMask:1}});
   await cdp.detach();
  }
  if(entry==='dialog'){
   await require('./file-action.cjs')(env.page,'open');await modal(env);keys(env,'path',target);
  }
  await editable(env);if(process.env.EO_DIRTY_TRACE==='1')await env.page.evaluate(()=>{const api=EOLocalSession.api,original=api.SetDocumentModified;window.EODirtyTrace=[];api.SetDocumentModified=function(value){EODirtyTrace.push({value,time:performance.now(),index:EOLocalSession.win.AscCommon.History.Index,stack:new Error().stack.split('\n').slice(1,5)});return original.apply(this,arguments)}});await edit(env);const cjkBefore=cjkGate?await cjkSnapshot(env):null;
  const dirtyTitle=cp.execFileSync('xprop',['-root','_NET_CLIENT_LIST'],{env:{...process.env,DISPLAY:display,XAUTHORITY:path.join(root,'desktop.Xauthority')},encoding:'utf8'});
  await env.page.waitForFunction(()=>EODesktopState(false).dirty&&!EODesktopState(false).opening);
  await require('./file-action.cjs')(env.page,'save');await env.page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
  try{await env.page.waitForFunction(()=>!EOLocalSession.controller.isModified())}catch(error){console.log('DIRTY SAVE STATE',JSON.stringify(await env.page.evaluate(()=>({canSave:EOLocalSession.api.canSave,modified:EOLocalSession.api.isDocumentModify,frame:EOLocalSession.api.isOpenedFrameEditor,saved:window.EOLastSave,error:window.EOLocalFailure,trace:window.EODirtyTrace?.slice(-12)})),null,2));throw error}
  assert(text(target).includes(marker),'Saved document lost edit');assert.equal((await fs.stat(target)).mode&0o777,0o664);
  const nativeBridge=await env.page.evaluate(async()=>{try{await eoDesktop.save('invalid',new Uint8Array([80,75,3,4]));return false}catch(error){return /active document/.test(error.message)}});
  assert(nativeBridge,'Invalid handle accepted');
  if(entry==='argument'){
   await require('./save-as-native.cjs').pdf(env,target.replace(/\.[^.]+$/,'.pdf'));
   await env.page.waitForFunction(()=>window.EOLastPdf||window.EOLocalFailure,null,{timeout:90000});
   assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
   const pdf=await env.page.evaluate(()=>window.EOLastPdf),pdfFile=target.replace(/\.[^.]+$/,'.pdf');
   assert(pdf.bytes>100);assert.equal(pdf.stats.backend,'wasm');
   const info=cp.execFileSync('pdfinfo',[pdfFile],{encoding:'utf8'}),pages=Number(/Pages:\s+(\d+)/.exec(info)[1]);
   assert.equal(pages,pdf.stats.pages);
   assert(cp.execFileSync('pdftotext',[pdfFile,'-'],{encoding:'utf8'}).replace(/\s/g,'').includes(marker),'PDF lost edit');
  }
  const escaped=env.requests.filter(r=>!r.url.startsWith('eoapp://desktop.elixiroffice.invalid/')&&!/^(blob:|data:)/.test(r.url));
  assert.deepEqual(escaped,[]);assert(env.requests.every(r=>r.method==='GET'));
  report.push({format,entry,bytes:(await fs.stat(target)).size,invalidHandleRejected:true,staticRequests:env.requests.length,pdf:await env.page.evaluate(()=>window.EOLastPdf||null),cjkBefore,errors:env.errors});
 }finally{await stop(env)}
 const fresh=await launch({file:target,profile:'reopen-'+format+'-'+Date.now()});
 try{await editable(fresh);assert(await fresh.page.evaluate(marker=>{const bytes=new Uint8Array(EOLocalSession.controller.serialize()),needle=Array.from(marker).flatMap(c=>[c.charCodeAt(0),0]);return bytes.some((_value,index)=>needle.every((value,j)=>bytes[index+j]===value))},marker),'Fresh reopen lost edit');const cjkAfter=cjkGate?await cjkSnapshot(fresh):null;if(cjkGate)assert.deepEqual(cjkAfter,cjkBefore,'CJK fallback/layout changed after reopen');report.at(-1).reopened=true;report.at(-1).cjkAfter=cjkAfter}
 finally{await stop(fresh)}
 await fs.writeFile(path.join(root,'results/lifecycle.json'),JSON.stringify(report,null,2));
 console.log('PASS',format,entry,'edit/save/reopen/native PDF');
}
if(require.main===module)(async()=>{
 const failures=[];
 for(const format of (process.env.EO_FORMATS||'docx,xlsx,pptx,odt,ods,odp').split(',')){
  try{await roundtrip(format)}catch(error){failures.push({format,error:error.message});console.error('FAIL',format,error)}
 }
 if(!cjkGate)for(const entry of ['dialog','drop']){
  try{await roundtrip('docx',entry)}catch(error){failures.push({entry,error:error.message});console.error('FAIL',entry,error)}
 }
 await fs.writeFile(path.join(root,'results/lifecycle-failures.json'),JSON.stringify(failures,null,2));
 if(failures.length)throw Error(failures.length+' lifecycle cases failed');
})().catch(error=>{console.error(error);process.exitCode=1});
module.exports={keys,modal,nativeDialogs,edit,text};
