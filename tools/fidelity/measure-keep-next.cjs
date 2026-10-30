// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),
 assert=require('node:assert/strict'),crypto=require('node:crypto');
const [corpusArg,outputArg,executableArg]=process.argv.slice(2);
assert.equal(process.platform,'linux');
assert(corpusArg&&outputArg&&executableArg,'Usage: node measure-keep-next.cjs CORPUS OUTPUT PACKAGED_EXECUTABLE');
const corpus=path.resolve(corpusArg),output=path.resolve(outputArg),executable=path.resolve(executableArg);
for(const value of [corpus,output])assert(!value.split(path.sep).some(p=>['corpus-\u0072eal','corpus-private'].includes(p)),'Public probes only');
process.env.EO_DESKTOP_ROOT=output;process.env.EO_TEST_FONT_DECLINED='1';
const {launch,stop,editable}=require('../../tests/desktop/harness.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const layout=m=>({pages:m.pages,paragraphs:m.markers.map(p=>({kind:p.kind,
 ranges:p.pages.filter(x=>x.end>=x.start).map(x=>({page:x.page,start:x.start,end:x.end}))}))});
const stable=m=>({layout:layout(m),text:m.allText,controls:m.controls,tables:m.tables,
 properties:m.markers.map(p=>({kind:p.kind,keep:p.keep,keepLines:p.keepLines,pageBefore:p.pageBefore,widow:p.widow,ownerBody:p.ownerBody}))});
