// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE,image=process.env.EO_LOCAL_IMAGE,out=process.env.EO_LOCAL_OUT;
assert(base&&!/:8080(?:\/|$)/.test(base)&&file&&image&&out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch(),context=await browser.newContext({acceptDownloads:true}),bad=[];let page=await context.newPage();
function monitor(page){page.on('websocket',w=>bad.push(w.url()));page.on('request',r=>{if(r.method()!=='GET'||/\/(upload|doc\/|ConvertService|coauthoring)/i.test(r.url()))bad.push(r.url());});}monitor(page);
async function freshEditor(){
 await page.close();page=await context.newPage();monitor(page);
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
 await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 return page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));
}
async function queueAndExport(frame,print){
 return frame.evaluate(async({bytes,print})=>{
  const c=parent.EOLocalSession.controller;
  const inserted=c.addImage(new File([new Uint8Array(bytes)],'pending.png',{type:'image/png'}));
  const wasPending=c.hasPendingImages();
  if(print)Asc.editor.asc_Print();else Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(513));
  await inserted;return wasPending;
 },{bytes:Array.from(fs.readFileSync(image)),print});
}
function picturePixels(pdf,label){
 // Editor pictures use PDF texture patterns, which pdfimages -list omits.
 const rendered=path.join(out,label);execFileSync('pdftoppm',['-r','144','-png','-singlefile',pdf,rendered]);
 const pixels=execFileSync('python3',['-c',`from PIL import Image,ImageChops,ImageStat
import sys,json
source=Image.open(sys.argv[1]).convert('RGB'); page=Image.open(sys.argv[2]).convert('RGB')
# This colourful public fixture is isolated from black text and red revisions.
def colour_crop(image):
 points=[(x,y) for y in range(image.height) for x in range(image.width) if (lambda c:c[1]>c[0]+10 or c[2]>c[0]+10)(image.getpixel((x,y)))]
 assert points,'inserted picture not visible in PDF'
 return image.crop((min(x for x,y in points),min(y for x,y in points),max(x for x,y in points)+1,max(y for x,y in points)+1))
source=colour_crop(source);crop=colour_crop(page)
assert crop.width>20 and crop.height>15,'picture render too small'
assert abs(crop.width/crop.height-source.width/source.height)<0.15,'picture aspect changed'
expected=source.resize(crop.size,Image.Resampling.BILINEAR)
error=sum(ImageStat.Stat(ImageChops.difference(crop,expected)).mean)/3
assert error<25,'picture pixels changed: '+str(error)
print(json.dumps({'width':crop.width,'height':crop.height,'meanPixelError':error}))
`,image,rendered+'.png'],{encoding:'utf8'});
 return JSON.parse(pixels);
}
try{
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 let frame=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));
 const format=frame.url().includes('/documenteditor/')?'docx':frame.url().includes('/spreadsheeteditor/')?'xlsx':'pptx';
 const code={docx:65,xlsx:257,pptx:129}[format],copyCode={docx:67,xlsx:259,pptx:131}[format];
 const chooser=page.waitForEvent('filechooser');await frame.evaluate(()=>Asc.editor.asc_addImage());await (await chooser).setFiles(image);
 // Export immediately after the real chooser: it must await the pending image pipeline.
 const pending=page.waitForEvent('download',{timeout:120000});await frame.evaluate(code=>Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(code)),code);
 const dest=path.join(out,'pending-image.'+format);await (await pending).saveAs(dest);
 execFileSync('python3',['-c',"import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); b=open(sys.argv[2],'rb').read(); assert b in [z.read(n) for n in z.namelist() if '/media/' in n]",dest,image]);
 assert(await page.evaluate(()=>EOLocalSession.controller.isModified()),'copy export marked picture edit saved');
 frame=await freshEditor();
 const pdfPending=page.waitForEvent('download',{timeout:120000});assert(await queueAndExport(frame,false),'PDF did not begin with a real pending image');const pdf=path.join(out,'pending-image.pdf');await (await pdfPending).saveAs(pdf);
 const pixels=picturePixels(pdf,'download-rendered');
 frame=await freshEditor();
 await frame.evaluate(()=>{window.EOPrintProbe=null;Asc.editor.asc_registerCallback('asc_onPrintUrl',url=>{window.EOPrintProbe=url;});});
 assert(await queueAndExport(frame,true),'Print did not begin with a real pending image');
 await frame.waitForFunction(()=>EOPrintProbe,null,{timeout:120000});
 const printed=await frame.evaluate(async()=>({bytes:Array.from(new Uint8Array(await (await fetch(EOPrintProbe)).arrayBuffer())),url:EOPrintProbe,frame:document.querySelector('#id-print-frame')?.src}));
 assert.equal(printed.frame,printed.url,'Main print iframe did not receive image PDF');
 const printedFile=path.join(out,'printed-image.pdf');fs.writeFileSync(printedFile,Buffer.from(printed.bytes));const printPixels=picturePixels(printedFile,'print-rendered');
 assert(await page.evaluate(()=>EOLocalSession.controller.isModified()));assert.deepEqual(bad,[]);
 await frame.evaluate(code=>{Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(code));},copyCode);
 await page.locator('#cancel:not([disabled])').click();await page.waitForFunction(()=>document.querySelector('#cancel').disabled,null,{timeout:120000});
 assert((await page.locator('#message').textContent()).includes('cancelled'));assert(await page.evaluate(()=>EOLocalSession.controller.isModified()));
 fs.writeFileSync(path.join(out,'media-report.json'),JSON.stringify({format,officeMediaBytes:fs.statSync(image).size,pdfImagePixels:pixels,printImagePixels:printPixels,copyKeepsDirty:true,cancelKeepsDirty:true,privacy:true,pdfStartedWhilePending:true,printStartedWhilePending:true},null,2));
 console.log('PASS',format,'pending picker image in office/PDF/Print, cancellation, dirty state and privacy');
}finally{await context.close();await browser.close();}
