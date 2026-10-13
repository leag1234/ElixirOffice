// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {app, BrowserWindow, ipcMain, dialog, Menu, session, protocol, net, shell} = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const packageGuard=require('./package-guard.cjs');
const files = require('./files.cjs'), resources = require('./resources.cjs'), {Fonts} = require('./fonts.cjs');
if (process.env.EO_DESKTOP_PROFILE) app.setPath('userData',path.resolve(process.env.EO_DESKTOP_PROFILE));
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
protocol.registerSchemesAsPrivileged([{scheme:resources.SCHEME,privileges:{standard:true,secure:true,supportFetchAPI:true,codeCache:true,corsEnabled:true}}]);
const assets = app.isPackaged ? path.join(process.resourcesPath,'assets') : path.join(__dirname,'assets');
let conversionRuntime;
let win, settings={recents:[],fontConsent:false}, current, dirty=false, busy=false, closing=false, ready=false, pending=[], closePending=false;
const fonts = new Fonts();
let preferences,recovery;
const locale=require('./locale.cjs'),capture=require('./capture.cjs'),decisions=require('./decisions.cjs');
let captureOptions,captureStartupError;
let languageInfo;
const t=key=>languageInfo?.strings[key]||key;
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
if(captureStartupError){console.error('ElixirOffice capture startup failed:\n'+captureStartupError.stack);app.exit(1);}
else if(!app.requestSingleInstanceLock()){if(captureOptions)cleanupCapture().then(()=>app.exit(1));else app.quit();}
else {
app.on('second-instance',(_event,argv)=>{if(captureOptions)return;const file=argument(argv.slice(1));if(file)pending.push(file);win?.show();win?.focus();if(ready)win.webContents.send('eo:action','pending');});
app.on('open-file',(event,file)=>{event.preventDefault();if(captureOptions)return;const selected=documentPath(file);if(selected)pending.push(selected);if(selected&&ready)win.webContents.send('eo:action','pending');});
app.whenReady().then(start).catch(async error=>{
 if(captureOptions){console.error(error.message);closing=true;if(win&&!win.isDestroyed())win.destroy();await cleanupCapture();app.exit(1)}
 else {dialog.showErrorBox('ElixirOffice',t('error'));app.quit();}
});
}
async function cleanupCapture(){
 if(captureOptions?.profile){app.releaseSingleInstanceLock();await fs.rm(captureOptions.profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}
function authorize(event) {
  if(!win || event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || event.senderFrame.url!==resources.ORIGIN+'/index.html')throw Error('This command requires the desktop start window');
}
function persist(){return preferences.save(settings)}

function title() { win.setTitle((dirty?'* ':'')+(current?.name?current.name+' — ':'')+'ElixirOffice'); }
async function rendererState(lock=true) {
  let timer;
  try{return await Promise.race([
    win.webContents.executeJavaScript('globalThis.EODesktopState ? globalThis.EODesktopState('+JSON.stringify(lock)+') : {dirty:true,opening:true}'),
    new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Editor did not confirm its save state')),3000)})
  ])}finally{clearTimeout(timer)}
}
async function discard() {
  if(!current)return true;
  try{
  const state=await rendererState();
  if(state.opening)throw Error('Wait for the document to finish opening');
  dirty=state.dirty===true;
        await preferences.flush();
  if(!dirty){if(current)await recovery.remove(current.recoveryId||current.token);return true;}
  const result=await dialog.showMessageBox(win,decisions.unsaved(t));
  if(decisions.discard(result)&&current){current.recoveryVersion=(current.recoveryVersion||0)+1;await recovery.remove(current.recoveryId||current.token);}
  return decisions.discard(result);
  }finally{win.webContents.send('eo:action','resume-close')}
}
async function remember(target) {
  settings.recents=settings.recents.filter(item=>item.target!==target);
  settings.recents.unshift({id:crypto.randomUUID(),target,name:path.basename(target)});settings.recents=settings.recents.slice(0,15);
  await persist();
}
async function select(filename) {
  const opened=await files.read(filename);
  const {bytes,...metadata}=opened;
  const sourceFormat=files.extension(opened.target),format=require('./formats.cjs').canonical[sourceFormat]||sourceFormat;
  current={...metadata,token:crypto.randomUUID(),name:path.basename(opened.target),format,sourceFormat};
  if(format!==sourceFormat){current.target=null;current.name=path.basename(opened.target).replace(/\.[^.]+$/,'.'+format)}
  dirty=false;title();await remember(opened.target);
  return {token:current.token,name:current.name,bytes:new Uint8Array(bytes),format:current.format,sourceFormat,runtime:conversionRuntime};
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
function handle(name,run) { ipcMain.handle('eo:'+name,(event,...args)=>{authorize(event);return run(...args)}); }
async function start() {
  preferences=require('./settings-store.cjs')(app.getPath('userData'));
  recovery=new (require('./recovery.cjs').Recovery)(app.getPath('userData'));
  const preferred=captureOptions?captureOptions.locales:[...(app.getPreferredSystemLanguages?.()||[]),app.getLocale()];
  languageInfo=await locale.load(assets,preferred);
  if(captureOptions&&captureOptions.locales.some(value=>!languageInfo.supported.includes(value)))throw Error('Unsupported capture locale');

  try{settings=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'desktop-settings.json'),'utf8'));if(!Array.isArray(settings.recents))settings.recents=[];settings.fontConsent=settings.fontConsent===true;}
  catch(error){if(error.code!=='ENOENT')throw error}
  const manifestBytes=await fs.readFile(path.join(assets,'desktop-manifest.json'));
  const manifest=JSON.parse(manifestBytes);
  if(!/^[a-zA-Z0-9-]+$/.test(manifest.conversion.artifact_version))throw Error('Invalid bundled conversion runtime');
  conversionRuntime=resources.ORIGIN+'/example/local-assets/sdkjs/common/wasm-convert/runtime/'+manifest.conversion.artifact_version+'/';
  const assetIdentity=crypto.createHash('sha256').update(manifestBytes).digest('hex').slice(0,16);
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
        if(busy||state.opening){win.webContents.send('eo:action','resume-close');return}
        dirty=state.dirty===true;
        await preferences.flush();
        if(!dirty){if(current)await recovery.remove(current.recoveryId||current.token);closing=true;win.close();return}
        const result=await dialog.showMessageBox(win,decisions.unsaved(t,true));
        if(result.response===0)win.webContents.send('eo:action','save-close');
        else if(decisions.discard(result)){if(current){current.recoveryVersion=(current.recoveryVersion||0)+1;await recovery.remove(current.recoveryId||current.token);}closing=true;win.close()}
        else win.webContents.send('eo:action','resume-close');
      } catch(error) {
        const result=await dialog.showMessageBox(win,{type:'warning',message:t('saveError'),buttons:decisions.buttons([t('cancel'),t('discard')]),normalizeAccessKeys:true,defaultId:0,cancelId:0});
        if(result.response===1){closing=true;win.close()}else {closing=false;win.webContents.send('eo:action','resume-close');}
      } finally {closePending=false}
    })();
  });
  handle('initial',()=>operation(async()=>{
    ready=true;if(!pending.length)return null;
    if(!await discard()){pending=[];return null}
    const selected=await select(pending.shift());return {...selected,morePending:pending.length>0};
  }));
  handle('author',()=>typeof settings.author==='string'&&settings.author.trim()?settings.author:'ElixirOffice');
  handle('author-save',async value=>{if(typeof value!=='string'||!value.trim()||value.length>200||/[\u0000-\u001f\u007f]/.test(value))throw Error('Invalid author name');settings.author=value.trim();await persist();return settings.author;});
  handle('help',()=>help());
  handle('locale',async()=>({...languageInfo,capture:!!captureOptions}));
  handle('capture-locale',async language=>{
    if(!captureOptions||!captureOptions.locales.includes(language))throw Error('Capture locale unavailable');
    languageInfo=await locale.load(assets,[language]);return {...languageInfo,capture:true};
  });
  handle('home',async()=>{
    const recents=[];
    for(const item of settings.recents){
      let modified=null;try{modified=(await fs.stat(item.target)).mtime.toISOString()}catch(error){if(!['ENOENT','EACCES'].includes(error.code))throw error}
      recents.push({id:item.id,name:item.name,folder:path.dirname(item.target),modified});
    }
    const templates=JSON.parse(await fs.readFile(path.join(assets,'desktop-home/templates.json'),'utf8'));
    return {templates,recents};
  });
  handle('return-home',()=>operation(async()=>{
    if(!await discard())return false;current=null;dirty=false;title();return true;
  }));
  handle('template',id=>operation(async()=>{
    const templates=JSON.parse(await fs.readFile(path.join(assets,'desktop-home/templates.json'),'utf8'));
    const template=templates.find(item=>item.id===id);if(!template)throw Error('Unknown template');
    if(!await discard())return null;
    const bytes=await fs.readFile(path.join(assets,'desktop-home/templates',template.file));
    current={token:crypto.randomUUID(),name:t(template.titleKey)+'.'+template.format,format:template.format,target:null};dirty=false;title();
    return {token:current.token,name:current.name,format:current.format,bytes:new Uint8Array(bytes),runtime:conversionRuntime};
  }));
  handle('open',()=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode uses generated documents only');
    if(!await discard())return null;
    const result=await dialog.showOpenDialog(win,{title:t('open'),properties:['openFile'],filters:[{name:t('file'),extensions:files.formats}]});
    return result.canceled?null:select(result.filePaths[0]);
  }));
  handle('drop',filename=>operation(async()=>{if(captureOptions)throw Error('Capture mode uses generated documents only');if(typeof filename!=='string'||!filename)throw Error('Drop a file from this computer');return await discard()?select(filename):null}));
  handle('recents',()=>settings.recents.map(({id,name})=>({id,name})));
  handle('recent',id=>operation(async()=>{if(captureOptions)throw Error('Capture mode uses generated documents only');const file=settings.recents.find(item=>item.id===id);if(!file)throw Error('Unknown recent file');return await discard()?select(file.target):null}));
  handle('new',format=>operation(async()=>{
    if(!['docx','xlsx','pptx'].includes(format))throw Error('Unsupported template');
    if(!await discard())return null;
    const bytes=await fs.readFile(format==='docx'?path.join(assets,'desktop-home/blanks',languageInfo.language+'.docx'):path.join(assets,'templates','new.'+format));
    current={token:crypto.randomUUID(),name:t('untitled')+'.'+format,format,target:null};dirty=false;title();
    return {token:current.token,name:current.name,format,bytes:new Uint8Array(bytes),runtime:conversionRuntime};
  }));
  handle('state',(token,modified)=>{if(!current||token!==current.token)return false;dirty=modified===true;title();return true});
  handle('save',(token,input,as)=>operation(async()=>{
    active(token);const bytes=output(input);let target=current.target,copy=false;
    try{packageGuard.protect(bytes,current.format,current.embeddedObjects)}
    catch(error){
      if(error.code!=='OBJECT_LOSS')throw error;
      const result=await dialog.showMessageBox(win,{type:'warning',message:t('objectsWarning'),detail:t('saveError'),buttons:[t('cancel'),t('saveCopy')],normalizeAccessKeys:true,defaultId:0,cancelId:0});
      if(result.response!==1)throw Error('Save cancelled: embedded objects could not be preserved');
      copy=true;
    }
    if(as||!target||copy){
      const defaultPath=copy?(target||current.name).replace(/\.[^.]+$/, '-copy.'+current.format):(target||current.name);
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
    const saved=await files.atomic(target,bytes,!as&&!copy&&current.target?current:undefined);
    current={...current,...saved,name:path.basename(target),embeddedObjects:['odt','ods','odp'].includes(current.format)?packageGuard.embeddedObjects(bytes):0};await remember(target);title();
    current.recoveryVersion=(current.recoveryVersion||0)+1;
    return {name:current.name,bytes:saved.bytes,recoveryVersion:current.recoveryVersion};
  }));
  handle('export-formats',token=>{active(token);return require('./formats.cjs').exports[require('./formats.cjs').kind(current.format)]});
  handle('export',(token,input,format)=>operation(async()=>{
    active(token);const formats=require('./formats.cjs');
    if(!formats.exports[formats.kind(current.format)]?.includes(format)||format==='pdf')throw Error('Unsupported export format');
    const bytes=formats.output(input,format);
    if(['odt','ods','odp'].includes(format))packageGuard.protect(bytes,format,current.embeddedObjects);
    const result=await dialog.showSaveDialog(win,{defaultPath:(current.target||current.name).replace(/\.[^.]+$/,'.'+format),filters:[{name:format.toUpperCase(),extensions:[format]}]});
    if(result.canceled)throw Error('Save cancelled');
    if(files.extension(result.filePath)!==format)throw Error('Choose the selected format extension');
    if(current.target){
      if(path.resolve(result.filePath)===current.target)throw Error('Export to a different file');
      try{const stat=await fs.stat(result.filePath);if(stat.dev===current.device&&stat.ino===current.inode)throw Error('Export to a different file');}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    const saved=await files.atomic(result.filePath,bytes);
    return {name:path.basename(saved.target),bytes:saved.bytes,format};
  }));
  handle('recovery-options',()=>({enabled:settings.recoveryEnabled!==false,seconds:[15,30,60,120,300].includes(settings.recoverySeconds)?settings.recoverySeconds:60}));
  handle('recovery-settings',async(value)=>{
    if(!value||typeof value.enabled!=='boolean'||![15,30,60,120,300].includes(value.seconds))throw Error('Invalid recovery settings');
    settings.recoveryEnabled=value.enabled;settings.recoverySeconds=value.seconds;await persist();return true;
  });
  handle('recovery-list',()=>captureOptions?[]:recovery.list());
  handle('recovery-save',(token,version,input)=>operation(async()=>{
    active(token);
    if(captureOptions||closing||closePending||settings.recoveryEnabled===false)return false;
    if(version!==(current.recoveryVersion||0))return false;
    const state=await rendererState(false);if(state.opening||!state.dirty)return false;
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
  handle('font-disable',async()=>{settings.fontChoice='declined';settings.fontConsent=false;await persist();return true});
  handle('font-permission',async()=>settings.fontConsent===true);
  handle('font-consent',()=>operation(async()=>{
    if(captureOptions)throw Error('Capture mode does not read computer fonts');
    if(settings.fontConsent===true)return true;
    const result=await dialog.showMessageBox(win,{type:'question',message:t('fontAsk'),detail:t('fontDetail'),buttons:decisions.buttons([t('cancel'),t('allow')]),normalizeAccessKeys:true,defaultId:0,cancelId:0});
    if(result.response!==1){settings.fontChoice='declined';await persist();return false;}
    settings.fontChoice='granted';settings.fontConsent=true;await persist();return true;
  }));
  handle('fonts',async()=>settings.fontConsent===true?fonts.enumerate():[]);
  handle('font',async id=>{if(settings.fontConsent!==true)throw Error('Font permission required');return fonts.read(id)});
  handle('pdf',(token,input,print)=>operation(async()=>{
    active(token);const bytes=output(input,true);
    if(print)return printPdf(bytes);
    const result=await dialog.showSaveDialog(win,{defaultPath:(current.target||current.name).replace(/\.[^.]+$/,'.pdf'),filters:[{name:'PDF',extensions:['pdf']}]});
    if(result.canceled)return null;
    if(files.extension(result.filePath)!=='pdf')throw Error('Choose a PDF destination');
    const saved=await files.atomic(result.filePath,bytes);return {bytes:saved.bytes};
  }));
  handle('closed-saved',()=>{if(!dirty&&!busy){closing=true;win.close()}});
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
    helpWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    helpWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(prefix))event.preventDefault()});
    await helpWindow.loadURL(prefix+'index.htm');
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate(require('./menu.cjs').template(process.platform,action,()=>help().catch(error=>dialog.showErrorBox(t('help'),t('error'))),t)));
  await win.loadURL(resources.ORIGIN+'/index.html');
  if(captureOptions){
    (async()=>{
      for(let i=0;i<600;i++){if(await win.webContents.executeJavaScript('!!window.EODesktopCapture'))break;await new Promise(resolve=>setTimeout(resolve,200));if(i===599)throw Error('Capture shell did not become ready')}
      win.setContentSize(1360,900);await capture.run(win,captureOptions);
    })().then(async()=>{
      closing=true;win.destroy();try{await cleanupCapture();app.exit(0)}catch(error){console.error('Capture profile cleanup: '+error.message);app.exit(1)}
    },async error=>{
      console.error(error.message);closing=true;win.destroy();try{await cleanupCapture()}finally{app.exit(1)}
    });
  }

}
async function printPdf(bytes) {
  const printWindow=new BrowserWindow({width:900,height:800,parent:win,title:t('print')+' PDF',webPreferences:{session:win.webContents.session,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  printWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const pdf=bytes.toString('base64');
  await printWindow.loadURL('data:application/pdf;base64,'+pdf);
  const result=await new Promise(resolve=>printWindow.webContents.print({silent:false},(success,reason)=>resolve({printed:success,reason:reason||null})));
  if(!printWindow.isDestroyed())printWindow.close();
  return result;
}
app.on('window-all-closed',()=>{if(!captureOptions)app.quit()});
