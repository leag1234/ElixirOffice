// SPDX-License-Identifier: AGPL-3.0-only
// Unit fault injection runs the real main close handler; native dialogs remain runtime/manual coverage.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const source=path.resolve(__dirname,'../../desktop/main.cjs'),load=createRequire(source),{ORIGIN}=load('./resources.cjs');
const tick=()=>new Promise(setImmediate);
async function boot({document=false,failRemove=false,safeStorage,systemLanguages=["en"],systemLocale="en",captureLocales}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eo-close-recovery-')),handlers=new Map(),dialogs=[],responses=[],saveResponses=[],state={dirty:false},windows=[],app=new EventEmitter();
 let window,started=false,removeCalls=0;
 Object.assign(app,{isPackaged:false,commandLine:{appendSwitch(){}},setPath(){},getPath:()=>directory,requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getPreferredSystemLanguages:()=>systemLanguages,getLocale:()=>systemLocale,quit(){},getVersion:()=> '0.1.0'});
 class Window extends EventEmitter{
  constructor(){super();window=this;windows.push(this);this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:{url:ORIGIN+'/index.html'},setWindowOpenHandler(){},send(){},executeJavaScript:async()=>({...state,opening:false})});this.webContents.session={};}
  setTitle(){} setContentSize(){} show(){} focus(){} isDestroyed(){return this.closed===true}
  async loadURL(url){this.url=url;started=true}
  close(){let stopped=false;this.emit('close',{preventDefault(){stopped=true}});if(!stopped)this.closed=true}
 }
 const ses={protocol:{handle(){}},webRequest:{onBeforeRequest(){}},setPermissionCheckHandler(){},setPermissionRequestHandler(){},on(){}};
 const electron={safeStorage,app,BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},protocol:{registerSchemesAsPrivileged(){}},session:{fromPartition:()=>ses},net:{fetch(){}},shell:{openExternal(){}},Menu:{buildFromTemplate:x=>x,setApplicationMenu(){}},dialog:{showSaveDialog:async()=>saveResponses.shift()||{canceled:true},showErrorBox:(...x)=>{throw Error('Unexpected startup error '+x)},showMessageBox:async(_win,options)=>{dialogs.push(options);const response=responses.shift();return typeof response==='function'?await response():{response:response??0}}}};
 const Base=load('./recovery.cjs').Recovery;
 class Recovery extends Base{remove(id){removeCalls++;if(failRemove)return Promise.reject(Error('Injected recovery cleanup failure'));return super.remove(id)}}
 const filename=path.join(directory,'test.docx');if(document)await fs.writeFile(filename,'PKtest-public-document');
 const context={require:name=>name==='electron'?electron:name==='./recovery.cjs'?{Recovery}:name==='./capture.cjs'&&captureLocales?{...load(name),run:()=>new Promise(()=>{})}:load(name),module:{exports:{}},exports:{},__dirname:path.dirname(source),process:{...process,argv:['electron',source,...(captureLocales?['--capture-screens',path.join(directory,'captures'),'--locales',captureLocales]:[]),...(document?[filename]:[])],env:{}},console,Buffer,setTimeout,clearTimeout,URL};
 vm.runInNewContext(await fs.readFile(source,'utf8'),context,{filename:source});
 for(let i=0;i<100&&!started;i++)await new Promise(resolve=>setTimeout(resolve,10));assert(started,'Main did not initialize');
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
 const invoke=(name,...args)=>handlers.get('eo:'+name)(event,...args);
 const selected=document?await invoke('initial'):null;
 return {directory,window,windows,app,dialogs,responses,saveResponses,state,invoke,selected,discard:()=>vm.runInNewContext('discard()',context),get removeCalls(){return removeCalls},async cleanup(){await fs.rm(directory,{recursive:true,force:true})}};
}
test('fresh clean Home closes without a save/recovery error prompt',async()=>{
 const env=await boot();try{env.window.close();for(let n=0;n<30&&!env.window.closed;n++)await tick();assert.equal(env.window.closed,true);assert.deepEqual(env.dialogs,[]);assert.equal(env.removeCalls,0)}finally{await env.cleanup()}
});
test('cleanup failure plus Cancel retains unsaved guard; close-pending rejects a late recovery',async()=>{
 const env=await boot({document:true,failRemove:true});
 try{
  env.state.dirty=true;let resolveFirst;
  env.responses.push(()=>new Promise(resolve=>{resolveFirst=resolve}),0,2);
  env.window.close();for(let n=0;n<30&&!resolveFirst;n++)await tick();assert(resolveFirst);
  assert.equal(await env.invoke('recovery-save',env.selected.token,0,new Uint8Array(Buffer.from('PKlate-copy'))),false);
  assert.equal(env.removeCalls,0);
  resolveFirst({response:1});for(let n=0;n<30&&env.dialogs.length<2;n++)await tick();
  for(let n=0;n<5;n++)await tick();
  assert.equal(env.window.closed,undefined);assert.equal(env.removeCalls,1);assert.equal(env.dialogs.length,2);
  env.state.dirty=true;env.window.close();for(let n=0;n<30&&env.dialogs.length<3;n++)await tick();
  assert.equal(env.dialogs.length,3,'Subsequent close bypassed unsaved prompt');assert.equal(env.window.closed,undefined);
  assert.equal(env.dialogs[2].message,env.dialogs[0].message);
 }finally{await env.cleanup()}
});

