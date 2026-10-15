import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_LOCAL_FILE;assert.ok(base&&!/:8080(?:\/|$)/.test(base)&&file);
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto(base+'/example/local.html');
 await page.addScriptTag({url:base+'/sdkjs/common/clientpdf/wasm-fonts.js'});await page.addScriptTag({url:base+'/sdkjs/common/wasm-convert/api.js'});
 const data=Array.from(fs.readFileSync(file));
 for(const kind of ['normal','pre-cancel','mid-cancel','clone-error']){
  const result=await page.evaluate(async({kind,data})=>{
   const signal=new AbortController();if(kind==='pre-cancel')signal.abort();
   try{
    const value=await EOWasmConvert.convert(new Uint8Array(data),'docx','doct',{signal:signal.signal,onProgress:()=>{if(kind==='mid-cancel')signal.abort();},...(kind==='clone-error'?{resources:[{uncloneable:function(){}}]}:{})});
    return {ok:true,bytes:value.length};
   }catch(e){return {ok:false,code:e.code,message:e.message};}
  },{kind,data});
  if(kind==='normal')assert.ok(result.ok&&result.bytes>0);else if(kind.includes('cancel'))assert.equal(result.code,'cancelled');else assert.match(result.message,/cannot be sent to a worker/);
  const immediate=page.workers().length,start=Date.now();
  while(page.workers().length&&Date.now()-start<2000)await page.waitForTimeout(20);
  assert.equal(page.workers().length,0,'worker must close within 2 seconds after '+kind);
  console.log('PASS lifecycle',JSON.stringify({kind,immediateWorkers:immediate,closeWaitMs:Date.now()-start,...result}));
 }
}finally{await browser.close();}
