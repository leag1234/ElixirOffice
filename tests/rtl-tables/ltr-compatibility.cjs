// SPDX-License-Identifier: AGPL-3.0-only
// Pair actual keyboard/selection behavior against the clean integrated SDK.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {firefox}=require(process.env.EO_PLAYWRIGHT||'/srv/elixiroffice/pw/node_modules/playwright');
const [baselineConfig,candidateConfig,out,fixtureFilter]=process.argv.slice(2);assert(baselineConfig&&candidateConfig&&out);
fs.mkdirSync(out,{recursive:false});
const root=__dirname,fixtures=JSON.parse(fs.readFileSync(path.join(root,'ltr-compatibility-fixtures.json') )).cases.filter(fixture=>!fixtureFilter||fixture.file===fixtureFilter);
assert(fixtures.length>0,'Fixture filter must match a known fixture');
if(fixtureFilter)assert.equal(fixtures.length,1,'A scoped filter must match exactly one fixture');
function assertNoBorders(table){
 assert.equal(table.borderTracking,false,'Keyboard precondition must not retain border tracking in any table');
 for(const child of table.children)assertNoBorders(child.table);
}

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),results=[];
(async()=>{
 const server=await firefox.launchServer({headless:true}),browser=await firefox.connect(server.wsEndpoint());
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({version:browser.version(),playwright:require(path.join(process.env.EO_PLAYWRIGHT||'/srv/elixiroffice/pw/node_modules/playwright','package.json')).version,executable:firefox.executablePath(),sha256:sha(fs.readFileSync(firefox.executablePath())),launcher:'Default headless Firefox launchServer; no custom arguments'},null,2));
 try{
  for(const fixture of fixtures){
   const file=path.join(root,'fixtures',fixture.file);assert.equal(sha(fs.readFileSync(file)),fixture.sha256);
   const pair=[];
   for(const [phase,config]of [['baseline',baselineConfig],['candidate',candidateConfig]]){
    const base='http://127.0.0.1:'+JSON.parse(fs.readFileSync(config)).port,context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),bad=[],errors=[],records=[],rawStates=[],setupCaches=[];
    try{
     page.on('pageerror',error=>errors.push(error.message));
     await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(['data:','blob:'].includes(url.protocol)||url.origin===base&&['GET','HEAD'].includes(request.method()))return route.continue();bad.push(request.method()+' '+url.origin+url.pathname);return route.abort();});
     await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
     await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert(!await page.evaluate(()=>window.EOLocalFailure));
     const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
     await frame.waitForFunction(()=>window.Asc?.editor?.isDocumentLoadComplete===true,null,{timeout:120000});await page.waitForTimeout(600);
     await frame.evaluate(nested=>{window.EOGetTable=()=>{const table=Asc.editor.WordControl.m_oLogicDocument.Content.find(e=>e.IsTable?.());return nested?table.Content[1].Content[1].Content.Content.find(e=>e.IsTable?.()):table;};},fixture.nested);
     let focused=false;
     async function singleClick(x,y){const delay=await frame.evaluate(()=>Math.max(0,520-(Date.now()-AscCommon.global_mouseEvent.LastClickTime)));if(delay)await page.waitForTimeout(delay);await page.mouse.click(x,y);assert.equal(await frame.evaluate(()=>AscCommon.global_mouseEvent.ClickCount),1,'Real single-click precondition');}
     for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'])for(const shift of [false,true])for(const prior of ['caret','cell','text'])for(const edge of ['start','end']){
      const target=await frame.evaluate(({fixture,edge})=>{
       const wc=Asc.editor.WordControl,d=wc.m_oLogicDocument,t=EOGetTable();d.RemoveSelection();
       let row=1;if(fixture.laterPage)row=20;if(fixture.columns){const index=t.RowsInfo.findIndex(info=>info.StartPage===1);if(index>=0)row=index+1;}
       const cell=t.Content[row].Content[1];cell.Content.Set_CurrentElement(0,true);
       if(edge==='start')cell.Content.MoveCursorToStartPos();else cell.Content.MoveCursorToEndPos();
       cell.Content.RecalculateCurPos(true,true);d.private_UpdateCursorXY(true,true);d.Document_UpdateSelectionState();
       const xy=cell.Content.GetCurPosXY(),abs=cell.Content.GetAbsoluteCurrentPage(),dd=wc.m_oDrawingDocument,v=document.getElementById('id_viewer').getBoundingClientRect();
       let point=dd.ConvertCoordsToCursor(xy.X+1,xy.Y+.5,abs);
       if(point.Y<v.height*.2||point.Y>v.height*.7){wc.m_oScrollVerApi.scrollToY(Math.max(0,wc.m_dScrollY+point.Y-v.height*.45));point=dd.ConvertCoordsToCursor(xy.X+1,xy.Y+.5,abs);}
       return{x:v.left+point.X,y:v.top+point.Y,row};
      },{fixture,edge});
      const box=await(await frame.frameElement()).boundingBox();if(!focused){await singleClick(box.x+target.x,box.y+target.y);focused=true;}
      await page.keyboard.press(edge==='start'?'Home':'End');
      if(prior==='cell'){
       const hot=await frame.evaluate(row=>{const wc=Asc.editor.WordControl,t=EOGetTable(),c=t.Content[row].Content[1],m=c.Metrics,dd=wc.m_oDrawingDocument,abs=c.Content.GetAbsoluteStartPage(),rel=c.Content.GetRelativeStartPage(),x=t.Pages[rel].X+m.X_grid_start+(m.X_content_start-m.X_grid_start)*.85,y=t.RowsInfo[row].Y[rel]+t.RowsInfo[row].H[rel]/2,p=dd.ConvertCoordsToCursor(x,y,abs),v=document.getElementById('id_viewer').getBoundingClientRect();return{x:v.left+p.X,y:v.top+p.Y};},target.row);
       await singleClick(box.x+hot.x,box.y+hot.y);assert(await frame.evaluate(()=>EOGetTable().IsCellSelection()),'Real cell selection precondition');
       setupCaches.push(await frame.evaluate(()=>{const t=EOGetTable(),p=t.CurCell.Content.GetCurrentParagraph(false,false),before={RealX:p.CurPos.RealX,RealY:p.CurPos.RealY,position:p.Get_ParaContentPos(false,false).Data};t.CurCell.Content.RecalculateCurPos(true,true,false);return{before,after:{RealX:p.CurPos.RealX,RealY:p.CurPos.RealY,position:p.Get_ParaContentPos(false,false).Data},rtl:Asc.editor.WordControl.m_oLogicDocument.GetCurrentTablesStack().map(t=>t.IsRTL?.()||false)};}));

      }else if(prior==='text'){await page.keyboard.press('Shift+'+(edge==='start'?'ArrowRight':'ArrowLeft'));}
      async function state(){const raw=await frame.evaluate(()=>{
       const d=Asc.editor.WordControl.m_oLogicDocument,t=EOGetTable(),r=value=>typeof value==='number'?Math.round(value*1e6)/1e6:value;
       const selection=value=>({Use:value.Use,Type:value.Type,Type2:value.Type2,StartPos:value.StartPos?.Pos||value.StartPos,EndPos:value.EndPos?.Pos||value.EndPos,Data:value.Data});
       function tableState(table){return{cellSelection:table.IsCellSelection(),row:table.CurCell?.Row.Index,cell:table.CurCell?.Index,borderTracking:table.Selection.Type2===1||table.Selection.Type2===2,selection:selection(table.GetSelectionState().at(-1).Selection),rawSelection:selection(table.Selection),children:table.Content.flatMap((row,i)=>row.Content.flatMap((cell,j)=>cell.Content.Content.filter(e=>e.IsTable?.()).map(child=>({parent:[i,j],table:tableState(child)}))))};}
       const paragraph=t.CurCell.Content.GetCurrentParagraph(false,false),position=paragraph?.Get_ParaContentPos(false,false);
       return JSON.parse(JSON.stringify({table:tableState(d.Content.find(e=>e.IsTable?.())),doc:{Use:d.Selection.Use,StartPos:d.Selection.StartPos,EndPos:d.Selection.EndPos,Flag:d.Selection.Flag},selectedText:d.GetSelectedText(),cursor:d.GetCursorPosXY(),position:position?.Data,paragraphCaret:paragraph?{RealX:paragraph.CurPos.RealX,RealY:paragraph.CurPos.RealY,ContentPos:paragraph.CurPos.ContentPos,Line:paragraph.CurPos.Line,Range:paragraph.CurPos.Range}:null,rtlStack:d.GetCurrentTablesStack().map(t=>t.IsRTL?.()||false),bounds:t.IsCellSelection()?t.GetSelectionBounds():null,anchor:t.IsCellSelection()?t.GetSelectionAnchorPos():null,history:{index:AscCommon.History.Index,points:AscCommon.History.Points.length,items:AscCommon.History.Points[AscCommon.History.Index]?.Items.length},contextLeaked:!!d._tableCursorMove},(k,v)=>r(v)));
      });
       rawStates.push(raw);const value=structuredClone(raw);
       // Compare the engine selection-state contract; preserve raw UI caches separately.
       // GetSelectionState excludes transient Type2 and inactive cell Data itself.
       function canonical(table){delete table.rawSelection;if(!table.cellSelection&&(table.selection.Data==null||Array.isArray(table.selection.Data)&&table.selection.Data.length===0))table.selection.Data=[];for(const child of table.children)canonical(child.table);}
       canonical(value.table);assertNoBorders(value.table);return value;}
      await page.waitForTimeout(60);const before=await state();
      assertNoBorders(before.table);
      await page.keyboard.press((shift?'Shift+':'')+key);await page.waitForTimeout(60);const after=await state();
      assert(!after.contextLeaked);const continuation=[];
      if(fixture.file==='ltr-nested-ltr-empty.docx'&&prior==='cell'&&((!shift&&key==='ArrowLeft'&&edge==='end')||(shift&&['ArrowLeft','ArrowRight'].includes(key)&&edge==='start'))){
       for(const command of ['Shift+ArrowRight','ArrowLeft','ArrowDown']){await page.keyboard.press(command);await page.waitForTimeout(60);continuation.push({command,state:await state()});}
       await singleClick(box.x+target.x,box.y+target.y);await page.keyboard.press('Shift+ArrowRight');await page.waitForTimeout(60);continuation.push({command:'click then Shift+ArrowRight',state:await state()});
      }
      records.push({key,shift,prior,edge,before,after,continuation});
     }
     assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);pair.push({phase,fixture:fixture.file,records,rawStates,setupCaches,errors,bad});
    }finally{await context.close();}
   }
   fs.writeFileSync(path.join(out,fixture.file+'.json'),JSON.stringify(pair,null,2));
   assert.deepEqual(pair[1].records,pair[0].records,'LTR real editor differs: '+fixture.file);
   results.push({fixture:fixture.file,status:'PASS',cases:pair[0].records.length,baseline:pair[0],candidate:pair[1]});
   fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(fixture.file,'PASS',pair[0].records.length);
  }
 }finally{await browser.close().catch(()=>{});await server.close().catch(()=>{});}
 const summary={status:fixtureFilter?'SCOPED_PASS':'PASS',fixtureFilter:fixtureFilter||null,fixtures:results.length,cases:results.reduce((n,r)=>n+r.cases,0),sourceSHA256:sha(fs.readFileSync(__filename)),configs:[baselineConfig,candidateConfig]};
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(summary);
})().catch(error=>{fs.writeFileSync(path.join(out,'failure.txt'),error.stack);console.error(error);process.exitCode=1;});
