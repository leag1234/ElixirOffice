// SPDX-License-Identifier: AGPL-3.0-only
(() => {
'use strict';
const $=id=>document.getElementById(id);let editor,controller,file,abort,opening=false,frame,main,savingAs=false,saveAsTicket=null,choosingSaveAs=false,closeCheck=false,pendingRequested=false,pendingRunning=false,openingOperation;
Object.defineProperty(window,'EODesktopState',{value:(lock=true)=>{if(lock)closeCheck=true;return {dirty:!!(controller&&(controller.isModified()||controller.hasPendingImages())),opening:opening||choosingSaveAs||!!controller?.isSaving?.()||!!lastOperation&&!['ready','warning','complete','error','cancelled'].includes(lastOperation.phase)}}});
Object.defineProperty(window,'EODesktopCancelOperation',{value:()=>{abort?.abort();openingOperation?.cancel();controller?.dispose();}});
function blockDuringClose(event){if(closeCheck||info?.capture){event.preventDefault();event.stopImmediatePropagation()}}
for(const name of ['keydown','beforeinput','click','drop'])document.addEventListener(name,blockDuringClose,true);
let info,operationBusy=false,backstage,recoveryBusy=false,pdfCompatibility,recoveryNotified=false,feedback,lastOperation,statusOperation;
const t=key=>info?.strings[key]||({recoveryFailed:'AutoRecover could not keep a recovery copy. Save your document manually.',pdfRecoveryOff:'AutoRecover is not available for PDF files. Save manually; these settings apply to Office files.'})[key]||key;
const status=(text,operationId)=>{statusOperation=operationId||null;const recovery=controller?.isRecoveryLocked?.()?'AutoRecover is disabled for this session because password protection was used':'';const message=[text,recovery].filter(Boolean).join(' — ');$('message').textContent=message;$('message').hidden=!message;};
async function refreshHome(view='home'){const data=await eoDesktop.home();EODesktopHome.render($('home'),{...data,...info},desktopAction,view);}
async function returnHome(){if(!await eoDesktop.returnHome())return;pdfCompatibility?.dispose();pdfCompatibility=null;controller?.dispose();controller=null;feedback?.dispose();feedback=null;lastOperation=null;editor?.destroyEditor();editor=null;file=null;frame=null;main=null;window.EOLocalSession=null;$('workspace').hidden=true;$('home').hidden=false;status('');await refreshHome();}
function desktopAction(action,value){if(choosingSaveAs)return;return ({open:()=>run(()=>eoDesktop.choose()),new:()=>run(()=>eoDesktop.create(value)),template:()=>run(()=>eoDesktop.template(value)),recent:()=>run(()=>eoDesktop.recent(value)),save:()=>save(),'save-as':()=>save(true),rename:()=>rename(),pdf:()=>pdf(),print:()=>pdf(true),help:()=>eoDesktop.help(),settings:()=>showOptions(),fonts:()=>fontConsent(),home:()=>returnHome(),cancel:()=>abort?.abort()}[action]||(()=>{}))();}

const fail=error=>{if(EODesktopErrors.cancelled(error)){window.EOLocalFailure=null;status('');return}const reason=EODesktopErrors.message(error,info?.strings);window.EOLocalFailure=reason;status(reason);};
function buttons(busy) {
  operationBusy=busy;
  for(const button of $('home').querySelectorAll('button'))button.disabled=busy;
  if(!busy && pendingRequested)setTimeout(drainPending,0);
}

function script(win,url){return new Promise((resolve,reject)=>{const element=win.document.createElement('script');element.src=url;element.onload=resolve;element.onerror=()=>reject(Error('Cannot load bundled editor asset'));win.document.head.appendChild(element)})}
async function recent(){if(!$('home').hidden)await refreshHome();}

async function installFonts(win) {
  const LF=win.Common?.ElixirLocalFonts;
  if(!LF)throw Error('Bundled local font interface missing');
  if(await eoDesktop.fontPermission())LF.setConsent(true);
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
    pdfCompatibility?.dispose();pdfCompatibility=null;controller?.dispose();controller=null;editor?.destroyEditor();file=selected;feedback?.dispose();lastOperation=null;feedback=EOOperationFeedback.mount(document,document.body,info.strings,{open:id=>run(()=>eoDesktop.savedOpen(id)),show:id=>eoDesktop.savedShow(id),error:operationEvent,cancel:id=>{if(lastOperation?.id===id&&EOOperationFeedback.canCancel(lastOperation))abort?.abort();}});feedback.reset(file.token);
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
            timings.appReady=performance.now();openingOperation.phase('initializing');frame=document.querySelector('#workspace iframe').contentWindow;
            await Promise.all([
              script(frame,'/example/local-assets/sdkjs/common/clientpdf/wasm-fonts.js'),
              script(frame,'/example/local-assets/sdkjs/common/wasm-convert/api.js'),
              frame.Common?.ElixirLocal?Promise.resolve():new Promise((resolve,reject)=>frame.require(['common/main/lib/elixir-local/Controller'],resolve,reject))
            ]);
            timings.imports=performance.now();const NativeWorker=frame.Worker;
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
            await installFonts(frame);
            main=(kind==='word'?frame.DE:kind==='cell'?frame.SSE:kind==='pdf'?frame.PDFE:frame.PE).getController('Main');
            frame.Common.ElixirLocal.prepare(main.api,main);
            main.loadDocument({doc:{fileType:format,title:file.name,url:'_offline_',key:'local-'+crypto.randomUUID(),permissions:{edit:kind!=='pdf',comment:true,fillForms:true,download:true,print:false,chat:false}}});
            controller=frame.Common.ElixirLocal.install(main.api,{format,name:file.name,lang:info.language,pdfStrings:info.strings,saveAcknowledgesOriginal:kind==='pdf',operationScope:file.token,onOperation:operationEvent,beforeOperationWork:()=>EOOperationFeedback.paint(window),onExport:exportOutput,getSignal:()=>abort.signal,
              onSave:async (bytes,protection)=>{const saved=await eoDesktop.save(file.token,bytes,savingAs,protection,lastOperation?.id,saveAsTicket);file.name=saved.name;setDocumentName(saved.name);file.recoveryVersion=saved.recoveryVersion;window.EOLastSave=saved;return outputOutcome(saved)},
              onProtectionLock:async()=>{const locked=await eoDesktop.passwordLock(file.token);file.recoveryVersion=locked.recoveryVersion;status('AutoRecover is disabled for this session because password protection was used');},
              onBeforeSave:()=>{abort=new AbortController();buttons(true)},onAfterSave:()=>{buttons(false);updateDirty()},
              onError:fail});
            let input=new Uint8Array(file.bytes).buffer;
            if(!input.byteLength&&['txt','csv'].includes(file.sourceFormat))input=new Uint8Array([10]).buffer;
            if(file.sourceFormat && file.sourceFormat!==format)input=(await frame.EOWasmConvert.convert(new frame.Uint8Array(input),file.sourceFormat,format,{signal:abort.signal,onProgress:openingOperation.progress})).buffer;
            timings.beforeConvert=performance.now();const stats=await controller.open(input,openingOperation);timings.contentReady=performance.now();if(kind==='pdf')pdfCompatibility=EODesktopPdfCompatibility(frame,main,info.strings,status);
            main.api.asc_registerCallback('asc_onDocumentModifiedChanged',updateDirty);
            for(const name of ['keydown','beforeinput','click','drop'])frame.document.addEventListener(name,blockDuringClose,true);
            frame.document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault()},true);
            frame.document.addEventListener('drop',drop,true);
            if(file.recovered){
             // A recovered copy has no saved destination; preserve this state across SDK recalculation.
             frame.AscCommon.History.ForceSave=true;main.api.SetDocumentModified(true);
            }
            await updateDirty();backstage=await EODesktopBackstage(frame,main,info,desktopAction);
            // Report readiness only after the native file actions have been installed.
            window.EOLocalSession={controller,format,stats,api:main.api,file,win:frame,timings,editableMs:performance.now()};
            status(kind==='pdf'&&!controller.canSave()?controller.readOnlyMessage():'');openingOperation.finish({kind:'opened'});resolve();
          } catch(error){reject(error)}
        },onError:event=>reject(Error(event.data?.errorDescription||'Local editor failed'))}
      });
    });
  } catch(error){openingOperation?.fail(error);pdfCompatibility?.dispose();pdfCompatibility=null;controller?.dispose();controller=null;feedback?.dispose();feedback=null;lastOperation=null;editor?.destroyEditor();editor=null;file=null;frame=null;main=null;window.EOLocalSession=null;$('workspace').hidden=true;$('home').hidden=false;await refreshHome();fail(error)}finally{abort.signal.removeEventListener('abort',cancelPreparation);cancelPreparation();opening=false;openingOperation=null;buttons(false);recent().catch(fail)}
}
window.addEventListener('eo:backstage-visibility',event=>feedback?.obscure(event.detail));
window.addEventListener('eo:saved-open',event=>run(()=>eoDesktop.savedOpen(event.detail)));
function operationEvent(event){if(event.scope!==file?.token||lastOperation&&event.phase!=='preparing'&&event.id!==lastOperation.id)return;if(event.phase==='error')event={...event,reason:EODesktopErrors.message(event.reason,info?.strings)};lastOperation=event;if(['ready','warning','complete','error','cancelled'].includes(event.phase)&&statusOperation===event.id)status('');feedback?.update(event);backstage?.operation?.(event);window.dispatchEvent(new CustomEvent('eo:local-operation',{detail:event}));}
function outputOutcome(saved,print=false){
 if(!saved)return {kind:'cancelled'};
 if(print){if(saved.printed)return {kind:'print-started'};if(saved.reason&&!['cancelled','canceled','Print job cancelled','Print job canceled'].includes(saved.reason))throw Error(saved.reason);return {kind:'cancelled'};}
 return {...saved,kind:'saved',committed:true};
}
async function exportOutput(bytes,target,options={},stats,protection){
 const print=target==='pdf'&&!!options.isPdfPrint;
 const saved=target==='pdf'
  ?await eoDesktop.pdf(file.token,bytes,print,!!options.allowPlainCopy,lastOperation?.id,saveAsTicket)
  :await eoDesktop.export(file.token,bytes,target,protection,lastOperation?.id,saveAsTicket);
 if(target==='pdf')window.EOLastPdf={...saved,stats:stats||{backend:'drawingfile'}};
 else window.EOLastExport=saved;
 return outputOutcome(saved,print);
}
async function updateDirty(){if(controller)await eoDesktop.state(file.token,controller.isModified()||controller.hasPendingImages())}
async function run(select){if(opening||operationBusy)return;window.EOLocalFailure=null;buttons(true);try{await open(await select())}catch(error){fail(error)}finally{buttons(false)}}
async function save(as=false){
  if(!controller||choosingSaveAs)return false;if(operationBusy){status(lastOperation?EOOperationFeedback.label(lastOperation,info?.strings):t('opPreparing'));return false;}if(as)return chooseExport();window.EOLocalFailure=null;savingAs=as;
  try{await controller.save();await updateDirty();if(!controller.isModified())await eoDesktop.recoveryClear(file.token);return !controller.isModified()}catch(error){fail(error);return false}finally{savingAs=false}
}
function setDocumentName(name){
 main.api.documentTitle=name;main.api.DocInfo?.put_Title(name);const doc=main.document||main.appOptions.spreadsheet;if(doc)doc.title=name;main.onDocumentName(name);backstage?.setName();
}
async function rename(){
 if(!controller||operationBusy)return;
 window.EOLocalFailure=null;
 const label=backstage?.renameLabel||'Rename',box=modal(label),input=document.createElement('input'),notice=document.createElement('p');
 input.id='desktop-rename-name';input.value=file.name.replace(/\.[^.]+$/,'');input.maxLength=200;input.setAttribute('aria-label',label);notice.setAttribute('role','status');box.append(input,notice);
 const button=modalButton(box,t('save'),async()=>{
  if(operationBusy)return;buttons(true);button.disabled=true;
  try{
   const renamed=await eoDesktop.rename(file.token,input.value);Object.assign(file,renamed);
   setDocumentName(renamed.name);window.EOLastRename=renamed;box.close();await recoveryCopy();
  }catch(error){notice.textContent=error.message;window.EOLocalFailure=error.message}
  finally{buttons(false);button.disabled=false}
 });
 modalButton(box,t('cancel'),()=>box.close());input.focus();input.select();
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
 }catch(error){fail(error);return false}
 finally{
  saveAsTicket=null;choosingSaveAs=false;
  await eoDesktop.saveAsCancel(selectedFile.token).catch(()=>{});
  if(pendingRequested)setTimeout(drainPending,0);
 }
}
async function exportAs(format){
 if(!controller||operationBusy)return false;
 if(format==='pdf'&&(file.format!=='pdf'||!controller.canSave()))return pdf(false,saveAsTicket);
 if(format===file.format){
  savingAs=true;try{await (controller.saveAs?controller.saveAs():controller.save());await updateDirty();if(!controller.isModified())await eoDesktop.recoveryClear(file.token);return !controller.isModified()}catch(error){fail(error);return false}finally{savingAs=false}
 }
 buttons(true);abort=new AbortController();
 try{
  let saved;await controller.exportCopy(format,async (bytes,protection)=>{saved=await eoDesktop.export(file.token,bytes,format,protection,lastOperation?.id,saveAsTicket);return outputOutcome(saved)});window.EOLastExport=saved;return true;
 }catch(error){fail(error);return false}finally{buttons(false)}
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
    const plainCopy=await controller.confirmUnprotectedExport?.();
    const result=file.format==='pdf'?{bytes:await controller.serialize(operation),stats:{backend:controller.canSave()?'original-append':'drawingfile'}}:await frame.EODesktopPdf(main.api,file.format,{signal:abort.signal,onProgress:operation.progress});
    if(!['wasm','drawingfile','original-append'].includes(result.stats.backend))throw Error('Native local PDF export unavailable');
    if(abort.signal.aborted)throw Object.assign(Error('PDF export cancelled'),{name:'AbortError',code:'aborted'});
    operation.phase('awaiting-output');
    const saved=await eoDesktop.pdf(file.token,result.bytes,print,plainCopy,operation.id,ticket);operation.finish(outputOutcome(saved,print));window.EOLastPdf={...saved,stats:result.stats};return !!saved;

  }catch(error){operation?.fail(error);fail(error)}finally{buttons(false)}
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
function modal(title){
 const box=document.createElement('dialog');box.className='desktop-options';
 const heading=document.createElement('h2');heading.textContent=title;box.append(heading);
 document.body.append(box);box.addEventListener('close',()=>box.remove(),{once:true});box.showModal();return box;
}
function modalButton(box,label,action){
 const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>Promise.resolve(action()).catch(fail));box.append(button);return button;
}
async function showOptions(){
 const options=await eoDesktop.recoveryOptions(),box=modal(t('options')),label=document.createElement('label'),enabled=document.createElement('input');
 enabled.type='checkbox';enabled.checked=options.enabled;enabled.id='recovery-enabled';label.append(enabled,document.createTextNode(t('autoRecover')));box.append(label);
 const interval=document.createElement('select');interval.id='recovery-interval';interval.setAttribute('aria-label',t('autoRecover'));
 if(file?.format==='pdf'){const pdfNote=document.createElement('p');pdfNote.textContent=t('pdfRecoveryOff');box.append(pdfNote);}
 for(const seconds of [15,30,60,120,300]){const option=document.createElement('option');option.value=seconds;option.textContent=String(seconds)+' s';option.selected=seconds===options.seconds;interval.append(option)}box.append(interval);
 const authorLabel=document.createElement('label'),author=document.createElement('input');author.id='author-name';author.maxLength=200;author.value=await eoDesktop.author();authorLabel.textContent=t('authorName');authorLabel.append(author);box.append(authorLabel);
 const aiController=(frame?.DE||frame?.SSE||frame?.PE||frame?.PDFE)?.getController('Common.Controllers.ElixirAI');
 if(aiController)modalButton(box,'Elixir — '+t('settings'),()=>{box.close();aiController.openSettings(false)});
 const note=document.createElement('p');note.textContent=t('saveCopy')+'. '+t('privacy');box.append(note);
 await addFontOptions(box);
 modalButton(box,t('save'),async()=>{await eoDesktop.recoverySettings({enabled:enabled.checked,seconds:Number(interval.value)});const name=await eoDesktop.authorSave(author.value);if(main?.api){main.api.User?.setUserName(name);main.api.DocInfo?.get_UserInfo()?.put_FullName(name);frame.AscCommon.UserInfoParser.setCurrentName(name);if(main.appOptions.user)main.appOptions.user.fullname=name;if(main.editorConfig.user)main.editorConfig.user.name=name;(frame.DE||frame.SSE||frame.PE||frame.PDFE).getController('Viewport').getView('Common.Views.Header')?.setUserName(frame.AscCommon.UserInfoParser.getParsedName(name));}box.close()});
 modalButton(box,t('cancel'),()=>box.close());
}
async function offerRecovery(){
 const entries=await eoDesktop.recoveryList();if(!entries.length)return;
 const box=modal(t('autoRecover'));
 for(const entry of entries){
  const row=document.createElement('section'),name=document.createElement('p');name.textContent=entry.name+(entry.modified?' — '+new Intl.DateTimeFormat(info.language,{dateStyle:'short',timeStyle:'short'}).format(new Date(entry.modified)):'');row.append(name);box.append(row);
  if(!entry.damaged)modalButton(row,t('restore'),async()=>{box.close();await run(()=>eoDesktop.recoveryRestore(entry.id))});
  modalButton(row,t('discard'),async()=>{await eoDesktop.recoveryRemove(entry.id);row.remove();if(!box.querySelector('section'))box.close()});
 }
 modalButton(box,t('cancel'),()=>box.close());
}
async function fontConsent(){try{if(!await eoDesktop.fontConsent())return false;if(frame){await installFonts(frame);await frame.Common.ElixirLocalFonts.readList();await frame.Common.ElixirLocalFonts.enable(main.api)}status(t('fontUse'));return true}catch(error){fail(error);return false}}
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
eoDesktop.onAction(async action=>{
  if(action==='prepare-close'){closeCheck=true;return}
  if(action==='resume-close'){closeCheck=false;if(pendingRequested)setTimeout(drainPending,0);return}
  if(action==='pending'){pendingRequested=true;return drainPending()}
  if(closeCheck && action!=='save-close')return;
  if(choosingSaveAs)return;
  if(action==='save-close'){try{if(await save())await eoDesktop.closeSaved();}catch(error){fail(error)}finally{closeCheck=false;if(pendingRequested)setTimeout(drainPending,0)}return}
  ({'external-error':()=>status(t('error')),settings:()=>showOptions(),fonts:()=>fontConsent(),home:()=>returnHome(),cancel:()=>abort?.abort(),'new-docx':()=>run(()=>eoDesktop.create('docx')),'new-xlsx':()=>run(()=>eoDesktop.create('xlsx')),'new-pptx':()=>run(()=>eoDesktop.create('pptx')),open:()=>run(()=>eoDesktop.choose()),save:()=>save(),'save-as':()=>save(true),pdf:()=>pdf(),print:()=>pdf(true)}[action]||(()=>{}))();
});
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();document.body.classList.add('drag')}});
document.addEventListener('dragleave',()=>document.body.classList.remove('drag'));document.addEventListener('drop',drop,true);
(async()=>{
 info=await eoDesktop.locale();window.EODesktopStrings=Object.freeze(info.strings);document.documentElement.lang=info.language;document.documentElement.dir=['ar','he','ur'].includes(info.language)?'rtl':'ltr';
 await refreshHome();pendingRequested=true;await drainPending();window.EODesktopReady=true;
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
