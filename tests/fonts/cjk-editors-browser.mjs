// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,fixtures=process.env.EO_LOCAL_FIXTURES,out=process.env.EO_LOCAL_OUT;
assert(base&&!/:8080(?:\/|$)/.test(base)&&fixtures&&out,'Own non-8080 EO_BASE, fixtures and output required');
fs.mkdirSync(out,{recursive:true});
const marker='日本語简体中文繁體中文한국어ᄀｶ',expected=[['JP','Elixir Fallback CJK JP'],['TC','Elixir Fallback CJK TC'],['SC','Elixir Fallback CJK SC'],['KR','Elixir Fallback CJK KR'],['JAMO','Elixir Fallback CJK KR'],['HALFWIDTH','Elixir Fallback CJK JP']];
const allCases=[['word','sample.docx'],['cell','sample.xlsx'],['slide','sample.pptx']],cases=process.env.EO_CJK_CASE?allCases.filter(([kind])=>kind===process.env.EO_CJK_CASE):allCases,browser=await chromium.launch(),report=[];

function text(file){return execFileSync('python3',['-c',"import sys,zipfile,xml.etree.ElementTree as E;z=zipfile.ZipFile(sys.argv[1]);print(''.join(''.join(E.fromstring(z.read(n)).itertext()) for n in z.namelist() if n.endswith('.xml')))",file],{encoding:'utf8'});}
async function open(page,file,diagnostics={}){
 await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
 try{await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:Number(process.env.EO_CJK_TIMEOUT||120000)});}
 catch(error){throw new Error(error.message+' '+JSON.stringify({...(await page.evaluate(()=>({message:document.getElementById('message')?.textContent,failure:window.EOLocalFailure,session:!!window.EOLocalSession,frames:Array.from(document.querySelectorAll('iframe'),frame=>frame.src)}))),...diagnostics}));}
 assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
 const frame=page.frames().find(f=>/\/(document|spreadsheet|presentation)editor\/main\//.test(f.url()));assert(frame);return frame;
}
async function snapshot(frame){
 await frame.waitForFunction(()=>window.AscFonts?.FontPickerByCharacter?.getFontBySymbol);
 return frame.evaluate(()=>{
  const api=Asc.editor;
  return {picks:[[0x3042,'JP'],[0x3105,'TC'],[0x4e00,'SC'],[0xac00,'KR'],[0x1100,'JAMO'],[0xff76,'HALFWIDTH']].map(([cp,region])=>[region,AscFonts.FontPickerByCharacter.getFontBySymbol(cp)]),pages:typeof api.getCountPages==='function'?api.getCountPages():null};
 });
}

