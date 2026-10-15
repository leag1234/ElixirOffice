import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE;assert.ok(base&&!/:8080(?:\/|$)/.test(base)&&file);
const browser=await chromium.launch({headless:true});
async function drop(page){
 await page.evaluate(({name,bytes})=>{
  const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],name));
  document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  // Real native drops protect their DataTransfer after dispatch; retain a
  // synchronous File snapshot before the asynchronous health decision.
  transfer.items.clear();
 },{name:path.basename(file),bytes:Array.from(fs.readFileSync(file))});
}
try{
 for(const mode of ['server-default','server-drop','opt-in-local','unreachable-local','unreachable-drop','unreachable-reject','unreachable-drop-reject']){
  const ctx=await browser.newContext(),page=await ctx.newPage(),uploads=[];
  page.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());});
  if(mode.startsWith('unreachable-'))await ctx.route('**/healthcheck',r=>r.fulfill({status:503,body:'false'}));
  await page.goto(base+'/example/');
  if(await page.locator('#profile-dialog').isVisible())await Promise.all([page.waitForNavigation(),page.locator('#profile-skip').click()]);
  uploads.length=0;
  const setting=page.getByRole('checkbox',{name:'Convert files locally (no upload)'});
  assert.equal(await setting.isChecked(),false);
  if(mode==='opt-in-local')await setting.check();
  if(mode==='server-default'||mode==='server-drop'){
   const response=page.waitForResponse(r=>r.url().endsWith('/example/upload')&&r.request().method()==='POST');
   if(mode==='server-drop')await drop(page);else await page.locator('#file-input').setInputFiles(file);assert.equal((await response).status(),200);
   assert.ok(uploads.some(u=>u.endsWith('/example/upload')));
  }else{
   var confirmed;
   if(mode.startsWith('unreachable-'))confirmed=new Promise(resolve=>page.once('dialog',async d=>{assert.equal(d.type(),'confirm');assert.equal(d.message(),'Server unavailable: open locally on this computer?');if(mode.endsWith('reject'))await d.dismiss();else await d.accept();resolve();}));
   if(mode.includes('unreachable-drop')){
    await drop(page);
   }else await page.locator('#file-input').setInputFiles(file);
   if(confirmed)await confirmed;
   if(mode.endsWith('reject')){await page.waitForTimeout(300);assert.ok(page.url().endsWith('/example/'));assert.deepEqual(uploads,[]);assert.equal(await page.locator('#file-input').inputValue(),'');console.log('PASS launch',mode);await ctx.close();continue;}
   await page.waitForURL('**/example/local.html*');
   await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:90000});
   assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
   assert.deepEqual(uploads,[]);
   const count=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('eo-local-launch',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('pending'),get=t.objectStore('pending').count();get.onsuccess=()=>{resolve(get.result);db.close();};};r.onerror=()=>reject(r.error);
   }));assert.equal(count,0);
  }
  console.log('PASS launch',mode);await ctx.close();
 }
}finally{await browser.close();}
