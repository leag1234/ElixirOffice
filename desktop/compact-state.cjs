// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
function normalize(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid compact state');
 const result={};
 for(const name of ['save','undo','redo','search']){
  const item=value[name];
  if(!item||typeof item!=='object'||typeof item.visible!=='boolean'||typeof item.enabled!=='boolean'||typeof item.label!=='string'||item.label.length>200||/[\u0000-\u001f\u007f]/.test(item.label))throw Error('Invalid compact state');
  result[name]={visible:item.visible,enabled:item.enabled,label:item.label};
 }
 return result;
}
module.exports={normalize};
