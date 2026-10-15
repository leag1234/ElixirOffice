// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Required environment explicitly identifies the caller-owned packaged app and test helpers.
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {_electron}=require(process.env.EO_PLAYWRIGHT),root=path.resolve(process.env.EO_DESKTOP_ROOT),executable=path.resolve(process.env.EO_PACKAGE_EXECUTABLE);
assert.equal(process.platform,'darwin');assert(executable.startsWith(root+path.sep));assert(!executable.startsWith('/Applications/'));
const resultsName=process.env.EO_CLOSE_RESULTS||'mac-close-candidate';
const selectedCases=process.env.EO_CLOSE_CASES?.split(',');
if(!selectedCases||selectedCases.includes('save-as-native-cancel'))assert.equal(process.env.EO_MANUAL_NATIVE,'yes','Native destination-panel cases require an operator; never substitute a dialog result');
let testPassword;
async function protectedBytes(){
 const crypto=require('node:crypto');testPassword=crypto.randomBytes(16).toString('hex');
 const assets=path.resolve(path.dirname(executable),'../Resources/assets'),manifest=JSON.parse(await fs.readFile(path.join(assets,'desktop-manifest.json'),'utf8'));
 assert(/^[a-z0-9-]+$/.test(manifest.conversion.artifact_version));
 const release=path.join(assets,'sdkjs/common/wasm-convert/runtime',manifest.conversion.artifact_version);
 const create=require(path.join(release,'x2t.js'));
 async function convert(bytes,from,to,extra={}){const m=await create({noInitialRun:true,print(){},printErr(){}}),F=m.FS;['/w','/tmp/conversion','/fonts'].forEach(p=>F.mkdirTree(p));F.writeFile('/w/in',bytes);
 const tags={m_sFileFrom:'/w/in',m_sFileTo:'/w/out',m_nFormatFrom:from,m_nFormatTo:to,m_bIsNoBase64:'true',m_sTempDir:'/tmp/conversion',m_sFontDir:'/fonts',...extra};
 F.writeFile('/task.xml','<TaskQueueDataConvert>'+Object.entries(tags).map(([k,v])=>'<'+k+'>'+v+'</'+k+'>').join('')+'</TaskQueueDataConvert>');let status;try{status=m.callMain(['/task.xml'])}catch(error){status=error.status}assert.equal(status,0,'Public protected fixture conversion failed');return F.readFile('/w/out');}
 return convert(await convert(await fs.readFile(path.join(root,'fixtures/sample.docx')),65,8193),8193,65,{m_sSavePassword:testPassword});
}
const helper=process.env.EO_CLOSE_NATIVE_HELPER,dialogsHelper=process.env.EO_DIALOG_NATIVE_HELPER||helper,rows=[];
async function waitExit(child,limit=10000){for(let n=0;n<limit/100&&child.exitCode===null&&child.signalCode===null;n++)await new Promise(r=>setTimeout(r,100));return child.exitCode!==null||child.signalCode!==null;}
async function run({name,format,dirty=false,choice,action='close',fault,passwordMode,corrupt,preAction,saveInFlight}){
 if(selectedCases&&!selectedCases.includes(name))return;
 const folder=await fs.mkdtemp(path.join(root,'fixtures/close-')),profile=path.join(root,'profiles','close-fixed-'+name+'-'+Date.now());await fs.mkdir(profile,{recursive:true});
 const source=format?path.join(folder,'public.'+format):null;
 if(source){if(passwordMode)await fs.writeFile(source,await protectedBytes());else if(corrupt)await fs.writeFile(source,Buffer.from('PKbroken-public-document'));else await fs.copyFile(path.join(root,'fixtures',format==='pdf'?'public-forms.pdf':'sample.'+format),source);}
 const before=source?await fs.readFile(source):null;
 const app=await _electron.launch({executablePath:executable,args:['--user-data-dir='+profile,...(source?[source]:[])],env:{...process.env,EO_DESKTOP_PROFILE:profile},timeout:120000}),child=app.process();
 let record={name,format,action,pid:child.pid,profile};
 await fs.writeFile(path.join(root,'results/mac-close-current.json'),JSON.stringify(record,null,2));
 try{
  assert(cp.execFileSync('/bin/ps',['-ww','-p',String(child.pid),'-o','command='],{encoding:'utf8'}).includes(executable));
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
  await app.evaluate(({app},{helper,dialogsHelper})=>{
   const load=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
   globalThis.OwnClose=load(helper);globalThis.OwnDialogs=load(dialogsHelper);
  },{helper,dialogsHelper});
  assert.equal(await app.evaluate(()=>OwnClose.pid()),child.pid);assert.equal(await app.evaluate(()=>OwnDialogs.pid()),child.pid);
  const page=await app.firstWindow();page.on('dialog',dialog=>{(record.browserDialogs||(record.browserDialogs=[])).push({type:dialog.type(),message:dialog.message()});});
  let passwordPending=false;
  if(passwordMode){
   const frame=await(await page.waitForSelector('iframe[name=frameEditor]',{timeout:90000})).contentFrame(),field=frame.locator('.open-dlg input[type=password]');await field.waitFor({timeout:90000});
   if(passwordMode==='wrong'){const old=await field.elementHandle();await field.fill('intentionally-wrong');await frame.locator('.open-dlg button[result=ok]').click();await old.waitForElementState('hidden',{timeout:90000});await field.waitFor({timeout:90000});passwordPending=true;}
   else if(passwordMode==='pending')passwordPending=true;
   else if(passwordMode==='cancel')await frame.locator('.open-dlg button[result=cancel]').click();
   else {await field.fill(testPassword);await frame.locator('.open-dlg button[result=ok]').click();}
  }
  if(!passwordPending)await page.waitForFunction(()=>window.EODesktopReady,null,{timeout:120000});
  if(corrupt)await page.waitForFunction(()=>window.EOLocalFailure,null,{timeout:90000});
  else if(source&&!passwordPending&&passwordMode!=='cancel'){await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);}
  if(name==='blank'){await page.locator('[data-new="docx"]').click();await page.waitForFunction(()=>window.EOLocalSession,null,{timeout:120000});}
  if(dirty){
   await page.evaluate(format=>{
    const s=EOLocalSession;
    if(format==='pdf'){const c=new s.win.Asc.asc_CCommentDataWord(null);c.asc_putText('PUBLIC CLOSE TEST');c.asc_putUserName('Public author');c.asc_putUserId('local');s.api.asc_addComment(c);s.api.CheckChangedDocument();}
    else {
     if(format==='pptx'){const doc=s.api.WordControl.m_oLogicDocument,control=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(item=>item.txBody);control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();}
     s.api.asc_enterText(Array.from('PUBLIC CLOSE TEST',c=>c.codePointAt(0)));if(format==='xlsx')s.api.asc_closeCellEditor();
    }
   },format);
   await page.waitForFunction(()=>EOLocalSession.controller.isModified(),null,{timeout:10000});
  }
  await app.evaluate(({dialog})=>{globalThis.OwnCloseDialogs=[];const original=dialog.showMessageBox;
   dialog.showMessageBox=function(...args){const options=args.at(-1),entry={message:options.message,detail:options.detail,buttons:options.buttons,pending:true};OwnCloseDialogs.push(entry);const promise=original.apply(this,args);promise.then(answer=>{entry.pending=false;entry.response=answer.response});return promise;};
  });
  if(fault==='pending-images'){await page.evaluate(()=>{EOLocalSession.controller.hasPendingImages=()=>true;});record.faultInjection='pending-image state';}
  if(fault==='saving'){await page.evaluate(()=>{EOLocalSession.controller.isSaving=()=>true;});record.faultInjection='stuck controller.isSaving';}
  if(fault==='hung'){await app.evaluate(({BrowserWindow})=>{const wc=BrowserWindow.getAllWindows()[0].webContents,original=wc.executeJavaScript.bind(wc);wc.executeJavaScript=function(code,...args){if(code.startsWith('globalThis.EODesktopState'))return new Promise(()=>{});return original(code,...args);};});record.faultInjection='hung renderer state query';}
  async function close(){
   const result=await app.evaluate((_electron,action)=>action==='cmd-w'?OwnClose.commandW():action==='cmd-q'?OwnClose.commandQ():action==='quit'?OwnClose.quit():OwnClose.closeWindow(),action).catch(error=>{if(child.exitCode===null&&child.signalCode===null)throw error});
   assert(result!==false,'Own native close window not found');
  }
  async function choose(index){
   let entry;for(let n=0;n<100;n++){entry=(await app.evaluate(()=>OwnCloseDialogs)).at(-1);if(entry?.pending)break;await new Promise(r=>setTimeout(r,100));}
   assert(entry?.pending,'Real native decision did not appear');
   const title=entry.buttons[index].replaceAll('&','');let pressed=false;
   for(let n=0;n<30;n++){pressed=await app.evaluate((_electron,title)=>OwnDialogs.pressButton(title),title);if(pressed)break;await new Promise(r=>setTimeout(r,100));}
   assert(pressed,'Real own native decision button unavailable');record.dialogs=await app.evaluate(()=>OwnCloseDialogs).catch(()=>[{...entry,response:index}]);
  }
  if(preAction==='save-as-chooser-cancel'){
   const frame=page.frames().find(frame=>frame.url().includes('/documenteditor/main/'));if(!await frame.locator('#fm-btn-download').isVisible())await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-download').click();
   const cancel=await page.evaluate(()=>EODesktopStrings.cancel);await page.locator('.desktop-options button').filter({hasText:cancel}).click();
   record.formatChooserCancelled=true;record.nativeDestinationPanel=false;
  }
  if(preAction==='save-as-native-cancel'){
   await require(path.join(root,'tests/desktop/file-action.cjs'))(page,'save-as');
   let visible=false;for(let n=0;n<100;n++){visible=await app.evaluate(()=>OwnClose.hasSavePanel());if(visible)break;await new Promise(r=>setTimeout(r,100));}
   assert(visible,'Own native SavePanel missing');
   console.log('MANUAL: cancel the Save As sheet in this owned public test window.');
   await page.waitForFunction(()=>document.getElementById('message').textContent===EODesktopStrings.cancel||window.EOLocalFailure,null,{timeout:120000});
   assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);record.actualNativeSavePanelCancelled=true;
  }
  if(preAction==='pdf-export-consent-cancel'){
   await require(path.join(root,'tests/desktop/file-action.cjs'))(page,'pdf');await choose(0);
   await page.waitForFunction(()=>window.EOLastPdf||window.EOLocalFailure,null,{timeout:90000});assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
   record.actualPdfCopyConsentCancelled=true;
  }
  if(saveInFlight){
   await page.evaluate(()=>{window.OwnSaveDone=false;window.OwnSaveFailure=null;EOLocalSession.controller.save().then(()=>window.OwnSaveDone=true,error=>window.OwnSaveFailure=error.message);});
   record.savingObserved=await page.evaluate(()=>EOLocalSession.controller.isSaving());assert(record.savingObserved,'Real conversion must still be running');
  }
  await close();
  if(saveInFlight){
   await choose(0);record.nativeCancelDuringConversion=true;
   await page.waitForFunction(()=>window.OwnSaveDone||window.OwnSaveFailure,null,{timeout:90000});assert.equal(await page.evaluate(()=>window.OwnSaveFailure),null);
   await close();
  }else if(choice!==undefined){await choose(choice);
   if(choice===((fault&&fault!=='pending-images')?0:2)){
    await new Promise(r=>setTimeout(r,500));assert.equal(child.exitCode,null);
    await page.evaluate(()=>{const button=document.createElement('button');button.id='close-unlock-probe';button.textContent='Public test';button.onclick=()=>window.OwnCloseClicks=(window.OwnCloseClicks||0)+1;button.style='position:fixed;top:0;left:0;z-index:100000';document.body.append(button);});
    await page.locator('#close-unlock-probe').click({timeout:5000});assert.equal(await page.evaluate(()=>window.OwnCloseClicks),1,'Cancel left input blocked');
    record.cancelRetainedDocument=true;record.inputUnlocked=true;
    await close();await choose(1);
   }
  }
  assert(await waitExit(child),'Native close did not exit after explicit choice');record.exited=true;
  if(source&&dirty){const after=await fs.readFile(source);if(choice===0&&!fault){assert(!after.equals(before));record.savedAtomic=true;}else{assert(after.equals(before));record.originalUnchanged=true;}}
  if(source&&preAction){assert((await fs.readFile(source)).equals(before));record.originalUnchanged=true;}
  assert(!record.browserDialogs?.length,'Native close must not trigger a second browser beforeunload dialog');
  rows.push(record);console.log('PASS '+JSON.stringify(record));
 }catch(error){record.failure=testPassword?error.message.split(testPassword).join('[redacted]'):error.message;rows.push(record);throw error;}finally{
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  await new Promise(r=>setTimeout(r,200));
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,500))]);
  await fs.writeFile(path.join(root,'results',resultsName+'.json'),JSON.stringify(rows,null,2));
 }
}
(async()=>{
 for(const action of ['close','quit','cmd-w','cmd-q'])await run({name:'home-'+action,action});
 await run({name:'blank'});
 for(const choice of [0,1,2])await run({name:'docx-dirty-'+choice,format:'docx',dirty:true,choice,action:choice===2?'quit':'close'});
 for(const format of ['xlsx','pptx','pdf'])await run({name:format+'-clean',format});
 for(const choice of [0,1,2])await run({name:'pdf-dirty-'+choice,format:'pdf',dirty:true,choice});
 for(const format of ['xlsx','pptx'])await run({name:format+'-dirty-cancel-discard',format,dirty:true,choice:2,action:'cmd-q'});
 await run({name:'save-as-native-cancel',format:'docx',preAction:'save-as-native-cancel'});
 await run({name:'save-as-chooser-cancel',format:'docx',preAction:'save-as-chooser-cancel'});
 await run({name:'pdf-export-consent-cancel',format:'pdf',preAction:'pdf-export-consent-cancel'});
 await run({name:'close-during-real-conversion',format:'pdf',dirty:true,saveInFlight:true,choice:0});
 await run({name:'pending-images-discard',format:'docx',fault:'pending-images',choice:1});
 await run({name:'invalid-open-error',format:'pdf',corrupt:true});
 await run({name:'password-pending-discard',format:'docx',passwordMode:'pending',choice:1});
 await run({name:'password-wrong-discard',format:'docx',passwordMode:'wrong',choice:1});
 await run({name:'password-cancel-home',format:'docx',passwordMode:'cancel'});
 await run({name:'password-open-clean',format:'docx',passwordMode:'correct'});
 await run({name:'password-dirty-save',format:'docx',passwordMode:'correct',dirty:true,choice:0});
 await run({name:'busy-cancel-discard',format:'docx',fault:'saving',choice:0});
 await run({name:'hung-cancel-discard',format:'docx',fault:'hung',choice:0,action:'quit'});
})().catch(error=>{console.error(error);process.exitCode=1});
