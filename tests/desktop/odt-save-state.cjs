// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Control timing of real Wasm saves; no conversion result is substituted.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.EO_DESKTOP_ROOT||path.resolve(__dirname,'../..');
const {launch,stop,editable,fixture}=require(path.join(root,'tests/desktop/harness.cjs'));
const {edit,text}=require(path.join(root,'tests/desktop/lifecycle.cjs'));
const action=require(path.join(root,'tests/desktop/file-action.cjs'));
const rows=[];
async function hold(env){
 await env.page.evaluate(()=>{
  const win=EOLocalSession.win,real=win.EOTestRealConvert||win.EOWasmConvert.convert;
  win.EOTestRealConvert=real;window.EOHeldSaveReady=false;window.EOLastSave=null;
  let release;const gate=new Promise(resolve=>release=resolve);
  window.EOReleaseHeldSave=()=>release();
  win.EOWasmConvert.convert=async function(input,from,to,options){
   const result=await real.call(this,input,from,to,options);
   if(from==='doct'){window.EOHeldSaveReady=true;await gate;}
   return result;
  };
 });
 await action(env.page,'save');
 await env.page.waitForFunction(()=>window.EOHeldSaveReady,null,{timeout:90000});
}
async function release(env){
 await env.page.evaluate(()=>EOReleaseHeldSave());
 await env.page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:90000});
 assert.equal(await env.page.evaluate(()=>EOLocalFailure),null);
}
async function cleanSave(env){
 await env.page.evaluate(()=>{EOLocalSession.win.EOWasmConvert.convert=EOLocalSession.win.EOTestRealConvert;window.EOLastSave=null;});
 await action(env.page,'save');
 try{await env.page.waitForFunction(()=>window.EOLastSave&&!EOLocalSession.controller.isModified()||window.EOLocalFailure,null,{timeout:90000});}
 catch(error){console.log('SAVE DIAGNOSTIC',JSON.stringify(await env.page.evaluate(()=>{const h=EOLocalSession.win.AscCommon.History;return {index:h.Index,points:h.Points.length,savedIndex:h.SavedIndex,userSavedIndex:h.UserSavedIndex,forceSave:h.ForceSave,rawModified:EOLocalSession.api.isDocumentModify,canSave:EOLocalSession.api.canSave,saved:!!EOLastSave,failure:EOLocalFailure};})));throw error;}
 assert.equal(await env.page.evaluate(()=>EOLocalFailure),null);
}
async function checkpoint(env){
 return env.page.evaluate(()=>{
  const h=EOLocalSession.win.AscCommon.History,p=h.Points[h.Index];
  return {index:h.Index,points:h.Points.length,items:p?p.Items.length:0,modified:EOLocalSession.controller.isModified(),forceSave:h.ForceSave};
 });
}
async function record(name,result){rows.push({name,status:'pass',...result});console.log('PASS',name);await fs.writeFile(path.join(root,'results/odt-save-state.json'),JSON.stringify({rows},null,2));}
(async()=>{
 const target=await fixture('sample-from-x2t.odt');
 let env=await launch({file:target,profile:'odt-save-state-'+Date.now(),executable:process.env.EO_PACKAGE_EXECUTABLE});
 try{
  await editable(env);await edit(env);
  await hold(env);
  const before=await checkpoint(env);
  await env.page.evaluate(()=>EOLocalSession.api.CheckChangedDocument());
  const notified=await checkpoint(env);
  assert.deepEqual([notified.index,notified.points,notified.items],[before.index,before.points,before.items],'Notification test must not edit history');
  await release(env);
  await env.page.waitForFunction(()=>!EOLocalSession.controller.isModified(),null,{timeout:15000});
  assert(text(target).includes('EODESKTOP'));await record('unchanged Word dirty notification does not invalidate the saved snapshot',{before,notified});

  await hold(env);
  await env.page.evaluate(()=>EOLocalSession.api.asc_enterText(Array.from('AFTERSAVE',c=>c.codePointAt(0))));
  await release(env);
  assert.equal((await checkpoint(env)).modified,true);
  assert(!text(target).includes('AFTERSAVE'),'Held snapshot must not contain the later edit');
  await cleanSave(env);assert(text(target).includes('AFTERSAVE'));
  await record('real typing during conversion remains dirty until a second save',{});

  await hold(env);
  await env.page.evaluate(()=>EOLocalSession.api.WordControl.m_oLogicDocument.Document_Undo());
  await release(env);assert.equal((await checkpoint(env)).modified,true);
  assert(text(target).includes('AFTERSAVE'));
  await cleanSave(env);assert(!text(target).includes('AFTERSAVE'));
  await record('undo during conversion keeps the changed document dirty',{});

  await hold(env);
  await env.page.evaluate(()=>EOLocalSession.api.WordControl.m_oLogicDocument.Document_Redo());
  await release(env);assert.equal((await checkpoint(env)).modified,true);
  assert(!text(target).includes('AFTERSAVE'));
  await cleanSave(env);assert(text(target).includes('AFTERSAVE'));
  await record('redo during conversion keeps the changed document dirty',{});

  await hold(env);
  await env.page.evaluate(()=>new Promise((resolve,reject)=>{
   const {api,win}=EOLocalSession;
   api.asc_PasteData(win.AscCommon.c_oAscClipboardDataFormat.Text,'PASTEDAFTERSAVE',undefined,undefined,undefined,resolve,undefined,()=>reject(Error('Paste rejected')));
  }));
  await release(env);
  assert.equal((await checkpoint(env)).modified,true);
  assert(!text(target).includes('PASTEDAFTERSAVE'),'Held snapshot must exclude the later paste');
  await cleanSave(env);assert(text(target).includes('PASTEDAFTERSAVE'));
  await record('real SDK paste during conversion remains dirty until a second save',{});

  assert.deepEqual(env.errors,[]);
 }finally{await stop(env)}

 const freshTarget=await fixture('sample-from-x2t.odt');
 env=await launch({file:freshTarget,profile:'odt-first-save-undo-'+Date.now(),executable:process.env.EO_PACKAGE_EXECUTABLE});
 try{
  await editable(env);
  await edit(env);await hold(env);
  await env.page.evaluate(()=>EOLocalSession.api.WordControl.m_oLogicDocument.Document_Undo());
  await release(env);
  assert.equal((await checkpoint(env)).modified,true,'Undo returning to the old saved state must stay dirty after a different snapshot overwrites the file');
  assert(text(freshTarget).includes('EODESKTOP'));
  await cleanSave(env);assert(!text(freshTarget).includes('EODESKTOP'));
  await record('first-save undo cannot silently lose an unsaved undo',{});

  await edit(env);await cleanSave(env);
  const savedBytes=await fs.readFile(freshTarget);
  await env.page.evaluate(()=>{
   const win=EOLocalSession.win,real=win.EOWasmConvert.convert;window.EONoFlightConversions=0;
   win.EOWasmConvert.convert=function(){EONoFlightConversions++;return real.apply(this,arguments);};
   window.EORestoreNoFlightConvert=()=>{win.EOWasmConvert.convert=real;};
   EOLocalSession.api.asc_enterText(Array.from('UNDOTOSAVED',c=>c.codePointAt(0)));
  });
  assert.equal((await checkpoint(env)).modified,true);
  await env.page.evaluate(()=>EOLocalSession.api.WordControl.m_oLogicDocument.Document_Undo());
  await env.page.waitForFunction(()=>!EOLocalSession.controller.isModified(),null,{timeout:15000});
  assert.equal(await env.page.evaluate(()=>EONoFlightConversions),0,'Undo-to-saved test must have no save in flight');
  assert.deepEqual(await fs.readFile(freshTarget),savedBytes,'Undo back to saved state must not rewrite the file');
  await env.page.evaluate(()=>EORestoreNoFlightConvert());
  await record('undo back to the saved state is clean with no save in flight',{});

  const disposed=await env.page.evaluate(()=>{
   const api=EOLocalSession.api,original=api.asc_unregisterCallback,removed=[],probes=[];
   const names=['asc_onDocumentModifiedChanged','asc_onUserActionStart','asc_onBeforeUndoRedo'];
   let called=0;
   api.asc_unregisterCallback=function(name,callback){
    if(names.includes(name)){
     removed.push({name,callback});
     if(!probes.some(probe=>probe.callback===callback)){
      const previous=Object.getOwnPropertyDescriptor(callback,'apply');
      probes.push({callback,previous});
      callback.apply=function(receiver,args){called++;return Function.prototype.apply.call(callback,receiver,args);};
     }
    }
    return original.apply(this,arguments);
   };
   try{
    EOLocalSession.controller.dispose();
    api.asc_unregisterCallback=original;
    for(const name of names)api.sendEvent(name);
    const callsAfterDispose=called;
    // A positive control proves this probe observes real SDK callback dispatch.
    const action=removed.find(entry=>entry.name==='asc_onUserActionStart');
    if(action){api.asc_registerCallback(action.name,action.callback);api.sendEvent(action.name);original.call(api,action.name,action.callback);}
    return {removed:removed.map(entry=>entry.name),sameAction:removed.find(entry=>entry.name===names[1])?.callback===removed.find(entry=>entry.name===names[2])?.callback,callsAfterDispose,positiveControlCalls:called-callsAfterDispose};
   }finally{
    api.asc_unregisterCallback=original;
    for(const probe of probes){if(probe.previous)Object.defineProperty(probe.callback,'apply',probe.previous);else delete probe.callback.apply;}
   }
  });
  assert.deepEqual(disposed.removed.sort(),['asc_onBeforeUndoRedo','asc_onDocumentModifiedChanged','asc_onUserActionStart']);
  assert.equal(disposed.sameAction,true);
  assert.equal(disposed.callsAfterDispose,0,'Disposed callbacks must not receive actual SDK events');
  assert.equal(disposed.positiveControlCalls,1,'The probe must observe an intentionally registered callback');
  await record('dispose unregisters all three exact Word save-state callbacks',disposed);

  assert.deepEqual(env.errors,[]);
 }finally{await stop(env)}
 assert.equal(rows.length,8);
})().catch(async error=>{
 rows.push({name:'save-state regression',status:'fail',error:error.message});
 await fs.writeFile(path.join(root,'results/odt-save-state.json'),JSON.stringify({rows},null,2));
 console.error(error);process.exitCode=1;
});

