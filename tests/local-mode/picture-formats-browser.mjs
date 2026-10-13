/* SPDX-License-Identifier: AGPL-3.0-only */
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const{chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_REVIEW_DOCX,out=process.env.EO_PICTURE_OUT;assert(base&&!/:8080(?:\/|$)/.test(base)&&file&&out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({acceptDownloads:true});await page.goto(base+'/example/local.html?lang=en');await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));
 const generated=await frame.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const ctx=canvas.getContext('2d');ctx.fillStyle='#e83728';ctx.fillRect(0,0,8,8);return{png:canvas.toDataURL('image/png').split(',')[1],jpg:canvas.toDataURL('image/jpeg').split(',')[1],webp:canvas.toDataURL('image/webp').split(',')[1]}});
 const bmp=Buffer.alloc(58);bmp.write('BM');bmp.writeUInt32LE(58,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(1,18);bmp.writeInt32LE(1,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp[56]=255;
 const variants=[['fixture.png','image/png',Buffer.from(generated.png,'base64')],['fixture.jpg','image/jpeg',Buffer.from(generated.jpg,'base64')],['fixture.gif','image/gif',Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')],['fixture.bmp','image/bmp',bmp],['fixture.svg','image/svg+xml',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>')],['fixture.webp','image/webp',Buffer.from(generated.webp,'base64')]];
 const count=()=>frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length);const initial=await count();
 for(const[name,mimeType,buffer]of variants){const chooser=page.waitForEvent('filechooser');await frame.evaluate(()=>Asc.editor.asc_addImage());await(await chooser).setFiles({name,mimeType,buffer});await page.waitForFunction(()=>!EOLocalSession.controller.hasPendingImages(),null,{timeout:30000});assert.equal(await frame.evaluate(()=>Asc.editor.isLongAction()),false);console.log('inserted',name,await count());}
 assert.equal(await count(),initial+variants.length);
 const dropFile=path.join(out,'drop.webp');fs.writeFileSync(dropFile,Buffer.from(generated.webp,'base64'));
 const target=await frame.locator(await frame.evaluate(()=> '#'+Asc.editor.HtmlElement.id)).boundingBox();assert(target);
 await frame.evaluate(()=>{
  window.EOWebPDrag=[];window.EOWebPDrop=[];
  document.addEventListener('dragover',event=>EOWebPDrag.push({trusted:event.isTrusted,effect:event.dataTransfer.dropEffect}));
  document.addEventListener('drop',event=>EOWebPDrop.push({trusted:event.isTrusted,files:Array.from(event.dataTransfer.files).map(file=>({name:file.name,type:file.type,size:file.size}))}),true);
 });
 const session=await page.context().newCDPSession(page),data={items:[],files:[dropFile],dragOperationsMask:1};
 try{
  for(const type of ['dragEnter','dragOver','drop'])await session.send('Input.dispatchDragEvent',{type,x:target.x+200,y:target.y+150,data});
 }finally{await session.detach()}
 const drag=await frame.evaluate(()=>({over:EOWebPDrag,drop:EOWebPDrop}));console.log('native file drag',drag);
 assert(drag.over.some(event=>event.trusted&&event.effect==='copy'),'SDK rejects the browser WebP file drag');
 assert(drag.drop.some(event=>event.trusted&&event.files.some(file=>file.name==='drop.webp'&&file.type==='image/webp')),'Browser did not deliver the real WebP file');
 await page.waitForFunction(()=>!EOLocalSession.controller.hasPendingImages(),null,{timeout:30000});
 await frame.waitForFunction(n=>Asc.editor.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length===n,initial+variants.length+1,{timeout:30000});
 const giant=Buffer.from(generated.png,'base64');giant.writeUInt32BE(65535,16);
 const corrupt=Buffer.from(generated.png,'base64').subarray(0,24);
 for(const[name,mimeType,buffer]of [['giant.png','image/png',giant],['corrupt.png','image/png',corrupt],['oversized.png','image/png',Buffer.alloc(21*1024*1024)],['invalid.svg','image/svg+xml',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><image href="https://example.invalid/private.png"/></svg>')],['broken.png','image/png',Buffer.from('broken')]]){
  const chooser=page.waitForEvent('filechooser');await frame.evaluate(()=>Asc.editor.asc_addImage());await(await chooser).setFiles({name,mimeType,buffer});await page.waitForFunction(()=>!EOLocalSession.controller.hasPendingImages(),null,{timeout:30000});assert.equal(await count(),initial+variants.length+1);assert.equal(await frame.evaluate(()=>Asc.editor.isLongAction()),false);
 }
 const download=page.waitForEvent('download',{timeout:90000});await page.locator('#save').click();const saved=path.join(out,'picture-formats.docx');await(await download).saveAs(saved);
 for(const[name,,buffer]of variants.slice(0,2))fs.writeFileSync(path.join(out,name),buffer);
 execFileSync('python3',['-c',"import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);images=[z.read(n) for n in z.namelist() if '/media/' in n];assert len(images)==7,len(images);assert all(open(p,'rb').read() in images for p in sys.argv[2:]);assert sum(b.startswith(bytes.fromhex('89504e470d0a1a0a')) for b in images)==6",saved,path.join(out,'fixture.png'),path.join(out,'fixture.jpg')]);
 fs.writeFileSync(path.join(out,'second.png'),Buffer.from(generated.png,'base64'));
 console.log('PASS PNG/JPEG exact bytes; GIF/BMP/safe SVG/WebP rasterized to PNG; malformed and linked images rejected; actual WebP SDK dragover/drop passes; saved DOCX retains seven pictures');
}finally{await browser.close()}
