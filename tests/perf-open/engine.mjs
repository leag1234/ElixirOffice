// SPDX-License-Identifier: AGPL-3.0-only
// Real font-engine equivalence and hidden-text setter regression checks.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const [doc,out]=process.argv.slice(2),base=process.env.EO_BASE;
if(!base||new URL(base).port==='8080')throw Error('Own instance required');
const browser=await chromium.launch({headless:true}),page=await browser.newPage();
const fd=new FormData();fd.append('uploadedFile',new Blob([fs.readFileSync(doc)]),'d4-engine-'+Date.now()+'.docx');
const j=await(await fetch(base+'/example/upload',{method:'POST',body:fd})).json();
try{
 await page.goto(base+'/example/editor?fileName='+encodeURIComponent(j.filename)+'&lang=en');
 let f;for(let i=0;i<600&&!f;i++){f=page.frames().find(f=>f.url().includes('/documenteditor/main/'));if(!f)await page.waitForTimeout(100);}
 await f.waitForFunction(()=>window.Asc?.editor?.isDocumentLoadComplete&&!Asc.editor.WordControl.m_oLogicDocument.FullRecalc.Id,null,{timeout:180000});
 const r=await f.evaluate(()=>{
  const failures=[];let tested=0;
  const values=[...Array(128).keys(),0xe9,0x300,0x591,0x5d0,0x621,0x202e,0x1e900,0x10900,0x1f600,0x10ffff];
  for(const cp of values){
   const expected=!!AscFonts.isRtlScript(cp),t=new AscWord.CRunText(cp);tested++;
   if(!!(t.Flags&2)!==expected)failures.push('constructor '+cp);
   t.SetCharCode(0x5d0);t.SetCharCode(cp);tested++;
   if(!!(t.Flags&2)!==expected)failures.push('RTL transition '+cp);
  }
  const api=Asc.editor,l=api.WordControl.m_oLogicDocument;
  let refreshes=0;const original=l.refreshHiddenText;
  l.refreshHiddenText=function(...a){refreshes++;return original.apply(this,a)};
  const before=refreshes;api.put_ShowParaMarks(api.get_ShowParaMarks());
  const redundant=refreshes-before;
  const initial=api.get_ShowParaMarks();api.put_ShowParaMarks(!initial);api.put_ShowParaMarks(initial);
  const changes=refreshes-before-redundant;l.refreshHiddenText=original;
  if(redundant!==0)failures.push('redundant setter scans '+redundant);
  if(changes!==2)failures.push('actual toggles must invalidate twice: '+changes);
  return {tested,failures,redundant,changes,pages:api.WordControl.m_oDrawingDocument.m_lPagesCount};
 });
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r));
 if(r.failures.length)process.exitCode=1;
}finally{await browser.close();await fetch(base+'/example/file?filename='+encodeURIComponent(j.filename),{method:'DELETE'});}
