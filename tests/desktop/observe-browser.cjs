// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Metrics belong to the owned app session, not whichever document is selected.
function observeBrowser(browser,{errors,requests,onPage=()=>{}}){
 const contexts=new Map(),pages=new Map();let disposed=false;
 function observePage(page){
  if(disposed||pages.has(page)||page.isClosed())return;
  const listeners={
   pageerror:error=>errors.push(error.message),
   console:message=>{if(message.type()==='error')errors.push(message.text())}
  };
  pages.set(page,{listeners,cleanup:null});
  for(const [name,listener] of Object.entries(listeners))page.on(name,listener);
  pages.get(page).cleanup=onPage(page);
 }
 function refresh(){
  if(disposed)return;
  for(const context of browser.contexts()){
   if(!contexts.has(context)){
    const listeners={
     page:page=>{refresh();observePage(page)},
     request:request=>requests.push({url:request.url(),method:request.method()}),
     response:response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url())}
    };
    contexts.set(context,listeners);
    for(const [name,listener] of Object.entries(listeners))context.on(name,listener);
   }
   for(const page of context.pages())observePage(page);
  }
 }
 function dispose(){
  disposed=true;
  for(const [context,listeners] of contexts)for(const [name,listener] of Object.entries(listeners))context.off(name,listener);
  for(const [page,{listeners,cleanup}] of pages){for(const [name,listener] of Object.entries(listeners))page.off(name,listener);cleanup?.()}
  contexts.clear();pages.clear();
 }
 refresh();return{refresh,dispose};
}
module.exports={observeBrowser};
