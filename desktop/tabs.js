// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
(()=>{
 const home=document.querySelector('#home-tab');
 const list=document.querySelector('#tabs'),add=document.querySelector('#new-tab'),move=document.querySelector('#move-tab'),error=document.querySelector('#tab-error'),errorText=document.querySelector('#tab-error-text'),dismiss=document.querySelector('#tab-error-dismiss');
 const quick=document.querySelector('#quick-access'),single=document.querySelector('#single-title'),search=document.querySelector('#command-search');
 // Existing Fluent UI System Icons (Microsoft, MIT); see tools/fluent-icons/LICENSE.
 const glyphs={"save":{"viewBox":"0 0 24 24","paths":["M3 5.75A2.75 2.75 0 0 1 5.75 3h9.96c.87 0 1.7.34 2.3.95L20.05 6c.6.6.95 1.43.95 2.3v9.96A2.75 2.75 0 0 1 18.25 21H5.75A2.75 2.75 0 0 1 3 18.25zM5.75 4.5c-.69 0-1.25.56-1.25 1.25v12.5c0 .69.56 1.25 1.25 1.25H6v-5.25C6 13.01 7 12 8.25 12h7.5c1.24 0 2.25 1 2.25 2.25v5.25h.25c.69 0 1.25-.56 1.25-1.25V8.29c0-.47-.18-.91-.51-1.24L16.95 5q-.4-.4-.95-.49v2.73c0 1.24-1 2.25-2.25 2.25h-4.5C8.01 9.5 7 8.5 7 7.25V4.5zm10.75 15v-5.25a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0-.75.75v5.25zm-8-15v2.75c0 .41.34.75.75.75h4.5c.41 0 .75-.34.75-.75V4.5z"]},"undo":{"viewBox":"-2 -2 24 24","paths":["M5 2.5a.5.5 0 0 0-1 0v4.9c0 .33.27.6.6.6h4.9a.5.5 0 0 0 0-1H5.9l3.48-3.02a4 4 0 0 1 5.25 6.04l-8.17 7.1a.5.5 0 0 0 .65.76l8.17-7.1a5 5 0 0 0-6.56-7.55L5 6.46z"]},"redo":{"viewBox":"-2 -2 24 24","paths":["M15 2.5a.5.5 0 0 1 1 0v4.9a.6.6 0 0 1-.6.6h-4.9a.5.5 0 0 1 0-1h3.6l-3.48-3.02a4 4 0 1 0-5.24 6.04l8.17 7.1a.5.5 0 1 1-.66.76l-8.17-7.1a5 5 0 1 1 6.56-7.55L15 6.46z"]}};
 for(const button of quick.querySelectorAll('button')){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),glyph=glyphs[button.dataset.quick];svg.setAttribute('viewBox',glyph.viewBox);svg.setAttribute('aria-hidden','true');for(const data of glyph.paths){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',data);svg.append(path);}button.append(svg);}

 for(const button of document.querySelectorAll('[data-quick]'))button.onclick=()=>{if(current?.activeId)action(window.eoTabs.quickAction(current.activeId,button.dataset.quick));};
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
  const compact=state.effectiveFrame==='compact',active=state.documents.find(item=>item.id===state.activeId);
  document.body.classList.toggle('compact',compact);
  document.querySelector('#tab-bar').hidden=!compact&&(state.openInTabs===false||state.stripVisible===false);
  list.hidden=compact&&(!state.openInTabs||!state.stripVisible);
  single.hidden=!compact||state.openInTabs&&state.stripVisible;single.dataset.hasDocument=String(!!active?.name);
  document.querySelector('#single-name').textContent=String(active?.name||'ElixirOffice').replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
  document.querySelector('#single-dirty').textContent=active?.dirty?'●':'';
  const type=/\.pdf$/i.test(active?.name||'')?'pdf':/\.(xlsx|xls|ods|csv|xltx|xlsm)$/i.test(active?.name||'')?'cell':/\.(pptx|ppt|odp|potx|ppsx)$/i.test(active?.name||'')?'slide':'word';
  const icon=single.querySelector('svg');icon.setAttribute('class','document-icon t-'+type);icon.querySelector('use').setAttribute('href','/example/local-assets/desktop-home/icons.svg#i-'+type);
  quick.hidden=!compact||!state.quick;
  for(const button of document.querySelectorAll('[data-quick]')){
   const value=state.quick?.[button.dataset.quick];button.hidden=!compact||!value?.visible;button.disabled=!value?.enabled;button.title=value?.label||'';button.setAttribute('aria-label',value?.label||button.dataset.quick);
   if(button===search)button.textContent=value?.label||'';
  }
  add.hidden=compact&&(!state.openInTabs||!state.stripVisible);move.hidden=compact&&(!state.openInTabs||!state.stripVisible);
  if(home)home.hidden=state.openInTabs===false||!state.showHomeTab;
  current=state;move.disabled=!state.activeId;const focused=list.contains(document.activeElement),focusedId=document.activeElement?.dataset?.document;
  list.replaceChildren();
  for(const item of state.documents){
   const group=document.createElement('div'),tab=document.createElement('button'),name=document.createElement('bdi'),dirty=document.createElement('span'),close=document.createElement('button');
   group.className='document-tab'+(item.id===state.activeId?' selected':'');group.setAttribute('role','presentation');
   tab.type='button';tab.className='document-label';tab.dataset.document=item.id;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(item.id===state.activeId));tab.tabIndex=item.id===state.activeId?0:-1;
   const label=String(item.name||strings.tabUntitled).replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim()||strings.tabUntitled;
   const type=/\.pdf$/i.test(label)?'pdf':/\.(xlsx|xls|ods|csv|xltx|xlsm)$/i.test(label)?'cell':/\.(pptx|ppt|odp|potx|ppsx)$/i.test(label)?'slide':'word';
   const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(icon.namespaceURI||'http://www.w3.org/2000/svg','use');
   icon.setAttribute('class','document-icon t-'+type);icon.setAttribute('aria-hidden','true');
   use.setAttribute('href','/example/local-assets/desktop-home/icons.svg#i-'+type);icon.append(use);
   const accessibleName='\u2068'+label+'\u2069';name.className='document-name';name.textContent=label;tab.title=label;
   tab.setAttribute('aria-description',strings.tabCloseHint+' '+strings.tabMoveHint);dirty.className='document-dirty';dirty.textContent=item.dirty?'●':'';dirty.setAttribute('aria-hidden','true');
   tab.setAttribute('aria-label',accessibleName+(item.dirty?', '+strings.tabModified:''));tab.append(icon,name,dirty);
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
 if(home)home.onclick=()=>action(window.eoTabs.home());
 add.onclick=()=>action(window.eoTabs.create());
 document.addEventListener('keydown',event=>{
  if(current?.effectiveFrame!=='compact'||!current.activeId||!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!(event.code==='KeyQ'||String(event.key).toLowerCase()==='q'))return;
  event.preventDefault();event.stopPropagation();action(window.eoTabs.quickAction(current.activeId,'search'));
 });
 window.eoTabs.onLimit(showLimit);
 window.eoTabs.onState(state=>{if(!initialized){if(!pendingState||state.revision>=pendingState.revision)pendingState=state;return;}render(state);});
 window.eoTabs.initial().then(value=>{
  strings=value.strings;document.documentElement.lang=value.language;document.dir=value.direction;
  if(home){home.textContent=strings.home||'Home';home.setAttribute('aria-label',strings.home||'Home');}
  dismiss.setAttribute('aria-label',strings.close||'Close');
  move.title=strings.tabMove;move.setAttribute('aria-label',strings.tabMove);
  list.setAttribute('aria-label',strings.tabsLabel);add.title=strings.tabNew;add.setAttribute('aria-label',strings.tabNew);initialized=true;render(pendingState&&pendingState.revision>value.state.revision?pendingState:value.state);
  if(limitNotice)showLimit();
  let lastAppearance;
  const appearance=()=>{const value=document.documentElement.getAttribute?.('data-eo-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');if(value===lastAppearance)return;lastAppearance=value;window.eoTabs.appearance(value).catch(failed);};
  appearance();matchMedia('(prefers-color-scheme:dark)').addEventListener('change',appearance);
  if(window.MutationObserver)new MutationObserver(appearance).observe(document.documentElement,{attributes:true,attributeFilter:['data-eo-theme']});
  window.EOTabShellReady=true;
 }).catch(failed);
})();
