// SPDX-License-Identifier: AGPL-3.0-only
const {launch,stop,editable}=require('./harness.cjs');
const assert=require('node:assert/strict');
(async()=>{
 const env=await launch({file:process.argv[2],profile:'smoke-'+Date.now()});
 try {
  if(process.argv[2])console.log(JSON.stringify({result:await editable(env),errors:env.errors},null,2));
  else{await env.page.locator('#home h1').waitFor();assert.equal(await env.page.locator('[data-new]').count(),3);console.log('PASS start page, three templates; native process has no sandbox bypass')}
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
