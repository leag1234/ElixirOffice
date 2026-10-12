// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE,first=process.env.EO_LOCAL_IMAGE,second=process.env.EO_LOCAL_REPLACEMENT,out=process.env.EO_LOCAL_OUT;
assert.ok(base&&!/:8080(?:\/|$)/.test(base)&&file&&first&&second&&out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({acceptDownloads:true});await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
 await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:90000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
 const frame=page.frames().find(f=>/documenteditor\/main/.test(f.url()));
 await frame.evaluate(()=>{
  const read=File.prototype.arrayBuffer;window.parent.__reads=[];window.parent.__release={};
  File.prototype.arrayBuffer=function(){const file=this;window.parent.__reads.push(file.name);return read.call(file).then(bytes=>new Promise(resolve=>{window.parent.__release[file.name]=()=>resolve(bytes);}));};
 });
 for(const [name,input] of [['first.png',first],['second.png',second]]){
  const chooser=page.waitForEvent('filechooser');await frame.evaluate(()=>DE.getController('Main').api.asc_addImage());
  await (await chooser).setFiles({name,mimeType:'image/png',buffer:fs.readFileSync(input)});
 }
 await page.waitForFunction(()=>typeof __release['first.png']==='function');
 assert.equal(await page.evaluate(()=>EOLocalSession.controller.hasPendingImages()),true);
 assert.deepEqual(await page.evaluate(()=>__reads),['first.png'],'later picker cannot finish ahead of blocked earlier picker');
 let downloads=0;page.on('download',()=>downloads++);const saved=page.waitForEvent('download',{timeout:90000});await page.locator('#save').click();await page.waitForTimeout(200);assert.equal(downloads,0);
 await page.evaluate(()=>{__release['first.png']();});await page.waitForFunction(()=>typeof __release['second.png']==='function');
 assert.deepEqual(await page.evaluate(()=>__reads),['first.png','second.png']);assert.equal(downloads,0);
 await page.evaluate(()=>{__release['second.png']();});const download=await saved,dest=path.join(out,'two-images.docx');await download.saveAs(dest);
 execFileSync('python3',['-c',"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); images=[z.read(n) for n in z.namelist() if '/media/' in n]; assert all(open(p,'rb').read() in images for p in sys.argv[2:]),'queued image missing from save'",dest,first,second]);
 await page.waitForFunction(()=>!document.getElementById('file').disabled);
 assert.equal(await page.evaluate(()=>EOLocalSession.controller.isModified()),false);
 console.log('PASS overlapping picker operations serialize; save waits for both and preserves both exact image payloads');
}finally{await browser.close();}
