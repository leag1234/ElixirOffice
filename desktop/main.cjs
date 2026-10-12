// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {app, BrowserWindow, ipcMain, dialog, Menu, session, protocol, net} = require('electron');
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
const {documentPath}=require('./document-path.cjs');
const argument=argv=>argv.map(documentPath).find(Boolean);
const initial = argument(process.argv.slice(app.isPackaged?1:2)); if(initial)pending.push(initial);
if(!app.requestSingleInstanceLock()){app.quit();}
else {
app.on('second-instance',(_event,argv)=>{const file=argument(argv.slice(1));if(file)pending.push(file);win?.show();win?.focus();if(ready)win.webContents.send('eo:action','pending');});
app.on('open-file',(event,file)=>{event.preventDefault();const selected=documentPath(file);if(selected)pending.push(selected);if(selected&&ready)win.webContents.send('eo:action','pending');});
app.whenReady().then(start).catch(error=>{dialog.showErrorBox('ElixirOffice could not start',error.message);app.quit();});
}
function authorize(event) {
  if(!win || event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || event.senderFrame.url!==resources.ORIGIN+'/index.html')throw Error('This command requires the desktop start window');
}
async function persist() {
  const folder=app.getPath('userData');await fs.mkdir(folder,{recursive:true});
  await files.atomic(path.join(folder,'desktop-settings.json'),Buffer.from(JSON.stringify(settings,null,2)));
}
function title() { win.setTitle((dirty?'* ':'')+(current?.name?current.name+' — ':'')+'ElixirOffice'); }
async function rendererState() {
  let timer;
  try{return await Promise.race([
    win.webContents.executeJavaScript('globalThis.EODesktopState ? globalThis.EODesktopState() : {dirty:true,opening:true}'),
    new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Editor did not confirm its save state')),3000)})
  ])}finally{clearTimeout(timer)}
}
async function discard() {
  if(!current)return true;
  try{
  const state=await rendererState();
  if(state.opening)throw Error('Wait for the document to finish opening');
  dirty=state.dirty===true;
  if(!dirty)return true;
  const result=await dialog.showMessageBox(win,{type:'question',message:'This document has unsaved changes.',detail:'Save it before opening another file, or discard the changes.',buttons:['&Cancel','&Discard'],normalizeAccessKeys:true,defaultId:0,cancelId:0});
  return result.response===1;
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
  const sourceFormat=files.extension(opened.target),format={doc:'docx',xls:'xlsx',ppt:'pptx'}[sourceFormat]||sourceFormat;
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
  try{settings=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'desktop-settings.json'),'utf8'));if(!Array.isArray(settings.recents))settings.recents=[];settings.fontConsent=settings.fontConsent===true;}
  catch(error){if(error.code!=='ENOENT')throw error}
  const manifestBytes=await fs.readFile(path.join(assets,'desktop-manifest.json'));
  const manifest=JSON.parse(manifestBytes);
  if(!/^[a-zA-Z0-9-]+$/.test(manifest.conversion.artifact_version))throw Error('Invalid bundled conversion runtime');
  conversionRuntime=resources.ORIGIN+'/example/local-assets/sdkjs/common/wasm-convert/runtime/'+manifest.conversion.artifact_version+'/';
  const assetIdentity=crypto.createHash('sha256').update(manifestBytes).digest('hex').slice(0,16);
  const ses=session.fromPartition('persist:elixiroffice-desktop-'+assetIdentity);
  ses.protocol.handle(resources.SCHEME,await resources.createHandler(assets,__dirname,url=>net.fetch(url)));
  ses.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*','ftp://*/*','file://*/*']},(_details,callback)=>callback({cancel:true}));
  ses.setPermissionCheckHandler((_wc,permission,origin)=>permission==='local-fonts'&&origin===resources.ORIGIN&&settings.fontConsent===true);
  ses.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission==='local-fonts'&&settings.fontConsent===true));
  ses.on('will-download',event=>event.preventDefault());
  win=new BrowserWindow({width:1360,height:960,title:'ElixirOffice',webPreferences:{session:ses,preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==resources.ORIGIN+'/index.html')event.preventDefault()});
  win.on('close',event=>{
    if(closing)return;
    event.preventDefault();if(closePending)return;closePending=true;
    (async()=>{
      try {
        const state=await rendererState();
        if(busy||state.opening){win.webContents.send('eo:action','resume-close');return}
        dirty=state.dirty===true;
        if(!dirty){closing=true;win.close();return}
        const result=await dialog.showMessageBox(win,{type:'question',message:'Save changes before closing?',buttons:['&Save','&Discard','&Cancel'],normalizeAccessKeys:true,defaultId:0,cancelId:2});
        if(result.response===0)win.webContents.send('eo:action','save-close');
        else if(result.response===1){closing=true;win.close()}
        else win.webContents.send('eo:action','resume-close');
      } catch(error) {
        const result=await dialog.showMessageBox(win,{type:'warning',message:'The editor could not confirm that all changes are saved.',detail:'Cancel to keep the document open.',buttons:['&Cancel','Close without &saving'],normalizeAccessKeys:true,defaultId:0,cancelId:0});
        if(result.response===1){closing=true;win.close()}else win.webContents.send('eo:action','resume-close');
      } finally {closePending=false}
    })();
  });
  handle('initial',()=>operation(async()=>{
    ready=true;if(!pending.length)return null;
    if(!await discard()){pending=[];return null}
    const selected=await select(pending.shift());return {...selected,morePending:pending.length>0};
  }));
  handle('open',()=>operation(async()=>{
    if(!await discard())return null;
    const result=await dialog.showOpenDialog(win,{title:'Open document',properties:['openFile'],filters:[{name:'Office documents',extensions:files.formats}]});
    return result.canceled?null:select(result.filePaths[0]);
  }));
  handle('drop',filename=>operation(async()=>{if(typeof filename!=='string'||!filename)throw Error('Drop a file from this computer');return await discard()?select(filename):null}));
  handle('recents',()=>settings.recents.map(({id,name})=>({id,name})));
  handle('recent',id=>operation(async()=>{const file=settings.recents.find(item=>item.id===id);if(!file)throw Error('Unknown recent file');return await discard()?select(file.target):null}));
  handle('new',format=>operation(async()=>{
    if(!['docx','xlsx','pptx'].includes(format))throw Error('Unsupported template');
    if(!await discard())return null;
    const bytes=await fs.readFile(path.join(assets,'templates','new.'+format));
    current={token:crypto.randomUUID(),name:'Untitled.'+format,format,target:null};dirty=false;title();
    return {token:current.token,name:current.name,format,bytes:new Uint8Array(bytes),runtime:conversionRuntime};
  }));
  handle('state',(token,modified)=>{if(!current||token!==current.token)return false;dirty=modified===true;title();return true});
  handle('save',(token,input,as)=>operation(async()=>{
    active(token);const bytes=output(input);let target=current.target,copy=false;
    try{packageGuard.protect(bytes,current.format,current.embeddedObjects)}
    catch(error){
      if(error.code!=='OBJECT_LOSS')throw error;
      const result=await dialog.showMessageBox(win,{type:'warning',message:'Some embedded objects could not be preserved.',detail:error.message,buttons:['&Cancel','Save a co&py'],normalizeAccessKeys:true,defaultId:0,cancelId:0});
      if(result.response!==1)throw Error('Save cancelled: embedded objects could not be preserved');
      copy=true;
    }
    if(as||!target||copy){
      const defaultPath=copy?(target||current.name).replace(/\.[^.]+$/, '-copy.'+current.format):(target||current.name);
      const result=await dialog.showSaveDialog(win,{defaultPath,filters:[{name:'Office document',extensions:[current.format]}]});
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
    return {name:current.name,bytes:saved.bytes};
  }));
  handle('font-consent',()=>operation(async()=>{
    if(settings.fontConsent===true)return true;
    const result=await dialog.showMessageBox(win,{type:'question',message:'Use fonts installed on this computer?',detail:'ElixirOffice will read font files only from standard system and user font folders. No fonts or document data leave this computer.',buttons:['&Cancel','&Allow'],normalizeAccessKeys:true,defaultId:0,cancelId:0});
    if(result.response!==1)return false;
    settings.fontConsent=true;await persist();return true;
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
    dialog.showMessageBox(win,{type:'info',message:'Desktop settings',detail:'Computer fonts: '+(settings.fontConsent?'allowed':'not allowed')+'. Recent files stay in this local profile. AI and external network access are disabled.',buttons:['Computer fonts…','Close'],defaultId:1,cancelId:1})
      .then(result=>{if(result.response===0)win.webContents.send('eo:action','fonts')})
      .catch(error=>dialog.showErrorBox('Settings unavailable',error.message));
  };
  const help=async()=>{
    const editor=['xlsx','ods'].includes(current?.format)?'spreadsheeteditor':['pptx','odp'].includes(current?.format)?'presentationeditor':'documenteditor';
    const prefix=resources.ORIGIN+'/example/local-assets/web-apps/apps/'+editor+'/main/resources/help/en/';
    const helpWindow=new BrowserWindow({parent:win,width:1000,height:800,title:'ElixirOffice Help',webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});
    helpWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    helpWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(prefix))event.preventDefault()});
    await helpWindow.loadURL(prefix+'UsageInstructions/SavePrintDownload.htm');
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate(require('./menu.cjs').template(process.platform,action,()=>help().catch(error=>dialog.showErrorBox('Offline help unavailable',error.message)))));
  await win.loadURL(resources.ORIGIN+'/index.html');
}
async function printPdf(bytes) {
  const printWindow=new BrowserWindow({width:900,height:800,parent:win,title:'Print document PDF',webPreferences:{session:win.webContents.session,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  printWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const pdf=bytes.toString('base64');
  await printWindow.loadURL('data:application/pdf;base64,'+pdf);
  const result=await new Promise(resolve=>printWindow.webContents.print({silent:false},(success,reason)=>resolve({printed:success,reason:reason||null})));
  if(!printWindow.isDestroyed())printWindow.close();
  return result;
}
app.on('window-all-closed',()=>app.quit());
