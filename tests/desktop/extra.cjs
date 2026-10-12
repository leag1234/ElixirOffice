// SPDX-License-Identifier: AGPL-3.0-only
const {launch,stop,editable,root,sleep,fixture}=require('./harness.cjs'),{modal,keys,edit,text}=require('./lifecycle.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const report=[];
async function record(row){report.push(row);await fs.writeFile(path.join(root,'results/extra.json'),JSON.stringify(report,null,2));console.log('PASS',row.check)}
async function malformedConsent(){
 const profile='invalid-consent-'+Date.now(),directory=path.join(root,'profiles',profile);
 await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'desktop-settings.json'),JSON.stringify({recents:[],fontConsent:'false'}));
 const env=await launch({profile});
 try{
  assert.deepEqual(await env.page.evaluate(()=>eoDesktop.fonts()),[]);
  assert(await env.page.evaluate(async()=>{try{await eoDesktop.font('/etc/passwd');return false}catch(e){return /permission/.test(e.message)}}));
  await record({check:'malformed-consent-never-grants-font-access'});
 }finally{await stop(env)}
}
async function startupQueue(){
 const profile='startup-queue-'+Date.now(),directory=path.join(root,'profiles',profile),times=[];
 let otherRuns;
 const env=await launch({file:await fixture('sample.docx'),profile,onSpawn:()=>{
  otherRuns=(async()=>{
   for(let i=0;i<500;i++){try{await fs.lstat(path.join(directory,'SingletonLock'));break}catch(e){if(e.code!=='ENOENT')throw e;await sleep(10)}}
   const runs=['sample.xlsx','sample.pptx'].map(async name=>{
    const log=await fs.open(path.join(root,'results','startup-'+name+'.log'),'w');times.push({name,spawned:Date.now()});
    const child=cp.spawn(path.join(root,'tools/electron/electron'),[path.join(root,'desktop/main.cjs'),await fixture(name)],{cwd:root,env:{...process.env,DISPLAY:':0',XAUTHORITY:path.join(root,'desktop.Xauthority'),EO_DESKTOP_PROFILE:directory},stdio:['ignore',log.fd,log.fd]});
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});await log.close();assert.equal(code,0);
   });
   await Promise.all(runs);
  })();
 }});
 try{
  await otherRuns;
  await env.page.waitForFunction(()=>window.EOLocalSession?.format==='pptx'||window.EOLocalSession?.format==='xlsx',null,{timeout:120000});
  await env.page.waitForFunction(async()=>{const items=await eoDesktop.recents();return ['sample.docx','sample.xlsx','sample.pptx'].every(name=>items.some(item=>item.name===name))},null,{timeout:120000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);assert.deepEqual(env.errors,[]);
  await record({check:'startup-queue-three-open-requests',times,recents:await env.page.evaluate(()=>eoDesktop.recents())});
 }finally{await stop(env)}
}
async function switchAndSaveCancel(){
 const file=await fixture('sample.docx');
 const before=await fs.readFile(file),env=await launch({file,profile:'switch-cancel-'+Date.now()});
 try{
  await editable(env);await edit(env);
  await env.page.locator('#save-as').click();await modal(env);keys(env,'escape');
  await env.page.waitForFunction(()=>!document.getElementById('save').disabled);
  assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()));assert.deepEqual(await fs.readFile(file),before);
  await env.page.locator('#open').click();await modal(env);keys(env,'escape');await sleep(300);
  assert.equal(await env.page.evaluate(()=>EOLocalSession.format),'docx');assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()));
  await env.page.locator('#open').click();await modal(env);keys(env,'discard');await modal(env);keys(env,'path',await fixture('sample.xlsx'));
  await env.page.waitForFunction(()=>window.EOLocalSession?.format==='xlsx',null,{timeout:120000});
  assert.deepEqual(await fs.readFile(file),before);
  await record({check:'save-as-cancel-preserves-dirty/replace-cancel-discard',originalBytes:before.length});
 }finally{await stop(env)}
}
async function printCancel(){
 const env=await launch({file:await fixture('sample.docx'),profile:'print-'+Date.now()});
 try{
  await editable(env);await env.page.locator('#print').click();await modal(env,'Print');
  const pages=env.browser.contexts()[0].pages();
  assert(pages.some(page=>page.url().startsWith('data:application/pdf;base64,')),'Native print must load the resulting PDF');
  keys(env,'escape');await env.page.waitForFunction(()=>window.EOLastPdf||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
  const result=await env.page.evaluate(()=>window.EOLastPdf);assert.equal(result.printed,false);assert.equal(result.stats.backend,'wasm');
  await record({check:'real-native-print-dialog-cancel/no-success-claim',reason:result.reason,pages:result.stats.pages});
 }finally{await stop(env)}
}
(async()=>{if(process.env.EO_PRINT_ONLY==='1'){await printCancel();return}await malformedConsent();await startupQueue();await switchAndSaveCancel();await printCancel()})().catch(e=>{console.error(e);process.exitCode=1});
