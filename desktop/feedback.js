// SPDX-License-Identifier: AGPL-3.0-only
(function(factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else window.EOOperationFeedback=factory();
})(function(){
 'use strict';
 const fallback={opOpening:'Opening {name}…',opOpened:'Opened: {name}',opDecrypting:'Decrypting {name}…',opEncrypting:'Encrypting {name}…',opPreparing:'Preparing…',opRuntime:'Loading conversion engine…',opInitializing:'Initializing…',opConverting:'Converting…',opAwaiting:'Waiting for your choice…',opWriting:'Saving…',opReady:'File ready: {name}',opCancelled:'Cancelled',opFailed:'Could not finish: {reason}',opWarning:'Saved, but disk durability could not be confirmed. Keep the backup and save again before closing.',opDownload:'Download started: {name}',opPrint:'Sent to the print system',opUnconfirmed:'Operation finished; file completion is unconfirmed.',opPages:'Preparing pages: {completed} of {total}',opShow:'Show in folder',opOpen:'Open file',opCopyDiagnostics:'Copy diagnostics',opDismiss:'Dismiss'};
 const terminal=new Set(['ready','warning','complete','error','cancelled']);
 function isolate(value){return '\u2068'+String(value??'').replace(/[\u202a-\u202e\u2066-\u2069]/g,'')+'\u2069';}
 function label(event,strings={}){
  const keys={preparing:'opPreparing','loading-runtime':'opRuntime',initializing:'opInitializing',converting:'opConverting','awaiting-user':'opAwaiting','awaiting-output':'opWriting',writing:'opWriting',ready:'opReady',warning:'opWarning',cancelled:'opCancelled',error:'opFailed'};
  let key=keys[event.phase];
  if(event.kind==='print'&&event.phase==='awaiting-output')key='opPreparing';
  if(event.kind==='open'&&!terminal.has(event.phase))key='opOpening';
  if(event.phase==='converting'&&['decrypting','encrypting'].includes(event.purpose))key=event.purpose==='decrypting'?'opDecrypting':'opEncrypting';
  if(event.phase==='complete')key=event.outcome==='opened'?'opOpened':event.outcome==='download-started'?'opDownload':['printed','print-started'].includes(event.outcome)?'opPrint':'opUnconfirmed';
  if(!terminal.has(event.phase)&&Number.isInteger(event.completed)&&Number.isInteger(event.total)&&event.total>0)key='opPages';
  return (strings[key]||fallback[key]||fallback.opPreparing).replace(/\{(name|reason|completed|total)\}/g,(_match,key)=>(['name','reason'].includes(key)?isolate(event[key]):String(event[key]??'')));
 }
 function paint(view){
  return new Promise(resolve=>{
   let ended=false,timer;
   const finish=()=>{if(ended)return;ended=true;view.clearTimeout(timer);resolve();};
   timer=view.setTimeout(finish,100);
   // Hidden/minimized windows must still complete saves; no progress is invented.
   if(view.document.hidden){view.setTimeout(finish,0);return;}
   view.requestAnimationFrame(()=>view.requestAnimationFrame(finish));
  });
 }
 // The system print dialog owns the visible choice; keep its live announcement.
 function nativePrintChoice(event){return event?.kind==='print'&&event.phase==='awaiting-user';}
 function canCancel(event){return event.cancellable!==false&&['pdf-export','pdf-save','print'].includes(event.kind)&&['preparing','loading-runtime','initializing','converting'].includes(event.phase);}
 function mount(document,container,strings={},actions={}){
  const text=document.createElement('p'),bar=document.createElement('progress'),links=document.createElement('div'),announcement=document.createElement('span'),notice=document.createElement('div');
  notice.className='eo-operation';text.className='eo-operation-text';text.setAttribute('aria-hidden','true');announcement.className='eo-operation-live';announcement.setAttribute('aria-live','polite');announcement.setAttribute('aria-atomic','true');announcement.setAttribute('role','status');
  bar.setAttribute('aria-label',strings.opPreparing||fallback.opPreparing);
  links.className='eo-operation-actions';notice.append(text,bar,links);container.append(notice,announcement);notice.hidden=true;
  let latest=null,scope=null,id=null,closed=false,lastAnnouncement=0,previousFocus,obscured=false,dismissed=false,actionKey=null;
  const view=document.defaultView||globalThis;
  let timer=null,due=0,remaining=8000,hovered=false;
  function quietOpen(event){return event?.kind==='open'&&event.phase==='complete'&&event.outcome==='opened'&&!notice.classList.contains('eo-operation-backstage');}
  function hasFileActions(event){return event.phase==="ready"&&!!event.artifactId&&!!(actions.open||actions.show);}
  function clearTimer(){if(timer!==null)view.clearTimeout(timer);timer=null;}
  function pauseTimer(){if(timer!==null)remaining=Math.max(0,due-view.Date.now());clearTimer();}
  function schedule(){
   if(closed||dismissed||obscured||hovered||notice.contains(document.activeElement)||!latest||quietOpen(latest)||hasFileActions(latest)||!["ready","complete","cancelled"].includes(latest.phase)||notice.classList.contains("eo-operation-backstage"))return;
   clearTimer();due=view.Date.now()+remaining;
   timer=view.setTimeout(()=>{timer=null;dismissed=true;notice.hidden=true;},remaining);
  }
  notice.addEventListener("mouseenter",()=>{hovered=true;pauseTimer();});
  notice.addEventListener("mouseleave",()=>{hovered=false;schedule();});
  notice.addEventListener("focusin",pauseTimer);
  notice.addEventListener("focusout",()=>view.setTimeout(()=>{if(!notice.contains(document.activeElement))schedule();},0));
  function reset(nextScope){clearTimer();remaining=8000;actionKey=null;scope=nextScope;id=null;latest=null;notice.hidden=true;announcement.textContent="";links.replaceChildren();bar.hidden=true;}
  function button(key,run){
   const node=document.createElement('button');node.type='button';node.textContent=key==='cancel'?(strings.cancel||'Cancel'):(strings[key]||fallback[key]);
   node.addEventListener('click',()=>{const actionEvent=latest;return Promise.resolve().then(run).catch(error=>{
    if(closed||latest?.id!==actionEvent?.id||scope!==actionEvent?.scope)return;
    const event={...actionEvent,phase:'error',reason:error};
    const fallbackError=()=>update({...event,reason:strings.error||'Unknown local file error'});
    try{if(actions.error){const result=actions.error(event);if(result?.catch)result.catch(fallbackError);}else fallbackError();}catch{fallbackError();}
   });});
   links.append(node);
  }
  function update(event){
   if(closed||event.scope!==scope)return false;
   if(event.phase==='preparing'){dismissed=false;id=event.id;if(!notice.contains(document.activeElement))previousFocus=document.activeElement;}else if(event.id!==id)return false;
   latest=event;notice.hidden=obscured||dismissed||nativePrintChoice(event)||quietOpen(event);const ended=terminal.has(event.phase),message=label(event,strings);
   notice.setAttribute('aria-busy',String(!ended));announcement.setAttribute('role',event.phase==='error'?'alert':'status');text.textContent=message;
   // Keep visual progress current; throttle page-count announcements for assistive technology.
   if(ended||event.phase!=='converting'||Date.now()-lastAnnouncement>=1000){announcement.textContent=message;lastAnnouncement=Date.now();}
   bar.hidden=ended;bar.setAttribute('aria-label',message);
   if(!ended&&Number.isInteger(event.completed)&&Number.isInteger(event.total)&&event.total>0){bar.max=event.total;bar.value=event.completed;}
   else bar.removeAttribute('value');
   if(!ended)clearTimer();
   const nextKey=ended?[event.id,event.phase,event.artifactId||''].join('/'):(actions.cancel&&canCancel(event)?'cancel/'+event.id:'');
   // Keep keyboard focus on Cancel while real page/stage events update the bar.
   if(nextKey!==actionKey){
    clearTimer();remaining=8000;
    const restore=links.contains(document.activeElement);links.replaceChildren();actionKey=nextKey;
    if(!ended&&actions.cancel&&canCancel(event))button('cancel',()=>actions.cancel(event.id));
    if(ended){
     if(event.phase==='error'&&['save','save-as','export','pdf-save','pdf-export'].includes(event.kind)&&actions.diagnostics)button('opCopyDiagnostics',()=>actions.diagnostics());
     if(event.phase==='ready'&&event.artifactId){
      if(actions.open)button('opOpen',()=>actions.open(event.artifactId));
      if(actions.show)button('opShow',()=>actions.show(event.artifactId));
     }
     button('opDismiss',()=>{clearTimer();dismissed=true;notice.hidden=true;if(previousFocus?.isConnected)previousFocus.focus();});
    }
    if(restore&&previousFocus?.isConnected)previousFocus.focus();
   }
   if(timer===null)schedule();
   return true;
  }
  return {update,reset,obscure(value){if(value)pauseTimer();obscured=!!value;notice.hidden=!latest||dismissed||obscured||nativePrintChoice(latest)||quietOpen(latest);if(!obscured)schedule();},dispose(){closed=true;clearTimer();notice.remove();announcement.remove();},element:notice};
 }
 return {mount,label,fallback,paint,canCancel,isolate};
});
