// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const source=path.resolve(__dirname,'../../desktop/main.cjs'),load=createRequire(source);
for(const kind of ['inspect','cdp','locale-only','duplicate','missing-folder','nonempty-folder','invalid-parent']){
 test('capture startup '+kind+' fails closed and logged without a main error popup',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-capture-startup-'));
  try{
   let folder=path.join(root,'screens');let args=['--capture-screens',folder,'--locales','en'];
   if(kind==='inspect')args.push('--inspect=0');
   if(kind==='cdp')args.push('--remote-debugging-port=12345');
   if(kind==='locale-only')args=['--locales','en'];
   if(kind==='duplicate')args.push('--locales','fr');
   if(kind==='missing-folder')args=['--capture-screens'];
   if(kind==='nonempty-folder'){fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'public.txt'),'public test');}
   if(kind==='invalid-parent'){fs.writeFileSync(folder,'public test');args=['--capture-screens',path.join(folder,'child')];}
   const exits=[],errors=[];let locks=0,ready=0,windows=0,dialogs=0;
   const app=new EventEmitter();Object.assign(app,{isPackaged:false,commandLine:{appendSwitch(){}},setPath(){},exit:code=>exits.push(code),requestSingleInstanceLock(){locks++;return true},whenReady(){ready++;return new Promise(()=>{})},quit(){}});
   const electron={app,BrowserWindow:class{constructor(){windows++}},protocol:{registerSchemesAsPrivileged(){}},dialog:{showErrorBox(){dialogs++}},ipcMain:{},Menu:{},session:{},net:{},shell:{}};
   const context={require:name=>name==='electron'?electron:load(name),module:{exports:{}},exports:{},__dirname:path.dirname(source),process:{...process,argv:['electron',source,...args],env:{}},console:{error:(...values)=>errors.push(values.join(' ')),log(){}},Buffer,setTimeout,clearTimeout,URL};
   assert.doesNotThrow(()=>vm.runInNewContext(fs.readFileSync(source,'utf8'),context,{filename:source}));
   assert.deepEqual(exits,[1]);assert.equal(errors.length,1);assert.match(errors[0],/Error:/);assert.match(errors[0],/main\.cjs/);
   assert.equal(locks,0);assert.equal(ready,0);assert.equal(windows,0);assert.equal(dialogs,0);
   assert(!fs.existsSync(path.join(root,'desktop-settings.json')));
  }finally{fs.rmSync(root,{recursive:true,force:true})}
 });
}