test('Home discard and dirty close tolerate no active document',async()=>{
 const env=await boot();
 try{
  assert.equal(await env.discard(),true);assert.equal(env.removeCalls,0);
  env.state.dirty=true;env.responses.push(1);env.window.close();
  for(let n=0;n<30&&!env.window.closed;n++)await tick();
  assert.equal(env.window.closed,true);assert.equal(env.dialogs.length,1);assert.equal(env.removeCalls,0);
 }finally{await env.cleanup()}
});

test('native export handler validates format, writes copies and protects original aliases (unit dialog injection)',async()=>{
 const env=await boot({document:true});
 try{
  const source=path.join(env.directory,'test.docx'),before=await fs.readFile(source),target=path.join(env.directory,'copy.txt');
  env.saveResponses.push({canceled:false,filePath:target});
  assert.equal((await env.invoke('export',env.selected.token,new Uint8Array(Buffer.from('public text')),'txt')).format,'txt');
  assert.equal(await fs.readFile(target,'utf8'),'public text');assert.deepEqual(await fs.readFile(source),before);
  await assert.rejects(env.invoke('export',env.selected.token,new Uint8Array(Buffer.from('bad')),'exe'),/Unsupported/);
  env.saveResponses.push({canceled:false,filePath:source});
  await assert.rejects(env.invoke('export',env.selected.token,new Uint8Array(Buffer.from('PKcopy')),'docx'),/different/);
  const alias=path.join(env.directory,'alias.txt');await fs.link(source,alias);env.saveResponses.push({canceled:false,filePath:alias});
  await assert.rejects(env.invoke('export',env.selected.token,new Uint8Array(Buffer.from('public text')),'txt'),/different/);
  assert.deepEqual(await fs.readFile(source),before);
 }finally{await env.cleanup()}
});
test('desktop AI native settings require consent and author changes persist (unit dialog injection)',async()=>{
 const env=await boot();
 try{
  assert.deepEqual(Object.keys(await env.invoke('ai-settings')),[]);
  await assert.rejects(env.invoke('ai-request','12345678-1234-1234-1234-123456789012','{}'),/unavailable/);
  env.responses.push(0);assert.equal(await env.invoke('ai-configure',{endpoint:'http://localhost:11434/v1',model:'local'}),false);
  assert.deepEqual(Object.keys(await env.invoke('ai-settings')),[]);
  env.responses.push(1);const approved=await env.invoke('ai-configure',{endpoint:'http://localhost:11434/v1',model:'local'});
  assert.equal(approved.consented,true);assert.equal(approved.endpoint,'http://localhost:11434/v1');assert.equal(approved.apiKey,undefined);
  assert.deepEqual(Object.keys(await env.invoke('ai-configure',{endpoint:''})),[]);
  assert.equal(await env.invoke('author-save',' Public Author '),'Public Author');assert.equal(await env.invoke('author'),'Public Author');
  assert.equal(JSON.parse(await fs.readFile(path.join(env.directory,'desktop-settings.json'),'utf8')).author,'Public Author');
  await assert.rejects(env.invoke('author-save',' '),/Invalid/);
 }finally{await env.cleanup()}
});

