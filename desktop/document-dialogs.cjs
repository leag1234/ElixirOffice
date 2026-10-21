// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
class DocumentDialogs{
 #windows=new Map();
 has(windowId){return this.#windows.has(windowId);}
 run(windowId,validate,show){
  const previous=this.#windows.get(windowId)||Promise.resolve();
  const next=previous.catch(()=>{}).then(()=>{validate();return show();});
  this.#windows.set(windowId,next);
  const finished=()=>{if(this.#windows.get(windowId)===next)this.#windows.delete(windowId);};
  next.then(finished,finished);
  return next;
 }
}
module.exports={DocumentDialogs};
