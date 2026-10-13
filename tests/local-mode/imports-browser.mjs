// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,fixtures=process.env.EO_LOCAL_FIXTURES,out=process.env.EO_LOCAL_OUT,seed=process.env.EO_EXPORT_OUT;
assert(base&&!/:8080(?:\/|$)/.test(base)&&fixtures&&out&&seed);fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),browser=await chromium.launch(),report=[];
const cases=[['rtf','docx','word'],['txt','docx','word'],['dotx','docx','word'],['docm','docx','word'],['csv','xlsx','cell'],['xltx','xlsx','cell'],['xlsm','xlsx','cell'],['potx','pptx','slide'],['ppsx','pptx','slide'],['doc','docx','word'],['xls','xlsx','cell'],['ppt','pptx','slide']];
try{
 const setup=await browser.newPage();await setup.goto(base+'/example/local.html');
 for(const name of ['clientpdf/wasm-fonts.js','wasm-convert/api.js'])await setup.addScriptTag({url:base+'/example/local-assets/sdkjs/common/'+name});
 for(const [from,to,kind] of cases){
  let input;
  if(['doc','xls','ppt'].includes(from))input=fs.readFileSync(path.join(fixtures,'public.'+from));
  else{
   const result=await setup.evaluate(async({data,from,to})=>Array.from(await EOWasmConvert.convert(new Uint8Array(data),from,to)),{data:Array.from(fs.readFileSync(path.join(seed,kind+'-copy.'+to))),from:to,to:from});
   input=Buffer.from(result);
  }
  const file=path.join(out,'input.'+from);fs.writeFileSync(file,input);const before=hash(input);
  const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),bad=[];
  page.on('request',r=>{if(r.method()!=='GET'||/\/(upload|doc\/|ConvertService|coauthoring)/i.test(r.url()))bad.push(r.url());});page.on('websocket',w=>bad.push(w.url()));
  await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
  await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null,from);
  const state=await page.evaluate(()=>({format:EOLocalSession.format,source:EOLocalSession.sourceFormat,converted:EOLocalSession.converted,message:document.querySelector('#message').textContent}));
  assert.equal(state.format,to);assert.equal(state.source,from);assert.equal(state.converted,true);assert(state.message.includes('converted copy'));
  const pending=page.waitForEvent('download',{timeout:120000});await page.locator('#save').click();
  const download=await pending,dest=path.join(out,'saved-'+from+'.'+to);await download.saveAs(dest);
  assert.equal(download.suggestedFilename(),'input (converted).'+to);assert.equal(hash(fs.readFileSync(file)),before);
  if(!['doc','xls','ppt'].includes(from))execFileSync('python3',['-c',"import sys,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(sys.argv[1]); assert any('D3COPY' in ''.join(E.fromstring(z.read(n)).itertext()) for n in z.namelist() if n.endswith('.xml'))",dest]);
  await page.locator('#file').setInputFiles(dest);await page.waitForFunction(()=>(EOLocalSession&&EOLocalSession.sourceFormat===EOLocalSession.format)||EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
  assert.equal(await page.evaluate(()=>EOLocalSession.format),to);assert.deepEqual(bad,[]);
  report.push({from,to,opened:true,convertedCopy:true,reopened:true,originalUnchanged:true,bytes:fs.statSync(dest).size});console.log('PASS import',from,to);await context.close();
 }
 await setup.close();fs.writeFileSync(path.join(out,'imports-report.json'),JSON.stringify(report,null,2));
}finally{await browser.close();}
