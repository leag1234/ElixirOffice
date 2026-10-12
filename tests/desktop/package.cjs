// SPDX-License-Identifier: AGPL-3.0-only
const {launch,stop,editable,root}=require('./harness.cjs'),{edit,text,modal,keys}=require('./lifecycle.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
(async()=>{
 const executable=process.env.EO_PACKAGE_EXECUTABLE;if(!executable)throw Error('EO_PACKAGE_EXECUTABLE is required');
 const label=process.env.EO_PACKAGE_LABEL||'package',file=path.join(root,'fixtures','packaged-'+label+'.docx');
 await fs.copyFile(path.join(root,'fixtures/sample.docx'),file);
 const env=await launch({executable,file:require('node:url').pathToFileURL(file).href,profile:label+'-'+Date.now()});
 try{
  await editable(env);await edit(env);await env.page.locator('#save').click();
  await env.page.waitForFunction(()=>window.EOLastSave&&!EOLocalSession.controller.isModified(),null,{timeout:90000});
  assert(text(file).includes('EODESKTOP'));assert.deepEqual(env.errors,[]);
  assert.equal(await env.page.evaluate(()=>typeof require),'undefined');
  await require('./privacy.cjs').networkDenied(env.page);
  await env.page.locator('#pdf').click();await modal(env);keys(env,'save-path',file.replace(/docx$/,'pdf'));
  await env.page.waitForFunction(()=>window.EOLastPdf,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>EOLastPdf.stats.backend),'wasm');
  const pdf=file.replace(/docx$/,'pdf');assert(cp.execFileSync('pdftotext',[pdf,'-'],{encoding:'utf8'}).includes('EODESKTOP'));
  console.log('PASS packaged',label,'argument/edit/atomic-save/native-PDF/offline/no-Node');
 }finally{await stop(env)}
 const fresh=await launch({executable,file,profile:label+'-reopen-'+Date.now()});
 try{await editable(fresh);assert.deepEqual(fresh.errors,[]);console.log('PASS packaged',label,'fresh-reopen')}finally{await stop(fresh)}
})().catch(e=>{console.error(e);process.exitCode=1});