try{for(const [kind,name] of cases){
 const context=await browser.newContext({acceptDownloads:true}),errors=[],bad=[],cjk=[];
 let page=await context.newPage();
 const monitor=current=>{
  current.on('pageerror',error=>errors.push(error.message));current.on('console',message=>{if(['error','warning'].includes(message.type()))errors.push('console '+message.type()+': '+message.text());});current.on('websocket',socket=>bad.push(socket.url()));
  current.on('request',request=>{const url=new URL(request.url());if(['blob:','data:'].includes(url.protocol))return;if(request.method()!=='GET'||url.origin!==new URL(base).origin||!(/^\/example\/local-assets\/(?:\d+\.\d+\.\d+-[a-f0-9]+\/)?(?:web-apps|sdkjs|fonts|dictionaries)\//.test(url.pathname)||['/example/local.html','/example/elixir-local/local.js','/sdkjs/common/device_scale.js'].includes(url.pathname)))bad.push(request.url());if(/\/fonts\/(?:004|005)$/.test(url.pathname))cjk.push({url:url.pathname});});
  current.on('response',response=>{const length=Number(response.headers()['content-length']||0),url=new URL(response.url()).pathname;if(response.status()>=400)errors.push('HTTP '+response.status()+' '+response.url());const entry=[...cjk].reverse().find(item=>item.url===url&&!item.status);if(entry){entry.status=response.status();entry.length=length;}});
 };monitor(page);
 let frame=await open(page,path.join(fixtures,name),{errors,bad});await frame.waitForFunction(()=>AscFonts.FontPickerByCharacter.__elixirCjkLazy&&Asc.editor.asc_enterText.__elixirCjkInput&&!AscCommon.g_font_loader.isWorking());assert.equal(cjk.length,0,'CJK bytes loaded before CJK content');
 await frame.evaluate(({kind,marker})=>{
  const api=Asc.editor,codes=Array.from(marker,c=>c.codePointAt(0));
  if(kind==='word')api.WordControl.m_oLogicDocument.MoveCursorToStartPos();
  if(kind==='slide'){
   const doc=api.WordControl.m_oLogicDocument,control=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(item=>item.txBody);
   if(!shape)throw Error('No editable slide text');control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();
  }
  api.asc_enterText(codes);if(kind==='cell')api.asc_closeCellEditor();
 },{kind,marker});
 await page.waitForFunction(()=>EOLocalSession.controller.isModified(),null,{timeout:30000});
 const before=await snapshot(frame);
 await frame.waitForFunction(()=>performance.getEntriesByType('resource').some(entry=>/\/fonts\/(?:004|005)$/.test(new URL(entry.name).pathname)),null,{timeout:30000});
 await frame.waitForFunction(()=>AscFonts.FontPickerByCharacter.__elixirCjkLoadState==='loaded'&&!AscCommon.g_font_loader.isWorking(),null,{timeout:30000});
 const cjkBytes=await frame.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>/\/fonts\/(?:004|005)$/.test(new URL(entry.name).pathname)).map(entry=>Math.max(entry.transferSize,entry.encodedBodySize,entry.decodedBodySize)));
 assert.deepEqual(before.picks,expected);assert.deepEqual(cjk.map(item=>item.url.match(/\/fonts\/(?:004|005)$/)[0]).sort(),['/fonts/004','/fonts/005']);assert(cjk.every(item=>item.status===200)&&cjkBytes.length===2&&cjkBytes.every(bytes=>bytes>19000000),'CJK collections were not fully fetched: '+JSON.stringify({cjk,cjkBytes}));
 const count=cjk.length;await frame.evaluate(()=>new Promise(resolve=>AscCommon.g_font_loader.LoadFonts(['Elixir Fallback CJK JP','Elixir Fallback CJK TC','Elixir Fallback CJK SC','Elixir Fallback CJK KR'],resolve)));assert.equal(cjk.length,count,'Repeated load fetched CJK bytes again');
 const saved=path.join(out,name),pending=page.waitForEvent('download',{timeout:120000});await page.locator('#save').click();await (await pending).saveAs(saved);assert(text(saved).includes(marker),'Saved '+kind+' document lost CJK text');
 const pdfPending=page.waitForEvent('download',{timeout:120000});let pdfDownload;try{[pdfDownload]=await Promise.all([pdfPending,page.evaluate(()=>EOLocalSession.controller.exportAs('pdf'))]);}catch(error){await pdfPending.catch(()=>{});throw error;}const pdf=path.join(out,kind+'.pdf');await pdfDownload.saveAs(pdf);
 const pdfStats=await page.evaluate(()=>window.EOLocalLastExport);
 assert(execFileSync('pdftotext',[pdf,'-'],{encoding:'utf8'}).replace(/\s/g,'').includes(marker),'PDF lost '+kind+' CJK text: '+JSON.stringify(pdfStats));
 const embedded=execFileSync('pdffonts',[pdf],{encoding:'utf8'});assert(/CID|Type 0C|TrueType/i.test(embedded)&&/yes\s+yes/i.test(embedded),'PDF lacks embedded searchable CJK font');
 await page.close();page=await context.newPage();monitor(page);frame=await open(page,saved,{errors,bad});await frame.waitForFunction(()=>AscFonts.FontPickerByCharacter.__elixirCjkLoadState==='loaded'&&!AscCommon.g_font_loader.isWorking());const after=await snapshot(frame);assert.deepEqual(after,before,'Fallback or page count changed after reopen');
 const cached=await frame.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>/\/fonts\/(?:004|005)$/.test(new URL(entry.name).pathname)).map(entry=>entry.transferSize));
 assert(cached.length===2&&cached.every(bytes=>bytes===0),'Fresh reopen did not use the CJK HTTP cache: '+JSON.stringify(cached));assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 report.push({kind,savedBytes:fs.statSync(saved).size,pdfBytes:fs.statSync(pdf).size,cjkRequests:cjk,before,after});await context.close();console.log('PASS',kind,'CJK fallback, save, PDF and cached reopen parity');
}
fs.writeFileSync(path.join(out,'cjk-editors.json'),JSON.stringify(report,null,2)+'\n');}finally{await browser.close();}
