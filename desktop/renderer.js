// SPDX-License-Identifier: AGPL-3.0-only
(() => {
'use strict';
const $=id=>document.getElementById(id);let editor,controller,file,abort,opening=false,frame,main,savingAs=false,saveAsTicket=null,choosingSaveAs=false,closeCheck=false,pendingRequested=false,pendingRunning=false,openingOperation;
Object.defineProperty(window,'EODesktopState',{value:(lock=true)=>{if(lock)closeCheck=true;return {dirty:!!(controller&&(controller.isModified()||controller.hasPendingImages())),opening:opening||choosingSaveAs||!!controller?.isSaving?.()||!!lastOperation&&!['ready','warning','complete','error','cancelled'].includes(lastOperation.phase)}}});
Object.defineProperty(window,'EODesktopCancelOperation',{value:()=>{abort?.abort();openingOperation?.cancel();controller?.dispose();}});
function blockDuringClose(event){if(closeCheck||info?.capture){event.preventDefault();event.stopImmediatePropagation()}}
for(const name of ['keydown','beforeinput','click','drop'])document.addEventListener(name,blockDuringClose,true);
let fontRefreshRequested=false,fontRefreshRunning=false,fontRefreshNotify=false;
let compactChrome,compactMode=false;
let info,operationBusy=false,backstage,recoveryBusy=false,pdfCompatibility,recoveryNotified=false,feedback,lastOperation,statusOperation;
const t=key=>info?.strings[key]||({recoveryFailed:'AutoRecover could not keep a recovery copy. Save your document manually.',pdfRecoveryOff:'AutoRecover is not available for PDF files. Save manually; these settings apply to Office files.'})[key]||key;
const status=(text,operationId)=>{statusOperation=operationId||null;const recovery=controller?.isRecoveryLocked?.()?'AutoRecover is disabled for this session because password protection was used':'';const message=[...new Set([text,recovery,frame?.EOComputerFontWarning].filter(Boolean))].join(' — ');$('message').textContent=message;$('message').hidden=!message;};
async function refreshHome(view='home'){const data=await eoDesktop.home();EODesktopHome.render($('home'),{...data,...info},desktopAction,view);}
async function returnHome(){
 try{
  let decision=await eoDesktop.returnHome();
  while(decision==='save'||decision==='save-as'){
   if(!await save(decision==='save-as'))return;
   decision=await eoDesktop.returnHome();
  }
  if(decision!==true)return;
  compactChrome?.dispose();compactChrome=null;pdfCompatibility?.dispose();pdfCompatibility=null;controller?.dispose();controller=null;feedback?.dispose();feedback=null;lastOperation=null;editor?.destroyEditor();editor=null;file=null;frame=null;main=null;window.EOLocalSession=null;$('workspace').hidden=true;$('home').hidden=false;status('');await refreshHome();
 }catch(error){fail(error)}
}
function desktopAction(action,value){if(choosingSaveAs)return;return ({open:()=>run(()=>eoDesktop.choose()),new:()=>run(()=>eoDesktop.create(value)),template:()=>run(()=>eoDesktop.template(value)),recent:()=>run(()=>eoDesktop.recent(value)),save:()=>save(),'save-as':()=>save(true),rename:()=>rename(),pdf:()=>pdf(),print:()=>pdf(true),help:()=>eoDesktop.help(),about:()=>eoDesktop.about(),quit:()=>eoDesktop.quit(),settings:()=>showOptions(),fonts:()=>fontConsent(),'move-menu':()=>eoDesktop.moveMenu().catch(fail),close:()=>info?.capture?returnHome():eoDesktop.closeTab().catch(fail),home:()=>returnHome(),cancel:()=>abort?.abort()}[action]||(()=>{}))();}

const fail=(error,saveError=false)=>{if(EODesktopErrors.cancelled(error)){window.EOLocalFailure=null;status('');return}const reason=EODesktopErrors.message(error,info?.strings);window.EOLocalFailure=reason;status(reason);if(!saveError)return;
 const copy=document.createElement('button');copy.type='button';copy.textContent=info?.strings.opCopyDiagnostics||'Copy diagnostics';copy.addEventListener('click',()=>eoDesktop.copySaveDiagnostics().catch(()=>{}));$('message').append(' ',copy);};
function buttons(busy) {
  operationBusy=busy;compactChrome?.refresh();
  for(const button of $('home').querySelectorAll('button'))button.disabled=busy;
  if(!busy && pendingRequested)setTimeout(drainPending,0);
  if(!busy && fontRefreshRequested)setTimeout(refreshFonts,0);
}

function script(win,url){return new Promise((resolve,reject)=>{const element=win.document.createElement('script');element.src=url;element.onload=resolve;element.onerror=()=>reject(Error('Cannot load bundled editor asset'));win.document.head.appendChild(element)})}
async function buildLocalPdf(api,_format,downloadOptions,signal){
 if(!frame?.AscCommon?.ClientPdf)await script(frame,'/example/local-assets/sdkjs/common/clientpdf/clientpdf.js');
 if(!frame?.AscCommon?.ClientPdf)throw Error('The bundled PDF exporter is unavailable');
 return frame.AscCommon.ClientPdf.build(api,Object.assign({},downloadOptions,{signal:signal}));
}
async function chooseMailMergeRecipients(){
 if(!file||operationBusy||choosingSaveAs)return null;
 const selectedFile=file,selectedController=controller;
 choosingSaveAs=true;buttons(true);
 try{
  const result=await eoDesktop.mailMergeRecipients(file.token);
  return file===selectedFile&&controller===selectedController?result:null;
 }finally{
  choosingSaveAs=false;buttons(false);
  if(pendingRequested)setTimeout(drainPending,0);
  if(fontRefreshRequested)setTimeout(refreshFonts,0);
 }
}
const openPerformance=(stage,durationMs,outcome='ok')=>{void eoDesktop.openPerformance({stage,durationMs,outcome}).catch(()=>{});};
async function recent(){if(!$('home').hidden)await refreshHome();}

async function installFonts(win,waitForIndex=false,isCurrent=()=>true,api) {
  // A renderer owns one document view; keep startup state attached to that exact engine.
  const pendingByView=installFonts.pendingByView ||= new WeakMap();
  const pending=pendingByView.get(win);
  const clearPending=()=>pending?.cancel();
  const LF=win.Common?.ElixirLocalFonts;
  if(!LF)throw Error('Bundled local font interface missing');
  const allowed=await eoDesktop.fontPermission();if(!isCurrent())return false;
  LF.setConsent(allowed);win.EOComputerFontWarning=null;
  if(!allowed){clearPending();LF.setStatus('off');if(pending)status('');return false;}
  if(pending?.failed&&!LF.engineReady?.()){LF.setConsent(false);LF.setStatus('error');win.EOComputerFontWarning=t('fontFailed');status('');return false;}
  // A ready engine may use the remaining attempt immediately on a notification.
  // Initial, post-open and later/deadline work share one three-attempt budget.
  if(pending?.failed){clearPending();return installFonts(win,waitForIndex,isCurrent,api);}
  if(pending?.attempts>=3){
    if(!pending.expired){LF.setStatus('loading');return false;}
    pending.failed=true;pending.stop();LF.setConsent(false);LF.setStatus('error');win.EOComputerFontWarning=t('fontFailed');status('');return false;
  }
  if(pending?.retried&&!pending.expired&&!LF.engineReady?.()){LF.setStatus('loading');return false;}
  if(pending){pending.retried=true;pending.attempts++;}
  try{
    if(!LF.desktopPolicy){
      await script(win,'/font-resolver.js');await script(win,'/computer-fonts.js');
      const index=await eoDesktop.fontIndex(!waitForIndex,!waitForIndex);
      if(!isCurrent())return false;
      if(!await eoDesktop.fontPermission()){if(isCurrent()){clearPending();LF.setConsent(false);LF.setStatus('off');}return false;}
      if(!isCurrent())return false;
      if(!index){LF.setConsent(false);LF.setStatus('loading');return false;}
      win.EOComputerFonts.install(index);
      // Install eligible families and ranges before document symbol scanning.
      await LF.readList();if(!isCurrent())return false;
      if(!await eoDesktop.fontPermission()){if(isCurrent()){clearPending();LF.setConsent(false);LF.setStatus('off');}return false;}
      if(!isCurrent())return false;
      const added=LF.register();
      // A late inventory arrives after the SDK initialized the font selector.
      if(api?.sync_InitEditorFonts && added?.length)api.sync_InitEditorFonts(LF.guiFonts(added));
    }
    clearPending();if(pending)status('');
    return true;
  }catch(error){
    // Optional discovery must not prevent opening a document with the packaged fonts.
    if(!isCurrent())return false;
    if(error?.message==='Font engine is not ready'&&!pending?.expired){
      LF.setStatus('loading');win.EOComputerFontWarning=null;status('');
      if(!pending){
        const state={retried:false,expired:false,attempts:1,timer:null};
        let observer;
        state.stop=()=>{
          clearTimeout(state.timer);observer?.disconnect();
          for(const view of [win,window])for(const event of ['pagehide','unload'])view.removeEventListener?.(event,state.cancel);
        };
        state.cancel=()=>{state.stop();pendingByView.delete(win);};
        for(const view of [win,window])for(const event of ['pagehide','unload'])view.addEventListener?.(event,state.cancel,{once:true});
        // Replacing/removing the editor iframe must release its captured window.
        if(typeof MutationObserver==='function'&&win.frameElement?.ownerDocument?.documentElement){
          observer=new MutationObserver(()=>{if(!win.frameElement?.isConnected)state.cancel();});
          observer.observe(win.frameElement.ownerDocument.documentElement,{childList:true,subtree:true});
        }
        pendingByView.set(win,state);fontRefreshRequested=true;
        // One deadline notification, not recurring polling. Save/open/close guards
        // retain it until the current document can safely refresh.
        state.timer=setTimeout(()=>{
          state.expired=true;
          if(frame!==win){state.cancel();return;}
          fontRefreshRequested=true;
          if(window.EOLocalSession?.win===win)return refreshFonts();
        },30000);
      }
      return false;
    }
    if(error?.message==='Font engine is not ready'&&pending?.expired){pending.failed=true;pending.stop();}else clearPending();
    LF.setConsent(false);LF.setStatus('error');win.EOComputerFontWarning=t('fontFailed');status('');
    return false;
  }
}

// Keep readiness notifications across opening, native choices and save/close checks.
async function refreshFonts(){
  if(!fontRefreshRequested||fontRefreshRunning||opening||operationBusy||choosingSaveAs||closeCheck)return;
  const session=window.EOLocalSession;
  fontRefreshRequested=false;
  if(!session)return;
  const current=()=>window.EOLocalSession===session && frame===session.win && file===session.file && controller===session.controller;
  const usable=()=>current()&&!opening&&!operationBusy&&!closeCheck&&!choosingSaveAs;
  // Font discovery is optional: never take the save/AutoRecover operation lock.
  fontRefreshRunning=true;
  try{
    const LF=session.win.Common.ElixirLocalFonts;
    if(!await installFonts(session.win,true,usable,session.api)){
      if(current()&&!usable()){fontRefreshRequested=true;return;}
      fontRefreshNotify=false;return false;
    }
    if(!usable()){if(current())fontRefreshRequested=true;return;}
    await LF.enable(session.api);
    if(!current())return false;
    const allowed=await eoDesktop.fontPermission();
    if(!current())return false;
    if(!allowed){LF.setConsent(false);LF.setStatus('off');fontRefreshNotify=false;return false;}
    if(!usable()){fontRefreshRequested=true;return;}
    if(fontRefreshNotify){fontRefreshNotify=false;status(t('fontUse'));}
    return true;
  }catch(error){
    fontRefreshNotify=false;
    if(current()){session.win.EOComputerFontWarning=t('fontFailed');status('');}
    return false;
  }finally{
    fontRefreshRunning=false;
    if(fontRefreshRequested&&!opening&&!operationBusy&&!choosingSaveAs&&!closeCheck)setTimeout(refreshFonts,0);
  }
}

async function drainPending(){
  if(!pendingRequested||pendingRunning||opening||operationBusy||choosingSaveAs||closeCheck)return;
  pendingRequested=false;pendingRunning=true;
  try{await run(async()=>{const selected=await eoDesktop.initial();if(selected?.morePending)pendingRequested=true;return selected})}
  finally{pendingRunning=false;if(pendingRequested)setTimeout(drainPending,0)}
}
async function open(selected) {
  if(!selected||opening)return;
  opening=true;recoveryNotified=false;buttons(true);window.EOLocalFailure=null;window.EOLocalSession=null;abort=new AbortController();
  let preparedWorker;
  const cancelPreparation=()=>{preparedWorker?.terminate();preparedWorker=null};
  abort.signal.addEventListener('abort',cancelPreparation,{once:true});
  try {
    compactChrome?.dispose();compactChrome=null;pdfCompatibility?.dispose();pdfCompatibility=null;controller?.dispose();controller=null;editor?.destroyEditor();file=selected;feedback?.dispose();lastOperation=null;feedback=EOOperationFeedback.mount(document,document.body,info.strings,{diagnostics:()=>eoDesktop.copySaveDiagnostics(),open:id=>run(()=>eoDesktop.savedOpen(id)),show:id=>eoDesktop.savedShow(id),error:operationEvent,cancel:id=>{if(lastOperation?.id===id&&EOOperationFeedback.canCancel(lastOperation))abort?.abort();}});feedback.reset(file.token);
    const openingTracker=Common.ElixirLocalOperation.create(operationEvent,file.token,'desktop-open');openingOperation=openingTracker.begin('open',{name:file.name});
    await EOOperationFeedback.paint(window);
    const timings={selected:performance.now()};
    // Compile for this opening while the editor UI loads; never reuse a document FS.
    if(file.format!=='pdf'){openingOperation.phase('loading-runtime');preparedWorker=new Worker('/example/local-assets/sdkjs/common/desktop/legacy-worker.js');
    preparedWorker.postMessage({prepare:true,runtime:file.runtime});}
    const format=file.format,kind={pdf:'pdf',docx:'word',odt:'word',xlsx:'cell',ods:'cell',pptx:'slide',odp:'slide'}[format];
    if(!kind)throw Error('Unsupported local format');
    $('home').hidden=true;$('workspace').hidden=false;status(t('open')+' '+EOOperationFeedback.isolate(file.name)+'…');
    const authorName=await eoDesktop.author();
    await new Promise((resolve,reject)=>{
      editor=new DocsAPI.DocEditor('editor',{documentType:kind,type:'desktop',width:'100%',height:'100%',
        editorConfig:{mode:'edit',lang:info.language,user:{id:'local',name:authorName},customization:{elixirLocal:true,autosave:false,forcesave:false,plugins:false,macros:false,features:{featuresTips:false}},coEditing:{mode:'strict',change:false}},
        events:{onAppReady:async()=>{
          if(controller)return;
          try {
            timings.appReady=performance.now();openPerformance('renderer-ready',timings.appReady-timings.selected);openingOperation.phase('initializing');frame=document.querySelector('#workspace iframe').contentWindow;
            await Promise.all([
              script(frame,'/example/local-assets/sdkjs/common/clientpdf/wasm-fonts.js'),
              script(frame,'/example/local-assets/sdkjs/common/wasm-convert/api.js'),
              frame.Common?.ElixirLocal?Promise.resolve():new Promise((resolve,reject)=>frame.require(['common/main/lib/elixir-local/Controller'],resolve,reject))
            ]);
            timings.imports=performance.now();openPerformance('sdk-load',timings.imports-timings.appReady);const NativeWorker=frame.Worker;
            frame.Worker=function(url,options){
              const parsed=new frame.URL(url,frame.location.href);
              if(parsed.pathname.endsWith('/wasm-convert/worker.js')){
                if(preparedWorker){const worker=preparedWorker;preparedWorker=null;return worker}
                return new NativeWorker('/example/local-assets/sdkjs/common/desktop/legacy-worker.js',options);
              }
              return new NativeWorker(url,options);
            };
            frame.Worker.prototype=NativeWorker.prototype;
            Object.assign(frame.EOWasmConvert.formats,{doc:66,xls:258,ppt:130,rtf:68,txt:69,docm:75,dotx:76,csv:260,xlsm:261,xltx:262,ppsx:132,potx:135});
            await EODesktopAI(frame);
            const fontsAt=performance.now();await installFonts(frame);openPerformance('font-install',performance.now()-fontsAt);
            main=(kind==='word'?frame.DE:kind==='cell'?frame.SSE:kind==='pdf'?frame.PDFE:frame.PE).getController('Main');
            frame.Common.ElixirLocal.prepare(main.api,main,{mailMerge:true});
            main.loadDocument({doc:{fileType:format,title:file.name,url:'_offline_',key:'local-'+crypto.randomUUID(),permissions:{edit:kind!=='pdf',comment:true,fillForms:true,download:true,print:false,chat:false}}});
            controller=frame.Common.ElixirLocal.install(main.api,{format,name:file.name,lang:info.language,pdfStrings:info.strings,saveAcknowledgesOriginal:kind==='pdf',operationScope:file.token,onOperation:operationEvent,beforeOperationWork:()=>EOOperationFeedback.paint(window),onExport:exportOutput,buildPdf:buildLocalPdf,chooseMailMergeRecipients:chooseMailMergeRecipients,getSignal:()=>abort.signal,
              onSave:async (bytes,protection)=>{const saved=await nativeWrite(()=>eoDesktop.save(file.token,bytes,savingAs,protection,lastOperation?.id,saveAsTicket),file.token,lastOperation?.id);file.name=saved.name;setDocumentName(saved.name);file.recoveryVersion=saved.recoveryVersion;window.EOLastSave=saved;return outputOutcome(saved)},
              onProtectionLock:async()=>{const locked=await eoDesktop.passwordLock(file.token);file.recoveryVersion=locked.recoveryVersion;status('AutoRecover is disabled for this session because password protection was used');},
              onBeforeSave:()=>{abort=new AbortController();buttons(true)},onAfterSave:()=>{buttons(false);updateDirty()},
              onError:fail});
            let input=new Uint8Array(file.bytes).buffer;
            if(!input.byteLength&&['txt','csv'].includes(file.sourceFormat))input=new Uint8Array([10]).buffer;
            if(file.sourceFormat && file.sourceFormat!==format)input=(await frame.EOWasmConvert.convert(new frame.Uint8Array(input),file.sourceFormat,format,{signal:abort.signal,onProgress:openingOperation.progress})).buffer;
            timings.beforeConvert=performance.now();const stats=await controller.open(input,openingOperation);timings.contentReady=performance.now();
            openPerformance('document-convert',timings.contentReady-timings.beforeConvert);
            for(const [stage,key] of [['wasm-fetch','wasmFetchMs'],['wasm-compile','wasmCompileMs'],['wasm-instantiate','wasmInstantiateMs']])if(Number.isFinite(stats?.[key]))openPerformance(stage,stats[key],stats.wasmCached&&stage!=='wasm-instantiate'?'skipped':'ok');
            if(kind==='pdf')pdfCompatibility=EODesktopPdfCompatibility(frame,main,info.strings,status);
            main.api.asc_registerCallback('asc_onDocumentModifiedChanged',()=>{updateDirty().catch(fail)});
            for(const name of ['keydown','beforeinput','click','drop'])frame.document.addEventListener(name,blockDuringClose,true);
            frame.document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault()},true);
            frame.document.addEventListener('drop',drop,true);
            if(file.recovered){
             // A recovered copy has no saved destination; preserve this state across SDK recalculation.
             frame.AscCommon.History.ForceSave=true;main.api.SetDocumentModified(true);
            }
            await updateDirty();backstage=await EODesktopBackstage(frame,main,info,desktopAction);
            compactChrome=EOCompactChrome.create({win:frame,main,bridge:eoDesktop,isBusy:()=>opening||operationBusy||choosingSaveAs||closeCheck});compactChrome.configure(compactMode);
            frame.requestAnimationFrame(()=>frame.requestAnimationFrame(()=>openPerformance('first-paint',performance.now()-timings.contentReady)));
            // Report readiness only after the native file actions have been installed.
            window.EOLocalSession={controller,format,stats,api:main.api,file,win:frame,timings,editableMs:performance.now()};
            status(kind==='pdf'&&!controller.canSave()?controller.readOnlyMessage():'');openingOperation.finish({kind:'opened'});resolve();
          } catch(error){reject(error)}
        },onError:event=>reject(Error(event.data?.errorDescription||'Local editor failed'))}
      });
    });
  } catch(error){openingOperation?.fail(error);compactChrome?.dispose();compactChrome=null;pdfCompatibility?.dispose();pdfCompatibility=null;controller?.dispose();controller=null;feedback?.dispose();feedback=null;lastOperation=null;editor?.destroyEditor();editor=null;file=null;frame=null;main=null;window.EOLocalSession=null;$('workspace').hidden=true;$('home').hidden=false;await refreshHome();fail(error)}finally{abort.signal.removeEventListener('abort',cancelPreparation);cancelPreparation();opening=false;openingOperation=null;buttons(false);recent().catch(fail)}
}
window.addEventListener('eo:backstage-visibility',event=>feedback?.obscure(event.detail));
window.addEventListener('eo:saved-open',event=>run(()=>eoDesktop.savedOpen(event.detail)));
function operationEvent(event){if(event.scope!==file?.token||lastOperation&&event.phase!=='preparing'&&event.id!==lastOperation.id)return;if(event.phase==='error')event={...event,reason:EODesktopErrors.message(event.reason,info?.strings)};lastOperation=event;if(['ready','warning','complete','error','cancelled'].includes(event.phase)&&statusOperation===event.id)status('');feedback?.update(event);backstage?.operation?.(event);window.dispatchEvent(new CustomEvent('eo:local-operation',{detail:event}));}
function outputOutcome(saved,print=false){
 if(!saved)return {kind:'cancelled'};
 if(print){if(saved.printed)return {kind:'print-started'};if(saved.reason&&!['cancelled','canceled','Print job cancelled','Print job canceled'].includes(saved.reason))throw Error(saved.reason);return {kind:'cancelled'};}
 return {...saved,kind:'saved',committed:true};
}
async function nativeWrite(run,scope,id) {
 const signal=abort?.signal;
 const cancel=()=>{if(typeof id==='string')void eoDesktop.cancelWrite(scope,id).catch(()=>{});};
 if(signal?.aborted)throw Object.assign(Error('Save cancelled'),{name:'AbortError',code:'cancelled'});
 signal?.addEventListener('abort',cancel,{once:true});
 try{return await run()}finally{signal?.removeEventListener('abort',cancel);}
}
async function exportOutput(bytes,target,options={},stats,protection){
 const print=target==='pdf'&&!!options.isPdfPrint;
 const saved=target==='pdf'
  ?await nativeWrite(()=>eoDesktop.pdf(file.token,bytes,print,!!options.allowPlainCopy,lastOperation?.id,saveAsTicket),file.token,lastOperation?.id)
  :await nativeWrite(()=>eoDesktop.export(file.token,bytes,target,protection,lastOperation?.id,saveAsTicket),file.token,lastOperation?.id);
 if(target==='pdf')window.EOLastPdf={...saved,stats:stats||{backend:'drawingfile'}};
 else window.EOLastExport=saved;
 return outputOutcome(saved,print);
}
async function updateDirty(){if(controller)await eoDesktop.state(file.token,controller.isModified()||controller.hasPendingImages())}
async function run(select){if(opening||operationBusy)return;window.EOLocalFailure=null;buttons(true);try{await open(await select())}catch(error){fail(error)}finally{buttons(false)}}
async function save(as=false){
  if(!controller||choosingSaveAs)return false;if(operationBusy){status(lastOperation?EOOperationFeedback.label(lastOperation,info?.strings):t('opPreparing'));return false;}if(as)return chooseExport();window.EOLocalFailure=null;savingAs=as;
  try{await controller.save();await updateDirty();if(!controller.isModified())await eoDesktop.recoveryClear(file.token);return !controller.isModified()}catch(error){fail(error,true);return false}finally{savingAs=false}
}
function setDocumentName(name){
 main.api.documentTitle=name;main.api.DocInfo?.put_Title(name);const doc=main.document||main.appOptions.spreadsheet;if(doc)doc.title=name;main.onDocumentName(name);backstage?.setName();
}
async function rename(){
 if(!controller||operationBusy)return;
 window.EOLocalFailure=null;
 const label=backstage?.renameLabel||'Rename',box=modal(label),form=document.createElement('form'),fieldLabel=document.createElement('label'),input=document.createElement('input'),notice=document.createElement('p'),actions=document.createElement('div');
 box.className+=' desktop-rename';actions.className='desktop-dialog-actions';fieldLabel.textContent=label;fieldLabel.htmlFor='desktop-rename-name';
 input.type='text';input.id='desktop-rename-name';input.value=file.name.replace(/\.[^.]+$/,'');input.maxLength=200;input.setAttribute('aria-label',label);notice.setAttribute('role','status');form.append(fieldLabel,input,notice,actions);box.append(form);
 const button=document.createElement('button');button.type='submit';button.textContent=t('save');button.className='btn btn-primary';actions.append(button);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(operationBusy)return;buttons(true);button.disabled=true;
  try{
   const renamed=await eoDesktop.rename(file.token,input.value);Object.assign(file,renamed);
   setDocumentName(renamed.name);window.EOLastRename=renamed;box.close();await recoveryCopy();
  }catch(error){notice.textContent=error.message;window.EOLocalFailure=error.message}
  finally{buttons(false);button.disabled=false}
 });
 modalButton(actions,t('cancel'),()=>box.close()).className='btn';input.focus();input.select();
}
async function chooseExport(){
 if(!controller||operationBusy||choosingSaveAs)return false;
 const selectedFile=file,selectedController=controller;
 choosingSaveAs=true;window.EOLocalFailure=null;
 try{
  const options=await eoDesktop.saveAsInfo(file.token);
  const format=options.nativeFormats?undefined:await EOFormatDialog.open({
   ...options,title:t('saveAs'),label:t('saveFormat'),ok:t('ok'),cancel:t('cancel'),language:info.language,
   dark:frame.document.body.className.includes('theme-type-dark'),
   accent:frame.getComputedStyle(frame.document.body).getPropertyValue('--background-accent-button').trim()});
  if(format===null)return false;
  const selected=await eoDesktop.saveAsChoose(file.token,format,file.format==='pdf'&&!controller.canSave());
  if(!selected||file!==selectedFile||controller!==selectedController)return false;
  saveAsTicket=selected.ticket;
  return await exportAs(selected.format);
 }catch(error){fail(error,true);return false}
 finally{
  saveAsTicket=null;choosingSaveAs=false;
  await eoDesktop.saveAsCancel(selectedFile.token).catch(()=>{});
  if(pendingRequested)setTimeout(drainPending,0);
  if(fontRefreshRequested)setTimeout(refreshFonts,0);
 }
}
async function exportAs(format){
 if(!controller||operationBusy)return false;
 if(format==='pdf'&&(file.format!=='pdf'||!controller.canSave()))return pdf(false,saveAsTicket);
 if(format===file.format){
  savingAs=true;try{await (controller.saveAs?controller.saveAs():controller.save());await updateDirty();if(!controller.isModified())await eoDesktop.recoveryClear(file.token);return !controller.isModified()}catch(error){fail(error,true);return false}finally{savingAs=false}
 }
 buttons(true);abort=new AbortController();
 try{
  let saved;await controller.exportCopy(format,async (bytes,protection)=>{saved=await nativeWrite(()=>eoDesktop.export(file.token,bytes,format,protection,lastOperation?.id,saveAsTicket),file.token,lastOperation?.id);return outputOutcome(saved)});window.EOLastExport=saved;return true;
 }catch(error){fail(error,true);return false}finally{buttons(false)}
}
async function pdf(print=false,ticket){
  if(!controller||operationBusy)return;window.EOLocalFailure=null;buttons(true);abort=new AbortController();
  let operation;
  try {
    operation=controller.beginOperation(print?'print':'pdf-export');
    await EOOperationFeedback.paint(window);
    status(t('pdf')+'…',operation.id);
    if(file.format!=='pdf'){
    await script(frame,'/example/local-assets/sdkjs/common/clientpdf/clientpdf.js');
    await script(frame,'/example/local-assets/sdkjs/common/clientpdf/wasm-pdf.js');
    if(!frame.EODesktopPdf)await script(frame,'/example/local-assets/sdkjs/common/desktop/pdf.js');
    }
    if(abort.signal.aborted)throw Object.assign(Error('PDF export cancelled'),{name:'AbortError',code:'aborted'});
    // The local snapshot barrier awaits queued picture decoding/insertion before drawing.
    if(file.format!=='pdf')await controller.snapshot();
    if(abort.signal.aborted)throw Object.assign(Error('PDF export cancelled'),{name:'AbortError',code:'aborted'});
    const plainCopy=await controller.confirmUnprotectedExport?.();
    const result=file.format==='pdf'?{bytes:await controller.serialize(operation),stats:{backend:controller.canSave()?'original-append':'drawingfile'}}:await frame.EODesktopPdf(main.api,file.format,{signal:abort.signal,onProgress:operation.progress});
    if(!['wasm','drawingfile','original-append'].includes(result.stats.backend))throw Error('Native local PDF export unavailable');
    if(abort.signal.aborted)throw Object.assign(Error('PDF export cancelled'),{name:'AbortError',code:'aborted'});
    operation.phase('awaiting-output');
    const saved=await nativeWrite(()=>eoDesktop.pdf(file.token,result.bytes,print,plainCopy,operation.id,ticket),file.token,operation.id);operation.finish(outputOutcome(saved,print));window.EOLastPdf={...saved,stats:result.stats};return !!saved;

  }catch(error){operation?.fail(error);fail(error,!print)}finally{buttons(false)}
}
async function recoveryCopy(){
 if(!controller||file?.format==='pdf'||opening||operationBusy||choosingSaveAs||recoveryBusy||closeCheck||info.capture||controller.isRecoveryLocked?.()||!controller.isModified())return;
 recoveryBusy=true;const selected=file,local=controller,editorWindow=frame,version=file.recoveryVersion||0;
 try{
  const snap=await local.snapshot();
  const result=selected.format==='pdf'?snap.bytes:await editorWindow.EOWasmConvert.convert(snap.bytes,snap.format,selected.format,{resources:snap.resources});
  if(controller===local&&file===selected)await eoDesktop.recoverySave(selected.token,version,result);
 }catch(error){await eoDesktop.recoveryFailure().catch(()=>{});if(!recoveryNotified){recoveryNotified=true;status(t('recoveryFailed'));}}finally{recoveryBusy=false}
}
function scheduleRecovery(){
 let timer;
 const schedule=async()=>{
  const options=await eoDesktop.recoveryOptions();
  timer=setTimeout(async()=>{if(options.enabled)await recoveryCopy();await schedule()},options.seconds*1000);
 };
 schedule().catch(fail);
 window.addEventListener('unload',()=>clearTimeout(timer),{once:true});
}
let dialogSerial=0;
function modal(title){
 const box=document.createElement('dialog');box.className='desktop-options';
 const heading=document.createElement('h2');heading.id='desktop-dialog-title-'+(++dialogSerial);heading.textContent=title;box.setAttribute('aria-labelledby',heading.id);box.append(heading);
 document.body.append(box);box.addEventListener('close',()=>box.remove(),{once:true});box.showModal();return box;
}
function modalButton(box,label,action){
 const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>Promise.resolve(action()).catch(fail));box.append(button);return button;
}
let releaseBanner;
async function showOptions(){
 const options=await eoDesktop.recoveryOptions(),windowOptions=await eoDesktop.windowOptions(),releaseOptions=await eoDesktop.releaseOptions(),languageOptions=await eoDesktop.languageOptions(),interfaceOptions=await eoDesktop.interfaceSize(),invoker=document.activeElement,returnFrame=frame,returnFile=file,returnController=controller;
 const returnTarget=returnFrame&&(invoker===document.body||invoker?.closest('dialog.desktop-options:not([open])'))?returnFrame.frameElement:invoker;
 const returnDocument=returnTarget?.tagName==='IFRAME'?returnTarget.contentDocument:null,returnChild=returnDocument?.activeElement;
 const box=modal(t('options')),label=document.createElement('label'),enabled=document.createElement('input');
 const generalGroup=document.createElement('section'),recoveryGroup=document.createElement('section'),recoveryRow=document.createElement('div'),authorGroup=document.createElement('section'),windowGroup=document.createElement('section'),fontGroup=document.createElement('section'),releaseGroup=document.createElement('section'),languageGroup=document.createElement('section'),actions=document.createElement('div');
 box.className+=' desktop-preferences';
 for(const group of [generalGroup,recoveryGroup,authorGroup,windowGroup,fontGroup,releaseGroup,languageGroup])group.className='desktop-setting-section';
 recoveryRow.className='desktop-recovery-row';actions.className='desktop-dialog-actions';
 recoveryGroup.append(recoveryRow);box.append(generalGroup,recoveryGroup,authorGroup,languageGroup,windowGroup,fontGroup,releaseGroup);
 const generalHeading=document.createElement('h3'),interfaceLabel=document.createElement('label'),interfaceSelect=document.createElement('select'),interfaceNote=document.createElement('p');
 generalHeading.textContent=t('generalSettings');interfaceLabel.textContent=t('interfaceSize');interfaceSelect.id='interface-size';interfaceNote.id='interface-size-description';interfaceNote.textContent=t('interfaceSizeDescription');interfaceSelect.setAttribute('aria-describedby',interfaceNote.id);
 for(const size of interfaceOptions.levels){const option=document.createElement('option');option.value=size;option.textContent=size+'%';interfaceSelect.append(option);}
 interfaceSelect.value=String(interfaceOptions.value);interfaceLabel.append(interfaceSelect);generalGroup.append(generalHeading,interfaceLabel,interfaceNote);
 box.addEventListener('close',()=>{
  const active=document.activeElement;
  // A close event may run after another dialog, control or document took ownership.
  if(returnFrame!==frame||returnFile!==file||returnController!==controller||document.querySelector('dialog[open]')||
    (active!==document.body&&active!==box&&!box.contains(active))||!returnTarget?.isConnected)return;
  if(returnChild){
   const doc=returnTarget.contentDocument;
   if(doc!==returnDocument||!returnChild.isConnected||(doc.activeElement!==returnChild&&doc.activeElement!==doc.body))return;
  }
  returnTarget.focus();returnChild?.focus();
 },{once:true});
 enabled.type='checkbox';enabled.checked=options.enabled;enabled.id='recovery-enabled';label.append(enabled,document.createTextNode(t('autoRecover')));recoveryRow.append(label);interfaceSelect.focus();
 const interval=document.createElement('select');interval.id='recovery-interval';interval.setAttribute('aria-label',t('autoRecover'));
 if(file?.format==='pdf'){const pdfNote=document.createElement('p');pdfNote.textContent=t('pdfRecoveryOff');recoveryGroup.append(pdfNote);}
 for(const seconds of [15,30,60,120,300]){const option=document.createElement('option');option.value=seconds;option.textContent=String(seconds)+' s';option.selected=seconds===options.seconds;interval.append(option)}recoveryRow.append(interval);
 const authorLabel=document.createElement('label'),author=document.createElement('input');author.type='text';author.id='author-name';author.maxLength=200;author.value=await eoDesktop.author();authorLabel.textContent=t('authorName');authorLabel.append(author);authorGroup.append(authorLabel);
 const aiController=(frame?.DE||frame?.SSE||frame?.PE||frame?.PDFE)?.getController('Common.Controllers.ElixirAI');
 if(aiController){const aiButton=modalButton(authorGroup,'Elixir — '+t('settings'),()=>{box.close();aiController.openSettings(false)});aiButton.className='btn desktop-ai-settings';}
 const note=document.createElement('p');note.className='desktop-privacy';note.textContent=t('privacy');box.append(note);
 const windowHeading=document.createElement('h3');windowHeading.textContent=t('window');windowGroup.append(windowHeading);
 const tabsLabel=document.createElement('label'),tabs=document.createElement('input'),homeLabel=document.createElement('label'),home=document.createElement('input'),homeNote=document.createElement('p');
 tabs.type='checkbox';tabs.id='open-documents-in-tabs';tabs.checked=windowOptions.openInTabs===true;
 home.type='checkbox';home.id='show-home-tab';home.checked=windowOptions.showHomeTab===true;home.disabled=!tabs.checked;
 homeNote.id='home-tab-requires-tabs';homeNote.textContent=t('homeTabRequiresTabs');home.setAttribute('aria-describedby',homeNote.id);
 tabs.addEventListener('change',()=>{home.disabled=!tabs.checked;});
 tabsLabel.append(tabs,document.createTextNode(t('openDocumentsInTabs')));homeLabel.append(home,document.createTextNode(t('showHomeTab')));
 const placementLabel=document.createElement('label'),placement=document.createElement('input');
 placement.type='checkbox';placement.id='remember-window-placement';placement.checked=windowOptions.rememberWindowPlacement!==false;
 placementLabel.append(placement,document.createTextNode(t('rememberWindowPlacement')));
 windowGroup.append(placementLabel,tabsLabel,homeLabel,homeNote);
 const customFrameLabel=document.createElement('label'),customFrame=document.createElement('input'),customFrameDescription=document.createElement('p'),customFrameNote=document.createElement('p');
 customFrame.type='checkbox';customFrame.id='custom-title-bar';customFrame.checked=windowOptions.customTitleBar;
 customFrame.disabled=!windowOptions.customTitleBarAvailable&&!customFrame.checked;
 customFrame.addEventListener('change',()=>{if(!windowOptions.customTitleBarAvailable&&!customFrame.checked)customFrame.disabled=true;});
 customFrameDescription.id='custom-title-bar-description';customFrameDescription.textContent=t('customTitleBarDesc');
 customFrameNote.id='custom-title-bar-note';customFrameNote.textContent=windowOptions.customTitleBarAvailable?t('customTitleBarRestart'):t('nativeTitleBarUnavailable');
 customFrame.setAttribute('aria-describedby',customFrameDescription.id+' '+customFrameNote.id);customFrameLabel.append(customFrame,document.createTextNode(t('customTitleBar')));windowGroup.append(customFrameLabel,customFrameDescription,customFrameNote);
 await addFontOptions(fontGroup);
 const releaseHeading=document.createElement('h3');releaseHeading.textContent=t('releaseUpdates');releaseGroup.append(releaseHeading);
 const releaseLabel=document.createElement('label'),releaseEnabled=document.createElement('input'),releasePrivacy=document.createElement('p');
 releaseEnabled.type='checkbox';releaseEnabled.id='release-checks-enabled';releaseEnabled.checked=releaseOptions.enabled;
 releaseLabel.append(releaseEnabled,document.createTextNode(t('releaseChecks')));releasePrivacy.id='release-checks-privacy';releasePrivacy.textContent=t('releasePrivacy');releaseEnabled.setAttribute('aria-describedby',releasePrivacy.id);releaseGroup.append(releaseLabel,releasePrivacy);
 const automaticLabel=document.createElement('label'),automatic=document.createElement('input'),automaticNote=document.createElement('p');
 automatic.type='checkbox';automatic.id='release-install-automatically';automatic.checked=releaseOptions.automatic===true;
 automaticNote.id='release-install-privacy';automatic.setAttribute('aria-describedby',automaticNote.id);
 automaticLabel.append(automatic,document.createTextNode(t('releaseAutomatic')));
 const refreshAutomatic=()=>{automatic.disabled=!releaseOptions.installationAvailable||!releaseEnabled.checked;automaticNote.textContent=t(releaseOptions.installationAvailable?'releaseAutomaticDescription':'releaseInstallUnavailable');};
 releaseEnabled.addEventListener('change',refreshAutomatic);refreshAutomatic();releaseGroup.append(automaticLabel,automaticNote);
 const languageHeading=document.createElement('h3'),languageLabel=document.createElement('label'),displayLanguage=document.createElement('select'),restartNotice=document.createElement('p');
 languageHeading.textContent=t('displayLanguageHeading');languageLabel.textContent=t('displayLanguage');
 displayLanguage.id='display-language';restartNotice.id='display-language-restart';restartNotice.textContent=t('displayLanguageRestart');
 displayLanguage.setAttribute('aria-describedby',restartNotice.id);
 const systemLanguage=document.createElement('option');systemLanguage.value='';systemLanguage.textContent=t('displayLanguageSystem');displayLanguage.append(systemLanguage);
 for(const locale of languageOptions.locales){const option=document.createElement('option');option.value=locale.language;option.textContent=locale.name;displayLanguage.append(option);}
 displayLanguage.value=languageOptions.value;languageLabel.append(displayLanguage);languageGroup.append(languageHeading,languageLabel,restartNotice);
 let savingOptions=false;
 const restartButton=modalButton(languageGroup,t('displayLanguageRestartNow'),()=>saveOptions(true));restartButton.id='display-language-restart-now';restartButton.className='btn';
 const refreshRestart=()=>{const changed=(displayLanguage.value||languageOptions.system)!==languageOptions.active;restartNotice.hidden=!changed;restartButton.hidden=!changed;};
 displayLanguage.addEventListener('change',refreshRestart);refreshRestart();
 async function saveOptions(restart=false){
  if(savingOptions)return;savingOptions=true;saveButton.disabled=true;restartButton.disabled=true;
  try{await eoDesktop.releaseSettings({enabled:releaseEnabled.checked,automatic:automatic.checked});await eoDesktop.windowSettings({customTitleBar:customFrame.checked,openInTabs:tabs.checked,showHomeTab:home.checked,rememberWindowPlacement:placement.checked});await eoDesktop.recoverySettings({enabled:enabled.checked,seconds:Number(interval.value)});const name=await eoDesktop.authorSave(author.value);if(main?.api){main.api.User?.setUserName(name);main.api.DocInfo?.get_UserInfo()?.put_FullName(name);frame.AscCommon.UserInfoParser.setCurrentName(name);if(main.appOptions.user)main.appOptions.user.fullname=name;if(main.editorConfig.user)main.editorConfig.user.name=name;(frame.DE||frame.SSE||frame.PE||frame.PDFE).getController('Viewport').getView('Common.Views.Header')?.setUserName(frame.AscCommon.UserInfoParser.getParsedName(name));}await eoDesktop.interfaceSizeSet(Number(interfaceSelect.value));await eoDesktop.languageSettings(displayLanguage.value);box.close();if(restart)await eoDesktop.restart();}
  finally{savingOptions=false;saveButton.disabled=false;restartButton.disabled=false;}
 }
 const saveButton=modalButton(actions,t('save'),()=>saveOptions());
 saveButton.className='btn btn-primary';
 modalButton(actions,t('cancel'),()=>box.close()).className='btn';box.append(actions);
}
async function offerRecovery(){
 const entries=await eoDesktop.recoveryOffer();if(!entries.length)return;
 const english={recoveryTitle:'Recover documents',recoveryUnavailable:'Unavailable recovery copy',recoveryDamaged:'This copy is damaged or unavailable and cannot be restored.'};
 const text=key=>{const value=info?.strings?.[key];return typeof value==='string'&&value.trim()?value:english[key]};
 const box=modal(text('recoveryTitle'));box.className+=' desktop-recovery';let firstRestore,index=0;
 for(const entry of entries){
  const row=document.createElement('section'),heading=document.createElement('h3'),name=document.createElement('bdi'),actions=document.createElement('div');
  row.className='desktop-recovery-entry';heading.id='desktop-recovery-entry-'+(++index);row.setAttribute('aria-labelledby',heading.id);
  name.textContent=entry.damaged?text('recoveryUnavailable'):entry.name;heading.append(name);row.append(heading);box.append(row);
  if(entry.damaged){const note=document.createElement('p');note.className='desktop-recovery-damaged';note.textContent=text('recoveryDamaged');row.append(note)}
  const modified=new Date(entry.modified);
  if(entry.modified&&Number.isFinite(modified.getTime())){const date=document.createElement('time');date.dateTime=modified.toISOString();date.textContent=new Intl.DateTimeFormat(info.language,{dateStyle:'short',timeStyle:'short'}).format(modified);row.append(date)}
  actions.className='desktop-dialog-actions';row.append(actions);
  if(!entry.damaged){const restore=modalButton(actions,t('restore'),async()=>{box.close();await run(()=>eoDesktop.recoveryRestore(entry.id))});restore.className='btn btn-primary desktop-recovery-restore';firstRestore??=restore;}
  modalButton(actions,t('discard'),async()=>{await eoDesktop.recoveryRemove(entry.id);row.remove();if(!box.querySelector('section'))box.close()}).className='btn';
 }
 const footer=document.createElement('div');footer.className='desktop-recovery-footer';box.append(footer);
 const cancel=modalButton(footer,t('cancel'),()=>box.close());cancel.className='btn';(firstRestore||cancel).focus();
}
async function fontConsent(){try{if(!await eoDesktop.fontConsent())return false;if(frame){fontRefreshRequested=true;fontRefreshNotify=true;return await refreshFonts()!==false;}status(t('fontUse'));return true}catch(error){fail(error);return false}}
async function addFontOptions(box){
 const label=document.createElement('label'),enabled=document.createElement('input'),state=document.createElement('p'),hint=document.createElement('p');
 enabled.type='checkbox';enabled.id='computer-fonts-enabled';state.id='computer-fonts-status';hint.id='computer-fonts-hint';
 label.append(enabled,document.createTextNode(t('fontComputer')));hint.textContent=t('fontReopen');box.append(label,state,hint);
 async function refresh(){enabled.checked=await eoDesktop.fontPermission();const choice=await eoDesktop.fontChoice();state.textContent=t(enabled.checked?'fontEnabled':choice==='declined'?'fontDisabled':'fontUnset');}
 await refresh();
 enabled.addEventListener('change',async()=>{
  enabled.disabled=true;
  try{
   if(enabled.checked)await fontConsent();
   else{await eoDesktop.fontDisable();const LF=frame?.Common?.ElixirLocalFonts;if(LF){LF.fonts=null;LF.setConsent(false);LF.setStatus('off');}}
  }catch(error){fail(error)}
  finally{try{await refresh()}catch(error){fail(error)}enabled.disabled=false;}
 });
}

