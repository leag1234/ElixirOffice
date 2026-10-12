// SPDX-License-Identifier: AGPL-3.0-only
const {launch,stop,editable,root,sleep}=require('./harness.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function memory(pid){
 let total=0;
 async function visit(id){
  try{
   const rollup=await fs.readFile('/proc/'+id+'/smaps_rollup','utf8');
   total+=Number(/^Pss:\s+(\d+)/m.exec(rollup)[1]);
   const children=(await fs.readFile('/proc/'+id+'/task/'+id+'/children','utf8')).trim().split(/\s+/).filter(Boolean);
   await Promise.all(children.map(visit));
  }catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e}
 }
 await visit(String(pid));return total;
}
(async()=>{
 const rows=[];
 for(const [name,pages] of [['empty',1],['synth100',97]]){
  const file=path.join(root,'fixtures',name+'.docx');
  for(const mode of ['fresh','warm']){
   if(mode==='warm'){const seed=await launch({file,profile:'bench-'+name+'-warm'});try{await editable(seed)}finally{await stop(seed)}}
   for(let run=0;run<5;run++){
    const profile='bench-'+name+'-'+mode+(mode==='fresh'?'-'+Date.now()+'-'+run:'');
    const started=performance.now(),env=await launch({file,profile,onPage:async page=>{
     await page.waitForURL('eoapp://desktop.elixiroffice.invalid/index.html',{timeout:120000});
     await page.evaluate(()=>{
      const deadline=Date.now()+120000;
      function ready(){
       const api=globalThis.EOLocalSession?.api,d=api?.WordControl.m_oDrawingDocument,l=api?.WordControl.m_oLogicDocument;
       if(d?.m_lPagesCount>0&&d.m_lCountCalculatePages>=d.m_lPagesCount&&!l.FullRecalc?.Id){window.EOLayoutReadyEpochMs=Date.now();return}
       if(Date.now()<deadline)setTimeout(ready,100);
      }
      ready();
     });
    }});
    try{
     await editable(env);
     await env.page.waitForFunction(pages=>EOLocalSession.api.WordControl.m_oLogicDocument.GetPagesCount()>=pages,pages,{timeout:120000});
     await env.page.waitForFunction(()=>{const api=EOLocalSession.api,d=api.WordControl.m_oDrawingDocument,l=api.WordControl.m_oLogicDocument;return d.m_lPagesCount>0&&d.m_lCountCalculatePages>=d.m_lPagesCount&&!l.FullRecalc?.Id},null,{timeout:120000});
     await env.page.waitForFunction(()=>window.EOLayoutReadyEpochMs,null,{timeout:120000});
     const observed=performance.now()-started,elapsed=(await env.page.evaluate(()=>window.EOLayoutReadyEpochMs))-env.launchEpochMs,count=await env.page.evaluate(()=>EOLocalSession.api.WordControl.m_oLogicDocument.GetPagesCount());
     assert.equal(count,pages);assert.deepEqual(env.errors,[]);
     rows.push({document:name,mode,run,editableMs:Math.round(elapsed),observedHarnessMs:Math.round(observed),pages:count,readyPssKiB:await memory(env.application.pid)});
     console.log(JSON.stringify(rows.at(-1)));
     await fs.writeFile(path.join(root,'results/benchmark.json'),JSON.stringify({cache:'external spawn to renderer layout-ready epoch; same full-layout condition and100ms polling as prototype; harness observation also retained; fresh/warm app profiles; OS page cache unchanged; PSS sampled at ready, not peak',rows},null,2));
    }finally{await stop(env)}
   }
  }
 }
})().catch(e=>{console.error(e);process.exitCode=1});
