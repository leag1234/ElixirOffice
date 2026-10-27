// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),{sleep}=require('./harness.cjs'),action=require('./file-action.cjs');
async function path(env,target){
 const {keys,modal,nativeDialogs}=require('./lifecycle.cjs');
 const chooser=await modal(env);
 keys(env,'path-only',target,{window:chooser});
 keys(env,'return',undefined,{window:chooser});
 // GTK can first accept the location entry and leave the original chooser open.
 // Never send its Save accelerator to a replacement warning or the editor.
 for(let i=0;i<8;i++){if(!nativeDialogs(env).includes(chooser))return;await sleep(100)}
 const current=nativeDialogs(env);assert.deepEqual(current,[chooser],'Native chooser changed before Save');
 keys(env,'save',undefined,{window:chooser});
 for(let i=0;i<100;i++){if(!nativeDialogs(env).includes(chooser))return;await sleep(100)}
 throw Error('Native chooser did not accept the selected path');
}
async function pdf(env,target,{cancel=false}={}){
 const {modal}=require('./lifecycle.cjs');
 const warning=await require('./native-dialog.cjs').watchPdfWarning(env);
 try{
  await action(env.page,'save-as','pdf');await path(env,target);
  const window=await modal(env);
  return await warning.confirm(window,cancel?'cancel':'saveCopy');
 }finally{await warning.close()}
}
module.exports={path,pdf};
