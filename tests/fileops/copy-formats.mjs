// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import * as L from '../shortcuts/lib.mjs';
const base=process.env.EO_BASE;assert(base,'Set EO_BASE to an owned instance');
const env=await L.launch({w:1920,h:1080}),fixture=fs.readFileSync(new URL('../fixtures/docx/selection-fills.docx',import.meta.url)),tag='PublicCopyFormats-'+Date.now(),marker='PUBLIC-OTHER-FORMAT';
try{
 const uploaded=await(await env.context.request.post(base+'/example/upload',{multipart:{uploadedFile:{name:tag+'.docx',mimeType:'application/octet-stream',buffer:fixture}}})).json();assert(uploaded.filename);
 const f=await L.openEditor(env.page,{fileName:uploaded.filename,lang:'en'});
 await f.evaluate(marker=>{Asc.editor.WordControl.m_oLogicDocument.MoveCursorToStartPos();Asc.editor.asc_enterText(Array.from(marker,c=>c.codePointAt(0)))},marker);
 for(const [ext,code] of [['pdf',513],['rtf',68]]){
  await f.locator('#toolbar a[data-tab=file]').click();await f.locator('#fm-btn-download').click();await f.locator('#panel-saveas .elx-copy-formats .elx-format[format="'+code+'"]').click();
  if(ext==='rtf'){
   const warning=f.locator('.dlg-btn[result=ok]:visible');await warning.waitFor();
   assert((await f.locator('.modal-dlg:visible,.asc-window:visible').allTextContents()).some(text=>/formatting might be lost/i.test(text)));
   await warning.first().click();
  }
  const picker=env.page.locator('dialog[data-storage-folder-picker=local]');await picker.waitFor({timeout:120000});
  const name=tag+'-independent.'+ext;await picker.locator('input').fill(name);
  const response=env.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/elixir/storage/copy'));await picker.getByRole('button',{name:'Save',exact:true}).click();
  const saved=await response;assert.equal(saved.status(),200,await saved.text());
  const data=await(env.context.request.get(base+'/example/download?fileName='+encodeURIComponent(name))).then(r=>r.body());
  if(ext==='pdf'){assert(data.subarray(0,5).equals(Buffer.from('%PDF-')));assert(execFileSync('pdftotext',['-','-'],{input:data,encoding:'utf8'}).includes(marker))}
  else{assert(data.subarray(0,5).equals(Buffer.from('{\\rtf')))}
  assert.deepEqual(await(await env.context.request.get(base+'/example/download?fileName='+encodeURIComponent(uploaded.filename))).body(),fixture);
  await picker.getByRole('button',{name:'Close',exact:true}).click();
  if(ext==='rtf'){
   const fresh=await L.openEditor(env.page,{fileName:name,lang:'en'});
   const content=await L.cmd(fresh,'(function(){var d=Api.GetDocument(),t=[];for(var i=0;i<d.GetElementsCount();i++){var p=d.GetElement(i);if(p.GetText)t.push(p.GetText())}return t.join("\\n")})()');
   assert(content.includes(marker),'Reopened RTF copy lost pending text');
  }
  console.log('PASS storage Save a Copy '+ext+' converts pending content, persists bytes and preserves original');
 }
}finally{await env.browser.close()}
