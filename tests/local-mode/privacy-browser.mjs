/*
 * SPDX-FileCopyrightText: 2026 ElixirOffice contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE;
assert.ok(base&&!/:8080(?:\/|$)/.test(base)&&file);
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext(),page=await context.newPage(),escaped=[];
 // Any attempted network escape is intercepted instead of contacting a host.
 await context.route('**/*eo-local-egress-probe*',route=>{escaped.push(route.request().url());return route.fulfill({status:200,body:'unexpected network'});});
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:90000});
 assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
 const frame=page.frames().find(f=>/documenteditor\/main/.test(f.url()));assert.ok(frame);
 const violations=await frame.evaluate(async()=>{
  const seen=[];document.addEventListener('securitypolicyviolation',e=>seen.push(e.effectiveDirective));
  const remote='https://example.invalid/eo-local-egress-probe',server=location.origin+'/ConvertService.ashx?eo-local-egress-probe';
  for(const url of [remote,server]){
   const image=new Image();image.src=url;document.body.appendChild(image);
   const frame=document.createElement('iframe');frame.src=url;document.body.appendChild(frame);
   const style=document.createElement('link');style.rel='stylesheet';style.href=url;document.head.appendChild(style);
   await fetch(url).then(()=>{throw new Error('Fetch escaped');},()=>{});
   try{const x=new XMLHttpRequest();x.open('POST',url);throw new Error('XHR escaped');}catch(e){if(e.message==='XHR escaped')throw e;}
   try{new WebSocket('wss://example.invalid/eo-local-egress-probe');throw new Error('WS escaped');}catch(e){if(e.message==='WS escaped')throw e;}
   if(navigator.sendBeacon(url,'probe'))throw new Error('Beacon escaped');
  }
  const result=await new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(new Blob(["fetch('https://example.invalid/eo-local-egress-probe').then(()=>postMessage('escaped'),()=>postMessage('blocked'))"],{type:'application/javascript'}));
   const worker=new Worker(url),timer=setTimeout(()=>reject(new Error('worker policy timeout')),5000);
   worker.onmessage=e=>{clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);resolve(e.data);};
  });
  if(result!=='blocked')throw new Error('Worker fetch escaped');
  await new Promise(r=>setTimeout(r,300));return seen;
 });
 for(const directive of ['img-src','frame-src','style-src-elem'])assert.ok(violations.includes(directive),directive);
 assert.deepEqual(escaped,[]);
 for(const url of ['/example/local-assets/sdkjs/common/wasm-convert/worker.js','/example/local-assets/web-apps/apps/documenteditor/main/index.html']){
  const response=await context.request.get(base+url);assert.equal(response.status(),200);
  assert.match(response.headers()['content-security-policy'],/connect-src .*\/example\/local-assets\//);
 }
 console.log('PASS native image/frame/style, fetch/XHR/WebSocket/beacon and blob worker egress blocked; editor and HTTP worker CSP headers');await context.close();
}finally{await browser.close();}
