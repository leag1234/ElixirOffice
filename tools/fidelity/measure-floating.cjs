// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Measure only this generator's original public corpus; Word results stay separate.
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),
 assert=require('node:assert/strict'),crypto=require('node:crypto');
const [corpusArg,outputArg,executableArg]=process.argv.slice(2);
assert(corpusArg&&outputArg&&executableArg,'Usage: node measure-floating.cjs CORPUS OUTPUT PACKAGED_EXECUTABLE');
assert.equal(process.platform,'linux','This measurement driver owns a Linux Xvfb display');
const corpus=path.resolve(corpusArg),output=path.resolve(outputArg),executable=path.resolve(executableArg);
const anchorExperiment=process.env.EO_FIDELITY_NEXT_ANCHOR==='1';
process.env.EO_DESKTOP_ROOT=output;process.env.EO_TEST_FONT_DECLINED='1';
const {launch,stop,editable}=require('../../tests/desktop/harness.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'desktop.Xauthority'),'');
 const manifest=JSON.parse(await fs.readFile(path.join(corpus,'manifest.json'),'utf8'));
 assert.equal(manifest.origin,'Original synthetic data; no input documents');
 for(const row of manifest.cases){assert(/^[fo]\d\d-[a-z-]+$/.test(row.id));assert.equal(sha(await fs.readFile(path.join(corpus,row.id+'.docx'))),row.sha256);}
 const binary=process.env.EO_FIDELITY_XVFB;assert(binary,'Explicit EO_FIDELITY_XVFB executable required');
 const log=await fs.open(path.join(output,'display.log'),'w');
 const display=cp.spawn(binary,['-screen','0','1360x960x24','-nolisten','tcp','-displayfd','1'],{stdio:['ignore','pipe',log.fd]});
 const rows=[];let env;
 try{
  const number=await new Promise((resolve,reject)=>{
   let value='';const timer=setTimeout(()=>reject(Error('Owned display startup timeout')),20000);
   const finish=(error,result)=>{clearTimeout(timer);error?reject(error):resolve(result)};
   display.stdout.on('data',b=>{value+=b;if(value.includes('\n'))finish(null,value.trim())});
   display.on('error',e=>finish(e));display.on('exit',c=>finish(Error('Owned display exited '+c)));
  });
  assert(/^\d+$/.test(number));process.env.EO_DESKTOP_DISPLAY=':'+number;
  for(const row of manifest.cases){
   const file=path.join(corpus,row.id+'.docx');
   env=await launch({file,executable,profile:row.id+'-'+Date.now()});await editable(env);
   const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
   if(anchorExperiment)await frame.evaluate(()=>{const l=Asc.editor.WordControl.m_oLogicDocument;l.Settings.ExperimentalNextParagraphTableAnchor=true;l.RecalculateFromStart(true,true)});
   await frame.waitForFunction(()=>{const e=Asc.editor,l=e.WordControl.m_oLogicDocument;return e.getCountPages()>0&&!(l.FullRecalc&&l.FullRecalc.Id)&&!e.isLongAction()},null,{timeout:120000});
   await frame.waitForTimeout(1000);
   const model=await frame.evaluate(()=>{
    const e=Asc.editor,l=e.WordControl.m_oLogicDocument,A=AscFonts;
    const file=A.g_fontApplication.GetFontFileWeb('Arial',0),info=A.g_font_infos[A.g_map_font_index[file.m_wsFontName]];
    return{pages:e.getCountPages(),font:{requested:'Arial',selected:file.m_wsFontName,local:!!info?.isLocalFont},
     tables:l.GetAllTables().map(t=>({inline:t.IsInline(),startPage:t.GetAbsoluteStartPage(),positionH:t.PositionH,positionV:t.PositionV,overlap:t.AllowOverlap,grid:t.TableGridCalc,
      pages:t.Pages.map(p=>({y:p.Y,yLimit:p.YLimit,bottom:p.Bounds.Bottom,firstRow:p.FirstRow,lastRow:p.LastRow,lastRowSplit:p.LastRowSplit})),
      rows:t.Content.map((r,i)=>({minimum:r.Pr.Height,margins:r.Content.map(c=>c.GetMargins()),geometry:t.RowsInfo[i]}))})),
     body:l.Content.map(x=>({table:x.IsTable?.(),page:x.PageNum,paragraph:x.IsParagraph?.()?{text:x.GetText?.(),spacing:x.Get_CompiledPr2(false).ParaPr.Spacing,pages:x.Pages.map(p=>({y:p.Y,bottom:p.Bounds.Bottom}))}:undefined}))};
   });
   const pdf=await env.page.evaluate(async()=>{
    const w=EOLocalSession.win,load=url=>new Promise((ok,no)=>{const tag=w.document.createElement('script');tag.src=url;tag.onload=ok;tag.onerror=no;w.document.head.append(tag)});
    if(!w.EOClientPdf)await load('/example/local-assets/sdkjs/common/clientpdf/clientpdf.js');
    if(!w.EOWasmPdf)await load('/example/local-assets/sdkjs/common/clientpdf/wasm-pdf.js');
    if(!w.EODesktopPdf)await load('/example/local-assets/sdkjs/common/desktop/pdf.js');
    const p=await w.EODesktopPdf(EOLocalSession.api,EOLocalSession.format);return{bytes:Array.from(p.bytes),stats:p.stats};
   });
   assert.equal(pdf.stats.backend,'wasm');assert.equal(pdf.stats.pages,model.pages);
   const pdfPath=path.join(output,'results',row.id+'.pdf');await fs.writeFile(pdfPath,Buffer.from(pdf.bytes));
   const text=cp.execFileSync('pdftotext',['-layout',pdfPath,'-'],{encoding:'utf8'});
   assert(text.includes('TABLE-A-ROW-1-CELL-1'),'Missing original table marker');
   assert(text.includes('FOLLOW-02'),'Missing trailing paragraph marker');
   assert.deepEqual(env.errors,[]);assert(env.requests.every(r=>r.method==='GET'&&/^(eoapp:|blob:|data:)/.test(r.url)),'Unexpected external request');
   if(['f00-base','f02-spill','f15-no-break-wrapped','o00-collision-never','o01-collision-allowed'].includes(row.id))await env.page.screenshot({path:path.join(output,'results',row.id+'.png')});
   if(['f02-spill','f15-no-break-wrapped','f16-explicit-break-allowed'].includes(row.id)){
    const bytes=await env.page.evaluate(async()=>{const s=await EOLocalSession.controller.snapshot();return Array.from(await EOLocalSession.win.EOWasmConvert.convert(s.bytes,s.format,'docx',{resources:s.resources}))});
    await fs.writeFile(path.join(output,'results',row.id+'-roundtrip.docx'),Buffer.from(bytes));
   }
   const observation={id:row.id,parent:row.parent,change:row.change,anchorExperiment,model,pdf:{...pdf.stats,bytes:pdf.bytes.length,sha256:sha(Buffer.from(pdf.bytes))},wordResult:'unverified: awaiting independent Word PDF',errors:env.errors,externalRequests:env.requests.filter(r=>/^https?:/.test(r.url))};
   await fs.writeFile(path.join(output,'results',row.id+'.json'),JSON.stringify(observation,null,2)+'\n');
   rows.push({id:row.id,pages:model.pages,selectedFont:model.font.selected,tableFragments:model.tables.map(t=>t.pages.length),wordResult:observation.wordResult});
   console.log(row.id,'pages='+model.pages,'tableFragments='+rows.at(-1).tableFragments.join(','),'font='+model.font.selected);
   await stop(env);env=null;
   await fs.writeFile(path.join(output,'results','summary.json'),JSON.stringify({platform:process.platform,anchorExperiment,packageAsarSha256:sha(await fs.readFile(path.join(path.dirname(executable),'resources/app.asar'))),rows},null,2)+'\n');
  }
  for(const row of manifest.cases)assert.equal(sha(await fs.readFile(path.join(corpus,row.id+'.docx'))),row.sha256,'Source fixture changed');
 }finally{if(env)await stop(env);display.kill('SIGTERM');await log.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