(async()=>{
 await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'desktop.Xauthority'),'');
 const manifest=JSON.parse(await fs.readFile(path.join(corpus,'manifest.json'),'utf8'));
 assert.equal(manifest.origin,'Original synthetic data; no input documents');
 for(const row of manifest.cases)assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id));
 assert(process.env.EO_FIDELITY_XVFB,'Explicit owned-display executable required');
 const displayLog=await fs.open(path.join(output,'display.log'),'w');
 const display=cp.spawn(process.env.EO_FIDELITY_XVFB,['-screen','0','1360x960x24','-nolisten','tcp','-displayfd','1'],{stdio:['ignore','pipe',displayLog.fd]});
 let env,frame;const rows=[];
 try{
  const number=await new Promise((ok,no)=>{let value='';const timer=setTimeout(()=>no(Error('Display timeout')),20000);
   display.stdout.on('data',b=>{value+=b;if(value.includes('\n')){clearTimeout(timer);ok(value.trim())}});
   display.on('error',e=>{clearTimeout(timer);no(e)})});
  assert(/^\d+$/.test(number));process.env.EO_DESKTOP_DISPLAY=':'+number;
  const ready=async()=>{await editable(env);frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
   await frame.waitForFunction(()=>{const e=Asc.editor,d=e.WordControl.m_oLogicDocument;return e.getCountPages()>0&&!d.FullRecalc.Id&&!e.isLongAction()},null,{timeout:120000})};
  const observe=()=>frame.evaluate(()=>{
   const e=Asc.editor,d=e.WordControl.m_oLogicDocument,all=d.GetAllParagraphs();
   let controls=0;const visit=items=>{for(const item of items){
    if(typeof item.RemoveContentControlWrapper==='function'){controls++;visit(item.Content.Content)}
    else if(item.IsTable?.())for(const row of item.Content)for(const cell of row.Content)visit(cell.Content.Content);
   }};visit(d.Content);
   return {pages:e.getCountPages(),controls,tables:d.GetAllTables().length,
    allText:all.map(p=>p.GetText({Numbering:false})),
    ownerHook:/GetDocumentContentForRecalcInfo/.test(all[0].RecalculateKeepNext.toString()),
    markers:['HEADING','CHAIN','TARGET'].flatMap(kind=>all.filter(p=>p.GetText({Numbering:false}).includes(kind)).map(p=>{
     const pr=p.Get_CompiledPr2(false).ParaPr;
     return {kind,text:p.GetText({Numbering:false}),keep:!!pr.KeepNext,keepLines:!!pr.KeepLines,
      pageBefore:!!pr.PageBreakBefore,widow:!!pr.WidowControl,
      ownerBody:p.Parent.GetDocumentContentForRecalcInfo()===d,
      pages:p.Pages.map((x,i)=>({page:p.GetAbsoluteStartPage()+i+1,start:x.StartLine,end:x.EndLine,y:x.Y,bottom:x.Bounds.Bottom}))};
    }))};
  });
  const privacy=()=>{assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>r.method==='GET'&&/^(eoapp:|blob:|data:)/.test(r.url)))};
  for(const row of manifest.cases){
   const source=path.join(corpus,row.id+'.docx');assert.equal(sha(await fs.readFile(source)),row.sha256);
   env=await launch({file:source,executable,profile:row.id});await ready();
   const model=await observe();
   await fs.writeFile(path.join(output,'results',row.id+'-model.json'),JSON.stringify(model,null,2)+'\n');
   assert.equal(model.markers.filter(p=>p.kind==='HEADING').length,1);
   assert.equal(model.markers.filter(p=>p.kind==='TARGET').length,1);
   const heading=model.markers.find(p=>p.kind==='HEADING'),target=model.markers.find(p=>p.kind==='TARGET');
   assert.equal(heading.keep,row.keep);assert.equal(heading.keepLines,true);
   assert.equal(target.pageBefore,row.scenario==='page-before');
   assert.equal(target.ownerBody,row.scenario!=='leading-table');assert.equal(heading.ownerBody,true);
   const expectedControls=row.scenario==='same-control'?row.targetDepth:
    row.headingDepth+row.targetDepth*(row.scenario==='empty-control'?2:1);
   assert.equal(model.controls,expectedControls,'Imported content-control wrappers changed');
   assert.equal(model.tables,row.scenario==='leading-table'?1:0);
   if(process.env.EO_EXPECT_KEEP_OWNER)assert.equal(model.ownerHook,process.env.EO_EXPECT_KEEP_OWNER==='1','Unexpected compiled keep-next method');
   await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.RecalculateFromStart(true,true));
   await frame.waitForFunction(()=>!Asc.editor.WordControl.m_oLogicDocument.FullRecalc.Id,null,{timeout:120000});
   assert.deepEqual(stable(await observe()),stable(model),'Full recalculation changed layout or content');
   const exercise=row.keep&&row.headingDepth===2&&row.targetDepth===2;
   let incremental=false,roundtrip=false;
   if(exercise&&process.env.EO_KEEP_INCREMENTAL==='1'){
    await frame.evaluate(targeted=>{
     const e=Asc.editor,d=e.WordControl.m_oLogicDocument;d.RemoveSelection();
     if(targeted){const p=d.GetAllParagraphs().find(p=>p.GetText({Numbering:false}).includes('TARGET'));p.SetThisElementCurrent();p.MoveCursorToEndPos(false)}
     else d.MoveCursorToEndPos(false);
     e.asc_AddText(' EDITCHECK');
    },process.env.EO_KEEP_EDIT_TARGET==='1');
    await frame.waitForFunction(()=>!Asc.editor.WordControl.m_oLogicDocument.FullRecalc.Id,null,{timeout:120000});
    const edited=await observe();assert(edited.allText.some(t=>t.includes('EDITCHECK')),'Actual incremental edit missing');
    if(process.env.EO_KEEP_EDIT_TARGET==='1')assert(edited.markers.find(p=>p.kind==='TARGET').text.includes('EDITCHECK'),'Edit did not reach the target paragraph');
    assert.deepEqual(layout(edited),layout(model),'Short edit unexpectedly moved the keep group');
    if(process.env.EO_KEEP_VERIFY_INCREMENTAL==='1'){
     await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.RecalculateFromStart(true,true));
     await frame.waitForFunction(()=>!Asc.editor.WordControl.m_oLogicDocument.FullRecalc.Id,null,{timeout:120000});
     assert.deepEqual(stable(await observe()),stable(edited),'Incremental edited result differs from a full recalculation');
    }
    await frame.evaluate(()=>Asc.editor.Undo());
    await frame.waitForFunction(()=>!Asc.editor.WordControl.m_oLogicDocument.FullRecalc.Id,null,{timeout:120000});
    assert.deepEqual(stable(await observe()),stable(model),'Undo failed to restore pagination/content');
    incremental=true;
   }
   privacy();
   if(exercise&&process.env.EO_KEEP_ROUNDTRIP==='1'){
    const bytes=await env.page.evaluate(async()=>{const s=await EOLocalSession.controller.snapshot();
     return Array.from(await EOLocalSession.win.EOWasmConvert.convert(s.bytes,s.format,'docx',{resources:s.resources}))});
    const file=path.join(output,'results',row.id+'-roundtrip.docx');await fs.writeFile(file,Buffer.from(bytes));
    await stop(env);env=null;env=await launch({file,executable,profile:row.id+'-reopen'});await ready();
    assert.deepEqual(stable(await observe()),stable(model),'Saved document changed when reopened in a fresh process');
    privacy();roundtrip=true;
   }
   rows.push({...row,model,incremental,incrementalTarget:incremental&&process.env.EO_KEEP_EDIT_TARGET==='1',roundtrip,errors:env.errors});
   await fs.writeFile(path.join(output,'observations.json'),JSON.stringify({rows},null,2)+'\n');
   console.log(row.id,JSON.stringify(layout(model)));
   await stop(env);env=null;
  }
  const failures=[];
  for(const row of rows){
   const direct=rows.find(x=>x.scenario===row.scenario&&x.keep===row.keep&&x.headingDepth===0&&x.targetDepth===0);assert(direct);
   if(JSON.stringify(layout(row.model))!==JSON.stringify(layout(direct.model)))failures.push({id:row.id,actual:layout(row.model),expected:layout(direct.model)});
  }
  for(const row of manifest.cases)assert.equal(sha(await fs.readFile(path.join(corpus,row.id+'.docx'))),row.sha256,'Source changed');
  const result={total:rows.length,failures,incremental:rows.filter(r=>r.incremental).length,
   roundtrip:rows.filter(r=>r.roundtrip).length,packageAsarSha256:sha(await fs.readFile(path.join(path.dirname(executable),'resources/app.asar')))};
  await fs.writeFile(path.join(output,'verdict.json'),JSON.stringify(result,null,2)+'\n');
  assert.deepEqual(failures,[],'Keep-with-next body SDT layout must match unwrapped flow');
 }finally{if(env)await stop(env);display.kill('SIGTERM');await displayLog.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
