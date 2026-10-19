// SPDX-License-Identifier: AGPL-3.0-only
// Exercise the actual clipboard paste route twice and record style reuse.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {firefox}=require(process.env.EO_PLAYWRIGHT||'/srv/elixiroffice/pw/node_modules/playwright');
const [config,captures,out,filter,manifestName='style-output-fixtures.json']=process.argv.slice(2);assert(config&&captures&&out);fs.mkdirSync(out,{recursive:false});
const base='http://127.0.0.1:'+JSON.parse(fs.readFileSync(config)).port;
const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,manifestName))).cases.filter(f=>!filter||f.file===filter);assert(fixtures.length);
(async()=>{
 const server=await firefox.launchServer({headless:true}),browser=await firefox.connect(server.wsEndpoint()),results=[];
 try{
  for(const fixture of fixtures){
   const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),errors=[],bad=[];
   try{
    page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(['data:','blob:'].includes(u.protocol)||u.origin===base&&['GET','HEAD'].includes(r.method()))return route.continue();bad.push(r.method()+' '+u.origin+u.pathname);return route.abort();});
    await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles('/srv/elixiroffice/wt/review-rebase-Z-work/baseline-assets/templates/new.docx');
    await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert(!await page.evaluate(()=>window.EOLocalFailure));
    const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);await frame.waitForFunction(()=>window.Asc?.editor?.isDocumentLoadComplete===true,null,{timeout:120000});
    assert.equal(await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.Content.filter(t=>t.IsTable?.()).length),0,'Blank target must begin without tables');
    const clipboard=fs.readFileSync(path.join(captures,fixture.file,'clipboard.docy'),'utf8'),steps=[];
    for(let step=0;step<2;step++){
     await frame.evaluate(clipboard=>{
      const api=Asc.editor,d=api.WordControl.m_oLogicDocument;d.RemoveSelection();d.MoveCursorToEndPos(false);window.ZStylePasteDone=false;
      api.asc_PasteData(AscCommon.c_oAscClipboardDataFormat.Internal,clipboard,null,null,false,()=>{window.ZStylePasteDone=true;});
     },clipboard);
     await frame.waitForFunction(()=>window.ZStylePasteDone,null,{timeout:30000});await page.waitForTimeout(200);
     const state=await frame.evaluate(()=>{
      const d=Asc.editor.WordControl.m_oLogicDocument,styles=Object.values(d.Styles.Style),tables=[];
      function walk(content){for(const e of content){if(!e.IsTable?.())continue;tables.push({rtl:e.IsRTL?.()||false,style:e.GetTableStyle()});for(const row of e.Content)for(const c of row.Content)walk(c.Content.Content);}}
      walk(d.Content);return{styleCount:styles.length,tableStyles:styles.filter(s=>s.Get_Type()===3).map(s=>({name:s.Name,basedOn:s.BasedOn,direct:s.TablePr.BidiVisual})),tables};
     });
     assert(state.tables.length>0);assert(state.tables.every(t=>t.rtl===(fixture.expectedRTL??false)));if(step===1){assert.equal(state.tables.length,2*steps[0].tables.length,'Each actual paste must add the same table count');assert.equal(state.styleCount,steps[0].styleCount,'Second paste must reuse existing styles');assert.deepEqual(state.tableStyles,steps[0].tableStyles,'Second paste must retain identical table styles');}steps.push(state);
    }
    const dir=path.join(out,fixture.file);fs.mkdirSync(dir);const pending=page.waitForEvent('download',{timeout:120000});await page.locator('#save').click();await(await pending).saveAs(path.join(dir,'post-paste.docx'));
    assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);results.push({fixture:fixture.file,status:'PASS',steps,errors,bad});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(fixture.file,'PASTED twice');
   }finally{await context.close();}
  }
 }finally{await browser.close().catch(()=>{});await server.close().catch(()=>{});}
})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),e.stack);console.error(e);process.exitCode=1;});
