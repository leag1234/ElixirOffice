// SPDX-License-Identifier: AGPL-3.0-only
(function(factory){if(typeof module==='object'&&module.exports)module.exports=factory();else window.EODesktopPdfCompatibility=factory();})(function(){
 'use strict';
 return function(win,main,strings,status){
  const api=main.api,viewer=api.DocumentRenderer||api.getDocumentRenderer(),parent=viewer.parent;
  if(!api.DocInfo?.get_OfflineApp()||!parent)throw Error('Local PDF scrolling adapter requires an offline viewer');
  const hint=()=>status(strings.pdfTextUnavailable||'Editing the original text of a PDF is not available yet; you can annotate, comment and fill in forms');
  const originalWheel=parent.onmousewheel;parent.onmousewheel=null;
  parent.removeEventListener('DOMMouseScroll',viewer.onMouseWhell,false);
  let zoomDelta=0,zoomTime=0;
  function wheel(event){
   if(event.ctrlKey||event.metaKey){
    if(event.deltaY){
     event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
     const now=Date.now(),scale=event.deltaMode===1?45:event.deltaMode===2?(viewer.height||800):1;
     const delta=Math.max(-300,Math.min(300,event.deltaY*scale));
     if(now-zoomTime>250||Math.sign(delta)!==Math.sign(zoomDelta))zoomDelta=0;
     zoomTime=now;zoomDelta+=delta;
     while(Math.abs(zoomDelta)>=100){zoomDelta<0?api.zoomIn():api.zoomOut();zoomDelta+=zoomDelta<0?100:-100;}
    }
    return;
   }
   zoomDelta=0;
   const scale=event.deltaMode===1?45:event.deltaMode===2?(viewer.height||parent.clientHeight||800):1;
   let x=event.deltaX*scale,y=event.deltaY*scale;
   if(event.shiftKey&&viewer.isVisibleHorScroll){x=x||y;y=0;}
   const normalized={wheelDelta:y?-y*120/45:0,wheelDeltaY:y?-y*120/45:0,wheelDeltaX:x?-x*120/45:0,deltaX:x,deltaY:y,ctrlKey:false,metaKey:false,altKey:event.altKey,shiftKey:event.shiftKey,
    pageX:event.pageX,pageY:event.pageY,clientX:event.clientX,clientY:event.clientY,target:event.target,srcElement:event.target,
    preventDefault:()=>event.preventDefault(),stopPropagation:()=>event.stopPropagation()};
   // Reuse the SDK's field scrolling, axis choice and pointer-update behavior.
   viewer.onMouseWhell(normalized);
  }
  parent.addEventListener('wheel',wheel,{passive:false,capture:true});
  const options=main.appOptions;options.canPDFEdit=false;options.isPDFEdit=false;options.isEditTextSupport=false;
  const holder=win.PDFE.getController('DocumentHolder'),editPage=api.asc_EditPage;
  const guardedEdit=()=>{hint();return false;};api.asc_EditPage=guardedEdit;
  holder?.documentHolder?.btnEditText?.cmpEl?.hide();
  const notifications=win.Common.NotificationCenter,trigger=notifications.trigger;
  function localTrigger(name,...args){if(name==='pdf:mode-apply'&&args[0]==='edit'){hint();return false;}return trigger.call(this,name,...args);}
  notifications.trigger=localTrigger;
  function keydown(event){
   const target=event.target,doc=api.getPDFDoc();
   if(target?.isContentEditable||target?.closest?.('input,textarea,[contenteditable=true]')||doc.activeForm||doc.mouseDownAnnot||doc.GetActiveForm?.()||doc.GetActiveAnnot?.())return;
   if(!viewer.file?.Selection?.IsSelection)return;
   const key=event.key||'',command=event.ctrlKey||event.metaKey;
   if((!command&&!event.altKey&&(key.length===1||key==='Delete'||key==='Backspace'))||(command&&['x','v'].includes(key.toLowerCase()))){
    event.preventDefault();event.stopImmediatePropagation();hint();
   }
  }
  win.document.addEventListener('keydown',keydown,true);
  return {dispose(){
   parent.removeEventListener('wheel',wheel,{passive:false,capture:true});if(parent.onmousewheel===null)parent.onmousewheel=originalWheel;
   parent.addEventListener('DOMMouseScroll',viewer.onMouseWhell,false);
   win.document.removeEventListener('keydown',keydown,true);if(api.asc_EditPage===guardedEdit)api.asc_EditPage=editPage;
   if(notifications.trigger===localTrigger)notifications.trigger=trigger;
  }};
 };
});
