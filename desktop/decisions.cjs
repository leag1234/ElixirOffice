// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
function buttons(labels){
 const used=new Set();
 return labels.map(label=>{
  const index=Array.from(label).findIndex(char=>/[a-z]/i.test(char)&&!used.has(char.toLowerCase()));
  if(index<0)return label;const characters=Array.from(label);used.add(characters[index].toLowerCase());characters.splice(index,0,'&');return characters.join('');
 });
}
function named(t,key,name){
 // Keep a filename's direction controls from escaping its Unicode isolate.
 const value=String(name||t('untitled')).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim()||t('untitled');
 return t(key).replace('{name}',()=> '\u2068'+value+'\u2069');
}
function unsaved(t,close=false,name='',platform=process.platform){
 // NSAlert places the first button at the trailing edge: Save, Cancel, Don't Save.
 const actions=close?(platform==='darwin'?['quitSave','cancel','dontSave']:['quitSave','dontSave','cancel']):['cancel','dontSave'];
 return {type:'question',title:'ElixirOffice',message:named(t,close?'saveChangesNamed':'closeWithoutSavingNamed',name),
  buttons:buttons(actions.map(key=>t(key))),normalizeAccessKeys:true,noLink:true,defaultId:0,cancelId:actions.indexOf('cancel')};
}
function busy(t,name){
 return {...unsaved(t,false,name),type:'warning',detail:t('closeUnavailable')+'\n\n'+t('closeUnsavedRisk')};
}
function discard(result,close=false,platform=process.platform){return result.response===(close&&platform==='darwin'?2:1);}
module.exports={buttons,unsaved,busy,discard};
