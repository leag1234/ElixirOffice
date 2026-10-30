// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),
 assert=require('node:assert/strict'),crypto=require('node:crypto');
const [corpusArg,outputArg,executableArg]=process.argv.slice(2);
assert.equal(process.platform,'linux');
assert(corpusArg&&outputArg&&executableArg,'Usage: node measure-hide-mark.cjs CORPUS OUTPUT EXECUTABLE');
const corpus=path.resolve(corpusArg),output=path.resolve(outputArg),executable=path.resolve(executableArg);
for(const p of [corpus,output])assert(!p.split(path.sep).some(s=>['corpus-\u0072eal','corpus-private'].includes(s)),'Public original probes only');
process.env.EO_DESKTOP_ROOT=output;process.env.EO_TEST_FONT_DECLINED='1';
const {launch,stop,editable}=require('../../tests/desktop/harness.cjs');
const {assertSameModel}=require('./assert-native-model.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'desktop.Xauthority'),'');
 const manifest=JSON.parse(await fs.readFile(path.join(corpus,'manifest.json'),'utf8'));
 assert.equal(manifest.origin,'Original synthetic data; no input documents');
 assert(process.env.EO_FIDELITY_XVFB,'Explicit owned Xvfb required');
 const log=await fs.open(path.join(output,'display.log'),'w');
 const display=cp.spawn(process.env.EO_FIDELITY_XVFB,['-screen','0','1360x960x24','-nolisten','tcp','-displayfd','1'],{stdio:['ignore','pipe',log.fd]});
 let env;const rows=[],failures=[];
 try{
  const number=await new Promise((ok,no)=>{let v='';const timer=setTimeout(()=>no(Error('Display timeout')),20000);
   display.stdout.on('data',b=>{v+=b;if(v.includes('\n')){clearTimeout(timer);ok(v.trim())}});
   display.on('error',e=>{clearTimeout(timer);no(e)})});
  assert(/^\d+$/.test(number));process.env.EO_DESKTOP_DISPLAY=':'+number;
  for(const row of manifest.cases){
   assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id));
   const bytes=await fs.readFile(path.join(corpus,row.id+'.docx'));assert.equal(sha(bytes),row.sha256);
   env=await launch({file:path.join(corpus,row.id+'.docx'),executable,profile:row.id});await editable(env);
   let frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
   const settle=()=>frame.waitForFunction(()=>{const e=Asc.editor,d=e.WordControl.m_oLogicDocument;return e.getCountPages()>0&&!(d.FullRecalc&&d.FullRecalc.Id)&&!e.isLongAction()},null,{timeout:120000});
   await settle();
   let trace=null;
   // Three admitted cases trace actual WASM->SDK transport by reopening source bytes.
   // The delegated reader callback and its return value remain unmodified.
   if(process.env.EO_HIDE_TRACE==='1'&&row.scenario==='auto'&&row.trailing&&row.markerSize===12&&!row.sdt){
    const transport=await frame.evaluate(()=>window.__EOHideMarkTransport);
    assert(transport&&transport.cellReadGroups>0,'Pre-import QA transport observer was not installed');
    trace=transport.calls;
    assert.equal(trace.length,row.mode==='omitted'?0:1,'Unexpected hideMark transport count');
    if(trace.length){assert.equal(trace[0].length,1);assert.equal(trace[0].raw,Number(row.mode==='true'));}
   }
   const observe=()=>frame.evaluate(emptyOnly=>{
    const e=Asc.editor,d=e.WordControl.m_oLogicDocument,all=d.GetAllParagraphs();
    const targets=all.filter(p=>p.GetText({Numbering:false}).includes('HIDEMARKCONTENT'));
    const emptyTable=emptyOnly?d.GetAllTables().find(t=>t.Content.length===2&&t.Content[1].Content[0].Content.GetAllParagraphs().some(p=>p.GetText({Numbering:false}).includes('AFTERHIDEMARK'))):null;
    if(emptyOnly&&!emptyTable)throw Error('Empty-only target table missing');
    if(!emptyOnly&&targets.length!==1)throw Error('Expected one target paragraph');
    const p=emptyOnly?emptyTable.Content[0].Content[0].Content.GetAllParagraphs()[0]:targets[0],
     cell=p.IsTableCellContent(true),table=cell.Row.Table,row=cell.Row.Index;
    return {pages:e.getCountPages(),allText:all.map(p=>p.GetText({Numbering:false})),
     hideMark:cell.Pr.HideMark??null,compiledHideMark:cell.Get_CompiledPr(false).HideMark??null,
     cellParagraphs:cell.Content.GetAllParagraphs().map(p=>({text:p.GetText({Numbering:false}),empty:p.IsEmpty(),
      size:p.Get_CompiledPr2(false).TextPr.FontSize,spacing:p.Get_CompiledPr2(false).ParaPr.Spacing})),
     target:{blockSdt:!!p.Parent.IsBlockLevelSdtContent(),lines:p.Lines.length,pages:p.Pages.map(x=>({start:x.StartLine,end:x.EndLine,y:x.Y,bottom:x.Bounds.Bottom}))},
     table:{startPage:table.GetAbsoluteStartPage(),pages:table.Pages.map(x=>({y:x.Y,bottom:x.Bounds.Bottom,first:x.FirstRow,last:x.LastRow,split:x.LastRowSplit})),
      rows:table.RowsInfo.map((x,i)=>({index:i,geometry:x,bottom:table.TableRowsBottom[i]})),targetRow:row}};
   },!!row.emptyOnly);
   const model=await observe();
   await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.RecalculateFromStart(true,true));
   await settle();assertSameModel(await observe(),model,'Full recalculation changed model');
   assert.equal(model.target.blockSdt,!!row.sdt,'Imported block SDT structure must be real');
   assert.equal(model.cellParagraphs.length,1+Number(row.trailing));
   assert.equal(model.cellParagraphs.filter(p=>p.empty).length,Number(row.trailing)+Number(!!row.emptyOnly));

   const exercise=row.markerSize===12
    &&(row.emptyOnly||(row.trailing&&((row.scenario==='auto'&&!row.sdt)||(row.scenario==='nested'&&row.sdt))));
   const actions={};
   if(exercise&&process.env.EO_HIDE_INCREMENTAL==='1'){
    await frame.evaluate(emptyOnly=>{
     const e=Asc.editor,d=e.WordControl.m_oLogicDocument;
     const table=emptyOnly?d.GetAllTables().find(t=>t.Content.length===2&&t.Content[1].Content[0].Content.GetAllParagraphs().some(p=>p.GetText({Numbering:false}).includes('AFTERHIDEMARK'))):null;
     const p=emptyOnly?table.Content[0].Content[0].Content.GetAllParagraphs()[0]:d.GetAllParagraphs().find(p=>p.GetText({Numbering:false}).includes('HIDEMARKCONTENT'));
     p.SetThisElementCurrent();p.MoveCursorToEndPos(false);e.asc_AddText(' EDITCHECK');
    },!!row.emptyOnly);
    await settle();const edited=await observe();
    assert(edited.allText.some(t=>t.includes('EDITCHECK')),'Actual edit did not reach target');
    await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.RecalculateFromStart(true,true));
    await settle();assertSameModel(await observe(),edited,'Incremental edited layout differs from full recalculation');
    await frame.evaluate(()=>Asc.editor.Undo());await settle();
    const undone=await observe();
    if(process.env.EO_HIDE_DIAGNOSE_UNDO==='1'){
     await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.RecalculateFromStart(true,true));
     await settle();
     await fs.writeFile(path.join(output,'undo-diagnostic.json'),JSON.stringify({original:model,incrementalUndo:undone,afterFullRecalc:await observe()},null,2)+'\n');
    }
    assertSameModel(undone,model,'Undo did not restore original model');actions.editUndo=true;
   }

   if(process.env.EO_HIDE_PRESERVE_ACTIONS==='1'){
    const expected=row.mode==='omitted'?null:row.mode==='true';
    const cellFlag=()=>frame.evaluate(()=>{
     const d=Asc.editor.WordControl.m_oLogicDocument;
     return d.GetAllParagraphs().find(p=>p.GetText({Numbering:false}).includes('HIDEMARKCONTENT')).IsTableCellContent(true).Pr.HideMark??null;
    });
    assert.equal(await cellFlag(),expected,'Imported property before native history action');
    await frame.evaluate(value=>{
     const e=Asc.editor,d=e.WordControl.m_oLogicDocument;
     const cell=d.GetAllParagraphs().find(p=>p.GetText({Numbering:false}).includes('HIDEMARKCONTENT')).IsTableCellContent(true);
     d.StartAction(AscDFH.historydescription_Document_SetTableProps);
     cell.SetHideMark(value);d.FinalizeAction();
    },expected!==true);
    await settle();assert.equal(await cellFlag(),expected!==true);
    await frame.evaluate(()=>Asc.editor.Undo());await settle();assert.equal(await cellFlag(),expected);
    await frame.evaluate(()=>Asc.editor.Redo());await settle();assert.equal(await cellFlag(),expected!==true);
    await frame.evaluate(()=>Asc.editor.Undo());await settle();assertSameModel(await observe(),model,'Native property Undo restored original model');
    actions.propertyUndoRedo=true;
    const copy=await frame.evaluate(async()=>{
     const e=Asc.editor,d=e.WordControl.m_oLogicDocument;
     const source=d.GetAllParagraphs().find(p=>p.GetText({Numbering:false}).includes('HIDEMARKCONTENT'));
     source.SetThisElementCurrent();e.selectCell();
     let bytes=null;
     e.asc_CheckCopy({pushData(format,data){if(format===AscCommon.c_oAscClipboardDataFormat.Internal)bytes=data}},AscCommon.c_oAscClipboardDataFormat.Internal);
     if(typeof bytes!=='string'||!bytes.length)throw Error('Real internal clipboard payload missing');
     d.RemoveSelection();
     const after=d.GetAllParagraphs().find(p=>!p.IsTableCellContent()&&p.GetText({Numbering:false}).includes('DOCUMENTEND'));
     if(!after)throw Error('Outside-table paste destination missing');
     after.SetThisElementCurrent();after.MoveCursorToEndPos(false);
     const before=d.GetAllTables().length;
     await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Internal paste deadline')),20000);
      e.asc_PasteData(AscCommon.c_oAscClipboardDataFormat.Internal,bytes,undefined,undefined,false,()=>{clearTimeout(timer);resolve()},undefined,()=>{clearTimeout(timer);reject(Error('Paste rejected'))});
     });
     const tables=d.GetAllTables();
     return {bytes:bytes.length,before,after:tables.length,flags:tables.map(t=>t.Content[0].Content[0].Pr.HideMark??null)};
    });
    await fs.writeFile(path.join(output,row.id+'-clipboard.json'),JSON.stringify(copy,null,2)+'\n');
    assert.equal(copy.after,copy.before+1,'Cell clipboard must create a real pasted table');
    assert(copy.flags.every(v=>v===expected),'Pasted cell must preserve explicit/omitted hideMark');
    await settle();await frame.evaluate(()=>Asc.editor.Undo());await settle();
    assertSameModel(await observe(),model,'Clipboard Undo restored original model');
    actions.cellClipboard=copy;
   }
   if(exercise&&process.env.EO_HIDE_ROUNDTRIP==='1'){
    const saved=await env.page.evaluate(async()=>{
     const s=await EOLocalSession.controller.snapshot();
     return Array.from(await EOLocalSession.win.EOWasmConvert.convert(s.bytes,s.format,'docx',{resources:s.resources}));
    });
    assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>r.method==='GET'&&/^(eoapp:|blob:|data:)/.test(r.url)));
    const file=path.join(output,'results',row.id+'-roundtrip.docx');await fs.writeFile(file,Buffer.from(saved));
    await stop(env);env=null;env=await launch({file,executable,profile:row.id+'-reopen'});await editable(env);
    frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);await settle();
    assertSameModel(await observe(),model,'Save/fresh reopen changed properties, text or layout');actions.saveReopen=true;
   }
   const expected=row.mode==='omitted'?null:row.mode==='true';
   if(model.hideMark!==expected||model.compiledHideMark!==(expected??false))
    failures.push({id:row.id,requirement:'source hideMark reaches direct and compiled cell properties',
     expectedDirect:expected,expectedCompiled:expected??false,actualDirect:model.hideMark,actualCompiled:model.compiledHideMark});
   assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>r.method==='GET'&&/^(eoapp:|blob:|data:)/.test(r.url)),'External request');
   rows.push({...row,model,trace,actions,errors:env.errors});
   await fs.writeFile(path.join(output,'observations.json'),JSON.stringify({rows},null,2)+'\n');
   console.log(row.id,JSON.stringify({hideMark:model.hideMark,pages:model.pages,trace}));
   await stop(env);env=null;
  }
  await fs.writeFile(path.join(output,'verdict.json'),JSON.stringify({total:rows.length,propertyFailures:failures,
   geometryStatus:'Recorded native geometry; synthetic Word reference and matched before/after analysis are separate requirements'},null,2)+'\n');
  assert.deepEqual(failures,[],'Cell marker properties must survive import');
 }finally{if(env)await stop(env);display.kill('SIGTERM');await log.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
