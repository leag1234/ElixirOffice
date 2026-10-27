// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,editable,stop,root,fixture}=require('./harness.cjs');
const {modal,keys}=require('./lifecycle.cjs'),action=require('./file-action.cjs');
(async()=>{let env;const folder=await fs.mkdtemp(path.join(root,'fixtures/g1b-dialog-')),source=path.join(folder,'public.pdf');await fs.copyFile(path.join(root,'fixtures/public-forms.pdf'),source);const original=await fs.readFile(source),target=path.join(folder,'saved-copy.pdf');
try{
 env=await launch({file:source,profile:'g1b-dialog-'+Date.now()});await editable(env);
 await env.page.evaluate(()=>{const s=EOLocalSession,c=new s.win.Asc.asc_CCommentDataWord(null);c.asc_putText('Native Save As preservation');c.asc_putUserName('Public author');c.asc_putUserId('local');c.asc_putTime(String(Date.now()));s.api.asc_addComment(c);s.api.CheckChangedDocument()});
 await action(env.page,'save-as','pdf');await modal(env);keys(env,'escape');
 await env.page.waitForFunction(()=>!EOLocalSession.controller.isSaving());
 assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()));assert.deepEqual(await fs.readFile(source),original);
 await action(env.page,'save-as','pdf');await require('./save-as-native.cjs').path(env,target);
 await env.page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:90000});
 assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
 assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),false);
 const copy=await fs.readFile(target);assert.deepEqual(copy.subarray(0,original.length),original);assert.deepEqual(await fs.readFile(source),original);
 await action(env.page,'print');await modal(env);keys(env,'escape');
 assert.equal(env.errors.length,0,JSON.stringify(env.errors));assert(!env.requests.some(r=>/^(https?|wss?):/.test(r.url)));
 const result={saveAs:true,cancelPreservesDirty:true,originalUntouched:true,printDialogCancelled:true,bytes:copy.length,requests:env.requests.length};
 await stop(env);env=null;env=await launch({file:target,profile:'g1b-dialog-reopen-'+Date.now()});await editable(env);
 assert(await env.page.evaluate(()=>EOLocalSession.api.getPDFDoc().annots.some(a=>a.GetContents()==='Native Save As preservation')));result.reopened=true;
 await fs.writeFile(path.join(root,'results/native-dialog.json'),JSON.stringify(result,null,2));console.log('PASS',JSON.stringify(result));
}finally{if(env)await stop(env)}
})().catch(e=>{console.error(e);process.exitCode=1});

