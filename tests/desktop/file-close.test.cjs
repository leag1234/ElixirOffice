// SPDX-License-Identifier: AGPL-3.0-only
// Real IPC and renderer lifecycle with injected native choices; packaged UI is a separate gate.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),load=createRequire(path.join(root,'desktop/main.cjs')),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'close-recovery.test.cjs'),'utf8')+'\nmodule.exports={boot};',{
 require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate
});
const {boot}=scope.exports,tick=()=>new Promise(setImmediate);
const renderer=fs.readFileSync(path.join(root,'desktop/renderer.js'),'utf8');
const from=renderer.indexOf('async function returnHome(){'),to=renderer.indexOf('\nfunction desktopAction(',from);
assert(from>=0&&to>from);
function lifecycle(env,save){
 const removed=[],elements={workspace:{hidden:false},home:{hidden:true}},failures=[];
 const c={compactChrome:null,eoDesktop:{returnHome:()=>env.invoke('return-home')},save,
  pdfCompatibility:{dispose:()=>removed.push('pdf')},controller:{dispose:()=>removed.push('controller')},
  feedback:{dispose:()=>removed.push('feedback')},editor:{destroyEditor:()=>removed.push('editor')},
  file:{token:env.selected.token},frame:{},main:{},lastOperation:{},window:{EOLocalSession:{}},
  $:id=>elements[id],status:()=>{},refreshHome:async()=>removed.push('home'),fail:error=>failures.push(error.message)};
 vm.createContext(c);vm.runInContext(renderer.slice(from,to),c);
 return {c,removed,elements,failures,close:()=>c.returnHome()};
}
for(const platform of ['linux','win32','darwin']){
 test(platform+': File Close uses named quit actions, safe Cancel and deferred Save',async()=>{
  const env=await boot({platform,document:true});
  try{
   env.state.dirty=true;env.responses.push(platform==='darwin'?1:2);
   assert.equal(await env.invoke('return-home'),false);
   const options=env.dialogs[0],labels=Array.from(options.buttons,value=>value.replace(/&/g,''));
   assert.deepEqual(labels,platform==='darwin'?['Save','Cancel',"Don't Save"]:['Save',"Don't Save",'Cancel']);
   assert.equal(labels[options.defaultId],'Save');assert.equal(labels[options.cancelId],'Cancel');
   assert(options.message.includes('\u2068test.docx\u2069'));assert.match(options.message,/save the changes/i);
   assert.equal(env.removeCalls,0);assert.equal(env.window.destroyed,undefined);
   env.responses.push(0);assert.equal(await env.invoke('return-home'),'save');assert.equal(env.removeCalls,0);
   assert(env.sent.some(value=>value[1]==='resume-close'));
  }finally{await env.cleanup()}
 });
 test(platform+': File Close Don\'t Save removes recovery and returns home without quitting',async()=>{
  const env=await boot({platform,document:true});
  try{
   env.state.dirty=true;env.responses.push(platform==='darwin'?2:1);
   assert.equal(await env.invoke('return-home'),true);assert.equal(env.removeCalls,1);
   assert.equal(env.window.destroyed,undefined);
   await assert.rejects(env.invoke('save-as-info',env.selected.token),/No active document/);
  }finally{await env.cleanup()}
 });
}
test('File Close rechecks edits delivered with prepare-close before taking a clean shortcut',async()=>{
 let env;
 env=await boot({document:true,onSend:(_channel,action)=>{if(action==='prepare-close')env.state.dirty=true}});
 try{
  env.responses.push(process.platform==='darwin'?1:2);
  assert.equal(await env.invoke('return-home'),false);assert.equal(env.dialogs.length,1);assert.equal(env.removeCalls,0);
 }finally{await env.cleanup()}
});
test('File Close saves real bytes before disposing the renderer and leaves the app open',async()=>{
 const env=await boot({document:'pdf'});
 try{
  env.state.dirty=true;env.responses.push(0);
  let release;
  const ui=lifecycle(env,async()=>{
   await new Promise(resolve=>{release=resolve});
   await env.invoke('save',env.selected.token,new Uint8Array(Buffer.from('%PDF-public-close-saved')),false);
   env.state.dirty=false;return true;
  });
  const pending=ui.close();for(let n=0;n<100&&!release;n++)await tick();assert(release);
  assert.deepEqual(ui.removed,[]);assert.equal(env.removeCalls,0);
  assert.equal(await fsp.readFile(path.join(env.directory,'test.pdf'),'utf8'),'%PDF-public-source');
  release();await pending;
  assert.equal(await fsp.readFile(path.join(env.directory,'test.pdf'),'utf8'),'%PDF-public-close-saved');
  assert.deepEqual(ui.removed,['pdf','controller','feedback','editor','home']);
  assert.equal(ui.elements.home.hidden,false);assert.equal(ui.c.file,null);assert.equal(env.window.destroyed,undefined);
  assert.deepEqual(ui.failures,[]);
 }finally{await env.cleanup()}
});
for(const outcome of ['cancelled','rejected','late-edit']){
 test('File Close keeps the live document after '+outcome+' saving',async()=>{
  const env=await boot({document:true});
  try{
   env.state.dirty=true;env.responses.push(0,process.platform==='darwin'?1:2);
   const ui=lifecycle(env,async()=>{if(outcome==='rejected')throw Error('Injected save failure');return outcome==='late-edit'});
   await ui.close();assert.deepEqual(ui.removed,[]);assert.equal(ui.c.file.token,env.selected.token);
   assert.equal(ui.elements.workspace.hidden,false);assert.equal(env.removeCalls,0);
   assert.equal(env.dialogs.length,outcome==='late-edit'?2:1);
   assert.equal(ui.failures.length,outcome==='rejected'?1:0);
   assert.equal(await fsp.readFile(path.join(env.directory,'test.docx'),'utf8'),'PKtest-public-document');
  }finally{await env.cleanup()}
 });
}
test('File Close handles rejected IPC without disposing and clean close needs no dialog',async()=>{
 const env=await boot({document:true});
 try{
  const ui=lifecycle(env,async()=>{throw Error('Unexpected save')});
  ui.c.eoDesktop.returnHome=async()=>{throw Error('Injected close failure')};await ui.close();
  assert.deepEqual(ui.removed,[]);assert.deepEqual(ui.failures,['Injected close failure']);
  ui.c.eoDesktop.returnHome=()=>env.invoke('return-home');await ui.close();
  assert.equal(env.dialogs.length,0);assert.equal(ui.c.file,null);assert.equal(env.window.destroyed,undefined);
 }finally{await env.cleanup()}
});
test('replacement/open keeps its existing two-choice guard',async()=>{
 const env=await boot({document:true});
 try{
  env.state.dirty=true;env.responses.push(0);assert.equal(await env.discard(),false);
  assert.deepEqual(Array.from(env.dialogs[0].buttons,value=>value.replace(/&/g,'')),['Cancel',"Don't Save"]);
  assert.equal(env.removeCalls,0);
 }finally{await env.cleanup()}
});

