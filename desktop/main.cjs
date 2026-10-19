// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {app, BrowserWindow, ipcMain, dialog, Menu, session, protocol, net, shell} = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const packageGuard=require('./package-guard.cjs'),password=require('./password.cjs');
const saveAs=require('./save-as.cjs'),destinations=new saveAs.Destinations();
const files = require('./files.cjs'), resources = require('./resources.cjs'), {Fonts} = require('./fonts.cjs');
// Keep the existing profile location while correcting the native app identity.
const defaultProfile=app.getPath('userData');
app.setName?.('ElixirOffice');app.setPath('userData',defaultProfile);
if (process.env.EO_DESKTOP_PROFILE) app.setPath('userData',path.resolve(process.env.EO_DESKTOP_PROFILE));
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
protocol.registerSchemesAsPrivileged([{scheme:resources.SCHEME,privileges:{standard:true,secure:true,supportFetchAPI:true,codeCache:true,corsEnabled:true}}]);
const assets = app.isPackaged ? path.join(process.resourcesPath,'assets') : path.join(__dirname,'assets');
let conversionRuntime;
let win, settings={recents:[],fontConsent:false}, current, dirty=false, busy=false, closing=false, ready=false, pending=[], closePending=false;
const fonts = new Fonts({report:error=>{void safety.log('font-error');void safety.log(error?.code)}});
const captureConsoleError=console.error.bind(console);
const safety=require('./safety-log.cjs').create(()=>app.getPath('userData'));
safety.install(process,console,async()=>{
 closing=true;
 try{
  if(!app.isReady?.()){app.exit(1);return;}
  const options={type:'error',message:t('fatalMessage'),detail:t('fatalDetail'),buttons:[t('close')],normalizeAccessKeys:true,defaultId:0,cancelId:0};
  if(win&&!win.isDestroyed())await dialog.showMessageBox(win,options);else await dialog.showMessageBox(options);
 }catch{await safety.log('fatal-dialog-failure');}
 finally{await safety.flush();app.exit(1);}
});
const artifacts=new (require('./artifacts.cjs').Artifacts)();
const printer=require('./printing.cjs').create({BrowserWindow,session,root:path.join(app.getPath('userData'),'print-jobs'),log:code=>safety.log(code),allowOffscreenRetry:process.env.EO_PRINT_OFFSCREEN_RETRY==='1'});
let preferences,recovery;
const locale=require('./locale.cjs'),capture=require('./capture.cjs'),decisions=require('./decisions.cjs');
let captureOptions,captureStartupError;
let languageInfo;
const fatalFallback={fatalMessage:'ElixirOffice encountered an unexpected problem and needs to close.',fatalDetail:'Changes not yet saved may be lost. Open the app again to continue.',close:'Close'};
const t=key=>languageInfo?.strings[key]||fatalFallback[key]||key;
// Invalid capture requests fail before startup, without Electron's uncaught-error dialog.
try{
 captureOptions=capture.parse(process.argv.slice(app.isPackaged?1:2));
 if(captureOptions){
  const sync=require('node:fs');sync.mkdirSync(captureOptions.folder,{recursive:true});
  if(sync.readdirSync(captureOptions.folder).length)throw Error('Choose an empty capture output folder');
  captureOptions.profile=sync.mkdtempSync(path.join(captureOptions.folder,'.capture-profile-'));
  app.setPath('userData',captureOptions.profile);
 }
}catch(error){captureStartupError=error;}

