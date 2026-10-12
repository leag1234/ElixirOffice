// SPDX-License-Identifier: AGPL-3.0-only
// Render real editor drawing commands through the native PDF worker.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(process.env.PW_DIR||path.join(os.homedir(),'elixiroffice/pw'),'package.json'))('playwright');
const [corpus,out]=process.argv.slice(2),base=process.env.EO_BASE;
if(!base||new URL(base).port==='8080')throw Error('Own instance required');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1280,height:900}}),page=await ctx.newPage();
const rows=fs.readFileSync(path.join(corpus,'manifest.csv'),'utf8').trim().split(/\r?\n/).slice(1).map(l=>l.split(',').slice(0,2));
const results=[];
try{for(const [id,file] of rows){
 if(!file.endsWith('.docx'))continue;
 const fd=new FormData();fd.append('uploadedFile',new Blob([fs.readFileSync(path.join(corpus,file))]),'d4-'+id+'-'+Date.now()+'.docx');
 const j=await(await fetch(base+'/example/upload',{method:'POST',body:fd})).json();if(!j.filename)throw Error(JSON.stringify(j));
 try{
 await page.goto(base+'/example/editor?fileName='+encodeURIComponent(j.filename)+'&lang=en');
 let f;for(let k=0;k<500&&!f;k++){f=page.frames().find(f=>f.url().includes('/documenteditor/main/'));if(!f)await page.waitForTimeout(100);}
 if(!f)throw Error('Missing editor '+id);
 await f.waitForFunction(()=>{const a=window.Asc?.editor,d=a?.WordControl?.m_oDrawingDocument,l=a?.WordControl?.m_oLogicDocument;
  return a?.isDocumentLoadComplete&&d.m_lPagesCount>0&&d.m_lCountCalculatePages>=d.m_lPagesCount&&!l.FullRecalc.Id;},null,{timeout:180000});
 const data=await f.evaluate(async()=>{
  const api=Asc.editor,l=api.WordControl.m_oLogicDocument;
  const pdf=await AscCommon.ClientPdf.build(api);if(pdf.stats.backend!=='wasm')throw Error('Native PDF required: '+JSON.stringify(pdf.stats));
  return {bytes:Array.from(pdf.bytes),stats:pdf.stats,pages:api.WordControl.m_oDrawingDocument.m_lPagesCount,
   layout:l.Content.map(e=>({page:e.GetAbsoluteStartPage(),pages:e.Pages?.map(p=>({pos:p.Pos,end:p.EndPos,bounds:p.Bounds}))}))};
 });
 fs.writeFileSync(path.join(out,id+'.pdf'),Buffer.from(data.bytes));delete data.bytes;
 results.push({id,...data});fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify(results,null,2));
 console.log(id,data.pages,data.stats.backend);
 }finally{await fetch(base+'/example/file?filename='+encodeURIComponent(j.filename),{method:'DELETE'});}
}}finally{await browser.close();}
