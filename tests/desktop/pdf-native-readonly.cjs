// SPDX-License-Identifier: AGPL-3.0-only
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,stop,editable,fixture,root}=require('./harness.cjs');
const {modal,keys}=require('./lifecycle.cjs'),action=require('./file-action.cjs');
(async()=>{const rows=[],profile='g1b-readonly-'+Date.now();
for(const [name,phrase] of [['public-stream-script.pdf','scripts'],['public-sigflags-1.pdf','signature'],['public-unsupported-catalog.pdf','named destinations']]){
 const file=await fixture(name),original=await fs.readFile(file);let env;
 try{env=await launch({file,profile});await editable(env);assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.canSave()),false);
 const text=await env.page.locator('#message').innerText();assert(text.includes(phrase),text);assert(text.includes('Save As'),text);
 const refusal=await env.page.evaluate(async()=>{try{await EOLocalSession.controller.save();return null}catch(e){return e.message}});
 assert(refusal.includes(phrase));assert(refusal.includes('Save As'));assert.deepEqual(await fs.readFile(file),original);assert.deepEqual(env.errors,[]);
 await action(env.page,'save-as','pdf');await modal(env);keys(env,'escape');
 await env.page.waitForFunction(()=>!EODesktopState(false).opening&&!document.querySelector('.eo-format-dialog')&&Array.from(document.querySelectorAll('#home button')).every(button=>!button.disabled));
 assert.deepEqual(await fs.readFile(file),original,'Cancelled read-only PDF copy does not modify the original');
 assert.equal(await env.page.evaluate(()=>window.EOLastPdf||null),null);assert.equal(await env.page.evaluate(()=>window.EOLocalFailure||null),null);

 rows.push({name,readOnly:true,copyOffer:true,nativeDestinationCancel:true,originalUntouched:true});console.log('PASS actual native read-only reason/copy offer/Save refusal/SaveAs cancel',name);
 }finally{if(env)await stop(env)}
}
await fs.writeFile(path.join(root,'results/review-native-readonly.json'),JSON.stringify(rows,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});