const {documentPath}=require('./document-path.cjs');
const argument=argv=>argv.map(documentPath).find(Boolean);
const initial = captureOptions||captureStartupError?null:argument(process.argv.slice(app.isPackaged?1:2)); if(initial)pending.push(initial);
if(captureStartupError){try{captureConsoleError('ElixirOffice capture startup failed:\n'+captureStartupError.stack);}catch{void safety.log('console-error');}app.exit(1);}
else if(!app.requestSingleInstanceLock()){if(captureOptions)cleanupCapture().catch(()=>safety.log('capture-cleanup-failure')).then(()=>app.exit(1)).catch(()=>{void safety.log('capture-cleanup-failure');app.exit(1)});else app.quit();}
else {
app.on('second-instance',(_event,argv)=>{if(captureOptions)return;const file=argument(argv.slice(1));if(file)pending.push(file);win?.show();win?.focus();if(ready)win.webContents.send('eo:action','pending');});
app.on('open-file',(event,file)=>{event.preventDefault();if(captureOptions)return;const selected=documentPath(file);if(selected)pending.push(selected);if(selected&&ready)win.webContents.send('eo:action','pending');});
app.whenReady().then(start).catch(async error=>{
 if(captureOptions){console.error(error.message);closing=true;if(win&&!win.isDestroyed())win.destroy();try{await cleanupCapture()}catch{await safety.log('capture-cleanup-failure')}finally{app.exit(1)}}
 else {dialog.showErrorBox('ElixirOffice',t('error'));app.quit();}
}).catch(()=>{void safety.log('startup-failure');app.exit(1)});
}
async function cleanupCapture(){
 if(captureOptions?.profile){app.releaseSingleInstanceLock();await fs.rm(captureOptions.profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}
function authorize(event) {
  if(safety.failed)throw Error(t('fatalMessage'));
  if(!win || event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || event.senderFrame.url!==resources.ORIGIN+'/index.html')throw Error('This command requires the desktop start window');
}
function persist(){return preferences.save(settings)}

function title() { win.setTitle((dirty?'* ':'')+(current?.name?current.name+' — ':'')+'ElixirOffice'); }
let finishClosePending;
function finishClose() {
 if(finishClosePending)return finishClosePending;
 finishClosePending=(async()=>{
  // Called only after saved/clean state or an explicit native Discard decision.
  // Destroy also finishes when a frozen iframe cannot acknowledge unload.
  for(const warning of files.writeWarnings()){
    const error={rollbackUncertain:true,message:'SAVE_RESTORE_UNCERTAIN:'+JSON.stringify(warning.backupName)};
    await dialog.showMessageBox(win,{type:'warning',title:'ElixirOffice',message:require('./errors.js').message(error,languageInfo?.strings),buttons:[t('close')],normalizeAccessKeys:true,defaultId:0,cancelId:0});
    files.acknowledgeWriteWarning(warning.key);
  }
  closing=true;win.destroy();
 })().finally(()=>{finishClosePending=null});
 return finishClosePending;
}
let closeLogWrite=Promise.resolve();
function closeReason(reason) {
  // Fixed reason codes only; serialize writes and retain at most 64 KiB.
  closeLogWrite=closeLogWrite.then(async()=>{
    const flags=require('node:fs').constants;
    const handle=await fs.open(path.join(app.getPath('userData'),'desktop-close.log'),flags.O_WRONLY|flags.O_CREAT|flags.O_APPEND|flags.O_NOFOLLOW,0o600);
    try{
      await handle.chmod(0o600);
      const line=Buffer.from(new Date().toISOString()+' '+reason+'\n');
      if((await handle.stat()).size+line.length>64*1024)await handle.truncate(0);
      await handle.write(line);
    }finally{await handle.close()}
  }).catch(async error=>{await safety.log('font-list-error');await safety.log(error?.code);});
  return closeLogWrite;
}
async function closeDeadline(work,deadline=Date.now()+3000) {
  let timer;
  try{return await Promise.race([work,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Close state unavailable')),Math.max(0,deadline-Date.now()))})])}
  finally{clearTimeout(timer)}
}
async function cancelRendererOperation(){
  const deadline=Date.now()+3000,settled=files.cancelPending({deadline});
  try{await closeDeadline(win.webContents.executeJavaScript('globalThis.EODesktopCancelOperation?.()'),deadline);}
  catch{closeReason('operation-cancel-unavailable');}
  // A timeout keeps the window alive; rollback/backup cleanup must settle first.
  await closeDeadline(settled,deadline);
}
async function savedTarget(id){
  try{return await artifacts.resolve(id,current?.token);}
  catch{throw Error('Saved file unavailable');}
}
async function rendererState(lock=true) {
  const state=await closeDeadline(win.webContents.executeJavaScript('globalThis.EODesktopState ? globalThis.EODesktopState(false) : {dirty:true,opening:true}'));
  if(lock)win.webContents.send('eo:action','prepare-close');return state;
}
async function discard(allowSave=false) {
  if(!current)return true;
  try{
  const state=await rendererState();
  if(state.opening)throw Error('Wait for the document to finish opening');
  dirty=state.dirty===true;
        await preferences.flush();
  if(allowSave){const confirmed=await rendererState(false);if(confirmed.opening)throw Error('Wait for the document to finish opening');dirty=confirmed.dirty===true;}
  if(!dirty){if(current)await recovery.remove(current.recoveryId||current.token);return true;}
  const result=await dialog.showMessageBox(win,decisions.unsaved(t,allowSave,current?.name,process.platform));
  // Choose the shared destination-ticket path before saving a document without a target.
  if(allowSave&&result.response===0)return current.target?'save':'save-as';
  const discarded=decisions.discard(result,allowSave,process.platform);
  if(discarded&&current){current.recoveryVersion=(current.recoveryVersion||0)+1;await recovery.remove(current.recoveryId||current.token);}
  return discarded;
  }finally{win.webContents.send('eo:action','resume-close')}
}
async function remember(target) {
  settings.recents=settings.recents.filter(item=>item.target!==target);
  settings.recents.unshift({id:crypto.randomUUID(),target,name:path.basename(target)});settings.recents=settings.recents.slice(0,15);
  try{await persist();return true}
  catch(error){await safety.log('file-error');await safety.log(error?.code);return false}
}
async function select(filename) {
  let opened;
  try{opened=await files.read(filename)}
  catch(error){
    await safety.log('file-error');await safety.log(error?.code);
    throw Error(require('./errors.js').openMessage(error,languageInfo?.strings,process.platform));
  }
  const {bytes,...metadata}=opened;
  const sourceFormat=files.extension(opened.target),format=require('./formats.cjs').canonical[sourceFormat]||sourceFormat;
  artifacts.clear();destinations.clear();
  current={...metadata,sourceTarget:opened.target,token:crypto.randomUUID(),name:path.basename(opened.target),format,sourceFormat};
  current.protected=password.encrypted(bytes,sourceFormat);current.recoveryLocked=current.protected;
  if(format!==sourceFormat){current.target=null;current.name=path.basename(opened.target).replace(/\.[^.]+$/,'.'+format)}
  dirty=false;title();await remember(opened.target);
  return {token:current.token,name:current.name,bytes:new Uint8Array(bytes),format:current.format,sourceFormat,runtime:conversionRuntime};
}
let homeFontDiscovery,homeFontGeneration;
function discoverFontsInBackground(){
 const generation=fonts.generation||0;
 if(homeFontDiscovery&&homeFontGeneration===generation)return;
 homeFontGeneration=generation;
 homeFontDiscovery=fonts.index();
 homeFontDiscovery.then(()=>{
  if(!captureOptions&&settings.fontConsent===true&&generation===(fonts.generation||0)&&win&&!win.isDestroyed())
   win.webContents.send('eo:action','font-index-ready');
 }).catch(()=>{});
}
function templateFonts(templates,language){
 if(!templates.some(template=>template.systemLocales?.includes(language))||captureOptions||settings.fontConsent!==true)return {};
 const index=fonts.peek();
 if(index)return {index};
 discoverFontsInBackground();
 return {};
}
function active(token) { if(!current||typeof token!=='string'||current.token!==token)throw Error('No active document handle'); }
function output(input,pdf=false) {
  if(!(input instanceof Uint8Array)||input.byteLength>512*1024*1024)throw Error('Invalid document output');
  const bytes=Buffer.from(input);
  if(pdf ? bytes.subarray(0,5).toString()!=='%PDF-' : bytes[0]!==80||bytes[1]!==75)throw Error('Invalid document output');
  return bytes;
}
async function operation(run) {
  if(busy)throw Error('Another file operation is running');
  busy=true;try{return await run()}finally{busy=false}
}
function operationStage(scope,id,phase){
 if(typeof id==='string'&&/^local-operation-[0-9]+$/.test(id))win.webContents.send('eo:operation-stage',{scope,id,phase});
}
async function takeDestination(ticket,format,route){
  try{return await destinations.take(ticket,current,format,route)}
  catch(error){if(error.code==='SAVE_AS_SELECTION')throw Error(t('saveDestinationChanged'));throw error;}
}
function handle(name,run) { ipcMain.handle('eo:'+name,(event,...args)=>{authorize(event);return (async()=>{try{return await run(...args)}catch(error){if(/^(?:E[A-Z0-9_]+|UNKNOWN)$/.test(error?.code||'')){await safety.log('file-error');await safety.log(error.code)}throw error}})()}); }
async function start() {
  await printer.cleanup().catch(()=>safety.log('print-cleanup-failure'));
  preferences=require('./settings-store.cjs')(app.getPath('userData'));
  recovery=new (require('./recovery.cjs').Recovery)(app.getPath('userData'));
  const preferred=captureOptions?captureOptions.locales:[...(app.getPreferredSystemLanguages?.()||[]),app.getLocale()];
  languageInfo=await locale.load(assets,preferred);
  let buildIdentity;
  try{buildIdentity=require('./build-identity.cjs').validate(JSON.parse(await fs.readFile(path.join(__dirname,'build-info.json'),'utf8')));}
  catch(error){if(app.isPackaged||error.code!=='ENOENT')throw error;}
  const aboutText=buildIdentity?require('./build-identity.cjs').label(buildIdentity):'Development';
  app.setAboutPanelOptions(buildIdentity?require('./build-identity.cjs').aboutOptions(buildIdentity):{applicationName:'ElixirOffice',applicationVersion:aboutText});
  const showAbout=()=>process.platform==='darwin'?app.showAboutPanel():dialog.showMessageBox(win,{type:'info',title:t('about')+' ElixirOffice',message:'ElixirOffice',detail:aboutText,buttons:['OK'],defaultId:0,cancelId:0});

  if(captureOptions&&captureOptions.locales.some(value=>!languageInfo.supported.includes(value)))throw Error('Unsupported capture locale');

  try{settings=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'desktop-settings.json'),'utf8'));settings.recents=require('./recent-files.cjs').normalize(settings.recents);settings.fontConsent=settings.fontConsent===true;}
  catch(error){if(error.code!=='ENOENT')throw error}
  settings=require('./font-preferences.cjs').migrate(settings,{capture:!!captureOptions});
  if(!captureOptions)await persist();
  const manifestBytes=await fs.readFile(path.join(assets,'desktop-manifest.json'));
  const manifest=JSON.parse(manifestBytes);
  if(!/^[a-zA-Z0-9-]+$/.test(manifest.conversion.artifact_version))throw Error('Invalid bundled conversion runtime');
  conversionRuntime=resources.ORIGIN+'/example/local-assets/sdkjs/common/wasm-convert/runtime/'+manifest.conversion.artifact_version+'/';
  const assetIdentity=crypto.createHash('sha256').update(manifestBytes).digest('hex').slice(0,16);
  fonts.configure({cacheDir:path.join(app.getPath('userData'),'font-index'),bundled:assets,bundleIdentity:assetIdentity});
  const ses=session.fromPartition((captureOptions?'elixiroffice-capture-':'persist:elixiroffice-desktop-')+assetIdentity);
  ses.protocol.handle(resources.SCHEME,await resources.createHandler(assets,__dirname,url=>net.fetch(url)));
  ses.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*','ftp://*/*','file://*/*']},(_details,callback)=>callback({cancel:true}));
  ses.setPermissionCheckHandler(()=>false);
  ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  ses.on('will-download',event=>event.preventDefault());
  win=new BrowserWindow({width:1360,height:960,title:'ElixirOffice',webPreferences:{session:ses,preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false}});
  win.webContents.setWindowOpenHandler(require('./external.cjs').handler(url=>shell.openExternal(url),()=>win.webContents.send('eo:action','external-error')));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==resources.ORIGIN+'/index.html')event.preventDefault()});
  win.on('close',event=>{
    if(closing)return;
    event.preventDefault();if(closePending)return;closePending=true;
    (async()=>{
      try {
        const state=await rendererState();
        if(busy||state.opening)throw Error('close-busy')
        await closeDeadline(preferences.flush());
        const confirmed=await rendererState(false);
        if(busy||confirmed.opening)throw Error('close-busy');
        dirty=confirmed.dirty===true;
        if(!dirty){if(current)await closeDeadline(recovery.remove(current.recoveryId||current.token));await finishClose();return}
        const result=await dialog.showMessageBox(win,decisions.unsaved(t,true,current?.name,process.platform));
        if(result.response===0)win.webContents.send('eo:action','save-close');
        else if(decisions.discard(result,true,process.platform)){if(current){current.recoveryVersion=(current.recoveryVersion||0)+1;await closeDeadline(recovery.remove(current.recoveryId||current.token));}await finishClose()}
        else win.webContents.send('eo:action','resume-close');
      } catch(error) {
        closeReason(error.message==='close-busy'?'busy-choice':'state-or-cleanup-failure');
        win.show();
        const result=await dialog.showMessageBox(win,decisions.busy(t,current?.name));
        if(result.response===1){await cancelRendererOperation();await finishClose()}else {closing=false;win.webContents.send('eo:action','resume-close');}
      } finally {closePending=false;if(!closing)files.resumeWrites();if(!closing&&!win.isDestroyed())win.webContents.send('eo:action','resume-close')}
    })().catch(()=>{closing=false;closePending=false;if(!win.isDestroyed())win.webContents.send('eo:action','resume-close');closeReason('dialog-failure')});
  });
  handle('initial',()=>operation(async()=>{
    ready=true;if(!pending.length)return null;
    if(!await discard()){pending=[];return null}
    const selected=await select(pending.shift());return {...selected,morePending:pending.length>0};
  }));
  handle('author',()=>typeof settings.author==='string'&&settings.author.trim()?settings.author:'ElixirOffice');
  handle('author-save',async value=>{if(typeof value!=='string'||!value.trim()||value.length>200||/[\u0000-\u001f\u007f]/.test(value))throw Error('Invalid author name');settings.author=value.trim();await persist();return settings.author;});
  handle('help',()=>help());
  handle('about',()=>showAbout());
  handle('quit',()=>win.close());
  handle('locale',async()=>({...languageInfo,capture:!!captureOptions}));
  handle('capture-locale',async language=>{
    if(!captureOptions||!captureOptions.locales.includes(language))throw Error('Capture locale unavailable');
    languageInfo=await locale.load(assets,[language]);return {...languageInfo,capture:true};
  });
  handle('home',async()=>{
    const recents=await require('./recent-files.cjs').metadata(settings.recents,async error=>{
      await safety.log('file-error');await safety.log(error?.code);
    });
    const templates=JSON.parse(await fs.readFile(path.join(assets,'desktop-home/templates.json'),'utf8'));
    const fontOptions=await templateFonts(templates,languageInfo.language);
    return {templates:templates.map(item=>require('./templates.cjs').resolve(item,languageInfo.language,fontOptions)),recents};
  });
  handle('return-home',()=>operation(async()=>{
    const decision=await discard(true);if(decision!==true)return decision;
    destinations.clear();current=null;dirty=false;title();return true;
  }));
  handle('template',id=>operation(async()=>{
    const templates=JSON.parse(await fs.readFile(path.join(assets,'desktop-home/templates.json'),'utf8'));
    const selected=templates.find(item=>item.id===id);if(!selected)throw Error('Unknown template');
    if(!await discard())return null;
    const fontOptions=await templateFonts([selected],languageInfo.language);
    const template=require('./templates.cjs').resolve(selected,languageInfo.language,fontOptions);
    const bytes=await fs.readFile(path.join(assets,'desktop-home/templates',template.file));
    destinations.clear();current={token:crypto.randomUUID(),name:(template.title||t(template.titleKey))+'.'+template.format,format:template.format,target:null};dirty=false;title();
    return {token:current.token,name:current.name,format:current.format,bytes:new Uint8Array(bytes),runtime:conversionRuntime};
  }));
  handle('open',()=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode uses generated documents only');
    if(!await discard())return null;
    const result=await dialog.showOpenDialog(win,{title:t('open'),properties:['openFile'],filters:[{name:t('file'),extensions:files.formats}]});
    return result.canceled?null:select(result.filePaths[0]);
  }));
  handle('drop',filename=>operation(async()=>{if(captureOptions)throw Error('Capture mode uses generated documents only');if(typeof filename!=='string'||!filename)throw Error('Drop a file from this computer');return await discard()?select(filename):null}));
  handle('saved-open',(id)=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode unavailable');
    const target=await savedTarget(id);
    if(!await discard())return null;
    await savedTarget(id);return select(target);
  }));
  handle('saved-show',async id=>{
    if(captureOptions)throw Error('Capture mode unavailable');
    const target=await savedTarget(id);shell.showItemInFolder(target);return true;
  });
  handle('recents',()=>settings.recents.map(({id,name})=>({id,name})));
  handle('recent',id=>operation(async()=>{if(captureOptions)throw Error('Capture mode uses generated documents only');const file=settings.recents.find(item=>item.id===id);if(!file)throw Error('Unknown recent file');return await discard()?select(file.target):null}));
  handle('new',format=>operation(async()=>{
    if(!['docx','xlsx','pptx'].includes(format))throw Error('Unsupported template');
    if(!await discard())return null;
    const bytes=await fs.readFile(format==='docx'?path.join(assets,'desktop-home/blanks',languageInfo.language+'.docx'):path.join(assets,'templates','new.'+format));
    destinations.clear();current={token:crypto.randomUUID(),name:t('untitled')+'.'+format,format,target:null};dirty=false;title();
    return {token:current.token,name:current.name,format,bytes:new Uint8Array(bytes),runtime:conversionRuntime};
  }));
  handle('state',(token,modified)=>{if(!current||token!==current.token)return false;dirty=modified===true;title();return true});
  handle('rename',(token,name)=>operation(async()=>{
    active(token);if(captureOptions)throw Error('Rename is unavailable in capture mode');
    if(current.target){
      const previous=current.target,{bytes,...renamed}=await files.rename(current,name);
      current={...current,...renamed};
      settings.recents=settings.recents.filter(item=>item.target!==previous);
      await remember(current.target);
    }else current.name=files.renameName(name,'.'+current.format);
    current.recoveryVersion=(current.recoveryVersion||0)+1;title();
    return {name:current.name,recoveryVersion:current.recoveryVersion};
  }));
  handle('password-lock',async token=>{
    active(token);const collided=busy,version=await password.lock(current,recovery);active(token);
    if(collided)throw Error('Another file operation is running');return {recoveryVersion:version};
  });
  handle('save',(token,input,as,protection,operationId,ticket)=>operation(()=>files.scoped({scope:token,id:operationId},async writeOptions=>{
    active(token);if(current.format==='pdf'&&protection?.protected)throw Error('PDF password protection is unavailable');const bytes=current.format==='pdf'?output(input,current.format):password.validate(input,current.format,protection||{protected:current.protected===true,remove:false},current);let target=current.target,copy=false;
    const selected=ticket?await takeDestination(ticket,current.format,'save'):null;
    try{packageGuard.protect(bytes,current.format,current.embeddedObjects)}
    catch(error){
      if(error.code!=='OBJECT_LOSS')throw error;
      operationStage(token,operationId,'awaiting-user');
      const result=await dialog.showMessageBox(win,{type:'warning',message:t('objectsWarning'),detail:t('saveError'),buttons:[t('cancel'),t('saveCopy')],normalizeAccessKeys:true,defaultId:0,cancelId:0});
      if(result.response!==1)throw Error('Save cancelled: embedded objects could not be preserved');
      copy=true;
    }
    if(selected&&!copy)target=selected.target;
    else if(as||!target||copy){
      const defaultPath=copy?(target||current.name).replace(/\.[^.]+$/, '-copy.'+current.format):(target||current.name);
      operationStage(token,operationId,'awaiting-user');
      const result=await dialog.showSaveDialog(win,{defaultPath,filters:[{name:t('file'),extensions:[current.format]}]});
      if(result.canceled)throw Error('Save cancelled');target=result.filePath;
      if(files.extension(target)!==current.format)throw Error('Save with the current document extension');
    }
    if(copy&&current.target){
      if(path.resolve(target)===current.target)throw Error('Save the copy to a different file. Your original file was not changed.');
      try{
        const destination=await fs.lstat(target);
        if(destination.dev===current.device&&destination.ino===current.inode)throw Error('Save the copy to a different file. Your original file was not changed.');
        const original=await fs.lstat(current.target);
        if(destination.dev===original.dev&&destination.ino===original.ino)throw Error('Save the copy to a different file. Your original file was not changed.');
      }catch(error){if(error.code!=='ENOENT')throw error}
    }
    operationStage(token,operationId,'writing');
    const saved=await password.write(files,target,bytes,selected&&!copy?selected.state||{absent:true}:!as&&!copy&&current.target?current:undefined,writeOptions);
    current={...current,...saved,sourceTarget:target,sourceFormat:current.format,protected:password.encrypted(bytes,current.format),name:path.basename(target),embeddedObjects:['odt','ods','odp'].includes(current.format)?packageGuard.embeddedObjects(bytes):0};const preferencesSaved=await remember(target);title();
    current.recoveryVersion=(current.recoveryVersion||0)+1;
    return {artifactId:artifacts.register(saved,current.token),name:current.name,bytes:saved.bytes,recoveryVersion:current.recoveryVersion,preferencesSaved,durabilityUnconfirmed:saved.durabilityUnconfirmed===true,backupName:saved.backupName||null};
  })));
  handle('write-cancel',async(token,id)=>{
    active(token);
    if(typeof id!=='string'||!/^local-operation-[0-9]+$/.test(id))throw Error('Invalid save operation');
    return (await files.cancelPending({scope:token,id,deadline:Date.now()+3000}))>0;
  });
  handle('save-as-info',token=>{
    active(token);
    return {formats:saveAs.choices(current).map(value=>({value,name:t(saveAs.labels[value]),description:t(saveAs.labels[value]+'Desc')})),
      defaultFormat:saveAs.preferred(current),nativeFormats:saveAs.nativeFormats(process.platform,process.env.EO_NATIVE_SAVE_AS==='1'),platform:process.platform};
  });
  handle('save-as-cancel',token=>{active(token);destinations.clear();return true});
  handle('save-as-choose',(token,format,pdfCopy=false)=>operation(async()=>{
    active(token);destinations.clear();
    if(captureOptions)throw Error('Save As is unavailable in capture mode');
    const multi=saveAs.nativeFormats(process.platform,process.env.EO_NATIVE_SAVE_AS==='1');
    if(!multi&&!saveAs.available(current).includes(format))throw Error('Choose a Save As format');
    if(typeof pdfCopy!=='boolean')throw Error('Invalid PDF copy selection');
    let defaultPath=saveAs.suggestion(current,format||saveAs.preferred(current),t('saveCopy'));
    for(;;){
      const result=await dialog.showSaveDialog(win,{title:t('saveAs'),defaultPath,
        filters:saveAs.filters(current,t,multi?undefined:format),properties:['showOverwriteConfirmation']});
      active(token);if(result.canceled)return null;
      let selectedFormat;
      try{selectedFormat=saveAs.extension(result.filePath,current,multi?undefined:format)}
      catch(error){
        if(error.code!=='SAVE_AS_EXTENSION')throw error;
        await dialog.showMessageBox(win,{type:'warning',message:t('saveError'),
          detail:t('saveFormat')+': '+(multi?saveAs.available(current):[format]).map(value=>'*.'+value).join(', '),
          buttons:[t('ok')],defaultId:0,cancelId:0});
        active(token);defaultPath=result.filePath;continue;
      }
      const route=selectedFormat==='pdf'&&(current.format!=='pdf'||pdfCopy)?'pdf':selectedFormat===current.format?'save':'export';
      if(route==='pdf')await require('./pdf-policy.cjs').assertCopyDestination(current,result.filePath);
      const selected=await destinations.issue(current,result.filePath,selectedFormat,route);
      active(token);
      // GTK overwrite prompts vary with the native backend. Bind an explicit
      // Linux confirmation to the destination snapshot before conversion.
      if(process.platform==='linux'&&destinations.pending.state){
        const accepted=await dialog.showMessageBox(win,{type:'warning',message:t('saveReplace'),detail:path.basename(result.filePath),
          buttons:[t('cancel'),t('replace')],normalizeAccessKeys:true,defaultId:0,cancelId:0});
        active(token);if(accepted.response!==1){destinations.clear();return null;}
      }
      const warning=saveAs.warning(current,selectedFormat);
      if(warning){
        const accepted=await dialog.showMessageBox(win,{type:'warning',message:t(warning),
          buttons:[t('cancel'),t('saveCopy')],normalizeAccessKeys:true,defaultId:0,cancelId:0});
        active(token);if(accepted.response!==1){destinations.clear();return null;}
      }
      if(route==='pdf'&&!await require('./pdf-policy.cjs').confirmCopy(current,dialog,win,t)){destinations.clear();return null;}
      active(token);return selected;
    }
  }));
  handle('export-formats',token=>{active(token);return require('./formats.cjs').exports[require('./formats.cjs').kind(current.format)]});
  handle('export',(token,input,format,protection,operationId,ticket)=>operation(()=>files.scoped({scope:token,id:operationId},async writeOptions=>{
    active(token);const formats=require('./formats.cjs');
    if(!formats.exports[formats.kind(current.format)]?.includes(format)||format==='pdf')throw Error('Unsupported export format');
    if(current.protected&&protection?.protected!==true&&protection?.remove!==true)throw Error('Confirm an unprotected export copy');
    const bytes=['docx','xlsx','pptx','odt','ods','odp'].includes(format)?password.validate(input,format,protection||{protected:false,remove:false},current):formats.output(input,format);
    if(['odt','ods','odp'].includes(format))packageGuard.protect(bytes,format,current.embeddedObjects);
    if(!ticket)operationStage(token,operationId,'awaiting-user');
    const selected=ticket?await takeDestination(ticket,format,'export'):null;
    const result=selected?{filePath:selected.target}:await dialog.showSaveDialog(win,{defaultPath:saveAs.suggestion(current,format,t('saveCopy')),filters:saveAs.filters(current,t,format)});
    if(result.canceled)throw Error('Save cancelled');
    if(files.extension(result.filePath)!==format)throw Error('Choose the selected format extension');
    if(current.target){
      if(path.resolve(result.filePath)===current.target)throw Error('Export to a different file');
      try{const stat=await fs.stat(result.filePath);if(stat.dev===current.device&&stat.ino===current.inode)throw Error('Export to a different file');}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    operationStage(token,operationId,'writing');
    const saved=await files.atomic(result.filePath,bytes,selected?(selected.state||{absent:true}):undefined,writeOptions);
    return {artifactId:artifacts.register(saved,current.token),name:path.basename(saved.target),bytes:saved.bytes,format,durabilityUnconfirmed:saved.durabilityUnconfirmed===true,backupName:saved.backupName||null};
  })));
  handle('recovery-failure',()=>safety.log('recovery-failure').then(()=>true));
  handle('recovery-options',()=>({enabled:settings.recoveryEnabled!==false,seconds:[15,30,60,120,300].includes(settings.recoverySeconds)?settings.recoverySeconds:60}));
  handle('recovery-settings',async(value)=>{
    if(!value||typeof value.enabled!=='boolean'||![15,30,60,120,300].includes(value.seconds))throw Error('Invalid recovery settings');
    settings.recoveryEnabled=value.enabled;settings.recoverySeconds=value.seconds;await persist();return true;
  });
  handle('recovery-list',()=>captureOptions?[]:recovery.list());
  handle('recovery-save',(token,version,input)=>operation(async()=>{
    active(token);
    if(current.format==='pdf')return false;
    if(captureOptions||closing||closePending||settings.recoveryEnabled===false||current.recoveryLocked)return false;
    if(version!==(current.recoveryVersion||0))return false;
    const state=await rendererState(false);if(state.opening||!state.dirty||current.recoveryLocked||version!==(current.recoveryVersion||0))return false;
    const bytes=output(input);packageGuard.protect(bytes,current.format,current.embeddedObjects);
    return recovery.save({id:current.recoveryId||current.token,name:current.name,format:current.format},bytes);
  }));
  handle('recovery-clear',token=>operation(async()=>{
    active(token);const state=await rendererState(false);
    if(state.dirty||state.opening)return false;await recovery.remove(current.recoveryId||current.token);return true;
  }));
  handle('recovery-remove',id=>operation(async()=>{if(captureOptions)throw Error('Capture mode unavailable');await recovery.remove(id);return true}));
  handle('recovery-restore',id=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode unavailable');
    if(!await discard())return null;
    const restored=await recovery.read(id);
    current={token:crypto.randomUUID(),recoveryId:id,name:restored.name,format:restored.format,target:null,embeddedObjects:['odt','ods','odp'].includes(restored.format)?packageGuard.embeddedObjects(restored.data):0};
    current.protected=password.encrypted(restored.data,restored.format);current.recoveryLocked=current.protected;
    dirty=true;title();
    return {token:current.token,name:current.name,format:current.format,bytes:restored.data,recovered:true,runtime:conversionRuntime};
  }));
  const ai=require('./ai.cjs'),aiJobs=new Map();
  const publicAI=()=>{if(!settings.ai)return {};const {encryptedKey,...value}=settings.ai;return {...value,hasKey:!!encryptedKey}};
  handle('ai-settings',()=>captureOptions?{}:publicAI());
  handle('ai-configure',value=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode cannot configure AI');
    const config=ai.configuration(value);
    if(!config){for(const job of aiJobs.values())job.abort();settings.ai=null;await persist();return {};}
    const selected=ai.endpoint(config.endpoint);
    const result=await dialog.showMessageBox(win,{type:'question',message:t('aiConsent'),detail:config.endpoint+'\n\n'+t(selected.local?'aiLocal':'aiRemote'),buttons:decisions.buttons([t('cancel'),t('allow')]),normalizeAccessKeys:true,defaultId:0,cancelId:0});
    if(result.response!==1)return false;
    if(value.apiKey){
      const storage=require('electron').safeStorage;
      if(!storage.isEncryptionAvailable()||storage.getSelectedStorageBackend?.()==='basic_text')throw Error('Encrypted AI key storage unavailable');
      config.encryptedKey=storage.encryptString(value.apiKey).toString('base64');
    }else if(config.endpoint===settings.ai?.endpoint)config.encryptedKey=settings.ai.encryptedKey;
    for(const job of aiJobs.values())job.abort();settings.ai=config;await persist();return publicAI();
  }));
  handle('ai-request',async(id,body)=>{
    if(captureOptions||!settings.ai?.consented||typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||aiJobs.size>=2||aiJobs.has(id))throw Error('AI request unavailable');
    const abort=new AbortController(),config={...settings.ai};aiJobs.set(id,abort);
    try{
      const key=config.encryptedKey?require('electron').safeStorage.decryptString(Buffer.from(config.encryptedKey,'base64')):'';
      return await ai.request(config,body,key,abort.signal);
    }finally{aiJobs.delete(id)}
  });
  handle('ai-cancel',id=>{aiJobs.get(id)?.abort();return true});
  handle('font-choice',async()=>{await preferences.flush();return settings.fontConsent===true?'granted':settings.fontChoice==='declined'?'declined':'unset'});
  handle('font-dismiss',async()=>{settings.fontChoice='declined';await persist();return true});
  handle('font-disable',async()=>{settings.fontChoice='declined';settings.fontConsent=false;fonts.clear();homeFontDiscovery=null;await persist();return true});
  handle('font-permission',async()=>!captureOptions&&settings.fontConsent===true);
  handle('font-consent',()=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode does not read computer fonts');
    if(settings.fontConsent===true)return true;
    const result=await dialog.showMessageBox(win,{type:'question',title:'ElixirOffice',message:t('fontAsk'),detail:t('fontDetail'),buttons:decisions.buttons([t('cancel'),t('allow')]),normalizeAccessKeys:true,defaultId:0,cancelId:0});
    if(result.response!==1){settings.fontChoice='declined';await persist();return false;}
    settings.fontChoice='granted';settings.fontConsent=true;await persist();return true;
  }).catch(async error=>{await safety.log('font-consent-error');throw error}));
  handle('fonts',async()=>{
    try{return !captureOptions&&settings.fontConsent===true?await fonts.enumerate():[]}
    catch(error){await safety.log('font-list-error');throw error}
  });
  handle('font-index',async readyOnly=>{
    if(captureOptions||settings.fontConsent!==true)throw Error('Computer fonts are disabled');
    if(readyOnly!==undefined&&typeof readyOnly!=='boolean')throw Error('Invalid font index request');
    const index=fonts.peek();
    if(readyOnly===true&&!index){discoverFontsInBackground();return null;}
    try{return index||await fonts.index()}catch(error){await safety.log('font-list-error');throw error}
  });
  handle('font',async id=>{
    if(captureOptions||settings.fontConsent!==true)throw Error('Font permission required');
    try{return await fonts.read(id)}catch(error){await safety.log('font-read-error');throw error}
  });
  handle('pdf',(token,input,print,plainCopy,operationId,ticket)=>operation(()=>files.scoped({scope:token,id:operationId},async writeOptions=>{
    active(token);if(current.protected&&plainCopy!==true)throw Error('Confirm an unprotected PDF copy');const bytes=output(input,true);
    if(print){operationStage(token,operationId,'awaiting-user');return printer.print(bytes,{parent:win,signal:writeOptions.signal,title:t('print')+' PDF'});}
    const policy=require('./pdf-policy.cjs');
    if(!ticket)operationStage(token,operationId,'awaiting-user');
    const selected=ticket?await takeDestination(ticket,'pdf','pdf'):null;
    if(!selected&&!await policy.confirmCopy(current,dialog,win,t))return null;
    const result=selected?{filePath:selected.target}:await dialog.showSaveDialog(win,{defaultPath:policy.defaultPath(current),filters:[{name:'PDF',extensions:['pdf']}]});
    if(result.canceled)return null;
    if(files.extension(result.filePath)!=='pdf')throw Error('Choose a PDF destination');
    await policy.assertCopyDestination(current,result.filePath);
    operationStage(token,operationId,'writing');
    const saved=await files.atomic(result.filePath,bytes,selected?(selected.state||{absent:true}):undefined,writeOptions);
    return {artifactId:artifacts.register(saved,current.token),name:path.basename(saved.target),bytes:saved.bytes,durabilityUnconfirmed:saved.durabilityUnconfirmed===true,backupName:saved.backupName||null};
  })));
  handle('closed-saved',async()=>{
    // Recheck edits made after the save snapshot before authorizing destruction.
    const state=await rendererState(false);dirty=state.dirty===true;
    if(!dirty&&!busy&&!state.opening)await finishClose();else win.webContents.send('eo:action','resume-close');
  });
  const action=name=>()=> {
    if(name!=='settings'){win.webContents.send('eo:action',name);return}
    win.webContents.send('eo:action','settings');
  };
  const help=async()=>{
    const editor=['xlsx','ods'].includes(current?.format)?'spreadsheeteditor':['pptx','odp'].includes(current?.format)?'presentationeditor':'documenteditor';
    const base=path.join(assets,'web-apps/apps',editor,'main/resources/help');
    let language=languageInfo.language;
    try{await fs.access(path.join(base,language,'index.htm'))}catch{language='en'}
    const prefix=resources.ORIGIN+'/example/local-assets/web-apps/apps/'+editor+'/main/resources/help/'+language+'/';
    const helpWindow=new BrowserWindow({parent:win,width:1000,height:800,title:'ElixirOffice '+t('help'),webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});
    if(process.platform!=="darwin")helpWindow.setMenuBarVisibility(false);
    helpWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    helpWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(prefix))event.preventDefault()});
    await helpWindow.loadURL(prefix+'index.htm');
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate(require('./menu.cjs').template(process.platform,name=>name==='about'?showAbout:action(name),()=>help().catch(error=>dialog.showErrorBox(t('help'),t('error'))),t)));
  if(process.platform!=="darwin")win.setMenuBarVisibility(false);
  require('./shortcuts.cjs').install(win.webContents,process.platform,()=>current?.format,name=>name==='quit'?win.close():name==='help'?help().catch(()=>dialog.showErrorBox(t('help'),t('error'))):action(name)(),()=>!captureOptions);
  await win.loadURL(resources.ORIGIN+'/index.html');
  if(captureOptions){
    (async()=>{
      for(let i=0;i<600;i++){if(await win.webContents.executeJavaScript('!!window.EODesktopCapture'))break;await new Promise(resolve=>setTimeout(resolve,200));if(i===599)throw Error('Capture shell did not become ready')}
      win.setContentSize(1360,900);await capture.run(win,captureOptions);
    })().then(async()=>{
      closing=true;win.destroy();try{await cleanupCapture();app.exit(0)}catch(error){console.error('Capture profile cleanup: '+error.message);app.exit(1)}
    },async error=>{
      console.error(error.message);closing=true;win.destroy();try{await cleanupCapture()}catch{await safety.log('capture-cleanup-failure')}finally{app.exit(1)}
    }).catch(()=>{void safety.log('capture-cleanup-failure');app.exit(1)});
  }

}
app.on('window-all-closed',()=>{if(!captureOptions)app.quit()});
