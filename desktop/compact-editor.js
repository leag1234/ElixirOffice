// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
window.EOCompactChrome=Object.freeze({create({win,main,bridge,isBusy=()=>false}){
 const app=main.getApplication(),viewport=app.getController('Viewport'),header=viewport?.header||viewport?.getView?.('Common.Views.Header');
 const bar=app.getController('ElixirChrome')?.titleBar,doc=win.document,title=doc.getElementById('app-title'),layout=viewport?.viewport?.vlayout;
 let compact=false,disposed=false,last='',saved,observer,searchFrame;
 const clean=value=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200);
 const node=button=>button?.$el?.[0]||button?.el;
 function control(name){
  if(name==='search'){
   if(bar)return {visible:!!bar.$input?.[0],enabled:!!bar.$input?.[0]&&!isBusy(),label:clean(bar.$input?.[0]?.placeholder||bar.txtSearch||'Search')};
   const button=header?.btnSearch,element=node(button),visible=!!element&&element.nodeType===1&&!element.classList.contains('hidden')&&win.getComputedStyle(element).display!=='none';
   return {visible,enabled:visible&&!button.isDisabled()&&!isBusy(),label:clean(button?.hint||header?.tipSearch||'Search')};
  }
  const button=header?.[{save:'btnSave',undo:'btnUndo',redo:'btnRedo'}[name]],element=node(button);
  const visible=!!element&&element.nodeType===1&&!element.classList.contains('hidden')&&win.getComputedStyle(element).display!=='none';
  return {visible,enabled:visible&&!button.isDisabled()&&!isBusy(),label:clean(button?.hint||header?.[{save:'tipSave',undo:'tipUndo',redo:'tipRedo'}[name]]||name)};
 }
 function attachSearch(){
  if(!compact||saved.search)return;
  const search=bar?.$search?.[0];if(!search)return;
  Object.assign(saved,{search,parent:search.parentNode,next:search.nextSibling,hidden:search.hidden,focus:bar.focusSearch,close:bar.closeSearch});
  doc.body.append(search);search.classList.add('eo-compact-search');search.hidden=true;
  bar.focusSearch=function(){search.hidden=false;return saved.focus.apply(this,arguments)};
  bar.closeSearch=function(){const result=saved.close.apply(this,arguments);search.hidden=true;return result};
 }
 function publish(){
  if(disposed)return;attachSearch();
  const state=Object.fromEntries(['save','undo','redo','search'].map(name=>[name,control(name)])),key=JSON.stringify(state);
  if(key===last)return;last=key;void bridge.chromeState(state).catch(()=>{last=''});
 }
 function layoutChanged(){layout?.doLayout();win.Common?.NotificationCenter?.trigger('layout:changed','header');}
 function configure(value){
  if(disposed)return;
  const next=value===true;
  if(!next){win.cancelAnimationFrame(searchFrame);searchFrame=null;}
  if(next===compact){publish();return;}
  if(next){
   const item=layout?.getItem('title'),settings=win.Common?.Utils?.InternalSettings;
   if(!title||!item||!settings)throw Error('Compact editor layout unavailable');
   saved={item,height:item.height,setting:settings.get('document-title-height'),settings};
   item.height=0;settings.set('document-title-height',0);doc.body.classList.add('eo-compact-editor');compact=true;attachSearch();
  }else{
   const value=saved;
   value.item.height=value.height;value.settings.set('document-title-height',value.setting);doc.body.classList.remove('eo-compact-editor');
   if(value.search){
    bar.closeSearch();bar.focusSearch=value.focus;bar.closeSearch=value.close;
    value.search.classList.remove('eo-compact-search');value.search.hidden=value.hidden;
    if(value.parent.isConnected)value.parent.insertBefore(value.search,value.next?.parentNode===value.parent?value.next:null);else value.search.remove();
   }
   compact=false;saved=null;
  }
  layoutChanged();publish();
 }
 const style=doc.createElement('style');
 // Center the native header logo in its full-height box, independently of inline font metrics.
 style.textContent='#app-title #header-logo{display:flex;align-items:center}.eo-compact-editor #app-title{display:none!important}body .eo-compact-search{position:fixed!important;top:8px!important;left:50%!important;right:auto!important;transform:translateX(-50%);width:min(440px,calc(100vw - 32px))!important;z-index:10020!important;background:var(--background-toolbar,#fff);box-shadow:0 4px 20px #0003}body .eo-compact-search[hidden]{display:none!important}';
 doc.head.append(style);
 if(header){observer=new win.MutationObserver(publish);const container=doc.getElementById('box-document-title');if(container)observer.observe(container,{attributes:true,subtree:true,childList:true,attributeFilter:['disabled','style','class','title','aria-label']});}
 publish();
 return Object.freeze({
  configure,refresh:publish,
  perform(name){
   if(disposed||!compact||!['save','undo','redo','search'].includes(name))return false;
   attachSearch();const state=control(name);if(!state.visible||!state.enabled)return false;
   if(name==='search'){
    // Moving focus between native WebContents lets the SDK focus its canvas.
    // Open the original search after that handoff, without racing its textarea.
    win.cancelAnimationFrame(searchFrame);
    searchFrame=win.requestAnimationFrame(()=>{searchFrame=win.requestAnimationFrame(()=>{
     searchFrame=null;if(disposed||!compact||!control('search').enabled)return;
     if(bar?.focusSearch)bar.focusSearch();else (header.btnSearch.cmpEl?.[0]||node(header.btnSearch)?.querySelector('button')||node(header.btnSearch))?.click();
    })});
   }
   else header.fireEvent(name,header);
   return true;
  },
  dispose(){if(disposed)return;configure(false);disposed=true;observer?.disconnect();style.remove();}
 });
}});
