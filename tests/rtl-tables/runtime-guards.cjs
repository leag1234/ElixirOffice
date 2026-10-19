// SPDX-License-Identifier: AGPL-3.0-only
// Real engine checks for absent direction and constant-cost pointer snapshots.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {firefox}=require(process.env.EO_PLAYWRIGHT||'/srv/elixiroffice/pw/node_modules/playwright');
const [config,out]=process.argv.slice(2);assert(config&&out);fs.mkdirSync(out,{recursive:false});
const base='http://127.0.0.1:'+JSON.parse(fs.readFileSync(config)).port;
(async()=>{
 const server=await firefox.launchServer({headless:true}),browser=await firefox.connect(server.wsEndpoint()),results=[];
 try{
  for(const fixture of ['ltr-no-direct.docx','style-chain-center-rtl.docx','rtl-empty-ar.docx']){
   const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),errors=[],bad=[];
   try{
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(['data:','blob:'].includes(url.protocol)||url.origin===base&&['GET','HEAD'].includes(request.method()))return route.continue();bad.push(request.method()+' '+url.origin+url.pathname);return route.abort();});
    await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(path.join(__dirname,'fixtures',fixture));
    await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert(!await page.evaluate(()=>window.EOLocalFailure));
    const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
    await frame.waitForFunction(()=>window.Asc?.editor?.isDocumentLoadComplete===true,null,{timeout:120000});await page.waitForTimeout(600);
    const result=await frame.evaluate(fixture=>{
     const api=Asc.editor,d=api.WordControl.m_oLogicDocument,t=d.Content.find(e=>e.IsTable?.()),h=AscCommon.History;
     d.RemoveSelection();t.Content[0].Content[0].Content.Set_CurrentElement(0,true);
     const checks=[],check=(name,fn)=>{try{const details=fn();checks.push({name,status:'PASS',details});}catch(error){checks.push({name,status:'FAIL',error:String(error)});}},require=(yes,message)=>{if(!yes)throw Error(message);};
     if(fixture==='ltr-no-direct.docx')check('absent direct LTR getter/setter is history-neutral',()=>{
      require(t.Pr.BidiVisual===undefined,'Fixture must have no direct direction');require(t.Get_Props().BidiVisual===false,'Effective LTR getter');
      const position=h.BinaryWriter.GetCurPosition(),points=h.Points.length,index=h.Index;
      for(let n=0;n<3;n++){d.StartAction(AscDFH.historydescription_Document_ApplyTablePr);t.Set_Props({BidiVisual:false});d.FinalizeAction();}
      require(t.Pr.BidiVisual===undefined,'No explicit false property');require(h.BinaryWriter.GetCurPosition()===position,'No history payload');require(h.Points.length===points&&h.Index===index,'No undo point');
      return{position,points,index,directAbsent:t.Pr.BidiVisual===undefined};
     });
     if(fixture==='style-chain-center-rtl.docx')check('explicit false overrides inherited RTL and repeated false stays neutral',()=>{
      require(t.Pr.BidiVisual===undefined&&t.IsRTL(),'Inherited RTL fixture');
      d.StartAction(AscDFH.historydescription_Document_ApplyTablePr);t.Set_Props({BidiVisual:false});d.Recalculate();d.FinalizeAction();
      require(t.Pr.BidiVisual===false&&!t.IsRTL(),'Explicit override');const position=h.BinaryWriter.GetCurPosition();
      d.StartAction(AscDFH.historydescription_Document_ApplyTablePr);t.Set_Props({BidiVisual:false});d.FinalizeAction();require(h.BinaryWriter.GetCurPosition()===position,'Repeat writes no history');
      api.Undo();require(t.Pr.BidiVisual===undefined&&t.IsRTL(),'Undo restores inherited direction');api.Redo();require(t.Pr.BidiVisual===false&&!t.IsRTL(),'Redo restores override');
     });
     if(fixture==='style-chain-center-rtl.docx')check('history-off inherited style changes use real style invalidation and document recalculation',()=>{
      h.TurnOff();const style=d.Get_Styles().Get(t.TableStyle),original=style.TablePr.Copy();
      require(!!style,'Table style fixture');const snapshot=t.GetInteractionGeometry(),position=h.BinaryWriter.GetCurPosition();
      try{
       const changed=original.Copy();changed.TableInd=(changed.TableInd||0)+1;style.Set_TablePr(changed);
       style.Refresh_RecalcData({Type:AscDFH.historyitem_Style_TablePr});d.Recalculate();
       require(h.BinaryWriter.GetCurPosition()===position,'No history-off write');
       require(!t.IsInteractionGeometryCurrent(snapshot),'Style invalidation/recalc rejects old geometry');
      }finally{style.Set_TablePr(original);style.Refresh_RecalcData({Type:AscDFH.historyitem_Style_TablePr});d.Recalculate();h.TurnOn();}
     });
     if(fixture==='rtl-empty-ar.docx'){
      check('real hot path performs no row traversal, JSON serialization or parent search',()=>{
       const snapshot=t.GetInteractionGeometry(),content=t.Content,rows=t.RowsInfo,parentContent=t.Parent.Content,ownIndex=Object.getOwnPropertyDescriptor(parentContent,'indexOf'),stringify=JSON.stringify;
       const fail=()=>{throw Error('Forbidden hot-path traversal/serialization');};let elapsed;
       try{
        t.Content=new Proxy(content,{get:fail});Object.defineProperty(t,'RowsInfo',{configurable:true,get:fail});parentContent.indexOf=fail;JSON.stringify=fail;
        const start=performance.now();for(let n=0;n<10000;n++)require(t.IsInteractionGeometryCurrent(snapshot),'Stable token');elapsed=performance.now()-start;
       }finally{t.Content=content;Object.defineProperty(t,'RowsInfo',{configurable:true,writable:true,value:rows});if(ownIndex)Object.defineProperty(parentContent,'indexOf',ownIndex);else delete parentContent.indexOf;JSON.stringify=stringify;}
       return{checks:10000,elapsedMs:elapsed};
      });
      check('real history-off layout setters invalidate before document recalculation',()=>{
       const results=[];h.TurnOff();
       try{
        const mutations=[
         ['inline',()=>{const old=t.Inline;t.Set_Inline(!old);return()=>t.Set_Inline(old);}],
         ['overlap',()=>{const old=t.AllowOverlap;t.Set_AllowOverlap(!old);return()=>t.Set_AllowOverlap(old);}],
         ['distance',()=>{const old={...t.Distance};t.Set_Distance(old.L+1,old.T,old.R,old.B);return()=>t.Set_Distance(old.L,old.T,old.R,old.B);}],
         ['row-height',()=>{const row=t.Content[0],old=row.GetHeight();row.SetHeight(old.Value+1,old.HRule);return()=>row.SetHeight(old.Value,old.HRule);}]
        ];
        for(const [name,mutate]of mutations){const snapshot=t.GetInteractionGeometry(),restore=mutate();try{require(!t.IsInteractionGeometryCurrent(snapshot),'Stale '+name);results.push(name);}finally{restore();}}
       }finally{h.TurnOn();d.Recalculate();}
       return results;
      });
      check('empty action leaves token valid while actual recorded edits and undo invalidate',()=>{
       let snapshot=t.GetInteractionGeometry();d.StartAction(AscDFH.historydescription_Document_ApplyTablePr);require(t.IsInteractionGeometryCurrent(snapshot),'Own empty action must not cancel');d.FinalizeAction();
       snapshot=t.GetInteractionGeometry();d.StartAction(AscDFH.historydescription_Document_ApplyTablePr);const old=t.Content[0].GetHeight();t.Content[0].SetHeight(old.Value+1,old.HRule);
       require(!t.IsInteractionGeometryCurrent(snapshot),'Recorded edit invalidates');d.Recalculate();d.FinalizeAction();
       snapshot=t.GetInteractionGeometry();api.Undo();require(!t.IsInteractionGeometryCurrent(snapshot),'Undo invalidates');
      });
     }
     return{fixture,checks,status:checks.every(item=>item.status==='PASS')?'PASS':'FAIL'};
    },fixture);
    if(fixture==='ltr-no-direct.docx'){
     const pending=page.waitForEvent('download',{timeout:120000});await page.locator('#save').click();const download=await pending;await download.saveAs(path.join(out,'ltr-no-direct-roundtrip.docx'));
    }
    results.push({...result,errors,bad});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(fixture,result.status);
    assert.equal(result.status,'PASS');assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
   }finally{await context.close();}
  }
 }finally{await browser.close().catch(()=>{});await server.close().catch(()=>{});}
})().catch(error=>{fs.writeFileSync(path.join(out,'failure.txt'),error.stack);console.error(error);process.exitCode=1;});
