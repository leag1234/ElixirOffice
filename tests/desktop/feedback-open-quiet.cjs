// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.EO_PLAYWRIGHT||'playwright-core');
(async()=>{const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.EO_CHROMIUM_EXECUTABLE?{executablePath:process.env.EO_CHROMIUM_EXECUTABLE}:{})});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<button id="outside">Public control</button><div id="file-panel"></div>');
 await page.addStyleTag({content:await fs.readFile(path.join(__dirname,'../../desktop/feedback.css'),'utf8')});
 await page.addScriptTag({content:await fs.readFile(path.join(__dirname,'../../desktop/feedback.js'),'utf8')});
 await page.evaluate(()=>{
  window.floating=EOOperationFeedback.mount(document,document.body,{}, {open(){},show(){}});
  window.detail=EOOperationFeedback.mount(document,document.querySelector('#file-panel'),{},{});
  floating.element.id='floating-operation';
  detail.element.classList.add('eo-operation-backstage');
  for(const view of [floating,detail])view.reset('public');
  window.send=(view,id,event)=>{view.update({scope:'public',id,kind:event.kind,phase:'preparing',name:'Public.docx'});view.update({scope:'public',id,name:'Public.docx',...event});};
 });
 const notice=page.locator('#floating-operation'),live=page.locator('body > .eo-operation-live');
 await page.evaluate(()=>send(floating,'opening',{kind:'open',phase:'converting'}));assert(await notice.isVisible(),'Open progress remains visible');
 await page.evaluate(()=>floating.update({scope:'public',id:'opening',kind:'open',phase:'complete',outcome:'opened',name:'Public.docx'}));
 assert(await notice.isHidden(),'Successful Open must not show the bottom-right toast');
 assert((await live.textContent()).includes('Public.docx'));assert.equal(await live.getAttribute('aria-live'),'polite');
 await page.evaluate(()=>{floating.obscure(true);floating.obscure(false);});assert(await notice.isHidden(),'Closing File must not resurrect a successful Open toast');
 await page.evaluate(()=>send(detail,'opening',{kind:'open',phase:'complete',outcome:'opened'}));
 assert(await page.locator('#file-panel .eo-operation').isVisible(),'File operation details remain available');
 const cases=[
  {kind:'open',phase:'error',reason:'Public failure'},{kind:'open',phase:'warning'},
  {kind:'pdf-export',phase:'converting',completed:2,total:4},{kind:'print',phase:'awaiting-output'},
  {kind:'print',phase:'complete',outcome:'print-started'},{kind:'export',phase:'complete',outcome:'download-started'},
  {kind:'save',phase:'ready',artifactId:'public-copy'}
 ];
 for(let i=0;i<cases.length;i++){await page.evaluate(({event,id})=>send(floating,id,event),{event:cases[i],id:'case-'+i});assert(await notice.isVisible(),JSON.stringify(cases[i]));}
 assert.equal(await notice.getByRole('button',{name:'Open file'}).count(),1);
 assert.equal(await notice.getByRole('button',{name:'Show in folder'}).count(),1);
 assert.deepEqual(errors,[]);console.log('PASS quiet successful Open, retained live announcement, no resurrection, File details,7important feedback cases and file actions');
 await page.close();
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
