// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {firefox}=require(process.env.EO_PLAYWRIGHT||'/srv/elixiroffice/pw/node_modules/playwright');
const [config,blank,out]=process.argv.slice(2);assert(config&&blank&&out);fs.mkdirSync(out,{recursive:false});
const base='http://127.0.0.1:'+JSON.parse(fs.readFileSync(config)).port;
(async()=>{
 const server=await firefox.launchServer({headless:true}),browser=await firefox.connect(server.wsEndpoint());
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[],bad=[];
  try{
   page.on('pageerror',error=>errors.push(error.message));
   await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(['data:','blob:'].includes(url.protocol)||url.origin===base&&['GET','HEAD'].includes(request.method()))return route.continue();bad.push(request.method()+' '+url.origin+url.pathname);return route.abort();});
   await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(blank);
   await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert(!await page.evaluate(()=>window.EOLocalFailure));
   const frame=page.frames().find(f=>f.url().includes('/presentationeditor/main/'));assert(frame);
   await frame.waitForFunction(()=>Asc.editor.isDocumentLoadComplete===true,null,{timeout:120000});await page.waitForTimeout(600);
   const result=await frame.evaluate(()=>{
    const api=Asc.editor,d=api.WordControl.m_oLogicDocument;api.put_Table(2,2);
    const graphic=d.Slides[d.CurPage].cSld.spTree.find(shape=>shape.graphicObject?.IsTable?.());if(!graphic)throw Error('Inserted table missing');
    const table=graphic.graphicObject,record={rtl:table.IsRTL(),tableStackCapability:typeof table.LogicDocument.GetCurrentTablesStack};
    try{table.RemoveSelection();table.CurCell.Content.MoveCursorToStartPos();const cell=table.Content[0].Content[1],x=(cell.Metrics.X_content_start+cell.Metrics.X_content_end)/2,y=table.RowsInfo[0].Y[0]+table.RowsInfo[0].H[0]/2,m=graphic.getTransformMatrix();graphic.selectionSetStart({Button:0,ShiftKey:true,CtrlKey:false,Type:0,ClickCount:1},m.TransformPointX(x,y),m.TransformPointY(x,y),d.CurPage);record.route='actual GraphicFrame.selectionSetStart with Shift';record.status='PASS';record.selection={Use:table.Selection.Use,Type:table.Selection.Type,StartPos:table.Selection.StartPos.Pos,EndPos:table.Selection.EndPos.Pos};}
    catch(error){record.status='FAIL';record.error=String(error);}
    return record;
   });
   fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({result,errors,bad},null,2));console.log(result);assert.equal(result.status,'PASS');assert.equal(result.rtl,false);assert.equal(result.tableStackCapability,'undefined');assert.equal(result.selection.Use,true);assert.equal(result.selection.Type,0);assert.equal(result.selection.EndPos.Cell,1);assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  }finally{await context.close();}
 }finally{await browser.close().catch(()=>{});await server.close().catch(()=>{});}
})().catch(error=>{fs.writeFileSync(path.join(out,'failure.txt'),error.stack);console.error(error);process.exitCode=1;});
