// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events'),{fileURLToPath}=require('node:url');
const Printing=require('../../desktop/printing.cjs'),pdf=Buffer.from('%PDF-public-vector-unit');
const complete={recognized:true,state:'success',progress:100,initial:true,pages:300},tick=()=>new Promise(resolve=>setTimeout(resolve,5));
async function fixture(options={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eo-print-unit-')),root=path.join(directory,'print-jobs'),windows=[],requests=[],permissions=[],parent=new EventEmitter();let response,state=options.state===undefined?complete:options.state;
 class Window extends EventEmitter{
  constructor(config){super();this.config=config;this.destroyed=false;windows.push(this);this.webContents=new EventEmitter();
   Object.assign(this.webContents,{mainFrame:{framesInSubtree:[{url:'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html',executeJavaScript:async()=>{
    if(options.framePending)return new Promise(()=>{});if(options.frameError)throw Error('private frame detail');return state;
   }}]},setWindowOpenHandler(fn){this.openHandler=fn},loadURL:async url=>{this.url=url;options.onLoad?.(this);if(options.loadError)throw Error('private path /not-for-errors');},
   print:(settings,callback)=>{this.printSettings=settings;response=callback;options.onPrint?.(this,callback);}});}
  minimize(){this.minimized=true}
  setMenuBarVisibility(value){this.menuBarVisible=value}isDestroyed(){return this.destroyed}
  destroy(){if(options.destroyError)throw Error('private native cleanup detail');this.destroyed=true;this.emit('closed')}
 }
 const ses={webRequest:{onBeforeRequest:fn=>{requests.push(fn);if(fn===null&&options.listenerRemovalError)throw Error('private listener cleanup detail')}},setPermissionCheckHandler:fn=>permissions.push(fn),setPermissionRequestHandler:fn=>permissions.push(fn)};
 const logs=[],partitions=[],session={fromPartition:(name,options)=>{partitions.push({name,options});return ses;}};
 const printer=Printing.create({BrowserWindow:Window,session,root,readyTimeout:options.readyTimeout||80,printTimeout:options.printTimeout||1000,pollMs:2,fallbackDelay:options.fallbackDelay??6000,log:code=>logs.push(code),allowOffscreenRetry:options.allowOffscreenRetry===true,io:options.io||fs});
 return {directory,root,windows,requests,permissions,parent,partitions,logs,printer,setState:value=>{state=value},get respond(){return response},clearResponse(){response=undefined},async waitPrint(){for(let i=0;i<100&&!response;i++)await tick();assert(response,'Native print not reached');},async cleanup(){await fs.rm(directory,{recursive:true,force:true})}};
}
test('readiness requires Chromium PDF completion and a valid document page count',()=>{
 assert(Printing.ready(complete));
 for(const value of [null,{}, {...complete,state:'loading'},{...complete,progress:99},{...complete,initial:false},{...complete,pages:0},{...complete,pages:1.5},{...complete,pages:Infinity}])assert.equal(Printing.ready(value),false);
});
test('does not print at loadURL completion; hidden native job starts only after PDF readiness',async()=>{
 const e=await fixture({state:{...complete,progress:0},readyTimeout:1000});
 try{
  const pending=e.printer.print(pdf,{parent:e.parent});await tick();await tick();assert.equal(e.respond,undefined);
  e.setState(complete);await e.waitPrint();const win=e.windows[0];assert.equal(win.config.show,false);assert.equal(win.config.webPreferences.sandbox,true);assert.equal(win.config.webPreferences.nodeIntegration,false);assert.equal(win.menuBarVisible,false);
  assert(win.url.startsWith('file:'));assert(!win.url.startsWith('data:'));const file=fileURLToPath(win.url);assert.deepEqual(await fs.readFile(file),pdf);
  if(process.platform!=='win32'){assert.equal((await fs.stat(file)).mode&0o777,0o600);assert.equal((await fs.stat(path.dirname(file))).mode&0o777,0o700);}
  assert.deepEqual(win.printSettings,{silent:false,printBackground:true,margins:{marginType:'none'}});
  e.respond(true,'');assert.deepEqual(await pending,{printed:true,reason:null});assert(win.destroyed);assert.deepEqual(await fs.readdir(e.root),[]);
 }finally{await e.cleanup();}
});
test('private print session denies permissions, external requests, other files and navigation',async()=>{
 const e=await fixture();try{
  const pending=e.printer.print(pdf);await e.waitPrint();const win=e.windows[0],filter=e.requests[0],allowed=url=>{let answer;filter({url},value=>{answer=!value.cancel});return answer};
  assert.match(e.partitions[0].name,/^eo-print-/);assert.equal(e.partitions[0].options.cache,false);
  assert(allowed(win.url));assert(allowed(win.url+'#page=1'));assert(allowed('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html'));assert(allowed('chrome://resources/js/assert.js'));assert(allowed('about:blank'));
  for(const url of ['https://example.invalid/','http://127.0.0.1:8080/','file:///etc/passwd',win.url+'.other','data:text/html,public','chrome://settings','chrome-untrusted://arbitrary/','about:config','chrome-extension://unrelated/index.html'])assert.equal(allowed(url),false,url);
  assert.equal(e.permissions[0](),false);let grant;e.permissions[1](null,'media',value=>grant=value);assert.equal(grant,false);assert.deepEqual(win.webContents.openHandler(),{action:'deny'});
  let blocked=false;win.webContents.emit('will-navigate',{preventDefault(){blocked=true}},'https://example.invalid/');assert(blocked);
  e.respond(false,'Print job cancelled');assert.deepEqual(await pending,{printed:false,reason:'cancelled'});assert.equal(e.requests.at(-1),null);
 }finally{await e.cleanup();}
});
for(const scenario of ['loadError','framePending','frameError'])test(scenario+' fails without native print and removes private PDF',async()=>{
 const e=await fixture({[scenario]:true,readyTimeout:25});try{
  await assert.rejects(e.printer.print(pdf),error=>/^EOPRINT_/.test(error.code)&&!error.message.includes('private'));assert.equal(e.respond,undefined);
  assert(e.windows[0].destroyed);assert.deepEqual(await fs.readdir(e.root),[]);
 }finally{await e.cleanup();}
});
for(const event of ['render-process-gone','unresponsive','closed','parent-closed'])test(event+' closes only the helper and settles the pending operation',async()=>{
 const e=await fixture({state:null,readyTimeout:1000});try{
  const pending=e.printer.print(pdf,{parent:e.parent});const outcome=pending.then(value=>({value}),error=>({error}));
  for(let i=0;i<100&&!e.windows.length;i++)await tick();const win=e.windows[0];
  if(event==='render-process-gone')win.webContents.emit(event,{}, {reason:'crashed'});
  else if(event==='parent-closed')e.parent.emit('closed');else win.emit(event);
  const answer=await outcome;if(['closed','parent-closed'].includes(event))assert.deepEqual(answer.value,{printed:false,reason:'cancelled'});else assert.equal(answer.error?.code,'EOPRINT_RENDERER');
  assert.equal(e.respond,undefined);assert(win.destroyed);assert.deepEqual(await fs.readdir(e.root),[]);
 }finally{await e.cleanup();}
});
test('abort during readiness and during a native dialog settles and cleans without reprinting',async()=>{
 for(const duringDialog of [false,true]){
  const e=await fixture({state:duringDialog?complete:null,readyTimeout:1000});try{
   const abort=new AbortController(),pending=e.printer.print(pdf,{signal:abort.signal});
   if(duringDialog)await e.waitPrint();else for(let n=0;n<100&&!e.windows.length;n++)await tick();
   abort.abort();assert.deepEqual(await pending,{printed:false,reason:'cancelled'});assert(e.windows[0].destroyed);assert.deepEqual(await fs.readdir(e.root),[]);
   e.respond?.(true,'');assert.equal(e.windows.length,1);
  }finally{await e.cleanup();}
 }
});
test('missing native callback has a deadline and permits a later print after cleanup',async()=>{
 const e=await fixture({printTimeout:25});try{
  await assert.rejects(e.printer.print(pdf),{code:'EOPRINT_CALLBACK_TIMEOUT'});assert(e.windows[0].destroyed);assert.deepEqual(await fs.readdir(e.root),[]);
  e.clearResponse();const pending=e.printer.print(pdf);await e.waitPrint();e.respond(true,'');assert.deepEqual(await pending,{printed:true,reason:null});
 }finally{await e.cleanup();}
});
test('one active job and input validation do not create an extra helper or file',async()=>{
 const e=await fixture();try{
  await assert.rejects(e.printer.print(Buffer.from('not a PDF')),{code:'EOPRINT_INPUT'});const aborted=new AbortController();aborted.abort();assert.deepEqual(await e.printer.print(pdf,{signal:aborted.signal}),{printed:false,reason:'cancelled'});assert.equal(e.windows.length,0);
  const first=e.printer.print(pdf);await e.waitPrint();await assert.rejects(e.printer.print(pdf),{code:'operation-busy'});e.respond(false,'cancelled');await first;assert.equal(e.windows.length,1);
 }finally{await e.cleanup();}
});
test('startup reaps only interrupted job names and refuses a symbolic cache root',async()=>{
 const e=await fixture();try{
  await fs.mkdir(e.root);await fs.mkdir(path.join(e.root,'job-ABC123'));await fs.writeFile(path.join(e.root,'job-ABC123/document.pdf'),pdf);await fs.writeFile(path.join(e.root,'unrelated.txt'),'keep');
  await e.printer.cleanup();assert.deepEqual(await fs.readdir(e.root),['unrelated.txt']);
 }finally{await e.cleanup();}
 const e2=await fixture();try{
  await fs.mkdir(path.join(e2.directory,'outside'));await fs.symlink(path.join(e2.directory,'outside'),e2.root,process.platform==='win32'?'junction':'dir');
  await assert.rejects(e2.printer.print(pdf),{code:'EOPRINT_CACHE'});assert.equal(e2.windows.length,0);assert.deepEqual(await fs.readdir(path.join(e2.directory,'outside')),[]);
 }finally{await e2.cleanup();}
});

for(const failure of ['destroyError','listenerRemovalError'])test('private file removal still runs after '+failure,async()=>{
 const e=await fixture({[failure]:true});try{
  const pending=e.printer.print(pdf);const result=assert.rejects(pending,{code:'EOPRINT_CLEANUP'});await e.waitPrint();e.respond(true,'');await result;
  assert.deepEqual(await fs.readdir(e.root),[]);assert.equal(e.requests.at(-1),null);
 }finally{await e.cleanup();}
});
test('failed file removal is reported without a private path and reaped on the next startup',async()=>{
 let root;
 const io={...fs,rm:async(target,options)=>{if(path.basename(target).startsWith('job-'))throw Error('private document/path');return fs.rm(target,options)}};
 const e=await fixture({io});try{
  const pending=e.printer.print(pdf);const result=assert.rejects(pending,error=>error.code==='EOPRINT_CLEANUP'&&!error.message.includes('private'));await e.waitPrint();e.respond(false,'cancelled');await result;
  assert.equal((await fs.readdir(e.root)).length,1);assert(e.windows[0].destroyed);
  await Printing.create({root:e.root}).cleanup();assert.deepEqual(await fs.readdir(e.root),[]);
 }finally{await e.cleanup();}
});

test('unrecognised fields on a loaded real viewer use only the bounded compatibility grace period',async()=>{
 const unknown={viewer:true,defined:true,frameLoaded:true,recognized:false};
 const e=await fixture({state:unknown,fallbackDelay:30,readyTimeout:500});try{
  const pending=e.printer.print(pdf);await tick();await tick();assert.equal(e.respond,undefined);
  await e.waitPrint();assert.deepEqual(e.logs,['EOPRINT_READY_FALLBACK']);e.respond(true,'');assert.equal((await pending).printed,true);
 }finally{await e.cleanup()}
});
test('known loading, missing viewer and unloaded frame never use the compatibility fallback',async()=>{
 for(const state of [{...complete,progress:1},...['state','progress','initial','pages'].map((key,index)=>({viewer:true,defined:true,frameLoaded:true,recognized:false,[key]:['loading',1,false,0][index]})),{viewer:true,defined:false,frameLoaded:true,recognized:false},{viewer:true,defined:true,frameLoaded:false,recognized:false},null]){
  const e=await fixture({state,fallbackDelay:2,readyTimeout:30});try{
   await assert.rejects(e.printer.print(pdf),{code:'EOPRINT_READY_TIMEOUT'});assert.equal(e.respond,undefined);assert.deepEqual(e.logs,[]);
  }finally{await e.cleanup()}
 }
});
test('explicit viewer failure never uses a compatibility fallback',async()=>{
 const e=await fixture({state:{viewer:true,defined:true,frameLoaded:true,recognized:false,state:'failed'},fallbackDelay:2});
 try{await assert.rejects(e.printer.print(pdf),{code:'EOPRINT_VIEWER'});assert.equal(e.respond,undefined);assert.deepEqual(e.logs,[])}finally{await e.cleanup()}
});
test('contingency is off by default; a failed native submission is reported once',async()=>{
 const e=await fixture({onPrint:(_window,callback)=>callback(false,'Failed to print')});
 try{assert.deepEqual(await e.printer.print(pdf),{printed:false,reason:'EOPRINT_JOB'});assert.equal(e.windows.length,1);assert.deepEqual(e.logs,[])}finally{await e.cleanup()}
});
test('explicit contingency retries one failed submission in an off-screen minimized helper',async()=>{
 const e=await fixture({allowOffscreenRetry:true,onPrint:(window,callback)=>callback(window.config.show,'Failed to print')});
 try{
  assert.deepEqual(await e.printer.print(pdf),{printed:true,reason:null});assert.equal(e.windows.length,2);
  const [first,second]=e.windows;assert.equal(first.config.show,false);assert(first.destroyed);assert(second.destroyed);
  assert.equal(second.config.show,true);assert.equal(second.config.x,-32000);assert.equal(second.config.y,-32000);assert.equal(second.config.skipTaskbar,true);assert.equal(second.minimized,true);
  assert.deepEqual(e.logs,['EOPRINT_OFFSCREEN_RETRY']);assert.deepEqual(await fs.readdir(e.root),[]);
 }finally{await e.cleanup()}
});
test('contingency retries a helper failure before submission but never more than once',async()=>{
 const e=await fixture({allowOffscreenRetry:true,onLoad:window=>{if(!window.config.show)window.webContents.emit('render-process-gone')},onPrint:(_window,callback)=>callback(false,'Failed')});
 try{assert.deepEqual(await e.printer.print(pdf),{printed:false,reason:'EOPRINT_JOB'});assert.equal(e.windows.length,2);assert.deepEqual(e.logs,['EOPRINT_OFFSCREEN_RETRY'])}finally{await e.cleanup()}
});
test('opt-in contingency never retries cancellation, uncertain timeout, cleanup or a submitted renderer failure',async()=>{
 const cases=[
  {onPrint:(_window,callback)=>callback(false,'cancelled'),result:{printed:false,reason:'cancelled'}},
  {printTimeout:15,error:'EOPRINT_CALLBACK_TIMEOUT'},
  {destroyError:true,onPrint:(_window,callback)=>callback(true,''),error:'EOPRINT_CLEANUP'},
  {onPrint:window=>setImmediate(()=>window.webContents.emit('render-process-gone')),error:'EOPRINT_RENDERER'}
 ];
 for(const item of cases){
  const e=await fixture({...item,allowOffscreenRetry:true});try{
   if(item.error)await assert.rejects(e.printer.print(pdf),{code:item.error});else assert.deepEqual(await e.printer.print(pdf),item.result);
   assert.equal(e.windows.length,1);assert.deepEqual(e.logs,[]);
  }finally{await e.cleanup()}
 }
});

test('fixed print compatibility codes reach the bounded safety log without document data',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eo-print-log-'));
 try{
  const safety=require('../../desktop/safety-log.cjs').create(directory);
  for(const code of ['EOPRINT_READY_FALLBACK','EOPRINT_OFFSCREEN_RETRY','print-cleanup-failure'])await safety.log(code);
  await safety.log('EOPRINT_READY_FALLBACK private/document.pdf');await safety.flush();
  const lines=(await fs.readFile(path.join(directory,'desktop-safety.log'),'utf8')).trim().split('\n');assert.equal(lines.length,3);
  assert.deepEqual(lines.map(line=>line.split(' ').at(-1)),['EOPRINT_READY_FALLBACK','EOPRINT_OFFSCREEN_RETRY','print-cleanup-failure']);
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
