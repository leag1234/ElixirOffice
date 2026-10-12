// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const file=process.env.EO_LOCAL_FILE,base=process.env.EO_BASE;
assert.ok(file&&base);
const expected=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const browser=await chromium.launch();
try {
 const context=await browser.newContext();
 let staged;await context.exposeBinding("eoObserveStaged",(_,value)=>{staged=value;});
 await context.addInitScript(()=>{
  const original=File.prototype.arrayBuffer;
  File.prototype.arrayBuffer=async function(){
   const bytes=await original.call(this);
   if(location.pathname.endsWith('/local.html')||location.pathname.endsWith('/example/')){
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    const observed={name:this.name,type:this.type,lastModified:this.lastModified,
      sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};
    if(location.pathname.endsWith('/local.html'))window.EOHandoffObserved=observed;
    else await window.eoObserveStaged(observed);
   }
   return bytes;
  };
 });
 const page=await context.newPage(),uploads=[],errors=[];
 page.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/example/');
 if(await page.locator('#profile-dialog').isVisible())await Promise.all([page.waitForNavigation(),page.locator('#profile-skip').click()]);
 uploads.length=0;
 await page.getByRole('checkbox',{name:'Convert files locally (no upload)'}).check();
 await page.locator('#file-input').setInputFiles(file);
 await page.waitForURL('**/example/local.html*');
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:90000});
 assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
 const observed=await page.evaluate(()=>window.EOHandoffObserved);
 assert.equal(observed.sha256,expected);assert.equal(observed.name,path.basename(file));
 assert.deepEqual(observed,staged);assert.ok(Number.isFinite(observed.lastModified));assert.deepEqual(uploads,[]);assert.deepEqual(errors,[]);
 const count=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('eo-local-launch',1);r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{const db=r.result,t=db.transaction('pending'),get=t.objectStore('pending').count();
   get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};
 }));
 assert.equal(count,0);
 console.log('PASS handoff exact bytes, metadata, consumed IndexedDB, no upload/page errors',JSON.stringify(observed));
 await context.close();
}finally{await browser.close();}
