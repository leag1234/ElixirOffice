// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Exercise real native format-loss Cancel/Save a Copy decisions, never dialog mocks.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {launch,stop,editable,root,fixture}=require('./harness.cjs'),{edit,text}=require('./lifecycle.cjs'),native=require('./save-as-native.cjs'),action=require('./file-action.cjs');
const report=[];
async function absent(file){await assert.rejects(fs.stat(file),error=>error.code==='ENOENT')}
async function check(format){
 const source=await fixture('sample.'+format),original=await fs.readFile(source),folder=path.dirname(source),cancelled=path.join(folder,'cancelled.pdf'),target=path.join(folder,'copy.pdf');
 await absent(cancelled);await absent(target);
 let env=await launch({file:source,profile:'pdf-decisions-'+format+'-'+Date.now()});
 const row={format};
 try{
  await editable(env);await edit(env);assert.equal(await env.page.evaluate(()=>typeof require),'undefined');
  const previous=await env.page.evaluate(()=>window.EOLastPdf||null);
  const cancel=await native.pdf(env,cancelled,{cancel:true});
  await env.page.waitForFunction(()=>!EODesktopState(false).opening,null,{timeout:10000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure||null),null);
  assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),true);
  assert.deepEqual(await env.page.evaluate(()=>window.EOLastPdf||null),previous,'Cancel must not create a PDF completion receipt');
  await absent(cancelled);assert.deepEqual(await fs.readFile(source),original);
  row.cancel={native:cancel,noOutput:true,noPdfReceipt:true,dirtyPreserved:true,originalUntouched:true};
  await fs.writeFile(path.join(root,'results/pdf-save-as-native-progress.json'),JSON.stringify({complete:report,current:row},null,2)+'\n');
  const saved=await native.pdf(env,target);
  await env.page.waitForFunction(()=>window.EOLastPdf||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure||null),null);
  const pdf=await env.page.evaluate(()=>window.EOLastPdf);assert(pdf.bytes>100);assert.equal(pdf.stats.backend,'wasm');
  const info=cp.execFileSync('pdfinfo',[target],{encoding:'utf8',timeout:10000}),pages=Number(/Pages:\s+(\d+)/.exec(info)[1]);assert.equal(pages,pdf.stats.pages);
  assert(cp.execFileSync('pdftotext',[target,'-'],{encoding:'utf8',timeout:10000}).replace(/\s/g,'').includes('EODESKTOP'),'Native PDF lost the edit');
  assert.deepEqual(await fs.readFile(source),original,'Save a PDF copy must not overwrite the office source');
  assert.deepEqual(env.errors,[]);assert.equal(await env.page.evaluate(()=>typeof require),'undefined');
  assert.deepEqual(env.requests.filter(r=>!r.url.startsWith('eoapp://desktop.elixiroffice.invalid/')&&!/^(blob:|data:)/.test(r.url)),[]);
  assert(env.requests.every(r=>r.method==='GET'));
  row.copy={native:saved,bytes:(await fs.stat(target)).size,wasm:true,pages,marker:true,originalUntouched:true,noNode:true,errors:env.errors};
  // A separate explicit source save leaves no dirty close prompt during cleanup.
  // Original preservation was asserted above, before this intentional source write.
  await action(env.page,'save');
  await env.page.waitForFunction(()=>window.EOLastSave&&!EOLocalSession.controller.isModified(),null,{timeout:90000});
  assert(text(source).includes('EODESKTOP'));await stop(env);env=null;
  env=await launch({file:target,profile:'pdf-decisions-reopen-'+format+'-'+Date.now()});await editable(env);
  assert.equal(await env.page.evaluate(()=>EOLocalSession.format),'pdf');
  assert(await env.page.evaluate(()=>!!EOLocalSession.api.getPDFDoc()));
  assert.deepEqual(env.errors,[]);assert.equal(await env.page.evaluate(()=>typeof require),'undefined');row.copy.freshPdfReopen=true;
  report.push(row);await fs.writeFile(path.join(root,'results/pdf-save-as-native.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS native PDF decisions',format,JSON.stringify(row));
 }finally{if(env)await stop(env)}
}
(async()=>{for(const format of ['docx','xlsx','pptx'])await check(format)})().catch(error=>{console.error(error);process.exitCode=1});
