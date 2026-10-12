// SPDX-License-Identifier: AGPL-3.0-only
const {launch,stop,editable,root,fixture}=require('./harness.cjs');
const {networkDenied}=require('./privacy.cjs');
const {modal,keys}=require('./lifecycle.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const file=await fixture('synth100.docx'),original=await fs.readFile(file),workers=[];
 const env=await launch({file,profile:'cancel-preparation-'+Date.now(),onPage:async page=>{
  const firstWorker=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Opening worker did not start')),120000);
   page.on('worker',worker=>{
    if(!worker.url().endsWith('/desktop/legacy-worker.js'))return;
    const row={url:worker.url(),closed:false};workers.push(row);worker.on('close',()=>{row.closed=true});clearTimeout(timer);resolve();
   });
  });
  await firstWorker;
  assert.equal(await page.evaluate(()=>!!window.EOLocalSession),false,'Cancel must precede readiness');
  await page.locator('#cancel').click();
 }});
 try{
  assert.equal(await env.page.evaluate(()=>window.EOLocalSession),null);
  assert.match(await env.page.evaluate(()=>window.EOLocalFailure),/cancelled/i);
  assert(workers.length>0&&workers.every(worker=>worker.closed),'Cancelled opening must terminate every observed worker');
  assert.deepEqual(await fs.readFile(file),original,'Cancellation must preserve the original');
  await env.page.locator('#open').click();await modal(env,'Open document');
  keys(env,'path',await fixture('sample.docx'));await editable(env);
  assert.equal(await env.page.evaluate(()=>EOLocalSession.format),'docx');
  assert(workers.every(worker=>worker.closed),'Conversion must terminate its prepared worker');
  const privacy=await networkDenied(env.page);
  console.log('PASS early-worker cancellation/original preservation/native-open recovery',JSON.stringify({workers,privacy}));
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