test('untitled File Close Save selects a destination ticket and clears only after committed bytes',async()=>{
 const env=await boot();
 try{
  env.selected=await env.invoke('new','docx');env.state.dirty=true;env.responses.push(0);
  assert.equal(await env.invoke('return-home'),'save-as');assert.equal(env.removeCalls,0);
  const target=path.join(env.directory,'public-untitled-close.docx');
  await assert.rejects(fsp.stat(target),{code:'ENOENT'});
  env.saveResponses.push({canceled:false,filePath:target});
  const selected=await env.invoke('save-as-choose',env.selected.token,'docx',false);
  assert.equal(typeof selected.ticket,'string');
  const bytes=new Uint8Array(env.selected.bytes);
  const committed=await env.invoke('save',env.selected.token,bytes,true,undefined,undefined,selected.ticket);
  assert(committed.artifactId);assert.deepEqual(await fsp.readFile(target),Buffer.from(bytes));
  env.state.dirty=false;assert.equal(await env.invoke('return-home'),true);
  assert.equal(env.window.destroyed,undefined);
 }finally{await env.cleanup()}
});
for(const outcome of ['cancel','reject','late-edit','pending-picture','copy']){
 test('untitled close preserves the editor after Save As '+outcome,async()=>{
  let modified=true,pending=false;
  const state={window:{},controller:{isModified:()=>modified,hasPendingImages:()=>pending,isSaving:()=>false},opening:false,choosingSaveAs:false,lastOperation:null};
  const begin=renderer.indexOf("Object.defineProperty(window,'EODesktopState'");
  const end=renderer.indexOf("\nObject.defineProperty(window,'EODesktopCancelOperation'",begin);
  assert(begin>=0&&end>begin);vm.runInNewContext(renderer.slice(begin,end),state);
  const env=await boot({getRendererState:()=>state.window.EODesktopState(false)});
  try{
   env.selected=await env.invoke('new','docx');
   env.responses.push(0,process.platform==='darwin'?1:2);
   const calls=[],ui=lifecycle(env,async as=>{
    calls.push(as);
    if(outcome==='reject')throw Error('Injected Save As failure');
    if(outcome==='cancel')return false;
    modified=outcome==='late-edit'||outcome==='copy';pending=outcome==='pending-picture';return true;
   });
   await ui.close();assert.deepEqual(calls,[true],'Untitled Save must use the shared Save As flow');
   assert.deepEqual(ui.removed,[]);assert.equal(ui.c.file.token,env.selected.token);
   assert.equal(env.removeCalls,0);assert.equal(env.window.destroyed,undefined);
   assert.equal(env.dialogs.length,['cancel','reject'].includes(outcome)?1:2);
   assert.deepEqual(ui.failures,outcome==='reject'?['Injected Save As failure']:[]);
   assert(env.sent.some(value=>value[1]==='resume-close'));
  }finally{await env.cleanup()}
 });
}
