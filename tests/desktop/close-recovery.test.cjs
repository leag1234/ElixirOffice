// SPDX-License-Identifier: AGPL-3.0-only
// Unit fault injection runs the real main close handler; native dialogs remain runtime/manual coverage.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const source=path.resolve(__dirname,'../../desktop/main.cjs'),load=createRequire(source),{ORIGIN}=load('./resources.cjs');
const tick=()=>new Promise(setImmediate);
const closeCancel=process.platform==='darwin'?1:2,closeDontSave=process.platform==='darwin'?2:1;
async function boot({extraArgs=[],platform=process.platform,document=false,failRemove=false,safeStorage,systemLanguages=["en"],systemLocale="en",captureLocales,printSentinel=false,fontService,getRendererState,onSend,onShow,onPrint,fontSettings,timerDelay=ms=>ms,queuedPaths=[],releaseTransport,waitForRelease=true,overlayAvailable=false,displayBackend='x11'}={}){
 // Each VM models a fresh app process; createRequire otherwise shares its write barrier and warnings.
 const sessionFiles=load('./files.cjs');sessionFiles.resumeWrites();for(const warning of sessionFiles.writeWarnings())sessionFiles.acknowledgeWriteWarning(warning.key);
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eo-close-recovery-')),handlers=new Map(),dialogs=[],dialogParents=[],saveDialogs=[],responses=[],saveResponses=[],state={dirty:false},sent=[],windows=[],documentContents=[],app=new EventEmitter();
 if(fontSettings)await fs.writeFile(path.join(directory,'desktop-settings.json'),JSON.stringify({recents:[],...fontSettings}));
 const printSentinelPath=path.join(directory,'print-jobs','job-PUBLIC','document.pdf');
 if(printSentinel){await fs.mkdir(path.dirname(printSentinelPath),{recursive:true});await fs.writeFile(printSentinelPath,'%PDF-public-sentinel');}
 const releaseRequests=[],externalOpened=[];let releaseController,releaseDone=Promise.resolve();
 const appPaths={userData:directory};
 let window,focusedWindow,started=false,removeCalls=0;
 Object.assign(app,{isPackaged:false,commandLine:{appendSwitch(){}},setPath(name,value){appPaths[name]=value},getPath:name=>appPaths[name]||directory,requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getPreferredSystemLanguages:()=>systemLanguages,getLocale:()=>systemLocale,relaunch(options){(app.relaunchCalls??=[]).push(options);},quit(){app.quitCalls=(app.quitCalls||0)+1;},isReady:()=>true,exit(code){this.exitCode=code;},getVersion:()=> '0.1.0',setAboutPanelOptions(options){this.aboutOptions=options},showAboutPanel(){this.aboutShown=true}});
 function contents(url){
  const wc=new EventEmitter(),rendererState=documentContents.length?{dirty:false}:state;
  Object.assign(wc,{mainFrame:{url},state:rendererState,dead:false,zoomFactor:1,setZoomFactor(value){this.zoomFactor=value},getZoomFactor(){return this.zoomFactor},isDestroyed(){return this.dead;},getURL(){return this.mainFrame.url;},focus(){},setWindowOpenHandler(){},send(...args){sent.push(args);onSend?.(...args)},executeJavaScript:async expression=>getRendererState?getRendererState(expression,wc):({...wc.state,opening:wc.state.opening===true}),loadURL:async function(url){this.mainFrame.url=url;started=true;},close(){this.dead=true;this.emit('destroyed');}});
  return wc;
 }
 class View{
  constructor(){this.webContents=contents(ORIGIN+'/index.html');documentContents.push(this.webContents);}
  setVisible(value){this.visible=value;}setBounds(value){this.bounds=value;}
 }
 class Window extends EventEmitter{
  static getFocusedWindow(){return focusedWindow;}
  constructor(options={}){super();this.options=options;if(!window)window=this;focusedWindow=this;windows.push(this);this.contentView={addChildView(){},removeChildView(){}};this.webContents=contents(ORIGIN+'/tabs.html');Object.assign(this.webContents,{mainFrame:{url:ORIGIN+'/tabs.html'},setWindowOpenHandler(){},send(...args){sent.push(args);onSend?.(...args)},executeJavaScript:async expression=>getRendererState?getRendererState(expression):({...state,opening:state.opening===true})});this.webContents.print=(options,callback)=>onPrint?onPrint(options,callback):callback(false,'cancelled');this.webContents.loadURL=async url=>this.loadURL(url);this.webContents.session={};if(options.show===false)this.webContents.mainFrame.framesInSubtree=[{url:'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html',executeJavaScript:async()=>({recognized:true,state:'success',progress:100,initial:true,pages:1})}];}
  getContentSize(){return [1360,960]}
  setMenuBarVisibility(value){this.menuBarVisible=value}
  setTitle(){} setContentSize(){} show(){this.showCalls=(this.showCalls||0)+1} focus(){focusedWindow=this} getParentWindow(){return this.options.parent||null} isDestroyed(){return this.closed===true}
  async loadURL(url){this.url=url;this.webContents.mainFrame.url=url;}
  destroy(){this.closed=true;this.destroyed=true;this.webContents.dead=true;this.emit('closed');}
  close(){let stopped=false;this.emit('close',{preventDefault(){stopped=true}});if(!stopped)this.closed=true}
 }
 if(overlayAvailable)Window.prototype.setTitleBarOverlay=function(value){this.overlay=value};
 const ses={protocol:{handle(){}},webRequest:{onBeforeRequest(){}},setPermissionCheckHandler(){},setPermissionRequestHandler(){},on(){}};
 const electron={clipboard:{writeText(text){app.copiedDiagnostics=text}},safeStorage,app,BrowserWindow:Window,WebContentsView:View,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},protocol:{registerSchemesAsPrivileged(){}},session:{fromPartition:()=>ses},net:{fetch(){}},shell:{openExternal(url){externalOpened.push(url)},showItemInFolder(target){onShow?.(target);}},Menu:{buildFromTemplate:x=>x,setApplicationMenu(menu){app.menu=menu}},dialog:{showSaveDialog:async(_win,options)=>{saveDialogs.push(options);const value=saveResponses.shift();return typeof value==='function'?await value():value||{canceled:true}},showErrorBox:(...x)=>{throw Error('Unexpected startup error '+x)},showMessageBox:async(_win,options)=>{dialogs.push(options);dialogParents.push(_win);const response=responses.shift();return typeof response==='function'?await response():{response:response??0}}}};
 const Base=load('./recovery.cjs').Recovery;
 class Recovery extends Base{remove(id){removeCalls++;if(failRemove)return Promise.reject(Error('Injected recovery cleanup failure'));return super.remove(id)}}
 const filename=path.join(directory,document==='pdf'?'test.pdf':'test.docx');if(document)await fs.writeFile(filename,document==='pdf'?'%PDF-public-source':'PKtest-public-document');
 const context={require:name=>name==='./release-notice.cjs'?{...load(name),create(options){const instance=load(name).create({...options,fetch:async request=>{releaseRequests.push(request);return releaseTransport?releaseTransport(request):[]}});releaseController=instance;return {...instance,check(){releaseDone=instance.check();return releaseDone}}}}:name==='electron'?electron:name==='./fonts.cjs'&&fontService?{Fonts:class{constructor(){return fontService}}}:name==='./recovery.cjs'?{Recovery}:name==='./capture.cjs'&&captureLocales?{...load(name),run:()=>new Promise(()=>{})}:load(name),module:{exports:{}},exports:{},__dirname:path.dirname(source),process:Object.assign(new EventEmitter(),{platform,getuid:process.getuid,stdout:new EventEmitter(),stderr:new EventEmitter(),argv:['electron',source,...extraArgs,...(captureLocales?['--capture-screens',path.join(directory,'captures'),'--locales',captureLocales]:[]),...(document?[filename]:[])],env:{XDG_SESSION_TYPE:displayBackend}}),console:{...console},JSON:vm.runInThisContext('JSON'),Buffer,Uint8Array,setTimeout:(fn,ms,...args)=>setTimeout(fn,timerDelay(ms),...args),clearTimeout,URL};
 vm.runInNewContext(await fs.readFile(source,'utf8'),context,{filename:source});
 for(const file of queuedPaths)app.emit('open-file',{preventDefault(){}},file);
 for(let i=0;i<100&&!started;i++)await new Promise(resolve=>setTimeout(resolve,10));assert(started,'Main did not initialize');
 const event={sender:documentContents[0],senderFrame:documentContents[0].mainFrame};context.__testEvent=event;
 const invoke=(name,...args)=>handlers.get('eo:'+name)(event,...(name==='closed-saved'&&!args.length?[sent.findLast(item=>item[1]==='save-close')?.[2]?.attemptId]:args));
 const selected=document?await invoke('initial'):null;
 if(waitForRelease)await releaseDone;
 // Stall only this VM's settings save; keep the real Preferences writer after
 // release so close tests can inspect the actual final atomic file.
 const holdPreferenceWrites=()=>vm.runInNewContext(`(()=>{
  const save=preferences.save.bind(preferences);
  let release,reject,calls=0;
  const gate=new Promise((resolve,fail)=>{release=resolve;reject=fail});
  preferences.save=(...args)=>{calls++;return gate.then(()=>save(...args))};
  return {release,reject,get calls(){return calls}};
 })()`,context);
 // Legacy window fault hooks deliberately address the document view, not the trusted shell.
 return {evaluate:code=>vm.runInNewContext(code,context),releaseRequests,externalOpened,releaseSettled:()=>releaseDone,directory,printSentinelPath,shell:window,documents:documentContents,invokeFor:(contents,name,...args)=>handlers.get('eo:'+name)({sender:contents,senderFrame:contents.mainFrame},...args),window:new Proxy(window,{get(target,key){if(key==='webContents')return documentContents[0];const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}}),windows,app,handlers,process:context.process,dialogs,dialogParents,saveDialogs,responses,saveResponses,state,sent,invoke,setFocusedWindow:value=>{focusedWindow=value},holdPreferenceWrites,ownerCloseCompletion:(()=>{const owner=vm.runInNewContext('registry.windows()[0]',context);return ()=>owner.closePromise})(),quit:()=>vm.runInNewContext('quitApplication()',context),pendingCount:()=>vm.runInNewContext('pendingPaths.length+registry.windows().flatMap(owner=>owner.documents).reduce((count,id)=>count+registry.document(id).state.pending.length,0)',context),closeCompletion:()=>vm.runInNewContext('registry.window(registry.authorizeDocument(__testEvent).windowId).closePromise',context),flushSafety:()=>vm.runInNewContext('safety.flush()',context),flushCloseLog:()=>vm.runInNewContext('closeLogWrite',context),logReason:reason=>vm.runInNewContext('closeReason('+JSON.stringify(reason)+')',context),stallPreferences:()=>vm.runInNewContext('preferences.flush=()=>new Promise(()=>{})',context),rejectDialogs:()=>{const original=electron.dialog.showMessageBox;electron.dialog.showMessageBox=()=>Promise.reject(Error('Injected native dialog rejection'));return ()=>{electron.dialog.showMessageBox=original}},selected,discard:()=>vm.runInNewContext('registry.run(registry.authorizeDocument(__testEvent),()=>discard())',context),get removeCalls(){return removeCalls},async cleanup(){releaseController?.dispose();if(waitForRelease)await releaseDone;await vm.runInNewContext('closeLogWrite',context);await vm.runInNewContext('safety.flush()',context);await fs.rm(directory,{recursive:true,force:true})}};
}
test('fresh clean Home closes without a save/recovery error prompt',{timeout:2000},async()=>{
 const env=await boot();try{env.window.close();const completion=env.ownerCloseCompletion();assert(completion&&typeof completion.then==='function');await completion;assert.equal(env.window.closed,true);assert.deepEqual(env.dialogs,[]);assert.equal(env.removeCalls,0)}finally{await env.cleanup()}
});
test('cleanup failure plus Cancel retains unsaved guard; close-pending rejects a late recovery',async()=>{
 const env=await boot({document:true,failRemove:true});
 try{
  env.state.dirty=true;let resolveFirst;
  env.responses.push(()=>new Promise(resolve=>{resolveFirst=resolve}),0,closeCancel);
  env.window.close();for(let n=0;n<30&&!resolveFirst;n++)await tick();assert(resolveFirst);
  assert.equal(await env.invoke('recovery-save',env.selected.token,0,new Uint8Array(Buffer.from('PKlate-copy'))),false);
  assert.equal(env.removeCalls,0);
  resolveFirst({response:closeDontSave});for(let n=0;n<30&&env.dialogs.length<2;n++)await tick();
  for(let n=0;n<5;n++)await tick();
  assert.equal(env.window.closed,undefined);assert.equal(env.removeCalls,1);assert.equal(env.dialogs.length,2);
  env.state.dirty=true;env.window.close();for(let n=0;n<30&&env.dialogs.length<3;n++)await tick();
  assert.equal(env.dialogs.length,3,'Subsequent close bypassed unsaved prompt');assert.equal(env.window.closed,undefined);
  assert.equal(env.dialogs[2].message,env.dialogs[0].message);
 }finally{await env.cleanup()}
});

