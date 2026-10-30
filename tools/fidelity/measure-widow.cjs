// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),
 assert=require('node:assert/strict'),crypto=require('node:crypto');
const [corpusArg,outputArg,executableArg]=process.argv.slice(2);
assert.equal(process.platform,'linux','Owned Xvfb tests require Linux');
assert(corpusArg&&outputArg&&executableArg,'Usage: node measure-widow.cjs CORPUS OUTPUT EXECUTABLE');
const corpus=path.resolve(corpusArg),output=path.resolve(outputArg),executable=path.resolve(executableArg);
for(const value of [corpus,output])assert(!value.split(path.sep).some(p=>['corpus-\u0072eal','corpus-private'].includes(p)),'Public probes only');
process.env.EO_DESKTOP_ROOT=output;process.env.EO_TEST_FONT_DECLINED='1';
const {launch,stop,editable}=require('../../tests/desktop/harness.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'desktop.Xauthority'),'');
 const manifest=JSON.parse(await fs.readFile(path.join(corpus,'manifest.json'),'utf8'));
 assert.equal(manifest.origin,'Original synthetic data; no input documents');
 for(const row of manifest.cases)assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id),'Invalid original probe id');
 assert(process.env.EO_FIDELITY_XVFB,'Explicit owned-display executable required');
 const log=await fs.open(path.join(output,'display.log'),'w');
 const display=cp.spawn(process.env.EO_FIDELITY_XVFB,['-screen','0','1360x960x24','-nolisten','tcp','-displayfd','1'],{stdio:['ignore','pipe',log.fd]});
 let env;const rows=[];
 try{
  const number=await new Promise((ok,no)=>{let value='';const timer=setTimeout(()=>no(Error('Display timeout')),20000);
   display.stdout.on('data',b=>{value+=b;if(value.includes('\n')){clearTimeout(timer);ok(value.trim())}});
   display.on('error',e=>{clearTimeout(timer);no(e)})});
  assert(/^\d+$/.test(number));process.env.EO_DESKTOP_DISPLAY=':'+number;
  for(const row of manifest.cases){
   const file=path.join(corpus,row.id+'.docx');assert.equal(sha(await fs.readFile(file)),row.sha256);
   env=await launch({file,executable,profile:row.id});await editable(env);
   let frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
   await frame.waitForFunction(()=>{const e=Asc.editor,l=e.WordControl.m_oLogicDocument;return e.getCountPages()>0&&!(l.FullRecalc&&l.FullRecalc.Id)&&!e.isLongAction()},null,{timeout:120000});
   const observe=()=>frame.evaluate(marker=>{
    const e=Asc.editor,d=e.WordControl.m_oLogicDocument;
    const all=d.GetAllParagraphs();
    return {pages:e.getCountPages(),bodyCount:d.Content.length,allText:all.map(p=>p.GetText({Numbering:false})),drawingCount:d.GetAllDrawingObjects().length,
     targets:all.filter(p=>p.GetText({Numbering:false}).includes(marker)).map(p=>({
      text:p.GetText({Numbering:false}),widow:p.Get_CompiledPr2(false).ParaPr.WidowControl,
      directBody:p.Parent===d,ownerBody:p.Parent.GetDocumentContentForRecalcInfo()===d,
      lineCount:p.Lines.length,startPage:p.GetAbsoluteStartPage(),
      pages:p.Pages.map(x=>({start:x.StartLine,end:x.EndLine,y:x.Y,bottom:x.Bounds.Bottom}))}))};
   },row.marker||'TARGET');
   const model=await observe();
   await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.RecalculateFromStart(true,true));
   await frame.waitForFunction(()=>!Asc.editor.WordControl.m_oLogicDocument.FullRecalc.Id,null,{timeout:120000});
   assert.deepEqual(await observe(),model,'Repeated recalc changed model');
   await fs.writeFile(path.join(output,'results',row.id+'-model.json'),JSON.stringify(model,null,2)+'\n');
   assert.equal(model.targets.length,1);assert.equal(model.targets[0].lineCount,row.lines);
   assert.equal(model.targets[0].widow,row.mode!=='off');
   assert.equal(model.targets[0].directBody,(row.directBody??row.depth===0));assert.equal(model.targets[0].ownerBody,row.ownerBody??true);
   assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>r.method==='GET'&&/^(eoapp:|blob:|data:)/.test(r.url)));
   if(process.env.EO_WIDOW_ROUNDTRIP==='1'){
    const bytes=await env.page.evaluate(async()=>{
     const s=await EOLocalSession.controller.snapshot();
     return Array.from(await EOLocalSession.win.EOWasmConvert.convert(s.bytes,s.format,'docx',{resources:s.resources}));
    });
    const saved=path.join(output,'results',row.id+'-roundtrip.docx');
    await fs.writeFile(saved,Buffer.from(bytes));await stop(env);env=null;
    env=await launch({file:saved,executable,profile:row.id+'-reopen'});await editable(env);
    frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
    await frame.waitForFunction(()=>!Asc.editor.WordControl.m_oLogicDocument.FullRecalc.Id&&!Asc.editor.isLongAction(),null,{timeout:120000});
    assert.deepEqual(await observe(),model,'Save/reopen changed widow flow or content-control structure');
    assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>r.method==='GET'&&/^(eoapp:|blob:|data:)/.test(r.url)));
   }
   rows.push({...row,model,errors:env.errors});
   await fs.writeFile(path.join(output,'observations.json'),JSON.stringify({rows},null,2)+'\n');
   console.log(row.id,JSON.stringify(model.targets[0].pages));
   await stop(env);env=null;
  }
  const failures=[];
  const before=process.argv[5]?JSON.parse(await fs.readFile(process.argv[5],'utf8')).rows:null;
  const scopes=manifest.cases.some(row=>row.scope);

  for(const row of rows){
   if(row.expectedPages){
    const t=row.model.targets[0];
    const actual=t.pages.map((p,i)=>({page:t.startPage+i+1,start:p.start,end:p.end})).filter(p=>p.end>=p.start);
    if(JSON.stringify(actual)!==JSON.stringify(row.expectedPages))failures.push({
     id:row.id,requirement:'independent expected page allocation',actual,expected:row.expectedPages});
   }
   const direct=before?(row.ownerBody&&!['frame','floating-table','manual-break'].includes(row.scope)
    ?rows.find(x=>x.depth===0&&x.scope===row.scope):before.find(x=>x.id===row.id)):scopes?row:
    rows.find(x=>x.depth===0&&x.mode===row.mode&&x.fill===row.fill&&x.lines===row.lines&&x.scope===row.scope);
   const layout=x=>({pages:x.model.pages,startPage:x.model.targets[0].startPage,
    ranges:x.model.targets[0].pages.map(p=>[p.start,p.end])});
   if(JSON.stringify(layout(row))!==JSON.stringify(layout(direct)))failures.push({id:row.id,actual:layout(row),expected:layout(direct)});
  }
  await fs.writeFile(path.join(output,'verdict.json'),JSON.stringify({total:rows.length,comparison:before?'control-baseline-equivalence':scopes?'baseline-observations':'body-SDT-equivalence',failures},null,2)+'\n');
  assert.deepEqual(failures,[],'SDT body flow must match direct body widow behavior');
 }finally{if(env)await stop(env);display.kill('SIGTERM');await log.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
