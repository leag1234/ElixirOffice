// SPDX-License-Identifier: AGPL-3.0-only
const {launch,stop,editable,root,sleep}=require('./harness.cjs'),{edit,modal,keys,text}=require('./lifecycle.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const target=path.join(root,'fixtures/guard-objects.ods');await fs.copyFile(path.join(root,'fixtures/sample-from-x2t.ods'),target);
 const original=sha(await fs.readFile(target)),env=await launch({file:target,profile:'object-safety-'+Date.now()});
 try{
  await editable(env);await edit(env);
  for(const button of ['save','save-as']){
   await env.page.locator('#'+button).click();
   await modal(env);keys(env,'escape');
   await env.page.waitForFunction(()=>window.EOLocalFailure?.includes('embedded objects'),null,{timeout:90000});
   await env.page.waitForFunction(()=>!document.getElementById('save').disabled);
   assert.equal(sha(await fs.readFile(target)),original);assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()));assert.equal(await env.page.evaluate(()=>window.EOLastSave),undefined);
  }
  for(const destination of [target,path.join(root,'fixtures/guard-alias.ods')]){
   if(destination!==target){await fs.unlink(destination).catch(e=>{if(e.code!=='ENOENT')throw e});await fs.link(target,destination)}
   await env.page.locator('#save-as').click();await modal(env);keys(env,'copy');await modal(env,'Save File');keys(env,'save-path',destination);
   console.log('Checking refused copy destination',path.basename(destination));
   console.log('Native chooser result',await env.page.evaluate(()=>({failure:window.EOLocalFailure,saved:window.EOLastSave,message:document.getElementById('message').textContent})));
   try{await env.page.waitForFunction(()=>window.EOLocalFailure,null,{timeout:3000})}
   catch(error){if(error.name!=='TimeoutError')throw error;await modal(env);keys(env,'replace')}
   try{await env.page.waitForFunction(()=>window.EOLocalFailure?.includes('different file'),null,{timeout:90000})}
   catch(error){console.error('Native copy state',JSON.stringify(await env.page.evaluate(()=>({failure:window.EOLocalFailure,saved:window.EOLastSave,message:document.getElementById('message').textContent}))));throw error}
   assert.equal(sha(await fs.readFile(target)),original);assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()));
  }
  const moved=path.join(root,'fixtures/guard-moved-original.ods');
  await fs.unlink(moved).catch(e=>{if(e.code!=='ENOENT')throw e});await fs.rename(target,moved);
  try{
   await env.page.locator('#save-as').click();await modal(env);keys(env,'copy');await modal(env,'Save File');keys(env,'save-path',moved);
   console.log('Native chooser result',await env.page.evaluate(()=>({failure:window.EOLocalFailure,saved:window.EOLastSave,message:document.getElementById('message').textContent})));
   try{await env.page.waitForFunction(()=>window.EOLocalFailure,null,{timeout:3000})}
   catch(error){if(error.name!=='TimeoutError')throw error;await modal(env);keys(env,'replace')}
   try{await env.page.waitForFunction(()=>window.EOLocalFailure?.includes('different file'),null,{timeout:90000})}
   catch(error){console.error('Native copy state',JSON.stringify(await env.page.evaluate(()=>({failure:window.EOLocalFailure,saved:window.EOLastSave,message:document.getElementById('message').textContent}))));throw error}
   assert.equal(sha(await fs.readFile(moved)),original);assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()));
  }finally{await fs.rename(moved,target)}
  const copy=path.join(root,'fixtures/guard-objects-copy.ods');await fs.unlink(copy).catch(e=>{if(e.code!=='ENOENT')throw e});
  await env.page.locator('#save-as').click();await modal(env);keys(env,'copy');await modal(env,'Save File');keys(env,'save-path',copy);
  await env.page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);assert.equal(sha(await fs.readFile(target)),original);
  assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),false);
  const guard=require(path.join(root,'desktop/package-guard.cjs'));
  assert.equal(guard.embeddedObjects(await fs.readFile(target)),2);assert.equal(guard.embeddedObjects(await fs.readFile(copy)),1);
  assert(text(copy).includes('EODESKTOP'));
  await env.page.locator('#pdf').click();
  await env.page.waitForFunction(()=>window.EOLocalFailure?.includes('unsupported image'),null,{timeout:90000});
  assert.equal(sha(await fs.readFile(target)),original);
  const result={sameFileSaveCancelled:true,saveAsCancelled:true,originalPathRefused:true,hardLinkAliasRefused:true,movedOriginalRefused:true,explicitCopySaved:true,pdfRejected:true,originalUnchanged:true,copyClean:true,knownConverterDefect:'two embedded charts become one; missing media/image-1.jpg preview',errors:env.errors};
  await fs.writeFile(path.join(root,'results/object-safety.json'),JSON.stringify(result,null,2));console.log('PASS data safety; converter fidelity remains FAIL');
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
