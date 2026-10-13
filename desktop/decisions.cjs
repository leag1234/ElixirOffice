// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
function buttons(labels){
 const used=new Set();
 return labels.map(label=>{
  const index=Array.from(label).findIndex(char=>/[a-z]/i.test(char)&&!used.has(char.toLowerCase()));
  if(index<0)return label;const characters=Array.from(label);used.add(characters[index].toLowerCase());characters.splice(index,0,'&');return characters.join('');
 });
}
function unsaved(t,close=false){
 return {type:'question',message:t('unsaved'),buttons:buttons(close?[t('save'),t('discard'),t('cancel')]:[t('cancel'),t('discard')]),normalizeAccessKeys:true,defaultId:0,cancelId:close?2:0};
}
function discard(result){return result.response===1;}
module.exports={buttons,unsaved,discard};
