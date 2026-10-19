// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {firefox}=require(process.env.EO_PLAYWRIGHT||'playwright');
const work=process.env.EO_PDF_WORK,base=process.env.EO_BASE,locale=process.env.EO_LOCALE||'en';
assert(work&&base);assert.notEqual(new URL(base).port,'8080');
function run(tool,args){return cp.execFileSync(tool,args,{encoding:'utf8'});}
let preservationReference;
function independent(file,logical,nested=false,named=false){
 const xml=run('pdftohtml',['-xml','-stdout','-i',file]),info=run('pdfinfo',['-box','-f','1','-l','5',file]),meta=run('pdfinfo',['-meta',file]);
 assert.match(info,/Pages:\s+5/);assert.match(meta,/Public page-order metadata canary/);
 assert.match(xml,new RegExp('<item page="'+(logical.indexOf(1)+1)+'">First public page'));
 assert.match(xml,new RegExp('<item page="'+(logical.indexOf(5)+1)+'">Last nested public page'));
 // Poppler emits a destination diagnostic instead of an HTML anchor for
 // ninety-degree text (zero XML text width). Check its target and the actual
 // Link dictionary independently; retain the full anchor check otherwise.
 if(nested)assert(xml.includes('link to page '+(logical.indexOf(5)+1)+' '));
 else assert.match(xml,new RegExp('href="[^"]*#'+(logical.indexOf(5)+1)+'">Public PDF page 2'));
 for(let index=0;index<5;index++){
  const text=run('pdftotext',['-f',String(index+1),'-l',String(index+1),file,'-']);
  assert.match(text,new RegExp('Public PDF page '+logical[index]+' - ElixirOffice'));
  if(logical[index]===1)assert.match(text,/G2 order public value/);
  const offset=logical[index]-1,width=612+offset*8,height=792+offset*16;
  if(nested)assert.match(info,new RegExp('Page\\s+'+(index+1)+' rot:\\s+'+(offset%4*90)));
  assert.match(info,new RegExp('Page\\s+'+(index+1)+' size:\\s+'+width+' x '+height+' pts'));
  for(const [kind,expected] of [['MediaBox',[0,0,612+offset*10,792+offset*20]],['CropBox',[offset,offset*2,612+offset*9,792+offset*18]]]){
   const line=info.split('\n').find(line=>new RegExp('^Page\\s+'+(index+1)+' '+kind+':').test(line));assert(line,kind);
   assert.deepEqual(line.split(':')[1].trim().split(/\s+/).map(Number),expected);
  }

 }
 for(const [key,value] of [['Title','Original public title'],['Author','Public fixture author'],['Subject','Synthetic PDF fixture'],['Creator','Public page-order generator']])assert.match(info,new RegExp(key+':\\s+'+value));
 if(named){const destinations=run('pdfinfo',['-dests',file]);for(const [name,identity] of [['public-first',1],['public-last',5]])assert(destinations.split('\n').some(line=>line.trim().startsWith(String(logical.indexOf(identity)+1)+' ')&&line.includes(name)),name);}
 const structure=nested?JSON.parse(run(process.env.EO_PDF_STRUCTURE_PYTHON||'python3',[path.join(__dirname,'page-order-structure.py'),file,logical.join(','),'--reference',preservationReference,...(named?['--named']:[])])):null;
 return {logical,xml,info,meta,structure};
}
(async()=>{
 await fs.mkdir(work,{recursive:true});run('python3',[path.join(__dirname,'page-order-fixtures.py'),work+'/fixtures']);
 const browser=await firefox.launch({headless:true}),page=await browser.newPage({viewport:{width:1360,height:1200},deviceScaleFactor:Number(process.env.EO_DPR||1)}),errors=[],requests=[],rows=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 let frame,box;
 async function open(file,dirty=false){
  if(dirty)page.once('dialog',d=>d.accept());
  await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
  frame=page.frames().find(f=>f.url().includes('/pdfeditor/main/'));assert(frame);await frame.waitForFunction(()=>PDFE.getController('Main').api.DocumentRenderer.isFullText,null,{timeout:30000});
  await frame.waitForFunction(()=>PDFE.getController('Toolbar')._state.activated===true,null,{timeout:10000});await frame.waitForFunction(()=>{const api=PDFE.getController('Main').api,v=api.DocumentRenderer;return api.isDocumentLoadComplete&&!v.IsOpenFormsInProgress&&!v.IsOpenAnnotsInProgress&&!api.isLongAction();},null,{timeout:30000});box=await(await frame.frameElement()).boundingBox();
 }
 async function order(){return frame.evaluate(()=>PDFE.getController('Main').api.DocumentRenderer.file.pages.map(p=>p.originIndex));}
 async function thumbnails(){
  await frame.locator('#left-btn-thumbnails').click();await frame.waitForFunction(()=>document.querySelector('#id_viewer_th')?.getBoundingClientRect().width>0);
  await frame.locator('#thumbnails-btn-settings').click();await frame.locator('#sld-thumbnails-size .track').click({position:{x:30,y:1}});await frame.locator('#thumbnails-btn-settings').click();await frame.waitForFunction(()=>!PDFE.getController('PageThumbnails').panelThumbnails.buttonSettings.menu.isVisible());
  await frame.waitForFunction(()=>{const t=PDFE.getController('Main').api.DocumentRenderer.Thumbnails,last=t.getDrawingPage(t.pages.length-1).pageRect;return last.y+last.h-t.scrollY<t.canvas.height;});
 }
 async function point(index,part=0.5){
  const p=await frame.evaluate(({index,part})=>{const t=PDFE.getController('Main').api.DocumentRenderer.Thumbnails,r=t.getDrawingPage(index).pageRect,c=t.canvas.getBoundingClientRect(),ratio=AscCommon.AscBrowser.retinaPixelRatio;return {x:c.left+(r.x+r.w/2)/ratio,y:c.top+(r.y+r.h*part-t.scrollY)/ratio};},{index,part});
  return {x:box.x+p.x,y:box.y+p.y};
 }
 async function click(index,modifiers=[]){const p=await point(index);for(const key of modifiers)await page.keyboard.down(key);try{await page.mouse.click(p.x,p.y);}finally{for(const key of modifiers)await page.keyboard.up(key);}}
 async function drag(from,to,part){
  const a=await point(from),b=await point(to,part);await page.mouse.move(a.x,a.y);await page.mouse.down();try{await page.mouse.move(b.x,b.y,{steps:15});}finally{await page.mouse.up();}
 }
 async function save(name,original){const pending=page.waitForEvent('download');await page.locator('#save').click();await(await pending).saveAs(work+'/'+name);await page.waitForFunction(()=>!document.getElementById('file').disabled);const bytes=await fs.readFile(work+'/'+name);assert.deepEqual(bytes.subarray(0,original.length),original);assert.equal(await page.evaluate(()=>EOLocalSession.controller.isModified()),true);return bytes;}
 try{
  await page.goto(base+'/example/local.html?lang='+locale);
  const pin=JSON.parse(await fs.readFile(process.env.EO_PDF_PIN||path.join(__dirname,'../../tools/wasm/pdf-runtime-release.json'),'utf8')),runtime=base+'/example/local-assets/sdkjs/common/clientpdf/runtime/';
  const actual=await(await page.request.get(runtime+'current.json')).json();assert.equal(actual.artifact_version,pin.artifact_version);
  const manifest=await(await page.request.get(runtime+pin.artifact_version+'/manifest.json')).body();assert.equal(require('node:crypto').createHash('sha256').update(manifest).digest('hex'),pin.manifest_sha256);
  for(const [variant,inputName] of [['classic','public-page-order.pdf'],['compressed','public-page-order-compressed.pdf'],['inherited','public-page-order-inherited.pdf'],['inherited-compressed','public-page-order-inherited-compressed.pdf'],['nested','public-page-order-nested.pdf'],['nested-compressed','public-page-order-nested-compressed.pdf']]){
   const named=variant.startsWith('nested'),nested=named||variant.startsWith('inherited');
   if(nested)run(process.env.EO_PDF_STRUCTURE_PYTHON||'python3',[path.join(__dirname,'page-order-structure.py'),work+'/fixtures/'+inputName,'1,2,3,4,5','--input',...(named?['--named']:[])]);
   const input=work+'/fixtures/'+inputName,original=await fs.readFile(input);preservationReference=input;await open(input,rows.length>0);
   if(process.env.EO_EXPECT_REORDER_CLOSED==='yes'){
    const guard=await frame.evaluate(()=>{const api=PDFE.getController('Main').api,t=api.DocumentRenderer.Thumbnails,h=api.getPDFDoc().History,before=api.DocumentRenderer.file.pages.map(p=>p.originIndex),index=h.Index,allowed=api.eoLocalPdfCanReorder();t.reorderPagesMultiple([0],before.length);return {allowed,before,after:api.DocumentRenderer.file.pages.map(p=>p.originIndex),index,afterIndex:h.Index};});
    assert.equal(guard.allowed,false);assert.deepEqual(guard.after,guard.before);assert.equal(guard.afterIndex,guard.index);
    rows.push({variant,mode:'old-runtime-fail-closed',guard});console.log('PASS old-runtime reorder closed '+variant);continue;
   }
   await fs.writeFile(work+'/page-order-partial.json',JSON.stringify({locale,rows,pending:variant},null,2));
   assert.equal(await frame.evaluate(()=>PDFE.getController('Main').api.eoLocalPdfCanReorder()),true);
   const fieldPoint=await frame.evaluate(()=>{const api=PDFE.getController('Main').api,d=api.getPDFDoc(),v=api.DocumentRenderer,r=d.GetField('public_name').GetRect(),tr=d.pagesTransform[0].invert;return {x:v.x+tr.TransformPointX((r[0]+r[2])/2,(r[1]+r[3])/2),y:v.y+tr.TransformPointY((r[0]+r[2])/2,(r[1]+r[3])/2)};});
   await page.mouse.click(box.x+fieldPoint.x,box.y+fieldPoint.y);await frame.waitForFunction(()=>PDFE.getController('Main').api.getPDFDoc().activeForm?.GetFullName()==='public_name');await frame.evaluate(()=>{window.G2InputEvents=[];for(const name of ['keydown','keypress','keyup','input'])document.addEventListener(name,event=>G2InputEvents.push({type:name,key:event.key,code:event.code,ctrl:event.ctrlKey,target:event.target.id,forms:PDFE.getController('Main').api.DocumentRenderer.IsOpenFormsInProgress,annots:PDFE.getController('Main').api.DocumentRenderer.IsOpenAnnotsInProgress,long:PDFE.getController('Main').api.isLongAction(),readonly:event.target.readOnly,value:PDFE.getController('Main').api.getPDFDoc().GetField('public_name').GetValue(),time:performance.now()}),true);});
   await frame.waitForFunction(()=>document.hasFocus()&&document.activeElement.id==='area_id');
   await page.keyboard.press('Control+A');await frame.waitForFunction(()=>PDFE.getController('Main').api.getPDFDoc().activeForm.content.IsSelectionUse());
   await page.keyboard.type('G2 order public value');await page.keyboard.press('Tab');
   const inputState=await frame.evaluate(()=>({value:PDFE.getController('Main').api.getPDFDoc().GetField('public_name').GetValue(),activeId:document.activeElement.id,activeTag:document.activeElement.tagName,events:window.G2InputEvents}));
   await fs.writeFile(work+'/'+variant+'-input-state.json',JSON.stringify(inputState,null,2));assert.equal(inputState.value,'G2 order public value');

   await save(variant+'-baseline.pdf',original);await thumbnails();
   await click(4);await drag(4,0,0.2);
   await fs.writeFile(work+'/'+variant+'-drag-diagnostic.json',JSON.stringify(await frame.evaluate(()=>{const api=PDFE.getController('Main').api,t=api.DocumentRenderer.Thumbnails;return {can:api.eoLocalPdfCanReorder(),local:api.eoLocalMode,restriction:api.isRestrictionView(),selected:t.selectedPages,drag:t.isDragging,pending:t.pendingDrag,drop:t.dropInsertPosition,canvas:t.canvas.getBoundingClientRect().toJSON(),scroll:t.scrollY,visible:[t.startBlock,t.endBlock],pages:[0,1,2,3,4].map(i=>t.getDrawingPage(i).pageRect),localSource:t.reorderPagesMultiple.toString().includes('eoLocalMode'),reorderSource:t.reorderPagesMultiple.toString().slice(0,180)};}),null,2));assert.deepEqual(await order(),[4,0,1,2,3]);
   await frame.evaluate(()=>PDFE.getController('Main').api.Undo());assert.deepEqual(await order(),[0,1,2,3,4]);await frame.evaluate(()=>PDFE.getController('Main').api.Redo());assert.deepEqual(await order(),[4,0,1,2,3]);
   await save(variant+'-single.pdf',original);
   // Save must not clear history: exercise both directions AFTER actual output.
   await frame.evaluate(()=>PDFE.getController('Main').api.Undo());assert.deepEqual(await order(),[0,1,2,3,4]);
   await frame.evaluate(()=>PDFE.getController('Main').api.Redo());assert.deepEqual(await order(),[4,0,1,2,3]);
   const single=independent(work+'/'+variant+'-single.pdf',[5,1,2,3,4],nested,named);
   await click(1);await click(3,['Control']);assert.deepEqual(await frame.evaluate(()=>PDFE.getController('Main').api.DocumentRenderer.Thumbnails.selectedPages.slice()),[1,3]);
   await drag(1,4,0.8);assert.deepEqual(await order(),[4,1,3,0,2]);
   await frame.evaluate(()=>PDFE.getController('Main').api.Undo());assert.deepEqual(await order(),[4,0,1,2,3]);await frame.evaluate(()=>PDFE.getController('Main').api.Redo());assert.deepEqual(await order(),[4,1,3,0,2]);
   const groupBytes=await save(variant+'-group.pdf',original),group=independent(work+'/'+variant+'-group.pdf',[5,2,4,1,3],nested,named);
   await page.screenshot({path:work+'/'+variant+'-ordered.png'});await open(work+'/'+variant+'-group.pdf',true);
   const retained=await frame.evaluate(()=>{const d=PDFE.getController('Main').api.getPDFDoc();return {value:d.GetField('public_name').GetValue(),fieldPage:d.GetField('public_name').GetPage(),annots:d.annots.map(a=>({type:a.GetType(),page:a.GetPage(),contents:a.GetContents()}))};});
   assert.equal(retained.value,'G2 order public value');assert.equal(retained.fieldPage,3);assert(retained.annots.some(a=>a.page===0&&a.contents==='Existing public annotation'));
   await thumbnails();await click(0);await drag(0,4,0.8);assert.deepEqual(await order(),[1,2,3,4,0]);await save(variant+'-repeated.pdf',groupBytes);
   const repeated=independent(work+'/'+variant+'-repeated.pdf',[2,4,1,3,5],nested,named);assert.deepEqual(await fs.readFile(input),original);
   const busyDownload=page.waitForEvent('download');
   const busyGuard=await page.evaluate(()=>{const api=document.querySelector('iframe').contentWindow.PDFE.getController('Main').api,t=api.DocumentRenderer.Thumbnails,before=api.DocumentRenderer.file.pages.map(p=>p.originIndex),index=api.getPDFDoc().History.Index;window.G2BusySave=EOLocalSession.controller.save();const capability=api.eoLocalPdfCanReorder();t.reorderPagesMultiple([0],before.length);return {capability,before,after:api.DocumentRenderer.file.pages.map(p=>p.originIndex),index,afterIndex:api.getPDFDoc().History.Index};});
   assert.equal(busyGuard.capability,false);assert.deepEqual(busyGuard.after,busyGuard.before);assert.equal(busyGuard.afterIndex,busyGuard.index);
   await(await busyDownload).saveAs(work+'/'+variant+'-busy-guard.pdf');await page.evaluate(async()=>{await G2BusySave;return true;});
   const busyBytes=await fs.readFile(work+'/'+variant+'-busy-guard.pdf');assert.deepEqual(busyBytes.subarray(0,groupBytes.length),groupBytes);independent(work+'/'+variant+'-busy-guard.pdf',[2,4,1,3,5],nested,named);
   assert.equal(await frame.evaluate(()=>PDFE.getController('Main').api.eoLocalPdfCanReorder()),true);
   rows.push({variant,single,group,repeated,retained,busyGuard,undoRedoAfterSave:true});console.log('PASS '+variant+' real drag, end/multi selection, grouped Undo/Redo, repeat preserved save/reopen and independent destinations/metadata/boxes/text');
  }
  const negatives=[];
  for(const name of ['public-signature-marker.pdf','public-xfa-marker.pdf','public-unsupported-field.pdf']){
   await open(work+'/fixtures/'+name,true);assert.equal(await frame.evaluate(()=>PDFE.getController('Main').api.eoLocalPdfCanReorder()),false);await thumbnails();const before=await order();await click(1);await drag(1,0,0.2);assert.deepEqual(await order(),before);assert.equal(await page.evaluate(()=>EOLocalSession.controller.isModified()),false);negatives.push(name);
  }
  assert.deepEqual(errors,[]);assert(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===base));
  await fs.writeFile(work+'/page-order-result.json',JSON.stringify({locale,mode:process.env.EO_EXPECT_REORDER_CLOSED==='yes'?'old-runtime-fail-closed':'positive-preservation',dpr:await page.evaluate(()=>devicePixelRatio),pin,rows,negatives,errors,requestCount:requests.length},null,2));console.log('PASS policy-negative actual drag blocked and source unchanged');
 }catch(error){await fs.writeFile(work+'/page-order-failure.json',JSON.stringify({errors,rows,frames:page.frames().map(f=>f.url()),body:await page.locator('body').innerText()},null,2));await page.screenshot({path:work+'/page-order-failure.png'});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
