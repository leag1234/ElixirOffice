// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
(()=>{
 const list=document.querySelector('#tabs'),add=document.querySelector('#new-tab'),move=document.querySelector('#move-tab'),error=document.querySelector('#tab-error'),errorText=document.querySelector('#tab-error-text'),dismiss=document.querySelector('#tab-error-dismiss');
 let current,pendingState,initialized=false,strings={},limitNotice=false,activeDrag=null,dragState=null;
 const DRAG_TYPE='application/x-elixiroffice-document-tab';
 function renderAfterDrag(){activeDrag=null;if(dragState){const value=dragState;dragState=null;render(value);}}
 function showLimit(){limitNotice=true;error.hidden=false;errorText.textContent=strings.tabLimit||'You can open up to 16 documents at a time. Close a tab before opening another document.';error.title=errorText.textContent;}
 function failed(cause){error.hidden=false;errorText.textContent=typeof strings.tabLimit==='string'&&String(cause?.message||'').endsWith(strings.tabLimit)?strings.tabLimit:(strings.tabActionFailed||'Could not finish the document action. Try again.');error.title=errorText.textContent;}
 function action(promise){Promise.resolve(promise).then(()=>{error.hidden=true;limitNotice=false;}).catch(failed);}
 dismiss.onclick=()=>{error.hidden=true;limitNotice=false;};
 function render(state){
  if(activeDrag){if(!dragState||state.revision>=dragState.revision)dragState=state;return;}
  if(current&&state.revision<current.revision)return;
  current=state;move.disabled=!state.activeId;const focused=list.contains(document.activeElement),focusedId=document.activeElement?.dataset?.document;
  list.replaceChildren();
  for(const item of state.documents){
   const group=document.createElement('div'),tab=document.createElement('button'),name=document.createElement('bdi'),dirty=document.createElement('span'),close=document.createElement('button');
   group.className='document-tab'+(item.id===state.activeId?' selected':'');group.setAttribute('role','presentation');
   tab.type='button';tab.className='document-label';tab.dataset.document=item.id;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(item.id===state.activeId));tab.tabIndex=item.id===state.activeId?0:-1;
   const label=String(item.name||strings.tabUntitled).replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim()||strings.tabUntitled;
   const accessibleName='\u2068'+label+'\u2069';name.className='document-name';name.textContent=label;tab.title=label;
   tab.setAttribute('aria-description',strings.tabCloseHint+' '+strings.tabMoveHint);dirty.className='document-dirty';dirty.textContent=item.dirty?'*':'';dirty.setAttribute('aria-hidden','true');
   tab.setAttribute('aria-label',accessibleName+(item.dirty?' *':''));tab.append(name,dirty);
   close.type='button';close.className='document-close';close.tabIndex=-1;close.textContent='×';close.setAttribute('aria-label',strings.tabClose.replace('{name}',()=>accessibleName));close.disabled=item.closing;
   group.draggable=true;
   group.ondragstart=event=>{
    if(event.target.closest?.('.document-close')){event.preventDefault();return;}
    const token=crypto.randomUUID();activeDrag=token;
    event.dataTransfer.setData(DRAG_TYPE,token);event.dataTransfer.effectAllowed='move';
    action(window.eoTabs.beginDrag(item.id,token).catch(error=>{renderAfterDrag();throw error;}));
   };
   group.ondragend=()=>{const token=activeDrag;renderAfterDrag();if(token)action(window.eoTabs.endDrag(token));};
   group.oncontextmenu=event=>{event.preventDefault();action(window.eoTabs.moveMenu(item.id));};
   tab.onclick=()=>action(window.eoTabs.activate(item.id));
   close.onclick=()=>action(window.eoTabs.close(item.id));
   group.append(tab,close);list.append(group);
  }
  if(focused){const target=[...list.querySelectorAll('[role=tab]')].find(node=>node.dataset.document===focusedId)||list.querySelector('[aria-selected=true]');target?.focus();}
 }
 list.onkeydown=event=>{
  const tabs=current?.documents;if(!tabs?.length)return;
  const index=tabs.findIndex(item=>item.id===document.activeElement?.dataset.document);
  if(index<0)return;
  if(event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey)){event.preventDefault();action(window.eoTabs.moveMenu(tabs[index].id));return;}
  if(event.key==='Delete'){event.preventDefault();action(window.eoTabs.close(tabs[index].id));return;}
  if(event.key==='Escape'||event.key==='F6'){event.preventDefault();action(window.eoTabs.activate(tabs[index].id));return;}
  let next;
  const forward=document.dir==='rtl'?'ArrowLeft':'ArrowRight',backward=document.dir==='rtl'?'ArrowRight':'ArrowLeft';
  if(event.key===forward)next=(index+1)%tabs.length;
  else if(event.key===backward)next=(index+tabs.length-1)%tabs.length;
  else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;
  if(next===undefined)return;
  event.preventDefault();action(window.eoTabs.activate(tabs[next].id,false).then(()=>{list.querySelector('[aria-selected=true]')?.focus();}));
 };
 move.onclick=()=>{if(current?.activeId)action(window.eoTabs.moveMenu(current.activeId));};
 document.querySelector('#tab-bar').ondragover=event=>{if([...event.dataTransfer.types].includes(DRAG_TYPE)){event.preventDefault();event.dataTransfer.dropEffect='move';}};
 document.querySelector('#tab-bar').ondrop=event=>{const token=event.dataTransfer.getData(DRAG_TYPE);if(token){event.preventDefault();action(window.eoTabs.dropDrag(token));}};
 add.onclick=()=>action(window.eoTabs.create());
 window.eoTabs.onLimit(showLimit);
 window.eoTabs.onState(state=>{if(!initialized){if(!pendingState||state.revision>=pendingState.revision)pendingState=state;return;}render(state);});
 window.eoTabs.initial().then(value=>{
  strings=value.strings;document.documentElement.lang=value.language;document.dir=value.direction;
  dismiss.setAttribute('aria-label',strings.close||'Close');
  move.title=strings.tabMove;move.setAttribute('aria-label',strings.tabMove);
  list.setAttribute('aria-label',strings.tabsLabel);add.title=strings.tabNew;add.setAttribute('aria-label',strings.tabNew);initialized=true;render(pendingState&&pendingState.revision>value.state.revision?pendingState:value.state);
  if(limitNotice)showLimit();
  window.EOTabShellReady=true;
 }).catch(failed);
})();