test('AI keys are encrypted before settings persistence and excluded from public settings',async()=>{
 const crypto=require('node:crypto'),key=crypto.randomBytes(32),iv=crypto.randomBytes(12);
 const storage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString(value){
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  return Buffer.concat([cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);
 }};
 const env=await boot({safeStorage:storage}),secret=crypto.randomBytes(40).toString('hex');
 try{
  env.responses.push(1);
  const publicSettings=await env.invoke('ai-configure',{endpoint:'https://example.org/v1',model:'approved',apiKey:secret});
  const disk=await fs.readFile(path.join(env.directory,'desktop-settings.json'),'utf8');
  assert(!disk.includes(secret),'Plaintext key must never be persisted');
  assert(!JSON.stringify(publicSettings).includes(secret),'Public settings must not expose the key');
  const saved=JSON.parse(disk).ai;
  assert(saved.encryptedKey&&saved.apiKey===undefined,'Only encrypted key storage is permitted');
  assert(publicSettings.hasKey&&publicSettings.encryptedKey===undefined);
 }finally{await env.cleanup()}
});
test('unavailable or plaintext key storage rejects configuration before persistence',async()=>{
 for(const available of [false,true]){
  const env=await boot({safeStorage:{isEncryptionAvailable:()=>available,getSelectedStorageBackend:()=> 'basic_text',encryptString(){throw Error('Must not encrypt')}}});
  try{
   env.responses.push(1);
   await assert.rejects(env.invoke('ai-configure',{endpoint:'https://example.org/v1',model:'approved',apiKey:'synthetic-test-value'}),/Encrypted AI key storage unavailable/);
   assert.deepEqual(Object.keys(await env.invoke('ai-settings')),[]);
   const disk=await fs.readFile(path.join(env.directory,'desktop-settings.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error});
   assert(!disk.includes('synthetic-test-value'),'Rejected plaintext storage must not persist keys');
  }finally{await env.cleanup()}
 }
});


test('native Help follows selected UI language when system preferences differ, including UI locale changes',async()=>{
 const env=await boot({systemLanguages:['fr-FR'],systemLocale:'fr',captureLocales:'en,fr'});
 try{
  assert.equal(env.app.getLocale(),'fr');
  assert.equal((await env.invoke('locale')).language,'en');
  await env.invoke('help');
  assert(env.windows.at(-1).url.endsWith('/documenteditor/main/resources/help/en/index.htm'));
  assert.equal((await env.invoke('capture-locale','fr')).language,'fr');
  await env.invoke('help');
  assert(env.windows.at(-1).url.endsWith('/documenteditor/main/resources/help/fr/index.htm'));
 }finally{await env.cleanup()}
});


test('desktop font choice consent and revocation persist (native dialog unit injection)',async()=>{
 const env=await boot();
 try{
  assert.equal(await env.invoke('font-choice'),'unset');
  assert.equal(await env.invoke('font-permission'),false);
  assert.deepEqual(Array.from(await env.invoke('fonts')),[]);
  env.responses.push(0);assert.equal(await env.invoke('font-consent'),false);
  assert.equal(await env.invoke('font-choice'),'declined');assert.equal(await env.invoke('font-permission'),false);
  assert.deepEqual(Array.from(await env.invoke('fonts')),[]);
  env.responses.push(1);assert.equal(await env.invoke('font-consent'),true);
  assert.equal(await env.invoke('font-choice'),'granted');assert.equal(await env.invoke('font-permission'),true);
  let saved=JSON.parse(await fs.readFile(path.join(env.directory,'desktop-settings.json'),'utf8'));
  assert.equal(saved.fontConsent,true);assert.equal(saved.fontChoice,'granted');
  assert.equal(await env.invoke('font-disable'),true);
  assert.equal(await env.invoke('font-choice'),'declined');assert.equal(await env.invoke('font-permission'),false);
  saved=JSON.parse(await fs.readFile(path.join(env.directory,'desktop-settings.json'),'utf8'));
  assert.equal(saved.fontConsent,false);assert.equal(saved.fontChoice,'declined');
  assert.deepEqual(Array.from(await env.invoke('fonts')),[]);
  assert.equal(env.dialogs.length,2);assert(env.dialogs.every(d=>d.type==='question'));
 }finally{await env.cleanup()}
});
