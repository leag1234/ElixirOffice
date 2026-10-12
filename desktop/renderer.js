// SPDX-License-Identifier: AGPL-3.0-only
(() => {
'use strict';
const $=id=>document.getElementById(id);let editor,controller,file,abort,opening=false,frame,main,savingAs=false,closeCheck=false,pendingRequested=false,pendingRunning=false;
Object.defineProperty(window,'EODesktopState',{value:()=>{closeCheck=true;return {dirty:!!(controller&&(controller.isModified()||controller.hasPendingImages())),opening}}});
function blockDuringClose(event){if(closeCheck){event.preventDefault();event.stopImmediatePropagation()}}
for(const name of ['keydown','beforeinput','click','drop'])document.addEventListener(name,blockDuringClose,true);
const status=text=>$('message').textContent=text;
const fail=error=>{if(/Save cancelled$/.test(error.message)){window.EOLocalFailure=null;status('Save cancelled. Your changes are still here.');return}window.EOLocalFailure=error.message;status(error.message);console.error(error)};
function buttons(busy) {
  for(const id of ['open','fonts','save','save-as','pdf','print'])$(id).disabled=busy||(!['open','fonts'].includes(id)&&!controller);
  for(const button of document.querySelectorAll('[data-new]'))button.disabled=busy;
  $('cancel').disabled=!busy;
  if(!busy && pendingRequested)setTimeout(drainPending,0);
}
function script(win,url){return new Promise((resolve,reject)=>{const element=win.document.createElement('script');element.src=url;element.onload=resolve;element.onerror=()=>reject(Error('Cannot load bundled editor asset'));win.document.head.appendChild(element)})}
async function recent(){const items=await eoDesktop.recents();$('recent').replaceChildren();for(const item of items){const li=document.createElement('li'),button=document.createElement('button');button.textContent=item.name;button.onclick=()=>run(()=>eoDesktop.recent(item.id));li.append(button);$('recent').append(li)}}
async function installFonts(win) {
  const list=await eoDesktop.fonts();
  if(!list.length)return;
  const LF=win.Common?.ElixirLocalFonts;
  if(!LF)throw Error('Bundled local font interface missing');
  win.queryLocalFonts=async()=>list.map(face=>({...face,blob:async()=>new win.Blob([await eoDesktop.font(face.id)])}));
  LF.permission=async()=> 'granted';LF.setConsent(true);
}
async function drainPending(){
  if(!pendingRequested||pendingRunning||opening||$('open').disabled||closeCheck)return;
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
    $('home').hidden=true;$('workspace').hidden=false;status('Opening '+file.name+' locally…');
    await new Promise((resolve,reject)=>{
      editor=new DocsAPI.DocEditor('editor',{documentType:kind,type:'desktop',width:'100%',height:'100%',
        editorConfig:{mode:'edit',lang:navigator.language.split('-')[0],user:{id:'local',name:'Local user'},customization:{autosave:false,forcesave:false,plugins:false,macros:false},coEditing:{mode:'strict',change:false}},
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
            Object.assign(frame.EOWasmConvert.formats,{doc:66,xls:258,ppt:130});
            await installFonts(frame);
            main=(kind==='word'?frame.DE:kind==='cell'?frame.SSE:frame.PE).getController('Main');
            frame.Common.ElixirLocal.prepare(main.api,main);
            main.loadDocument({doc:{fileType:format,title:file.name,url:'_offline_',key:'local-'+crypto.randomUUID(),permissions:{edit:true,download:true,print:false,chat:false}}});
            controller=frame.Common.ElixirLocal.install(main.api,{format,getSignal:()=>abort.signal,
              onSave:async bytes=>{const saved=await eoDesktop.save(file.token,bytes,savingAs);file.name=saved.name;status('Saved '+saved.name);window.EOLastSave=saved},
              onBeforeSave:()=>{abort=new AbortController();buttons(true)},onAfterSave:()=>{buttons(false);updateDirty()},
              onError:fail,onProgress:progress=>status('Local conversion: '+progress.stage)});
            let input=new Uint8Array(file.bytes).buffer;
            if(file.sourceFormat && file.sourceFormat!==format)input=(await frame.EOWasmConvert.convert(new frame.Uint8Array(input),file.sourceFormat,format,{signal:abort.signal})).buffer;
            timings.beforeConvert=performance.now();const stats=await controller.open(input);timings.contentReady=performance.now();
            main.api.asc_registerCallback('asc_onDocumentModifiedChanged',updateDirty);
            for(const name of ['keydown','beforeinput','click','drop'])frame.document.addEventListener(name,blockDuringClose,true);
            frame.document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault()},true);
            frame.document.addEventListener('drop',drop,true);
            window.EOLocalSession={controller,format,stats,api:main.api,file,win:frame,timings,editableMs:performance.now()};
            await updateDirty();status('Editing '+file.name+' on this computer');resolve();
          } catch(error){reject(error)}
        },onError:event=>reject(Error(event.data?.errorDescription||'Local editor failed'))}
      });
    });
  } catch(error){controller=null;fail(error)}finally{abort.signal.removeEventListener('abort',cancelPreparation);cancelPreparation();opening=false;buttons(false);recent().catch(fail)}
}
async function updateDirty(){if(controller)await eoDesktop.state(file.token,controller.isModified()||controller.hasPendingImages())}
async function run(select){if(opening||$('open').disabled)return;window.EOLocalFailure=null;buttons(true);try{await open(await select())}catch(error){fail(error)}finally{buttons(false)}}
async function save(as=false){
  if(!controller||$('save').disabled)return false;window.EOLocalFailure=null;savingAs=as;
  try{await controller.save();await updateDirty();return !controller.isModified()}catch(error){fail(error);return false}finally{savingAs=false}
}
async function pdf(print=false){
  if(!controller||$('pdf').disabled)return;window.EOLocalFailure=null;buttons(true);
  try {
    status('Preparing PDF locally…');
    await script(frame,'/example/local-assets/sdkjs/common/clientpdf/clientpdf.js');
    await script(frame,'/example/local-assets/sdkjs/common/clientpdf/wasm-pdf.js');
    if(!frame.EODesktopPdf)await script(frame,'/example/local-assets/sdkjs/common/desktop/pdf.js');
    const result=await frame.EODesktopPdf(main.api,file.format);
    if(result.stats.backend!=='wasm')throw Error('Native local PDF export unavailable');
    const saved=await eoDesktop.pdf(file.token,result.bytes,print);window.EOLastPdf={...saved,stats:result.stats};
    status(print?(saved.printed?'Print job submitted':'Printing cancelled or failed: '+(saved.reason||'No print job submitted')):saved?'PDF saved on this computer':'PDF export cancelled');
  }catch(error){fail(error)}finally{buttons(false)}
}
async function fontConsent(){try{if(await eoDesktop.fontConsent()){if(frame){await installFonts(frame);await frame.Common.ElixirLocalFonts.readList();await frame.Common.ElixirLocalFonts.enable(main.api)}status('Computer fonts enabled')}}catch(error){fail(error)}}
async function drop(event){
  if(!event.dataTransfer?.files.length)return;
  // Only intercept Office documents; other drops retain the editor's behavior.
  if(!/\.(docx|doc|odt|xlsx|xls|ods|pptx|ppt|odp)$/i.test(event.dataTransfer.files[0].name))return;
  event.preventDefault();event.stopImmediatePropagation();document.body.classList.remove('drag');
  await run(()=>eoDesktop.drop(event.dataTransfer.files[0]));
}
$('open').onclick=()=>run(()=>eoDesktop.choose());$('save').onclick=()=>save();$('save-as').onclick=()=>save(true);$('pdf').onclick=()=>pdf();$('print').onclick=()=>pdf(true);$('fonts').onclick=fontConsent;$('cancel').onclick=()=>abort?.abort();
for(const button of document.querySelectorAll('[data-new]'))button.onclick=()=>run(()=>eoDesktop.create(button.dataset.new));
eoDesktop.onAction(async action=>{
  if(action==='resume-close'){closeCheck=false;if(pendingRequested)setTimeout(drainPending,0);return}
  if(action==='pending'){pendingRequested=true;return drainPending()}
  if(closeCheck && action!=='save-close')return;
  if(action==='save-close'){if(await save())await eoDesktop.closeSaved();else closeCheck=false;return}
  ({fonts:()=>fontConsent(),'new-docx':()=>run(()=>eoDesktop.create('docx')),'new-xlsx':()=>run(()=>eoDesktop.create('xlsx')),'new-pptx':()=>run(()=>eoDesktop.create('pptx')),open:()=>run(()=>eoDesktop.choose()),save:()=>save(),'save-as':()=>save(true),pdf:()=>pdf(),print:()=>pdf(true)}[action]||(()=>{}))();
});
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();document.body.classList.add('drag')}});
document.addEventListener('dragleave',()=>document.body.classList.remove('drag'));document.addEventListener('drop',drop,true);
recent().then(async()=>{pendingRequested=true;await drainPending()}).catch(fail).finally(()=>{window.EODesktopReady=true});
// SDK modified events update the title; close/open query the actual state.

})();