async function drop(event){
  if(!event.dataTransfer?.files.length)return;
  // Only intercept Office documents; other drops retain the editor's behavior.
  if(!/\.(docx|doc|odt|rtf|txt|docm|dotx|xlsx|xls|ods|csv|xlsm|xltx|pptx|ppt|odp|ppsx|potx|pdf)$/i.test(event.dataTransfer.files[0].name))return;
  event.preventDefault();event.stopImmediatePropagation();document.body.classList.remove('drag');
  await run(()=>eoDesktop.drop(event.dataTransfer.files[0]));
}

eoDesktop.onOperationStage(event=>{
 if(!lastOperation||event.id!==lastOperation.id||event.scope!==file?.token||['ready','warning','complete','error','cancelled'].includes(lastOperation.phase))return;
 if(['awaiting-user','writing'].includes(event.phase))operationEvent({id:event.id,scope:event.scope,kind:lastOperation.kind,phase:event.phase});
});
eoDesktop.onAction(async (action,details)=>{
  if(action==='font-index-ready'){fontRefreshRequested=true;const home=$('home');if(!home.hidden&&!closeCheck&&!choosingSaveAs)await refreshHome(home.querySelector('[aria-current="page"]')?.dataset.view||'home');return refreshFonts();}
  if(action==='prepare-close'){closeCheck=true;return}
  if(action==='resume-close'){closeCheck=false;if(pendingRequested)setTimeout(drainPending,0);if(fontRefreshRequested)setTimeout(refreshFonts,0);return}
  if(action==='pending'){pendingRequested=true;return drainPending()}
  if(closeCheck && action!=='save-close')return;
  if(choosingSaveAs)return;
  if(action==='save-close'){const attemptId=details?.attemptId;if(typeof attemptId!=='string')return;try{if(await save())await eoDesktop.closeSaved(attemptId);}catch(error){fail(error)}finally{closeCheck=false;await eoDesktop.closeCancelled(attemptId).catch(()=>{});if(pendingRequested)setTimeout(drainPending,0);if(fontRefreshRequested)setTimeout(refreshFonts,0)}return}
  if(/^quick-(save|undo|redo|search)$/.test(action)){compactChrome?.perform(action.slice(6));return;}
  ({'tab-limit':()=>status(t('tabLimit')),'backstage-home':()=>backstage?.open().catch(fail),'external-error':()=>status(t('error')),settings:()=>showOptions(),fonts:()=>fontConsent(),'move-menu':()=>eoDesktop.moveMenu().catch(fail),close:()=>info?.capture?returnHome():eoDesktop.closeTab().catch(fail),home:()=>returnHome(),cancel:()=>abort?.abort(),'new-docx':()=>run(()=>eoDesktop.create('docx')),'new-xlsx':()=>run(()=>eoDesktop.create('xlsx')),'new-pptx':()=>run(()=>eoDesktop.create('pptx')),open:()=>run(()=>eoDesktop.choose()),save:()=>save(),'save-as':()=>save(true),pdf:()=>pdf(),print:()=>pdf(true)}[action]||(()=>{}))();
});
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();document.body.classList.add('drag')}});
document.addEventListener('dragleave',()=>document.body.classList.remove('drag'));document.addEventListener('drop',drop,true);
(async()=>{
 Object.defineProperty(window,'EODocumentId',{value:(await eoDesktop.identity()).documentId});
 compactMode=(await eoDesktop.chromeMode()).compact===true;eoDesktop.onChromeMode(value=>{compactMode=value?.compact===true;compactChrome?.configure(compactMode)});
 info=await eoDesktop.locale();window.EODesktopStrings=Object.freeze(info.strings);document.documentElement.lang=info.language;document.documentElement.dir=['ar','he','ur'].includes(info.language)?'rtl':'ltr';
 releaseBanner=EOReleaseBanner.create({document,bridge:eoDesktop,t});
 window.addEventListener('pagehide',()=>releaseBanner?.dispose(),{once:true});
 await refreshHome();pendingRequested=true;await drainPending();window.EODesktopReady=true;await eoDesktop.desktopReady();
 await offerRecovery();
 scheduleRecovery();
 if(info.capture)window.EODesktopCapture={
  locale:async language=>{if(controller)await returnHome();info=await eoDesktop.captureLocale(language);window.EODesktopStrings=Object.freeze(info.strings);document.documentElement.lang=info.language;document.documentElement.dir=['ar','he','ur'].includes(info.language)?'rtl':'ltr';},
  start:async()=>{await returnHome();await refreshHome();},
  document:async()=>{await run(()=>eoDesktop.create('docx'));if(!EOLocalSession||EOLocalFailure)throw Error(EOLocalFailure||'Capture editor unavailable');},
  backstage:async()=>{await backstage.open();},
  validate:async view=>{
   if(view==='start'){
    const empty=$('home').querySelector('.recent-empty');
    if(!empty||empty.textContent!==t('noRecent'))throw Error('Empty Recent message unavailable');
    return {emptyRecent:empty.textContent};
   }
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const visible=el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height;
   if(frame.Common.UI.FeaturesManager.isFeatureEnabled('featuresTips',true))throw Error('Desktop feature announcements enabled');
   if([...frame.document.querySelectorAll('.asc-synchronizetip')].some(visible))throw Error('Desktop feature tip visible');
   const title=frame.document.querySelector('.elx-docname-text');
   if(!title||title.clientWidth<title.scrollWidth)throw Error('Document title truncated at review width');
   const search=frame.document.querySelector('.elx-search'),avatar=frame.document.querySelector('.btn-current-user,.slot-btn-user-name');
   if(search&&avatar&&visible(avatar)){
    const s=search.getBoundingClientRect(),a=avatar.getBoundingClientRect();
    if(a.left<s.right&&a.right>s.left)throw Error('Header avatar overlaps search');
   }
   const proofing=main.api.asc_getDefaultLanguage();
   const expected=frame.Common.util.LanguageInfo.getDefaultLanguageCode(info.language);
   if(expected && Number(proofing)!==Number(expected))throw Error('New document proofing language differs from UI');
   const result={title:title.textContent,proofingLanguage:proofing,featureTips:0};
   if(view==='file'){
    const ids=[...frame.document.querySelectorAll('.fm-btn')].filter(visible).map(el=>el.id);
    if(ids.indexOf('fm-btn-info')!==ids.indexOf('fm-btn-elx-open')+1||ids.indexOf('fm-btn-info')>=ids.indexOf('fm-btn-save'))throw Error('File Info order incorrect');
    result.infoBetweenOpenAndSave=true;
   }else{
    const bar=frame.document.querySelector('.elx-lf-bar');
    if(bar&&visible(bar)){
     const buttons=[...bar.querySelectorAll('.elx-lf-btn')];
     if(buttons.length<2||buttons.some(el=>!visible(el)||el.getBoundingClientRect().right>frame.innerWidth))throw Error('Font invitation buttons unavailable');
     result.fontButtons=buttons.map(el=>el.textContent);
    }
   }
   return result;
  }
 };
})().catch(fail);

// SDK modified events update the title; close/open query the actual state.

})();
