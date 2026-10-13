// SPDX-License-Identifier: AGPL-3.0-only
// Additional locked-desktop checks; this does not replace the native-sheet suite.
'use strict';
const {launch,stop,editable,root,fixture}=require('./harness.cjs'),{edit,text}=require('./lifecycle.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
(async()=>{
 assert.equal(process.platform,'darwin');const executable=process.env.EO_PACKAGE_EXECUTABLE;assert(executable);
 const originals={};for(const format of ['docx','xlsx','pptx'])originals[format]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,'fixtures/sample.'+format))).digest('hex');
 const file=await fixture('sample.docx'),profile='mac-unattended-'+Date.now(),env=await launch({executable,file:require('node:url').pathToFileURL(file).href,profile});
 try{
  await editable(env);assert((await fs.stat(path.join(env.directory,'desktop-settings.json'))).isFile());
  assert.deepEqual(await env.page.evaluate(()=>eoDesktop.fonts()),[]);await edit(env);await require('./file-action.cjs')(env.page,'save');
  await env.page.waitForFunction(()=>window.EOLastSave&&!EOLocalSession.controller.isModified(),null,{timeout:90000});
  assert(text(file).includes('EODESKTOP'));assert.equal(await env.page.evaluate(()=>typeof require),'undefined');assert.deepEqual(env.errors,[]);
  await require('./privacy.cjs').networkDenied(env.page);console.log('PASS rebuilt image fileURI/edit/atomic-save/profile/no-Node/network denial');
  const pdf=await env.page.evaluate(async()=>{
   const {win,api,format}=EOLocalSession;
   const script=url=>new Promise((resolve,reject)=>{const el=win.document.createElement('script');el.src=url;el.onload=resolve;el.onerror=reject;win.document.head.append(el)});
   for(const name of ['clientpdf.js','wasm-pdf.js'])await script('/example/local-assets/sdkjs/common/clientpdf/'+name);
   await script('/example/local-assets/sdkjs/common/desktop/pdf.js');
   const result=await win.EODesktopPdf(api,format);return {bytes:Array.from(result.bytes),stats:result.stats};
  });
  assert.equal(pdf.stats.backend,'wasm');const destination=file.replace(/docx$/,'pdf');await fs.writeFile(destination,Buffer.from(pdf.bytes));
  assert(cp.execFileSync('pdftotext',[destination,'-'],{encoding:'utf8'}).includes('EODESKTOP'));
  console.log('PASS rebuilt image actual Wasm PDF pipeline/saved edit (native save sheet not operated)');
  for(const [from,to] of [['docx','odt'],['xlsx','ods'],['pptx','odp']]){
   const bytes=await fs.readFile(path.join(root,'fixtures/sample.'+from));
   const converted=await env.page.evaluate(async({bytes,from,to})=>Array.from(await EOLocalSession.win.EOWasmConvert.convert(new EOLocalSession.win.Uint8Array(bytes),from,to)),{bytes:Array.from(bytes),from,to});
   await fs.writeFile(path.join(root,'fixtures/sample-from-x2t.'+to),Buffer.from(converted));
  }
  console.log('PASS derived ODF fixtures regenerated from new ElixirOffice samples');
 }finally{await stop(env)}
 const reopened=await launch({executable,file,profile});try{await editable(reopened);assert.deepEqual(reopened.errors,[]);assert.equal(await reopened.page.evaluate(()=>typeof require),'undefined');assert.equal(text(file).includes('EODESKTOP'),true);assert.deepEqual(await reopened.page.evaluate(()=>eoDesktop.fonts()),[]);console.log('PASS rebuilt image fresh reopen/denied consent persistence');}finally{await stop(reopened)}
 for(const format of ['docx','xlsx','pptx','odt','ods','odp']){
  const source=['odt','ods','odp'].includes(format)?'sample-from-x2t.'+format:'sample.'+format,target=await fixture(source);
  const run=await launch({executable,file:target,profile:'mac-six-'+format+'-'+Date.now()});try{await editable(run);await edit(run);await require('./file-action.cjs')(run.page,'save');await run.page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:90000});assert.equal(await run.page.evaluate(()=>window.EOLocalFailure),null);assert(text(target).includes('EODESKTOP'));assert.deepEqual(run.errors,[]);console.log('PASS new ElixirOffice fixture temporary edit/save',format);}finally{await stop(run)}
 }
 for(const format of ['docx','xlsx','pptx'])assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(root,'fixtures/sample.'+format))).digest('hex'),originals[format]);
 console.log('PASS immutable sample hashes unchanged after all edits');
 console.log('UNVERIFIED native Print/dirty-close/menu interactions while screen locked; full native-sheet suite unchanged');
})().catch(error=>{console.error(error);process.exitCode=1});
