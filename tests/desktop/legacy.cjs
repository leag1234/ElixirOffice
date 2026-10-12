// SPDX-License-Identifier: AGPL-3.0-only
const {launch,stop,editable,root}=require('./harness.cjs'),{modal,keys,edit,text}=require('./lifecycle.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const results=[],failures=[],sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function check(source,format){
 const file=path.join(root,'tests/desktop/fixtures','public.'+source),before=sha(await fs.readFile(file)),target=path.join(root,'fixtures','legacy-import.'+format);
 await fs.unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e});
 const env=await launch({file,profile:'legacy-'+source+'-'+Date.now()});
 try{
  await editable(env);assert.equal(await env.page.evaluate(()=>EOLocalSession.format),format);await edit(env);
  await env.page.locator('#save').click();await modal(env);keys(env,'save-path',target);
  await env.page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
  assert(text(target).includes('EODESKTOP'));assert.equal(sha(await fs.readFile(file)),before);assert.deepEqual(env.errors,[]);
 }finally{await stop(env)}
 const fresh=await launch({file:target,profile:'legacy-reopen-'+source+'-'+Date.now()});
 try{await editable(fresh);assert.equal(await fresh.page.evaluate(()=>EOLocalSession.format),format);assert(text(target).includes('EODESKTOP'));assert.deepEqual(fresh.errors,[])}
 finally{await stop(fresh)}
 results.push({source,format,originalUnchanged:true,reopened:true,bytes:(await fs.stat(target)).size});
 await fs.writeFile(path.join(root,'results/legacy.json'),JSON.stringify(results,null,2));console.log('PASS legacy',source,format);
}
(async()=>{
 for(const [source,format] of [['doc','docx'],['xls','xlsx'],['ppt','pptx']]){
  try{await check(source,format)}catch(error){failures.push({source,error:error.message});console.error('FAIL legacy',source,error)}
 }
 await fs.writeFile(path.join(root,'results/legacy-failures.json'),JSON.stringify(failures,null,2));
 if(failures.length)throw Error(failures.length+' legacy import failures');
})().catch(error=>{console.error(error);process.exitCode=1});
