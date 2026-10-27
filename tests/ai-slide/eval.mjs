// SPDX-License-Identifier: AGPL-3.0-only
// Public authored fixtures and the existing fire managed proxy only; no key/.env access.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium} from '../../tools/eval/lib.mjs';
const require=createRequire(import.meta.url),criteria=require('./criteria.cjs');
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),web=process.env.EO_WEB_APPS,base=process.env.EO_BASE,out=process.env.EO_SLIDE_RESULTS;
assert(web&&path.isAbsolute(web),'Explicit candidate web source required');
const deterministic=process.argv.includes('--deterministic');
if(deterministic){
 assert.equal(base,'http://127.0.0.1:18368','Deterministic checks use the isolated instance only; shared8080 forbidden');
 assert.equal(execFileSync('docker',['inspect','eo-ai-cell-A','--format','{{index .Config.Labels "org.elixiroffice.qa.owner"}}'],{encoding:'utf8'}).trim(),'A-ai-discover');
 assert.equal(execFileSync('docker',['port','eo-ai-cell-A','80/tcp'],{encoding:'utf8'}).trim(),'127.0.0.1:18368');
}else {
 assert.equal(process.env.EO_SLIDE_SHARED_AUTH,'release review','Fresh lead availability confirmation required');
 assert.equal(base,'http://127.0.0.1:8080','Real model uses only the explicitly authorized existing fire managed proxy');
}
assert.equal(process.env.EO_SLIDE_MANAGED_EVAL,'release review','Explicit owner authorization required');assert(out&&path.isAbsolute(out),'Owned result directory required');
fs.mkdirSync(out,{recursive:true,mode:0o700});
const tasks=JSON.parse(fs.readFileSync(path.join(repo,'tests/ai-slide/tasks.json')));assert.equal(tasks.length,30);
const affected=process.argv.includes('--affected'),pilot=process.argv.includes('--pilot'),smoke=process.argv.includes('--smoke');
const runs=affected||pilot||smoke||deterministic?1:3,selected=affected?tasks.filter(t=>['shorten-fr','notes-append-en'].includes(t.id)):smoke?tasks.slice(0,1):pilot?tasks.filter(t=>['generate-business-en','shorten-fr','notes-append-en','layout-content-fr','align-left-en','theme-citrus-fr','summarize-en','outline-fr'].includes(t.id)):tasks;
const source={
 core:fs.readFileSync(path.join(web,'apps/common/main/lib/elixir-ai/Core.js'),'utf8'),
 policy:fs.readFileSync(path.join(web,'apps/presentationeditor/main/app/elixir-ai/SlidePolicy.js'),'utf8'),
 tools:fs.readFileSync(path.join(web,'apps/presentationeditor/main/app/elixir-ai/SlideTools.js'),'utf8')
};
const testHashes=Object.fromEntries(['tasks.json','criteria.cjs','fixtures.py'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,'tests/ai-slide',n))).digest('hex')]));
const hashes=Object.fromEntries(Object.entries(source).map(([k,v])=>[k,crypto.createHash('sha256').update(v).digest('hex')]));
const fixtures=path.join(out,'fixtures');
execFileSync('python3',[path.join(repo,'tests/ai-slide/fixtures.py'),'--template',path.join(repo,'desktop/assets/templates/new.pptx'),'--tasks',path.join(repo,'tests/ai-slide/tasks.json'),'--out',fixtures],{stdio:'pipe'});
if(!deterministic){
 const config=await fetch(base+'/elixir-ai/config.json',{redirect:'error'}).then(r=>{assert(r.ok);return r.json()});
 assert.equal(Object.keys(config).some(k=>/key|token|secret/i.test(k)),false,'Unexpected secret field in public configuration');
 assert.equal(config.model,'gpt-4.1-mini');assert.equal(config.endpoint,'/elixir-ai/v1');assert.notEqual(config.enabled,false);
}
const uid='uid-A-slide-'+crypto.randomBytes(12).toString('hex'),results=[],browser=await chromium.launch();
const SNAPSHOT='(function(){var p=Api.GetPresentation();return JSON.stringify({count:p.GetSlidesCount(),width:p.GetWidth(),height:p.GetHeight(),masters:p.GetAllSlideMasters().length,slides:p.GetAllSlides().map(function(s){return {raw:JSON.parse(s.ToJSON(false,false,false,false)),layoutName:s.GetLayout().GetName(),colors:JSON.parse(s.GetTheme().GetColorScheme().ToJSON()),shapes:s.GetAllShapes().map(function(q){return {id:q.GetInternalId(),raw:JSON.parse(q.ToJSON()),position:{x:q.GetPosX(),y:q.GetPosY(),w:q.GetWidth(),h:q.GetHeight()}};})};})});})()';
async function cmd(frame,src){return frame.evaluate(src=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Public command deadline')),15000);Asc.editor.callCommand(src,true,v=>{clearTimeout(t);try{resolve(JSON.parse(v))}catch(e){reject(e)}})}),src)}
try{
 for(let run=1;run<=runs;run++)for(const task of selected){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),consoleErrors=[],requests=[];
  await context.addCookies([{name:'uid',value:uid,url:base}]);page.on('pageerror',()=>consoleErrors.push('pageerror'));page.on('console',m=>{if(m.type()==='error')consoleErrors.push('console error')});
  page.on('request',r=>{try{const u=new URL(r.url());if(/chat\/completions$/.test(u.pathname))requests.push({origin:u.origin,path:u.pathname});}catch{}});
  const started=Date.now();let frame,row={task:task.id,category:task.category,lang:task.lang,run,pass:false};
  try{
   const name='A-slide-'+crypto.randomBytes(8).toString('hex')+'.pptx',fd=new FormData();
   fd.append('uploadedFile',new Blob([fs.readFileSync(path.join(fixtures,task.id+'.pptx'))]),name);
   const upload=await fetch(base+'/example/upload',{method:'POST',body:fd,headers:{Cookie:'uid='+uid}}).then(r=>r.json());assert.equal(typeof upload.filename,'string','Owned synthetic upload failed');
   await page.goto(base+'/example/editor?fileName='+encodeURIComponent(upload.filename)+'&lang='+task.lang,{waitUntil:'load'});
   for(let n=0;n<400;n++){frame=page.frames().find(f=>f.url().includes('/presentationeditor/main/'));if(frame)break;await page.waitForTimeout(250)}
   assert(frame,'Presentation frame missing');
   await frame.waitForFunction(()=>{try{return PE.getController('Main')._isDocReady===true&&!!window.g_asc_plugins}catch{return false}},null,{timeout:90000});
   await frame.evaluate(({source})=>{let P,T;new Function('define','window',source.core)((d,f)=>f(),window);new Function('define',source.policy)((d,f)=>P=f());new Function('define','window',source.tools)((d,f)=>T=f(P),window);window.__slideEval=T.create(Asc.editor);},{source});
   const before=await cmd(frame,SNAPSHOT),modelStart=Date.now();
   const result=await frame.evaluate(async({instruction,lang,deterministic,task})=>{
    const AI=Common.ElixirAI,ts=window.__slideEval;
    if(deterministic){
     const c=await ts.init(),kind=task.criteria.type;let r={ok:true,changed:false,answer:''};
     try{
      let tool,args;
      if(kind==='generate'){tool='create_slides';args={slides:task.criteria.titles.map(title=>({title,bullets:task.criteria.requiredBody||['Public factual point '+(task.criteria.requiredBodyTerms||[]).join(' '),'Second public point']}))};}
      else if(kind==='rewrite'){const shape=c.context.slides[0].shapes[1];tool='rewrite_text';args={slide:1,shape_id:shape.id,paragraphs:[{index:1,expected:shape.paragraphs[0].text,text:task.lang==='fr'?'Merci : 120 livres en 15 jours pour la bibliothèque.':'Thank you: 120 books in 15 days for the library.'}]};}
      else if(kind==='notes'){tool='set_notes';args={slide:task.criteria.slide,expected:c.context.slides[task.criteria.slide-1].notes,text:task.criteria.expected,mode:'replace'};}
      else if(kind==='layout'){tool='set_layout';args={slides:[task.criteria.slide],master:1,layout:task.criteria.layoutName==='Blank'?7:2};}
      else if(kind==='align'){tool='align_shapes';args={slide:1,shape_ids:c.context.slides[0].shapes.map(s=>s.id),alignment:task.criteria.alignment};}
      else if(kind==='theme'){tool='apply_theme';args={slides:[task.criteria.slide],master:2};}
      else{tool='summarize_deck';args={};}
      const plan=await ts.execute('submit_plan',{goal:'Deterministic qualification',read_only:!ts.isMutating(tool),steps:[{tool,purpose:'Qualification'}]},c);if(!plan.ok)throw Error(JSON.stringify(plan));
      const step=await ts.execute(tool,args,c);if(!step.ok)throw Error(JSON.stringify(step));r.changed=!!step.mutated;
      r.answer='project business projet entreprise 120 15 2400 1800 600';
      await ts.end(c,true);return r;
     }catch(e){await ts.end(c,false);throw e;}
    }
    await AI.Settings.loadManaged();const settings=AI.Settings.get();
    if(!settings.managed||settings.endpoint!=='/elixir-ai/v1'||settings.model!=='gpt-4.1-mini'||settings.apiKey)throw Error('Approved managed configuration required');
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);
    try{return await AI.Orchestrator.run({instruction,lang,toolset:ts,settings:{...settings,mode:'scaffold',verify:'always',sampling:'deterministic',maxRounds:12},signal:abort.signal})}
    finally{clearTimeout(timer);}
   },{instruction:task.instruction,lang:task.lang,deterministic,task});
   row.modelMs=Date.now()-modelStart;
   const after=await cmd(frame,SNAPSHOT),failures=criteria.evaluate(task,before,after,result);let undo=null;
   if(result.changed){await frame.evaluate(()=>window.__slideEval.undo());await page.waitForTimeout(150);const restored=await cmd(frame,SNAPSHOT);undo=criteria.snapshotEqual(before,restored);if(!undo)failures.push('one Undo did not restore snapshot');}
   if(consoleErrors.length)failures.push('renderer console error');if(requests.some(r=>r.origin!==base||r.path!=='/elixir-ai/v1/chat/completions'))failures.push('unapproved model route');if(deterministic&&requests.length)failures.push('deterministic run sent model request');
   row={...row,pass:failures.length===0,failures,undo,consoleErrors:consoleErrors.length,requests:requests.length,usage:result.entry?.usage,answer:result.answer||'',verification:result.verification,tools:result.entry?.rounds?.flatMap(r=>r.tool_calls)||[],outcome:result.entry?.outcome,error:result.entry?.error||null,after};
  }catch(e){row.failures=['harness or transport exception: '+e.name];row.error=String(e.message).slice(0,400);}
  finally{row.totalMs=Date.now()-started;results.push(row);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({sourceHashes:hashes,testHashes,managedModel:deterministic?null:'gpt-4.1-mini',mode:deterministic?'deterministic-public-tools':'scaffold',results},null,2)+'\n');console.log(JSON.stringify({task:row.task,run,pass:row.pass,ms:row.modelMs,failures:row.failures,error:row.error}));await context.close();}
 }
}finally{await browser.close()}
const times=results.map(r=>r.modelMs).filter(Number.isFinite).sort((a,b)=>a-b),q=p=>times.length?times[Math.ceil(p*times.length)-1]:null;
const summary={tasks:selected.length,runs,attempts:results.length,pass:results.filter(r=>r.pass).length,medianMs:q(.5),p90Ms:q(.9),sourceHashes:hashes,testHashes,deterministic};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));process.exitCode=results.every(r=>r.pass)?0:1;
