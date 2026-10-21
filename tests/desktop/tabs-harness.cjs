// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launch,stop,editable,root}=require('./harness.cjs');
(async()=>{
 let env;
 try{
  env=await launch({file:path.join(root,'desktop/assets/desktop-home/blanks/en.docx'),profile:'tabs-harness-'+Date.now()});
  await editable(env);const a=env.page,identity=await a.evaluate(()=>window.eoDesktop.identity());
  assert.equal(await env.activeDocument(),a);
  await env.shell.evaluate(()=>window.eoTabs.create());
  let b;
  for(let n=0;n<100&&!b;n++){b=env.documentPages().find(page=>page!==a);if(!b)await new Promise(resolve=>setTimeout(resolve,50));}
  assert(b,'Second document page must appear');await b.waitForFunction(()=>window.EODesktopReady);
  const other=await b.evaluate(()=>window.eoDesktop.identity());assert.notEqual(other.documentId,identity.documentId);
  assert.equal(await env.documentPage(identity.documentId),a);assert.equal(await env.selectDocument(identity.documentId),a);assert.equal(env.page,a);
  assert.equal(await env.activeDocument(),a);assert.equal(await env.selectDocument(other.documentId),b);assert.equal(env.page,b);assert.equal(await env.activeDocument(),b);
  assert.equal(await a.evaluate(()=>EOLocalSession.format),'docx');
  assert.deepEqual(env.errors,[]);console.log('PASS actual shared harness: initial document, second tab, exact identity, active selection and preserved editor');
 }finally{if(env)await stop(env);}
})().catch(error=>{console.error(error);process.exitCode=1;});