test('Home discard and dirty close tolerate no active document',{timeout:2000},async()=>{
 const env=await boot();
 try{
  assert.equal(await env.discard(),true);assert.equal(env.removeCalls,0);
  env.state.dirty=true;env.responses.push(closeDontSave);env.window.close();
  const completion=env.ownerCloseCompletion();assert(completion&&typeof completion.then==='function');await completion;
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
 const env=await boot({fontSettings:{fontConsent:false,fontChoice:'declined'}});
 try{
  assert.equal(await env.invoke('font-choice'),'declined');
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

test('PDF copy export requires loss disclosure and cannot overwrite the original or a hard link',async()=>{
 const env=await boot({document:'pdf'});
 try{
  const input=new Uint8Array(Buffer.from('%PDF-public-copy')),original=path.join(env.directory,'test.pdf'),target=path.join(env.directory,'copy.pdf');
  env.responses.push(0);assert.equal(await env.invoke('pdf',env.selected.token,input,false),null);assert.match(env.dialogs.at(-1).message,/bookmarks/);
  assert.equal(await fs.readFile(original,'utf8'),'%PDF-public-source');
  env.responses.push(1);env.saveResponses.push({canceled:false,filePath:original});
  await assert.rejects(env.invoke('pdf',env.selected.token,input,false),/different destination/);
  const alias=path.join(env.directory,'alias.pdf');await fs.link(original,alias);env.responses.push(1);env.saveResponses.push({canceled:false,filePath:alias});
  await assert.rejects(env.invoke('pdf',env.selected.token,input,false),/different destination/);
  env.responses.push(1);env.saveResponses.push({canceled:false,filePath:target});assert.equal((await env.invoke('pdf',env.selected.token,input,false)).bytes,input.length);
  assert.equal(await fs.readFile(target,'utf8'),'%PDF-public-copy');assert.equal(await fs.readFile(original,'utf8'),'%PDF-public-source');
 }finally{await env.cleanup()}
});

test('PDF native atomic Save, cancelled Save As and concurrent replacement protect file identity',async()=>{
 const b=await boot({document:'pdf'});
 try{
  const original=path.join(b.directory,'test.pdf'),bytes=new Uint8Array(Buffer.from('%PDF-public-preserved-copy'));
  await b.invoke('save',b.selected.token,bytes,false);
  assert.deepEqual(await fs.readFile(original),Buffer.from(bytes));
  b.saveResponses.push({canceled:true});
  await assert.rejects(b.invoke('save',b.selected.token,bytes,true),/cancelled/);
  assert.deepEqual(await fs.readFile(original),Buffer.from(bytes));
  const external=Buffer.from('%PDF-public-external-replacement');
  await fs.writeFile(original,external);
  await assert.rejects(b.invoke('save',b.selected.token,bytes,false),/changed|conflict|modified/i);
  assert.deepEqual(await fs.readFile(original),external);
 }finally{await b.cleanup();}
});

test('a stuck opening/save state offers a visible choice, Cancel unlocks and retry can discard',{timeout:5000},async()=>{
 const env=await boot({document:true});
 try{
  env.state.opening=true;env.responses.push(0);env.window.close();
  const cancelled=env.closeCompletion();assert(cancelled&&typeof cancelled.then==='function');
  assert.equal(await cancelled,false,'Cancel must complete the actual close attempt');
  assert.equal(env.dialogs.length,1,'Busy close must reach the user');
  assert.equal(env.window.closed,undefined);
  assert(env.sent.some(args=>args[0]==='eo:action'&&args[1]==='resume-close'),'Cancel must release the input lock');
  env.responses.push(1);env.window.close();
  const discarded=env.closeCompletion();assert(discarded&&typeof discarded.then==='function');
  assert.equal(await discarded,true,'Discard must complete the actual close attempt');
  assert.equal(env.window.closed,true,'A subsequent explicit Discard must close');
  assert.equal(env.removeCalls,0,'Unknown/busy state must preserve recovery data');
  // Await the real serialized writer; closing deliberately does not wait for logging.
  await env.flushCloseLog();
  const log=await fs.readFile(path.join(env.directory,'desktop-close.log'),'utf8');
  assert.match(log,/busy-choice/);assert(!log.includes(env.directory));assert(!log.includes('test.docx'));
 }finally{await env.cleanup()}
});
test('a hung renderer times out safely and a late state reply cannot lock the UI',async()=>{
 const env=await boot({document:true});
 try{
  let resolveLate,script;
  env.window.webContents.executeJavaScript=value=>{script=value;return new Promise(resolve=>{resolveLate=resolve})};
  env.responses.push(0);env.window.close();
  for(let n=0;n<80&&!env.dialogs.length;n++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(env.dialogs.length,1,'Hung state query must show a conservative dialog');
  assert.match(script,/EODesktopState\(false\)/,'Late query must never request an input lock');
  resolveLate({dirty:false,opening:false});for(let n=0;n<5;n++)await tick();
  assert.equal(env.window.closed,undefined);
  env.window.webContents.executeJavaScript=async()=>({dirty:false,opening:false});
  env.window.close();for(let n=0;n<100&&!env.window.closed;n++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(env.window.closed,true,'Timed-out request must not wedge subsequent close');
 }finally{await env.cleanup()}
});
test('renderer save-close unlocks after cancelled save, rejected save or rejected acknowledgement',async()=>{
 const sourceText=require('node:fs').readFileSync(path.join(__dirname,'../../desktop/renderer.js'),'utf8');
 const match=sourceText.match(/eoDesktop\.onAction\((async \(action,details\)=>\{[\s\S]*?)\n\}\);/);assert(match);
 for(const mode of ['cancel','save-rejection','ack-rejection']){
  let handler,failures=0;
  const context={closeCheck:true,choosingSaveAs:false,pendingRequested:false,fontRefreshRequested:false,setTimeout,
   save:async()=>{if(mode==='save-rejection')throw Error('Injected save error');return mode!=='cancel'},
   fail:()=>{failures++},eoDesktop:{onAction:fn=>{handler=fn},closeCancelled:async()=>{},closeSaved:async()=>{throw Error('Injected acknowledgement error')}}};
  vm.runInNewContext('eoDesktop.onAction('+match[1]+'\n});',context);
  await handler('save-close',{attemptId:'test-attempt'});assert.equal(context.closeCheck,false,mode);
  assert.equal(failures,mode==='cancel'?0:1,mode);
 }
});

test('approved Discard destroys the window despite a frozen iframe unload veto; Cancel does not',async()=>{
 const env=await boot({document:true});
 try{
  env.state.dirty=true;env.responses.push(closeCancel,closeDontSave);
  const startClose=()=>env.window.emit('close',{preventDefault(){}});
  env.window.close=()=>{throw Error('Injected iframe unload veto')};
  startClose();for(let n=0;n<30&&!env.dialogs.length;n++)await tick();
  for(let n=0;n<5;n++)await tick();assert.equal(env.window.destroyed,undefined);
  startClose();for(let n=0;n<100&&!env.window.destroyed;n++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(env.window.destroyed,true);assert.equal(env.dialogs.length,2);
 }finally{await env.cleanup()}
});

test('stalled preferences cannot wedge close-pending or silently discard recovery',async()=>{
 const env=await boot({document:true});
 try{
  env.stallPreferences();env.responses.push(0,1);env.window.close();
  for(let n=0;n<80&&!env.dialogs.length;n++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(env.dialogs.length,1);for(let n=0;n<5;n++)await tick();assert.equal(env.window.closed,undefined);
  env.window.close();for(let n=0;n<80&&!env.window.closed;n++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(env.window.destroyed,true);assert.equal(env.removeCalls,0);
 }finally{await env.cleanup()}
});
test('a rejected native close dialog releases the input lock and permits a later explicit decision',async()=>{
 const env=await boot({document:true});
 try{
  env.state.dirty=true;const restore=env.rejectDialogs();env.window.close();
  for(let n=0;n<100&&!env.sent.some(args=>args[1]==='resume-close');n++)await new Promise(resolve=>setTimeout(resolve,10));
  assert(env.sent.some(args=>args[1]==='resume-close'));assert.equal(env.window.destroyed,undefined);
  restore();env.responses.push(closeDontSave);env.window.close();
  for(let n=0;n<100&&!env.window.destroyed;n++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(env.window.destroyed,true);
 }finally{await env.cleanup()}
});

test('saved-close acknowledgement rechecks a late edit instead of destroying unsaved state',async()=>{
 const env=await boot({document:true});
 try{
  env.state.dirty=true;env.responses.push(0);env.window.close();
  for(let n=0;n<100&&!env.sent.some(args=>args[1]==='save-close');n++)await new Promise(resolve=>setTimeout(resolve,10));
  const first=env.sent.findLast(args=>args[1]==='save-close')?.[2]?.attemptId;assert(first);
  await env.invoke('closed-saved',first);assert.equal(env.window.destroyed,undefined);
  assert(env.sent.some(args=>args[1]==='resume-close'));
  env.responses.push(0);env.window.close();
  for(let n=0;n<100&&env.sent.findLast(args=>args[1]==='save-close')?.[2]?.attemptId===first;n++)await new Promise(resolve=>setTimeout(resolve,10));
  const second=env.sent.findLast(args=>args[1]==='save-close')?.[2]?.attemptId;assert(second);assert.notEqual(first,second);
  env.state.dirty=false;await env.invoke('closed-saved',second);assert.equal(env.window.destroyed,true);
 }finally{await env.cleanup()}
});

test('close log caps existing/concurrent writes and secures existing permissions',async()=>{
 const env=await boot(),file=path.join(env.directory,'desktop-close.log');
 try{
  await fs.writeFile(file,'x'.repeat(70000),{mode:0o644});await env.logReason('busy-choice');
  assert((await fs.stat(file)).size<=65536);assert.equal((await fs.stat(file)).mode&0o777,0o600);
  assert.match(await fs.readFile(file,'utf8'),/busy-choice/);
  await fs.writeFile(file,'x'.repeat(65530));await Promise.all(Array.from({length:32},()=>env.logReason('busy-choice')));
  assert((await fs.stat(file)).size<=65536);assert.equal((await fs.stat(file)).mode&0o777,0o600);
 }finally{await env.cleanup()}
});
test('clean-close rechecks an edit arriving while prepare-close is delivered',async()=>{
 const env=await boot({document:true});
 try{
  const original=env.window.webContents.send;env.window.webContents.send=(...args)=>{original(...args);if(args[1]==='prepare-close')env.state.dirty=true};
  env.responses.push(closeCancel);env.window.close();
  for(let n=0;n<100&&!env.dialogs.length;n++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(env.dialogs.length,1);assert.equal(env.window.destroyed,undefined);assert.equal(env.removeCalls,0);
 }finally{await env.cleanup()}
});

test('PDF recovery is refused without conversion or writes; Office recovery remains available',async()=>{
 const env=await boot({document:'pdf'});
 try{env.state.dirty=true;assert.equal(await env.invoke('recovery-save',env.selected.token,0,new Uint8Array(Buffer.from('%PDF-public-recovery'))),false);assert.equal(await env.invoke('recovery-save',env.selected.token,0,null),false);assert.deepEqual(env.dialogs,[]);}
 finally{await env.cleanup()}
 const office=await boot({document:true});
 try{office.state.dirty=true;const result=await office.invoke('recovery-save',office.selected.token,0,new Uint8Array(Buffer.from('PKpublic-recovery')));assert.equal(result.format,'docx');}
 finally{await office.cleanup()}
});
test('unexpected fatal events show one friendly close message and reject later IPC writes',async()=>{
 const env=await boot();
 try{
  env.process.emit('uncaughtException',Error('SYNTHETIC_PRIVATE_EXCEPTION'));
  env.process.emit('unhandledRejection','SYNTHETIC_PRIVATE_REJECTION');
  for(let i=0;i<40&&env.app.exitCode===undefined;i++)await tick();
  await env.flushSafety();await tick();
  assert.equal(env.dialogs.length,1);assert(!JSON.stringify(env.dialogs).includes('SYNTHETIC_PRIVATE'));
  assert.equal(env.app.exitCode,1);assert.throws(()=>env.invoke('recovery-failure'),/unexpected problem/);
 }finally{await env.cleanup()}
});

test('forgotten main-process rejection leaves IPC and the document alive',async()=>{
 const env=await boot();
 try{env.process.emit('unhandledRejection',Error('SYNTHETIC_PRIVATE_REJECTION'));await env.flushSafety();await tick();
 assert.equal(env.app.exitCode,undefined);assert.equal(env.dialogs.length,0);assert.equal(await env.invoke('recovery-failure'),true);
 }finally{await env.cleanup()}
});

test('native actions wait for Save As selection while close lock/resume remain responsive',async()=>{
 const sourceText=require('node:fs').readFileSync(path.join(__dirname,'../../desktop/renderer.js'),'utf8');
 const match=sourceText.match(/eoDesktop\.onAction\((async \(action,details\)=>\{[\s\S]*?)\n\}\);/);assert(match);
 let handler,calls=0;
 const context={closeCheck:false,choosingSaveAs:true,pendingRequested:false,fontRefreshRequested:false,
  eoDesktop:{onAction:fn=>{handler=fn}},run:()=>{calls++}};
 vm.runInNewContext('eoDesktop.onAction('+match[1]+'\n});',context);
 await handler('open');assert.equal(calls,0);
 await handler('prepare-close');assert.equal(context.closeCheck,true);
 await handler('resume-close');assert.equal(context.closeCheck,false);
});

test('named quit maps Cancel, Save and Do not Save correctly on each platform',async()=>{
 for(const platform of ['win32','linux','darwin']){
  const env=await boot({platform,document:true});
  try{
   env.state.dirty=true;env.responses.push(platform==='darwin'?1:2);env.window.close();
   for(let n=0;n<100&&!env.dialogs.length;n++)await new Promise(resolve=>setTimeout(resolve,10));for(let n=0;n<5;n++)await new Promise(resolve=>setTimeout(resolve,10));
   const options=env.dialogs[0],labels=Array.from(options.buttons,label=>label.replace(/&/g,''));
   assert(options.message.includes('\u2068test.docx\u2069'));assert.equal(labels[options.defaultId],'Save');assert.equal(labels[options.cancelId],'Cancel');
   assert.deepEqual(labels,platform==='darwin'?['Save','Cancel',"Don't Save"]:['Save',"Don't Save",'Cancel']);
   assert.equal(env.window.destroyed,undefined);assert.equal(env.removeCalls,0);assert(env.sent.some(a=>a[1]==='resume-close'));
   env.responses.push(0);env.window.close();
   for(let n=0;n<100&&!env.sent.some(a=>a[1]==='save-close');n++)await new Promise(resolve=>setTimeout(resolve,10));
   assert(env.sent.some(a=>a[1]==='save-close'));assert.equal(env.window.destroyed,undefined,'Save must await a clean acknowledgement');
   env.state.dirty=false;await env.invoke('closed-saved');assert.equal(env.window.destroyed,true);
  }finally{await env.cleanup();}
  const discardEnv=await boot({platform,document:true});
  try{
   discardEnv.state.dirty=true;discardEnv.responses.push(platform==='darwin'?2:1);discardEnv.window.close();
   for(let n=0;n<100&&!discardEnv.window.destroyed;n++)await new Promise(resolve=>setTimeout(resolve,10));
   assert.equal(discardEnv.window.destroyed,true);assert.equal(discardEnv.removeCalls,1);
  }finally{await discardEnv.cleanup();}
 }
});
test('localized busy close names the document without offering an unsafe Save',async()=>{
 const env=await boot({document:true,systemLanguages:['fr']});
 try{
  env.state.opening=true;env.responses.push(0);env.window.close();
  for(let n=0;n<100&&!env.dialogs.length;n++)await new Promise(resolve=>setTimeout(resolve,10));for(let n=0;n<5;n++)await new Promise(resolve=>setTimeout(resolve,10));
  const options=env.dialogs[0],labels=Array.from(options.buttons,label=>label.replace(/&/g,''));
  assert(options.message.includes('\u2068test.docx\u2069'));assert.match(options.message,/sans enregistrer/);
  assert.deepEqual(labels,['Annuler','Ne pas enregistrer']);assert.equal(options.defaultId,0);assert.equal(options.cancelId,0);
  assert.equal(env.window.destroyed,undefined);assert.equal(env.removeCalls,0);
  env.responses.push(1);env.window.close();for(let n=0;n<100&&!env.window.destroyed;n++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(env.window.destroyed,true);assert.equal(env.removeCalls,0,'Busy-close must preserve recovery');
 }finally{await env.cleanup();}
});

test('fresh desktop enables system fonts while explicit decline and capture remain disabled',async()=>{
 for(const options of [{},{fontSettings:{fontConsent:false,fontChoice:'declined'}},{captureLocales:'en'}]){
  const env=await boot(options);try{
   const allowed=!options.fontSettings&&!options.captureLocales;
   assert.equal(await env.invoke('font-permission'),allowed);
   if(!allowed){assert.deepEqual(Array.from(await env.invoke('fonts')),[]);await assert.rejects(env.invoke('font','unknown'),/permission/);await assert.rejects(env.invoke('font-index'),/disabled/);}
   if(allowed){const settings=JSON.parse(await fs.readFile(path.join(env.directory,'desktop-settings.json'),'utf8'));assert.equal(settings.fontChoice,'default');assert.equal(env.dialogs.length,0);}
  }finally{await env.cleanup();}
 }
});

test('capture startup print-job root preserves ordinary-profile pending print bytes',async()=>{
 const env=await boot({captureLocales:'en',printSentinel:true});
 try{
  assert.notEqual(env.app.getPath('userData'),env.directory);
  assert.equal(await fs.readFile(env.printSentinelPath,'utf8'),'%PDF-public-sentinel');
  assert.equal((await fs.stat(path.join(env.app.getPath('userData'),'print-jobs'))).isDirectory(),true);
 }finally{await env.cleanup()}
});
test('ordinary startup print-job root still reaps interrupted jobs in its own profile',async()=>{
 const env=await boot({printSentinel:true});
 try{
  assert.equal(env.app.getPath('userData'),env.directory);
  await assert.rejects(fs.stat(env.printSentinelPath),error=>error.code==='ENOENT');
  assert.equal((await fs.stat(path.join(env.directory,'print-jobs'))).isDirectory(),true);
 }finally{await env.cleanup()}
});
