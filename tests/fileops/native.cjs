// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=process.env.EO_DESKTOP_ROOT;if(!root)throw Error('Set EO_DESKTOP_ROOT to an isolated test folder');
const {launch,stop,editable}=require(path.join(root,'tests/desktop/harness.cjs')),{edit,text}=require(path.join(root,'tests/desktop/lifecycle.cjs'));
const input=process.env.EO_NATIVE_INPUT;if(!input)throw Error('Set EO_NATIVE_INPUT to the PID-scoped isolated-display helper');
function keys(env,action,value){
 const r=cp.spawnSync('python3',[input,action,...(value?[value]:[])],{env:{...process.env,DISPLAY:process.env.EO_DESKTOP_DISPLAY,EO_NATIVE_PID:String(env.application.pid)},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
}
async function nativeDialog(env){
 const xenv={...process.env,DISPLAY:process.env.EO_DESKTOP_DISPLAY};
 for(let i=0;i<100;i++){
  const tree=cp.execFileSync('xwininfo',['-root','-tree'],{env:xenv,encoding:'utf8'});
  for(const id of new Set((tree.match(/0x[0-9a-f]+/g)||[]).filter(id=>id!=='0x0'))){
   try{
    const p=cp.execFileSync('xprop',['-id',id,'_NET_WM_PID','WM_TRANSIENT_FOR','_NET_WM_WINDOW_TYPE'],{env:xenv,encoding:'utf8',stdio:['ignore','pipe','pipe']});
    const parent=/WM_TRANSIENT_FOR.*?(0x[0-9a-f]+)/.exec(p);
    if(!parent||!p.includes('_NET_WM_WINDOW_TYPE_DIALOG'))continue;
    const owner=cp.execFileSync('xprop',['-id',parent[1],'_NET_WM_PID'],{env:xenv,encoding:'utf8'});
    if(owner.includes('= '+env.application.pid)){keys(env,'focus',id);return id}
   }catch(e){if(!String(e.stderr||e.message).includes('BadWindow'))throw e}
  }
  await env.page.waitForTimeout(200);
 }
 throw Error('Owned native Save As dialog not found');
}
(async()=>{
 for(const format of ['docx','xlsx','pptx']){
  const dir=await fs.mkdtemp(path.join(root,'tmp','fileops-')),source=path.join(dir,'Original.'+format),renamed=path.join(dir,'Renamed.'+format),copyDir=path.join(dir,'Copies'),copy=path.join(copyDir,'Independent.'+format);
  await fs.mkdir(copyDir);await fs.copyFile(path.join(root,'fixtures','sample.'+format),source);const original=await fs.readFile(source);
  const env=await launch({file:source,profile:'fileops-'+format+'-'+Date.now(),executable:process.env.EO_PACKAGE_EXECUTABLE});
  try{
   await editable(env);await edit(env);
   const frame=env.page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));
   await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-rename').click();
   await env.page.locator('#desktop-rename-name').fill('Renamed');await env.page.locator('dialog.desktop-options button').filter({hasText:/^Save$/}).click();
   await env.page.waitForFunction(()=>window.EOLastRename||window.EOLocalFailure);assert.equal(await env.page.evaluate(()=>EOLocalFailure),null);
   assert.equal(await env.page.evaluate(()=>EOLocalSession.api.asc_getDocumentName()),'Renamed.'+format);
   assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),'Rename lost pending edits');
   assert.deepEqual(await fs.readFile(renamed),original);assert.equal(await fs.stat(source).then(()=>true,()=>false),false);
   await require(path.join(root,'tests/desktop/file-action.cjs'))(env.page,'save');
   await env.page.waitForFunction(()=>window.EOLastSave&&!EOLocalSession.controller.isModified()||window.EOLocalFailure,null,{timeout:90000});
   assert.equal(await env.page.evaluate(()=>EOLocalFailure),null);assert(text(renamed).includes('EODESKTOP'));
   const stored=await fs.readFile(renamed);
   await require(path.join(root,'tests/desktop/file-action.cjs'))(env.page,'save-as',format);assert(await nativeDialog(env),'Native dialog required');
   keys(env,'save-path',copy);
   await env.page.waitForFunction(()=>EOLastSave?.name==='Independent.'+EOLocalSession.format||window.EOLocalFailure,null,{timeout:90000});
   assert.equal(await env.page.evaluate(()=>EOLocalFailure),null);assert(text(copy).includes('EODESKTOP'));assert.deepEqual(await fs.readFile(renamed),stored);
   assert.equal(await env.page.evaluate(()=>EOLocalSession.file.name),'Independent.'+format);
   assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>r.method==='GET'&&/^(eoapp:|blob:|data:)/.test(r.url)));
  }finally{await stop(env)}
  const fresh=await launch({file:copy,profile:'fileops-reopen-'+format+'-'+Date.now(),executable:process.env.EO_PACKAGE_EXECUTABLE});
  try{await editable(fresh);assert(await fresh.page.evaluate(()=>{const b=new Uint8Array(EOLocalSession.controller.serialize()),n=Array.from('EODESKTOP').flatMap(c=>[c.charCodeAt(0),0]);return b.some((_v,i)=>n.every((v,j)=>b[i+j]===v))}));assert.deepEqual(fresh.errors,[])}
  finally{await stop(fresh)}
  console.log('PASS native',format,'dirty real rename, future save, native folder chooser, original and copy reopen');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
