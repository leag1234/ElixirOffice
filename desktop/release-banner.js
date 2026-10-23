// SPDX-License-Identifier: AGPL-3.0-only
(() => {
'use strict';
function create({document:doc=window.document,bridge,t}){
 const view=doc.defaultView,style=doc.documentElement.style,key='--desktop-release-height',previous=style.getPropertyValue(key);
 let root=null,current=null,disposed=false,revision=0,lastFocus=doc.activeElement;
 const reserve=()=>style.setProperty(key,(root?Math.ceil(root.getBoundingClientRect().height):0)+'px');
 const observer=view.ResizeObserver?new view.ResizeObserver(reserve):null;
 const focus=event=>{if(!root||!root.contains(event.target))lastFocus=event.target;};
 doc.addEventListener('focusin',focus);view.addEventListener('resize',reserve);
 function hide(){
  const restore=root?.contains(doc.activeElement)?lastFocus:null;
  observer?.disconnect();root?.remove();root=null;current=null;reserve();
  if(restore?.isConnected)restore.focus({preventScroll:true});
 }
 async function refresh(){
  const at=revision;
  try{const value=await bridge.releaseState();if(!disposed&&at===revision)render(value);}catch{}
 }
 async function perform(action,version){
  try{await bridge.releaseAction(action,version);if(!disposed)await refresh();}catch{}
 }
 function render(value){
  if(disposed)return;
  if(!value||typeof value.version!=='string'||!value.version||value.version.length>128){hide();return;}
  if(root&&current?.version===value.version)return;
  const focusedAction=root?.contains(doc.activeElement)?doc.activeElement.dataset.releaseAction:null;
  if(!root){
   root=doc.createElement('aside');root.className='desktop-release-notice';root.setAttribute('role','status');root.setAttribute('aria-live','polite');doc.body.append(root);
   observer?.observe(root);
  }
  current={version:value.version};root.replaceChildren();
  const text=doc.createElement('strong');text.className='desktop-release-title';text.textContent=t('releaseAvailable').replace('{version}',value.version);root.append(text);
  const actions=doc.createElement('div');actions.className='desktop-release-actions';root.append(actions);
  for(const [action,label,primary] of [['notes','releaseNotes',false],['download','releaseDownload',true],['later','releaseLater',false],['skip','releaseSkip',false]]){
   const button=doc.createElement('button');button.type='button';button.className=primary?'btn btn-primary':'btn';button.dataset.releaseAction=action;button.textContent=t(label);
   // Capture this displayed version; a later push cannot retarget an old click.
   const expected=value.version;button.addEventListener('click',()=>{void perform(action,expected)});actions.append(button);
   if(action===focusedAction)button.focus({preventScroll:true});
  }
  reserve();
 }
 const unsubscribe=bridge.onReleaseNotice(value=>{revision++;render(value)});
 void refresh();
 return {render,refresh,dispose(){
  if(disposed)return;disposed=true;revision++;unsubscribe();hide();doc.removeEventListener('focusin',focus);view.removeEventListener('resize',reserve);
  if(previous)style.setProperty(key,previous);else style.removeProperty(key);
 }};
}
window.EOReleaseBanner=Object.freeze({create});
})();
