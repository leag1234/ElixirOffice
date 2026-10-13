// SPDX-License-Identifier: AGPL-3.0-only
(() => {
'use strict';
const $=id=>document.getElementById(id);let editor,controller,file,abort,opening=false,frame,main,savingAs=false,closeCheck=false,pendingRequested=false,pendingRunning=false;
Object.defineProperty(window,'EODesktopState',{value:(lock=true)=>{if(lock)closeCheck=true;return {dirty:!!(controller&&(controller.isModified()||controller.hasPendingImages())),opening}}});
function blockDuringClose(event){if(closeCheck||info?.capture){event.preventDefault();event.stopImmediatePropagation()}}
for(const name of ['keydown','beforeinput','click','drop'])document.addEventListener(name,blockDuringClose,true);
let info,operationBusy=false,backstage,recoveryBusy=false;
const t=key=>info?.strings[key]||key;
const status=text=>{$('message').textContent=text;$('message').hidden=!text;};
async function refreshHome(view='home'){const data=await eoDesktop.home();EODesktopHome.render($('home'),{...data,...info},desktopAction,view);}
async function returnHome(){if(!await eoDesktop.returnHome())return;controller?.dispose();controller=null;editor?.destroyEditor();editor=null;file=null;frame=null;main=null;window.EOLocalSession=null;$('workspace').hidden=true;$('home').hidden=false;status('');await refreshHome();}
function desktopAction(action,value){return ({open:()=>run(()=>eoDesktop.choose()),new:()=>run(()=>eoDesktop.create(value)),template:()=>run(()=>eoDesktop.template(value)),recent:()=>run(()=>eoDesktop.recent(value)),save:()=>save(),'save-as':()=>save(true),pdf:()=>pdf(),print:()=>pdf(true),help:()=>eoDesktop.help(),settings:()=>showOptions(),fonts:()=>fontConsent(),home:()=>returnHome(),cancel:()=>abort?.abort()}[action]||(()=>{}))();}

const fail=error=>{if(/Save cancelled$/.test(error.message)){window.EOLocalFailure=null;status(t('cancel'));return}window.EOLocalFailure=error.message;status(t('error'));console.error(error)};
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
  if(!pendingRequested||pendingRunning||opening||operationBusy||closeCheck)return;
  pendingRequested=false;pendingRunning=true;
  try{await run(async()=>{const selected=await eoDesktop.initial();if(selected?.morePending)pendingRequested=true;return selected})}
  finally{pendingRunning=false;if(pendingRequested)setTimeout(drainPending,0)}
}
async function open(selected) {
  if(!selected||opening)return;
  opening=true;buttons(true);window.EOLocalFailure=null;window.EOLocalSession=null;abort=new AbortController();
  let preparedWorker;
  const cancelPreparation=()=>{preparedWorker?.terminate();preparedWorker=null};
  abort.signal.addEventListener('abort',cancelPreparation,{once:true});
  try {
    controller?.dispose();controller=null;editor?.destroyEditor();file=selected;
    const timings={selected:performance.now()};
    // Compile for this opening while the editor UI loads; never reuse a document FS.
    preparedWorker=new Worker('/example/local-assets/sdkjs/common/desktop/legacy-worker.js');
    preparedWorker.postMessage({prepare:true,runtime:file.runtime});
    const format=file.format,kind={docx:'word',odt:'word',xlsx:'cell',ods:'cell',pptx:'slide',odp:'slide'}[format];
    if(!kind)throw Error('Unsupported local format');
    $('home').hidden=true;$('workspace').hidden=false;status(t('open')+' '+file.name+'…');
    const authorName=await eoDesktop.author();
    await new Promise((resolve,reject)=>{
      editor=new DocsAPI.DocEditor('editor',{documentType:kind,type:'desktop',width:'100%',height:'100%',
        editorConfig:{mode:'edit',lang:info.language,user:{id:'local',name:authorName},customization:{autosave:false,forcesave:false,plugins:false,macros:false,features:{featuresTips:false}},coEditing:{mode:'strict',change:false}},
        events:{onAppReady:async()=>{
          if(controller)return;
          try {
            timings.appReady=performance.now();frame=document.querySelector('#workspace iframe').contentWindow;
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
            main=(kind==='word'?frame.DE:kind==='cell'?frame.SSE:frame.PE).getController('Main');
            frame.Common.ElixirLocal.prepare(main.api,main);
            main.loadDocument({doc:{fileType:format,title:file.name,url:'_offline_',key:'local-'+crypto.randomUUID(),permissions:{edit:true,download:true,print:false,chat:false}}});
            controller=frame.Common.ElixirLocal.install(main.api,{format,getSignal:()=>abort.signal,
              onSave:async bytes=>{const saved=await eoDesktop.save(file.token,bytes,savingAs);file.name=saved.name;status(t('save')+' '+saved.name);file.recoveryVersion=saved.recoveryVersion;window.EOLastSave=saved},
              onBeforeSave:()=>{abort=new AbortController();buttons(true)},onAfterSave:()=>{buttons(false);updateDirty()},
              onError:fail,onProgress:progress=>status(t('open')+'…')});
            let input=new Uint8Array(file.bytes).buffer;
            if(!input.byteLength&&['txt','csv'].includes(file.sourceFormat))input=new Uint8Array([10]).buffer;
            if(file.sourceFormat && file.sourceFormat!==format)input=(await frame.EOWasmConvert.convert(new frame.Uint8Array(input),file.sourceFormat,format,{signal:abort.signal})).buffer;
            timings.beforeConvert=performance.now();const stats=await controller.open(input);timings.contentReady=performance.now();
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
            status('');resolve();
          } catch(error){reject(error)}
        },onError:event=>reject(Error(event.data?.errorDescription||'Local editor failed'))}
      });
    });
  } catch(error){controller=null;fail(error)}finally{abort.signal.removeEventListener('abort',cancelPreparation);cancelPreparation();opening=false;buttons(false);recent().catch(fail)}
}
async function updateDirty(){if(controller)await eoDesktop.state(file.token,controller.isModified()||controller.hasPendingImages())}
async function run(select){if(opening||operationBusy)return;window.EOLocalFailure=null;buttons(true);try{await open(await select())}catch(error){fail(error)}finally{buttons(false)}}
async function save(as=false){
  if(!controller||operationBusy)return false;if(as)return chooseExport();window.EOLocalFailure=null;savingAs=as;
  try{await controller.save();await updateDirty();if(!controller.isModified())await eoDesktop.recoveryClear(file.token);return !controller.isModified()}catch(error){fail(error);return false}finally{savingAs=false}
}
async function chooseExport(){
 const formats=await eoDesktop.exportFormats(file.token),box=modal(t('saveAs'));
 if(formats.includes('csv')){
  const warning=frame.SSE.getController('LeftMenu').warnDownloadCsv,plain=frame.document.createElement('div'),note=document.createElement('p');
  plain.innerHTML=warning;note.textContent=plain.textContent;box.append(note);
 }
 for(const format of formats)modalButton(box,format.toUpperCase(),async()=>{box.close();await exportAs(format)});
 modalButton(box,t('cancel'),()=>box.close());return false;
}
async function exportAs(format){
 if(!controller||operationBusy)return false;
 if(format==='pdf'){await pdf();return true;}
 if(format===file.format){
  savingAs=true;try{await controller.save();await updateDirty();if(!controller.isModified())await eoDesktop.recoveryClear(file.token);return !controller.isModified()}catch(error){fail(error);return false}finally{savingAs=false}
 }
 buttons(true);abort=new AbortController();
 try{
  const snap=await controller.snapshot();
  const bytes=await frame.EOWasmConvert.convert(snap.bytes,snap.format,format,{resources:snap.resources,signal:abort.signal});
  const saved=await eoDesktop.export(file.token,bytes,format);window.EOLastExport=saved;status(t('save')+' '+saved.name);return true;
 }catch(error){fail(error);return false}finally{buttons(false)}
}
async function pdf(print=false){
  if(!controller||operationBusy)return;window.EOLocalFailure=null;buttons(true);
  try {
    status(t('pdf')+'…');
    await script(frame,'/example/local-assets/sdkjs/common/clientpdf/clientpdf.js');
    await script(frame,'/example/local-assets/sdkjs/common/clientpdf/wasm-pdf.js');
    if(!frame.EODesktopPdf)await script(frame,'/example/local-assets/sdkjs/common/desktop/pdf.js');
    const result=await frame.EODesktopPdf(main.api,file.format);
    if(result.stats.backend!=='wasm')throw Error('Native local PDF export unavailable');
    const saved=await eoDesktop.pdf(file.token,result.bytes,print);window.EOLastPdf={...saved,stats:result.stats};
    status(print?(saved.printed?t('print'):t('cancel')):saved?t('pdf'):t('cancel'));
  }catch(error){fail(error)}finally{buttons(false)}
}
async function recoveryCopy(){
 if(!controller||opening||operationBusy||recoveryBusy||closeCheck||info.capture||!controller.isModified())return;
 recoveryBusy=true;const selected=file,local=controller,editorWindow=frame,version=file.recoveryVersion||0;
 try{
  const snap=await local.snapshot();
  const result=await editorWindow.EOWasmConvert.convert(snap.bytes,snap.format,selected.format,{resources:snap.resources});
  if(controller===local&&file===selected)await eoDesktop.recoverySave(selected.token,version,result);
 }catch(error){status(t('saveError'))}finally{recoveryBusy=false}
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
 for(const seconds of [15,30,60,120,300]){const option=document.createElement('option');option.value=seconds;option.textContent=String(seconds)+' s';option.selected=seconds===options.seconds;interval.append(option)}box.append(interval);
 const authorLabel=document.createElement('label'),author=document.createElement('input');author.id='author-name';author.maxLength=200;author.value=await eoDesktop.author();authorLabel.textContent=t('authorName');authorLabel.append(author);box.append(authorLabel);
 const aiController=(frame?.DE||frame?.SSE||frame?.PE)?.getController('Common.Controllers.ElixirAI');
 if(aiController)modalButton(box,'Elixir — '+t('settings'),()=>{box.close();aiController.openSettings(false)});
 const note=document.createElement('p');note.textContent=t('saveCopy')+'. '+t('privacy');box.append(note);
 modalButton(box,t('fontUse'),()=>{box.close();return fontConsent()});
 modalButton(box,t('save'),async()=>{await eoDesktop.recoverySettings({enabled:enabled.checked,seconds:Number(interval.value)});const name=await eoDesktop.authorSave(author.value);if(main?.api){main.api.User?.setUserName(name);main.api.DocInfo?.get_UserInfo()?.put_FullName(name);frame.AscCommon.UserInfoParser.setCurrentName(name);if(main.appOptions.user)main.appOptions.user.fullname=name;if(main.editorConfig.user)main.editorConfig.user.name=name;(frame.DE||frame.SSE||frame.PE).getController('Viewport').getView('Common.Views.Header')?.setUserName(frame.AscCommon.UserInfoParser.getParsedName(name));}box.close()});
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
async function fontConsent(){try{if(await eoDesktop.fontConsent()){if(frame){await installFonts(frame);await frame.Common.ElixirLocalFonts.readList();await frame.Common.ElixirLocalFonts.enable(main.api)}status(t('fontUse'))}}catch(error){fail(error)}}
async function drop(event){
  if(!event.dataTransfer?.files.length)return;
  // Only intercept Office documents; other drops retain the editor's behavior.
  if(!/\.(docx|doc|odt|rtf|txt|docm|dotx|xlsx|xls|ods|csv|xlsm|xltx|pptx|ppt|odp|ppsx|potx)$/i.test(event.dataTransfer.files[0].name))return;
  event.preventDefault();event.stopImmediatePropagation();document.body.classList.remove('drag');
  await run(()=>eoDesktop.drop(event.dataTransfer.files[0]));
}

eoDesktop.onAction(async action=>{
  if(action==='resume-close'){closeCheck=false;if(pendingRequested)setTimeout(drainPending,0);return}
  if(action==='pending'){pendingRequested=true;return drainPending()}
  if(closeCheck && action!=='save-close')return;
  if(action==='save-close'){if(await save())await eoDesktop.closeSaved();else closeCheck=false;return}
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
