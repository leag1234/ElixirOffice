// SPDX-License-Identifier: AGPL-3.0-only
// Authored fixtures only, existing server-managed proxy only. No key/.env access.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../tools/eval/lib.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const web=process.env.EO_WEB_APPS,base=process.env.EO_BASE;
assert(web&&path.isAbsolute(web),'Explicit candidate web source required');
assert.equal(base,'http://127.0.0.1:8080','release review approved existing fire proxy only');
assert.equal(process.env.EO_CELL_MANAGED_EVAL,'release review','Explicit release review managed-eval acknowledgment required');
const out=process.env.EO_CELL_RESULTS;assert(out&&path.isAbsolute(out),'Owned result folder required');
fs.mkdirSync(out,{recursive:true,mode:0o700});
const tasks=JSON.parse(fs.readFileSync(path.join(repo,'tests/ai-cell/tasks.json')));
assert.equal(tasks.length,30);
const affected=process.argv.includes('--affected'),pilot=process.argv.includes('--pilot'),smoke=process.argv.includes('--smoke')||pilot,runs=smoke?1:3,selected=affected?tasks.filter(t=>['numbers-comma','pivot-teachers'].includes(t.id)):pilot?tasks.filter(t=>['explain-threshold','dates-dmy','numbers-comma','pivot-sales','summarize-sales'].includes(t.id)):smoke?tasks.slice(0,1):tasks;
const source={
 core:fs.readFileSync(path.join(web,'apps/common/main/lib/elixir-ai/Core.js'),'utf8'),
 policy:fs.readFileSync(path.join(web,'apps/spreadsheeteditor/main/app/elixir-ai/CellPolicy.js'),'utf8'),
 tools:fs.readFileSync(path.join(web,'apps/spreadsheeteditor/main/app/elixir-ai/CellTools.js'),'utf8')
};
const fixtures=path.join(out,'fixtures');
execFileSync('python3',[path.join(repo,'tests/ai-cell/fixtures.py'),'--template',path.join(repo,'desktop/assets/templates/new.xlsx'),'--output',fixtures],{stdio:'pipe'});
const hashes=Object.fromEntries(Object.entries(source).map(([k,v])=>[k,crypto.createHash('sha256').update(v).digest('hex')]));
const publicConfig=await fetch(base+'/elixir-ai/config.json',{redirect:'error'}).then(r=>{assert(r.ok);return r.json()});
assert.equal(publicConfig.model,'gpt-4.1-mini');assert.equal(publicConfig.endpoint,'/elixir-ai/v1');assert.notEqual(publicConfig.enabled,false);
const uid='uid-A-cell-'+crypto.randomBytes(12).toString('hex'),results=[];
const browser=await chromium.launch();
const SNAPSHOT='(function(){return JSON.stringify(Api.GetSheets().map(function(s){var f=Api.GetWorksheetFunction(),cells=[];for(var y=1;y<=30;y++){var row=[];for(var x=1;x<=34;x++){var q=s.GetCells(y,x);row.push({value:String(q.GetValue2()),formula:f.ISFORMULA(q)===true?String(q.GetFormula()):null,number:f.COUNT(q)===1,format:q.GetNumberFormat()});}cells.push(row);}return {name:s.GetName(),cells:cells,hidden:Array.from({length:30},function(_,i){return s.GetRows((i+1)+":"+(i+1)).GetHidden();}),charts:s.GetAllCharts().length,pivots:s.GetAllPivotTables().map(function(p){return p.GetTableRange2().GetValue2();})};}));})()';
async function cmd(frame,src){return frame.evaluate(src=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Public command deadline')),15000);Asc.editor.callCommand(src,true,v=>{clearTimeout(t);try{resolve(JSON.parse(v))}catch(e){reject(e)}})}),src)}
function cell(snapshot,address){const m=/^([A-Z]+)([0-9]+)$/.exec(address);let c=0;for(const x of m[1])c=c*26+x.charCodeAt(0)-64;return snapshot[0].cells[+m[2]-1][c-1]}
function criteria(t,before,after,result){
 const errors=[],c=t.criteria;
 for(const [a,v]of Object.entries(c.cells||{}))if(cell(after,a).value!==v)errors.push(a+' expected '+v+' got '+cell(after,a).value);
 for(const a of c.formulas||[])if(!cell(after,a).formula)errors.push(a+' not a formula');
 for(const a of c.literal||[])if(cell(after,a).formula)errors.push(a+' executed as formula');
 for(const a of c.numeric||[])if(!cell(after,a).number)errors.push(a+' not numeric');
 for(const a of c.dateFormat||[])if(cell(after,a).format!=='yyyy-mm-dd')errors.push(a+' date format');
 if(c.hidden&&JSON.stringify(after[0].hidden.slice(1,c.hidden.length+1))!==JSON.stringify(c.hidden))errors.push('row visibility');
 if(c.charts!==undefined&&after.reduce((n,s)=>n+s.charts,0)!==c.charts)errors.push('chart count');
 if(c.pivotValues){const values=after.flatMap(s=>s.pivots.flat(2)).map(String);for(const v of c.pivotValues)if(!values.includes(v))errors.push('pivot missing '+v);}
 const answer=String(result.answer||result.summary||'').toLowerCase();
 for(const v of c.answerContains||[])if(!answer.includes(v.toLowerCase()))errors.push('answer missing '+v);
 if(c.readOnly&&JSON.stringify(before)!==JSON.stringify(after))errors.push('read-only task changed workbook');
 if(!result.ok)errors.push('orchestrator failure');
 if(result.verification?.goal_met===false)errors.push('goal not met');
 return errors;
}
try{
 for(let run=1;run<=runs;run++)for(const task of selected){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),consoleErrors=[],requests=[];
  await context.addCookies([{name:'uid',value:uid,url:base}]);
  page.on('pageerror',()=>consoleErrors.push('pageerror'));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push('console error')});
  page.on('request',r=>{try{const u=new URL(r.url());if(/chat\/completions$/.test(u.pathname))requests.push({origin:u.origin,path:u.pathname});}catch{}});
  const started=Date.now();let frame,row={task:task.id,category:task.category,lang:task.lang,run,pass:false};
  try{
   const name='A-cell-'+crypto.randomBytes(8).toString('hex')+'.xlsx',fd=new FormData();
   fd.append('uploadedFile',new Blob([fs.readFileSync(path.join(fixtures,task.id+'.xlsx'))]),name);
   const upload=await fetch(base+'/example/upload',{method:'POST',body:fd,headers:{Cookie:'uid='+uid}}).then(r=>r.json());
   assert.equal(typeof upload.filename,'string','Owned synthetic upload failed');
   await page.goto(base+'/example/editor?fileName='+encodeURIComponent(upload.filename)+'&lang='+task.lang,{waitUntil:'load'});
   for(let n=0;n<400;n++){frame=page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/'));if(frame)break;await page.waitForTimeout(250)}
   assert(frame,'Spreadsheet frame missing');
   await frame.waitForFunction(()=>{try{return SSE.getController('Main')._isDocReady===true&&!!window.g_asc_plugins}catch{return false}},null,{timeout:90000});
   await frame.evaluate(({source})=>{
    let P,T;
    new Function('define','window',source.core)((d,f)=>f(),window);
    new Function('define',source.policy)((d,f)=>P=f());
    new Function('define','window',source.tools)((d,f)=>T=f(P),window);
    window.__cellEval=T.create(Asc.editor);
   },{source});
   await cmd(frame,'(function(){Api.GetActiveSheet().GetRange('+JSON.stringify(task.selection)+').Select();return JSON.stringify({ok:true});})()');
   const before=await cmd(frame,SNAPSHOT),modelStart=Date.now();
   const result=await frame.evaluate(async({instruction,lang})=>{
    const AI=Common.ElixirAI;await AI.Settings.loadManaged();
    const s=AI.Settings.get();if(!s.managed||s.endpoint!=='/elixir-ai/v1'||s.model!=='gpt-4.1-mini'||s.apiKey)throw Error('Approved managed configuration required');
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);
    try{return await AI.Orchestrator.run({instruction,lang,toolset:window.__cellEval,settings:{...s,mode:'scaffold',verify:'always',sampling:'deterministic',maxRounds:12},signal:abort.signal})}
    finally{clearTimeout(timer);}
   },{instruction:task.instruction,lang:task.lang});
   row.modelMs=Date.now()-modelStart;
   const after=await cmd(frame,SNAPSHOT),failures=criteria(task,before,after,result);
   let undo=null;
   if(result.changed){
    await frame.evaluate(()=>window.__cellEval.undo());await page.waitForTimeout(150);
    const restored=await cmd(frame,SNAPSHOT);undo=JSON.stringify(restored)===JSON.stringify(before);
    if(!undo)failures.push('one Undo did not restore snapshot');
   }
   if(consoleErrors.length)failures.push('renderer console error');
   if(requests.some(r=>r.origin!==base||r.path!=='/elixir-ai/v1/chat/completions'))failures.push('unapproved model route');
   row={...row,pass:failures.length===0,failures,undo,consoleErrors:consoleErrors.length,requests:requests.length,rounds:result.entry?.rounds?.length||0,usage:result.entry?.usage,answer:result.answer||'',verification:result.verification,tools:result.entry?.rounds?.flatMap(r=>r.tool_calls)||[],outcome:result.entry?.outcome,error:result.entry?.error||null,after};
  }catch(e){row.failures=['harness or transport exception: '+e.name];row.error=String(e.message).slice(0,400)}
  finally{row.totalMs=Date.now()-started;results.push(row);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({sourceHashes:hashes,managedModel:'gpt-4.1-mini',mode:'scaffold',smoke,results},null,2)+'\n');console.log(JSON.stringify({task:row.task,run,pass:row.pass,ms:row.modelMs,failures:row.failures}));await context.close();}
 }
}finally{await browser.close()}
const times=results.map(r=>r.modelMs).filter(Number.isFinite).sort((a,b)=>a-b),quantile=p=>times.length?times[Math.ceil(p*times.length)-1]:null;
const summary={tasks:selected.length,runs,attempts:results.length,pass:results.filter(r=>r.pass).length,medianMs:quantile(.5),p90Ms:quantile(.9),sourceHashes:hashes};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
process.exitCode=results.every(r=>r.pass)?0:1;
