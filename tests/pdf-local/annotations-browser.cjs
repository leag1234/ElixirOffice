// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{firefox}=require(process.env.EO_PLAYWRIGHT||'playwright');
const work=process.env.EO_PDF_WORK,base=process.env.EO_BASE;
assert(work&&base,'EO_PDF_WORK and an isolated EO_BASE are required');
assert.notEqual(new URL(base).port,'8080','Never test the lead instance');
const locale=process.env.EO_LOCALE||'en';
function inspect(file){
 const info=execFileSync('pdfinfo',['-f','1','-l','2',file],{encoding:'utf8'});
 const metadata=Object.fromEntries(info.split('\n').filter(line=>line.includes(':')).map(line=>{const i=line.indexOf(':');return [line.slice(0,i),line.slice(i+1).trim()]}));
 const xml=execFileSync('pdftohtml',['-xml','-stdout','-i',file],{encoding:'utf8'});
 return {metadata,outline:/<outline>[\s\S]*?<\/outline>/.exec(xml)?.[0],text:execFileSync('pdftotext',[file,'-'],{encoding:'utf8'})};
}
(async()=>{const browser=await firefox.launch({headless:true}),context=await browser.newContext({viewport:{width:1360,height:960}}),page=await context.newPage(),errors=[],requests=[];
try{
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(/^https?:$/.test(u.protocol)&&u.origin!==base)return route.abort();
  return route.continue();
 });
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
 const pin=JSON.parse(await fs.readFile(path.join(__dirname,'../../tools/wasm/pdf-runtime-release.json'),'utf8'));const runtime=base+'/example/local-assets/sdkjs/common/clientpdf/runtime/';const current=await(await context.request.get(runtime+'current.json')).json();assert.equal(current.artifact_version,pin.artifact_version,'actual runtime must match the product PDF pin');const manifest=await(await context.request.get(runtime+pin.artifact_version+'/manifest.json')).body();assert.equal(require('node:crypto').createHash('sha256').update(manifest).digest('hex'),pin.manifest_sha256);
 await fs.mkdir(work,{recursive:true});execFileSync('python3',[path.join(__dirname,'preservation-fixtures.py'),path.join(work,'fixtures')]);
 await page.goto(base+'/example/local.html?lang='+encodeURIComponent(locale));await page.locator('#file').setInputFiles(work+'/fixtures/public-forms.pdf');
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
 const frame=page.frames().find(f=>f.url().includes('/pdfeditor/main/'));assert(frame);
 await frame.waitForFunction(()=>PDFE.getController('Main').api.DocumentRenderer.isFullText,null,{timeout:30000});
 await frame.waitForFunction(()=>PDFE.getController('Toolbar')._state.activated===true,null,{timeout:10000});
 await frame.locator('#toolbar a[data-tab=comment]').click();

 const permissions=await frame.evaluate(()=>{const m=PDFE.getController('Main');return {canEdit:m.appOptions.canPDFEdit,isEdit:m.appOptions.isPDFEdit,deleteButton:!!PDFE.getController('Toolbar').toolbar.btnDelPage};});assert.deepEqual(permissions,{canEdit:false,isEdit:false,deleteButton:false});
 const initial=await frame.evaluate(()=>{const api=PDFE.getController('Main').api,d=api.getPDFDoc(),v=api.DocumentRenderer,r=d.GetField('public_name').GetRect(),tr=d.pagesTransform[0].invert;return {point:{x:v.x+tr.TransformPointX((r[0]+r[2])/2,(r[1]+r[3])/2),y:v.y+tr.TransformPointY((r[0]+r[2])/2,(r[1]+r[3])/2)}};});
 const box=await(await frame.frameElement()).boundingBox();
 await page.mouse.click(box.x+initial.point.x,box.y+initial.point.y);
 await frame.waitForFunction(()=>PDFE.getController('Main').api.getPDFDoc().activeForm?.GetFullName()==='public_name');
 await page.keyboard.press('Control+A');await page.keyboard.type('G2 filled public value');await page.keyboard.press('Tab');
 assert.equal(await frame.evaluate(()=>PDFE.getController('Main').api.getPDFDoc().GetField('public_name').GetValue()),'G2 filled public value');
 await frame.locator('#tlbtn-textcomment button').first().click();
 await frame.waitForFunction(()=>PDFE.getController('Main').api.getPDFDoc().annots.some(a=>a.GetType()===AscPDF.ANNOTATIONS_TYPES.FreeText));
 await page.keyboard.type('G2 public text annotation');
 await page.keyboard.press('Escape');
 const text=await frame.evaluate(()=>PDFE.getController('Main').api.getPDFDoc().annots.map(a=>({type:a.GetType(),contents:a.GetContents(),text:a.GetDocContent?.()?.GetAllText?.()})));
 assert(text.some(a=>a.type===2));
 await page.screenshot({path:work+'/annotation-baseline.png'});

 const points=await frame.evaluate(()=>{const v=PDFE.getController('Main').api.DocumentRenderer,tr=v.getPDFDoc().pagesTransform[0].invert;return [[320,180],[440,235],[74,68],[320,68]].map(([x,y])=>({x:v.x+tr.TransformPointX(x,y),y:v.y+tr.TransformPointY(x,y)}));});
 await frame.locator('#tlbtn-shapecomment button').first().click();
 await page.mouse.move(box.x+points[0].x,box.y+points[0].y);await page.mouse.down();await page.mouse.move(box.x+points[1].x,box.y+points[1].y,{steps:12});await page.mouse.up();await page.keyboard.press('Escape');
 await frame.waitForFunction(()=>PDFE.getController('Main').api.getPDFDoc().annots.some(a=>a.GetType()===AscPDF.ANNOTATIONS_TYPES.Square));
 await page.mouse.move(box.x+points[2].x,box.y+points[2].y);await page.mouse.down();await page.mouse.move(box.x+points[3].x,box.y+points[3].y,{steps:12});await page.mouse.up();
 await frame.waitForFunction(()=>{const s=PDFE.getController('Main').api.DocumentRenderer.file.Selection;return s.Glyph1!==s.Glyph2;});
 await frame.locator('#id-toolbar-btn-highlight button').first().click();
 const edited=await frame.evaluate(()=>PDFE.getController('Main').api.getPDFDoc().annots.map(a=>({type:a.GetType(),contents:a.GetContents(),rect:a.GetRect()})));
 assert(edited.some(a=>a.type===8),'highlight added from real text selection');
 const firstDownload=page.waitForEvent('download');await page.locator('#save').click();await(await firstDownload).saveAs(work+'/annotation-baseline.pdf');
 await page.waitForFunction(()=>!document.getElementById('file').disabled);const output=await fs.readFile(work+'/annotation-baseline.pdf');
 const original=await fs.readFile(work+'/fixtures/public-forms.pdf');assert.deepEqual(Buffer.from(output).subarray(0,original.length),original);


 const before=inspect(work+'/fixtures/public-forms.pdf'),after=inspect(work+'/annotation-baseline.pdf');
 for(const key of ['Title','Author','Subject','Creator','Pages','Form'])assert.equal(after.metadata[key],before.metadata[key],key);
 assert.equal(after.outline,before.outline);assert.match(after.text,/G2 public text annotation/);assert.match(after.text,/G2 filled public value/);
 assert.match(after.text,/Public PDF page 1/);assert.match(after.text,/Public PDF page 2/);assert.match(after.metadata.Producer,/^ElixirOffice\//);
 assert.equal(await page.evaluate(()=>EOLocalSession.controller.isModified()),true,'download must not acknowledge the original file');
 await frame.locator('#left-btn-thumbnails').click();await frame.waitForFunction(()=>document.querySelector('#id_viewer_th')?.getBoundingClientRect().width>0);
 async function menu(){
  const point=await frame.evaluate(()=>{const t=PDFE.getController('Main').api.DocumentRenderer.Thumbnails,r=t.getDrawingPage(0).pageRect,c=t.canvas.getBoundingClientRect(),ratio=AscCommon.AscBrowser.retinaPixelRatio;return {x:c.left+(r.x+r.w/2)/ratio,y:c.top+(r.y+r.h/2-t.scrollY)/ratio};});
  await page.mouse.click(box.x+point.x,box.y+point.y);await page.mouse.click(box.x+point.x,box.y+point.y,{button:'right'});
  await frame.waitForFunction(()=>PDFE.getController('DocumentHolder').documentHolder.viewPageMenu);
  return frame.evaluate(()=>PDFE.getController('DocumentHolder').documentHolder.menuLocalRotatePages.map(i=>({id:i.id,caption:i.options.caption,visible:i.isVisible(),disabled:i.isDisabled()})));
 }
 const items=await menu();assert.equal(items.length,2);assert(items.every(i=>i.visible&&!i.disabled&&i.caption));await frame.locator('#'+items[0].id).click();
 await frame.waitForFunction(()=>PDFE.getController('Main').api.asc_GetPageRotate(0)===90);
 await frame.evaluate(()=>PDFE.getController('Main').api.Undo());assert.equal(await frame.evaluate(()=>PDFE.getController('Main').api.asc_GetPageRotate(0)),0);
 await frame.evaluate(()=>PDFE.getController('Main').api.Redo());assert.equal(await frame.evaluate(()=>PDFE.getController('Main').api.asc_GetPageRotate(0)),90);
 const rotatedDownload=page.waitForEvent('download');await page.locator('#save').click();await(await rotatedDownload).saveAs(work+'/rotation-final.pdf');
 await page.waitForFunction(()=>!document.getElementById('file').disabled);
 const rotatedBytes=await fs.readFile(work+'/rotation-final.pdf');assert.deepEqual(rotatedBytes.subarray(0,original.length),original);
 const rotated=inspect(work+'/rotation-final.pdf');for(const key of ['Title','Author','Subject','Creator','Pages','Form'])assert.equal(rotated.metadata[key],before.metadata[key]);
 assert.equal(rotated.metadata['Page    1 rot'],'90');assert.equal(rotated.metadata['Page    2 rot'],'0');assert.equal(rotated.outline,before.outline);
 assert.match(rotated.text,/G2 public text annotation/);assert.match(rotated.text,/G2 filled public value/);

 page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles(work+'/rotation-final.pdf');
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
 const reopened=page.frames().find(f=>f.url().includes('/pdfeditor/main/'));
 const retained=await reopened.evaluate(()=>{const api=PDFE.getController('Main').api,d=api.getPDFDoc();return {value:d.GetField('public_name').GetValue(),annots:d.annots.map(a=>({type:a.GetType(),contents:a.GetContents(),rect:a.GetRect()})),rotation:api.asc_GetPageRotate(0),pages:api.DocumentRenderer.file.pages.length};});
 assert.equal(retained.rotation,90);await fs.writeFile(work+'/annotations-result.json',JSON.stringify({locale,pin,items,edited,retained,before,after,rotated,errors,requests:requests.length},null,2));
 assert.equal(retained.value,'G2 filled public value');assert.equal(retained.pages,2);for(const type of [0,2,4,8])assert(retained.annots.some(a=>a.type===type),'retained annotation '+type);

 // Presence fixtures exercise policy refusal, not signature/XFA validity.
 const negatives=[];
 for(const name of ['public-signature-marker.pdf','public-xfa-marker.pdf','public-unsupported-field.pdf']){
  page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles(work+'/fixtures/'+name);
  await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
  const negative=await page.evaluate(()=>({policy:EOLocalSession.stats.policy,canSave:EOLocalSession.controller.canSave(),canRotate:document.querySelector('iframe').contentWindow.PDFE.getController('Main').api.eoLocalPdfCanRotate()}));
  assert.equal(negative.policy.writable,false);assert.equal(negative.canSave,false);assert.equal(negative.canRotate,false);negatives.push({name,reason:negative.policy.reason});
 }
 await fs.writeFile(work+'/negative-policy.json',JSON.stringify(negatives,null,2));
 assert.deepEqual(errors,[]);assert(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===base));
 console.log('PASS '+locale+' public PDF actual toolbar Text/shape/highlight, Tx filling, policy-gated rotation menu/undo/redo, original-prefix downloads/reopen, independent Poppler metadata/text/outline and policy refusals');

}catch(e){await fs.writeFile(work+'/annotations-diagnostic.json',JSON.stringify({errors,frames:page.frames().map(f=>f.url()),body:await page.locator('body').innerText(),requests:requests.slice(-30)},null,2));await page.screenshot({path:work+'/annotations-failure.png'});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
