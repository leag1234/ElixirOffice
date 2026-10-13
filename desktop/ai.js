// SPDX-License-Identifier: AGPL-3.0-only
// Only the native desktop shell installs this bounded AI transport.
(() => {
'use strict';
window.EODesktopAI=async function(win){
 const bridge=window.eoDesktop;let settings=await bridge.aiSettings();
 const state=()=>{
  win.Common?.Controllers&&win.Common.NotificationCenter.trigger('elixir:ai-state',false);
  const controller=(win.DE||win.SSE||win.PE)?.getController('Common.Controllers.ElixirAI');
  controller?.refreshState();
  (win.DE||win.SSE||win.PE)?.getController('ElixirChrome')?.backstage?.afterApplyMode();
 };
 win.eoDesktopAI={
  get:()=>({...settings}),
  ready:()=>Promise.resolve(null),
  configure:async value=>{const next=await bridge.aiConfigure(value);if(next===false)return false;settings=next;state();return true;},
  clear:async()=>{settings=await bridge.aiConfigure({endpoint:''});win.localStorage.removeItem('elixir-ai-settings');state();},
  configured:value=>!!(settings.consented&&settings.endpoint&&value.endpoint===settings.endpoint&&value.model===settings.model),
  fetch:async(url,options)=>{
   const expected=settings.endpoint+'/chat/completions';
   if(url!==expected||options.method!=='POST')throw Error('AI request is outside the configured endpoint');
   const id=crypto.randomUUID(),cancel=()=>bridge.aiCancel(id);
   if(options.signal?.aborted)throw Error('AI request cancelled');
   options.signal?.addEventListener('abort',cancel,{once:true});
   try{const result=await bridge.aiRequest(id,options.body);return new win.Response(result.text,{status:result.status,headers:{'Content-Type':result.type}})}
   finally{options.signal?.removeEventListener('abort',cancel)}
  }
 };
 state();
};
})();
