// SPDX-License-Identifier: AGPL-3.0-only
// Native sheets are operated in the real tested app, never replaced by test dialogs.
'use strict';
const {launch,stop,editable,root,sleep,fixture}=require('./harness.cjs'),{edit,text}=require('./lifecycle.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
(async()=>{
 assert.equal(process.platform,'darwin');const executable=process.env.EO_PACKAGE_EXECUTABLE;assert(executable);
 const label='mac-preview',file=await fixture('sample.docx'),profile=label+'-'+Date.now();
 const env=await launch({executable,file:require('node:url').pathToFileURL(file).href,profile});
 async function stage(name){console.log('NATIVE STAGE',name);await fs.writeFile(path.join(root,'results/current-native.json'),JSON.stringify({stage:name,pid:env.application.pid,file,profile:env.directory}));}
 try{
  await editable(env);assert((await fs.stat(path.join(env.directory,'desktop-settings.json'))).isFile());await edit(env);await env.page.locator('#save').click();
  await env.page.waitForFunction(()=>window.EOLastSave&&!EOLocalSession.controller.isModified(),null,{timeout:90000});
  assert(text(file).includes('EODESKTOP'));assert.equal(await env.page.evaluate(()=>typeof require),'undefined');assert.deepEqual(env.errors,[]);
  await require('./privacy.cjs').networkDenied(env.page);console.log('PASS native Mac fileURI/edit/atomic-save/offline/no-Node');
  await stage('save-pdf');await env.page.locator('#pdf').click();
  await env.page.waitForFunction(()=>window.EOLastPdf,null,{timeout:180000});
  assert.equal(await env.page.evaluate(()=>EOLastPdf.stats.backend),'wasm');
  assert(cp.execFileSync('pdftotext',[file.replace(/docx$/,'pdf'),'-'],{encoding:'utf8'}).includes('EODESKTOP'));
  console.log('PASS actual native Mac PDF with saved edit');
  assert.deepEqual(await env.page.evaluate(()=>eoDesktop.fonts()),[]);
  await stage('fonts-cancel');const deny=env.page.evaluate(()=>eoDesktop.fontConsent());assert.equal(await deny,false);
  assert.deepEqual(await env.page.evaluate(()=>eoDesktop.fonts()),[]);
  await stage('fonts-allow');const allow=env.page.evaluate(()=>eoDesktop.fontConsent());assert.equal(await allow,true);
  const fonts=await env.page.evaluate(()=>eoDesktop.fonts());assert(fonts.length>0);
  assert(await env.page.evaluate(async()=>{try{await eoDesktop.font('/etc/passwd');return false}catch(error){return /Unknown font/.test(error.message)}}));
  console.log('PASS native Mac denied/allowed font consent and opaque handles');
  await stage('print-cancel');await env.page.locator('#print').click();
  await env.page.waitForFunction(()=>window.EOLastPdf&&EOLastPdf.printed===false,null,{timeout:180000});
  console.log('PASS actual native Mac Print cancellation');
  const ack=path.join(root,'results','dirty-cancel-'+profile+'.ack');await assert.rejects(fs.access(ack));
  await edit(env);await stage('dirty-close-cancel');await env.page.evaluate(()=>window.close());
  for(let i=0;i<180;i++){try{await fs.access(ack);break}catch{await sleep(1000)}}
  assert.equal(await fs.readFile(ack,'utf8'),env.directory,'Native UI driver must acknowledge its real Cancel action');
  await sleep(500);assert.equal(env.application.exitCode,null);assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()));
  console.log('PASS native Mac dirty-close Cancel retains document');
  assert.deepEqual(env.errors,[]);
 }finally{await stop(env)}
 const reopened=await launch({executable,file,profile});
 try{await editable(reopened);assert.deepEqual(reopened.errors,[]);assert((await reopened.page.evaluate(()=>eoDesktop.fonts())).length>0);assert.equal(await reopened.page.evaluate(()=>eoDesktop.fontConsent()),true);
 const marker=await reopened.page.evaluate(()=>{const bytes=new Uint8Array(EOLocalSession.controller.serialize()),needle=Array.from('EODESKTOP').flatMap(c=>[c.charCodeAt(0),0]);return bytes.some((_v,i)=>needle.every((v,j)=>bytes[i+j]===v))});assert(marker);
 console.log('PASS actual native Mac fresh reopen/saved text/consent persistence');
 }finally{await stop(reopened)}
})().catch(error=>{console.error(error);process.exitCode=1});
