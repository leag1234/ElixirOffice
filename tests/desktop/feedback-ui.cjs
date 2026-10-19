// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {firefox}=require(process.env.EO_PLAYWRIGHT||'../../tools/node_modules/playwright-core');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'../..');
(async()=>{
 const work=process.env.EO_FEEDBACK_OUTPUT||await fs.mkdtemp(require('node:path').join(require('node:os').tmpdir(),'eo-feedback-ui-'));await fs.mkdir(work,{recursive:true});
 const browser=await firefox.launch({headless:true}),page=await browser.newPage({viewport:{width:1200,height:800}});
 try{
  const feedback=await fs.readFile(root+'/desktop/feedback.js','utf8'),css=await fs.readFile(root+'/desktop/feedback.css','utf8'),catalogs=JSON.parse(await fs.readFile(root+'/tools/desktop/i18n-extra.json','utf8'));
  for(const lang of ['en','fr','ar']){
   await page.setContent('<html lang="'+lang+'" dir="'+(lang==='ar'?'rtl':'ltr')+'"><body><h1>Lifecycle UI fixture</h1><button id="focus">Focus marker</button></body></html>');
   await page.addStyleTag({content:css});await page.addScriptTag({content:feedback});await page.addScriptTag({content:await fs.readFile(root+'/desktop/errors.js','utf8')});
   await page.evaluate(strings=>{window.actions=[];window.view=EOOperationFeedback.mount(document,document.body,strings,{open:id=>{if(window.actionError)throw Error(window.actionError);actions.push(['open',id]);},show:id=>{if(window.actionError)throw Error(window.actionError);actions.push(['show',id]);},error:event=>view.update({...event,reason:EODesktopErrors.message(event.reason,strings)}),cancel:id=>actions.push(['cancel',id])});view.reset('public');},catalogs[lang]);
   await page.locator('#focus').focus();
   await page.evaluate(()=>view.update({id:'one',scope:'public',kind:'export',phase:'preparing'}));
   assert.equal(await page.locator('.eo-operation').getAttribute('aria-busy'),'true');
   assert.equal(await page.locator('progress').getAttribute('value'),null);
   assert.equal(await page.locator('.eo-operation-actions button').count(),0);
   const painted=await page.evaluate(async()=>{await EOOperationFeedback.paint(window);const notice=document.querySelector('.eo-operation'),box=notice.getBoundingClientRect();return {visible:!notice.hidden&&box.width>0&&box.height>0,busy:notice.getAttribute('aria-busy'),indeterminate:!document.querySelector('progress').hasAttribute('value')};});
   assert.deepEqual(painted,{visible:true,busy:'true',indeterminate:true});
   await page.evaluate(()=>view.update({id:'one',scope:'public',kind:'export',phase:'converting',completed:2,total:5}));
   assert.equal(await page.locator('progress').getAttribute('value'),'2');assert.equal(await page.locator('progress').getAttribute('max'),'5');
   assert((await page.locator('.eo-operation-text').textContent()).includes('2 / 5'));
   assert.equal(await page.evaluate(()=>document.activeElement.id),'focus');
   assert.equal(await page.evaluate(()=>view.update({id:'old',scope:'public',phase:'ready',name:'wrong'})),false);
   assert.equal(await page.evaluate(()=>view.update({id:'one',scope:'other',phase:'ready',name:'wrong'})),false);
   await page.screenshot({path:work+'/feedback-'+lang+'-progress.png'});
   await page.evaluate(()=>view.update({id:'one',scope:'public',kind:'export',phase:'ready',name:'public.pdf',artifactId:'opaque-public'}));
   assert.equal(await page.locator('.eo-operation').getAttribute('aria-busy'),'false');
   assert.equal(await page.locator('.eo-operation-actions button').count(),3);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'focus');
   await page.locator('.eo-operation-actions button').nth(0).focus();await page.keyboard.press('Enter');
   await page.locator('.eo-operation-actions button').nth(1).focus();await page.keyboard.press('Enter');
   assert.deepEqual(await page.evaluate(()=>actions),[['open','opaque-public'],['show','opaque-public']]);
   await page.screenshot({path:work+'/feedback-'+lang+'-ready.png'});
   await page.locator('.eo-operation-actions button').nth(2).click();await page.evaluate(()=>{view.obscure(true);view.obscure(false);});assert(await page.locator('.eo-operation').isHidden());assert.equal(await page.evaluate(()=>document.activeElement.id),'focus');
   for(const phase of ['cancelled','warning','error','complete']){
    await page.evaluate(phase=>{view.update({id:phase,scope:'public',phase:'preparing'});view.update({id:phase,scope:'public',phase,reason:'Destination blocked',name:'public.pdf',artifactId:'opaque-public',outcome:'download-started'});},phase);
    assert.equal(await page.locator('.eo-operation-actions button').count(),1);
    if(phase==='error'){assert.equal(await page.locator('.eo-operation-live').getAttribute('role'),'alert');assert((await page.locator('.eo-operation-text').textContent()).includes('Destination blocked'));}
   }
   for(const phase of ['preparing','loading-runtime','initializing','converting']){
    await page.evaluate(phase=>{
     if(phase==='preparing')view.update({id:'named-open',scope:'public',kind:'open',phase,name:'تقرير-2026.docx'});
     else view.update({id:'named-open',scope:'public',kind:'open',phase,name:'تقرير-2026.docx',purpose:phase==='converting'?'decrypting':undefined});
    },phase);
    assert.equal(await page.locator('progress').getAttribute('value'),null);assert((await page.locator('.eo-operation-text').textContent()).includes('\u2068تقرير-2026.docx\u2069'));
   }
   await page.evaluate(()=>view.update({id:'named-open',scope:'public',kind:'open',phase:'complete',outcome:'opened',name:'تقرير-2026.docx'}));
   assert.equal(await page.locator('.eo-operation').getAttribute('aria-busy'),'false');assert.equal(await page.locator('.eo-operation-actions button').count(),1);
   await page.evaluate(()=>{view.update({id:'print',scope:'public',kind:'print',phase:'preparing'});view.update({id:'print',scope:'public',kind:'print',phase:'converting',completed:1,total:3});});
   assert.equal(await page.locator('.eo-operation-actions button').count(),1);
   await page.evaluate(()=>view.update({id:'print',scope:'public',kind:'print',phase:'awaiting-output'}));assert.equal(await page.locator('.eo-operation-actions button').count(),0);
   await page.evaluate(()=>view.update({id:'print',scope:'public',kind:'print',phase:'awaiting-user'}));
   assert(await page.locator('.eo-operation').isHidden(),'System print choice must not have a competing floating panel');
   assert.equal(await page.locator('.eo-operation-live').textContent(),catalogs[lang].opAwaiting);
   assert.equal(await page.locator('.eo-operation-live').evaluate(el=>el.closest('[hidden]')===null),true);
   await page.evaluate(()=>{view.obscure(true);view.obscure(false);});
   assert(await page.locator('.eo-operation').isHidden(),'Closing another overlay must not reveal the native print choice panel');
   await page.evaluate(()=>view.update({id:'print',scope:'public',kind:'print',phase:'complete',outcome:'print-started'}));
   assert(await page.locator('.eo-operation').isVisible(),'Submission feedback returns after system choice');
   for(const kind of ['save','pdf-export','open']){
    await page.evaluate(kind=>{view.update({id:kind,scope:'public',kind,phase:'preparing'});view.update({id:kind,scope:'public',kind,phase:'awaiting-user'});},kind);
    assert(await page.locator('.eo-operation').isVisible(),kind+' choices keep their existing feedback');
   }
   for(const phase of ['error','cancelled']){
    await page.evaluate(phase=>{view.update({id:'native-print',scope:'public',kind:'print',phase:'preparing'});view.update({id:'native-print',scope:'public',kind:'print',phase:'awaiting-user'});view.update({id:'native-print',scope:'public',kind:'print',phase,reason:'Printer unavailable'});},phase);
    assert(await page.locator('.eo-operation').isVisible(),phase+' must restore visible feedback');
   }
   await page.evaluate(()=>{view.update({id:'print-finished',scope:'public',kind:'print',phase:'preparing'});view.update({id:'print-finished',scope:'public',kind:'print',phase:'complete',outcome:'print-started'});});
assert.equal(await page.locator('.eo-operation-actions button').count(),1);
   assert.equal(await page.locator('.eo-operation-text').textContent(),catalogs[lang].opPrint);
  }
  for(const phase of ['preparing','loading-runtime','initializing','converting']){
   await page.evaluate(phase=>{view.update({id:'cancel-test',scope:'public',kind:'pdf-export',phase:'preparing'});view.update({id:'cancel-test',scope:'public',kind:'pdf-export',phase});},phase);
   assert.equal(await page.locator('.eo-operation-actions button').count(),1);
   await page.locator('.eo-operation-actions button').click();assert.deepEqual((await page.evaluate(()=>actions)).at(-1),['cancel','cancel-test']);
  }
  await page.locator('.eo-operation-actions button').focus();
  await page.evaluate(()=>{window.cancelNode=document.activeElement;view.update({id:'cancel-test',scope:'public',kind:'pdf-export',phase:'converting',completed:3,total:10});});
  assert.equal(await page.evaluate(()=>document.activeElement===cancelNode&&cancelNode.isConnected),true);
  for(const phase of ['awaiting-output','writing']){
   await page.evaluate(phase=>view.update({id:'cancel-test',scope:'public',kind:'pdf-export',phase}),phase);
   assert.equal(await page.locator('.eo-operation-actions button').count(),0);
  }
  await page.evaluate(()=>view.update({id:'cancel-test',scope:'public',kind:'pdf-export',phase:'cancelled'}));
  assert.equal(await page.locator('.eo-operation-actions button').count(),1);
  await page.evaluate(()=>{
   window.actionError="Error invoking remote method 'eo:saved-show': Error: ENOENT: lstat '/private/public-fixture'";
   view.update({id:'missing',scope:'public',phase:'preparing'});
   view.update({id:'missing',scope:'public',phase:'ready',name:'تقرير-2026.pdf',artifactId:'missing-opaque'});
  });
  assert((await page.locator('.eo-operation-text').textContent()).includes('\u2068تقرير-2026.pdf\u2069'));
  await page.locator('.eo-operation-actions button').nth(1).click();
  await page.waitForFunction(()=>document.querySelector('.eo-operation-live').getAttribute('role')==='alert');
  const mapped=await page.locator('.eo-operation-text').textContent();
  assert(!mapped.includes('/private/')&&!mapped.includes('Error invoking remote method')&&!mapped.includes('ENOENT'));
  assert(mapped.includes(catalogs.ar.savePath||await page.evaluate(()=>EODesktopErrors.fallback.savePath)));
  await page.evaluate(()=>{
   window.actionError="Error invoking remote method 'eo:saved-show': Error: Saved file unavailable";
   view.update({id:'expired',scope:'public',phase:'preparing'});view.update({id:'expired',scope:'public',phase:'ready',name:'public.pdf',artifactId:'expired'});
  });
  await page.locator('.eo-operation-actions button').nth(1).click();
  await page.waitForFunction(()=>document.querySelector('.eo-operation-live').getAttribute('role')==='alert');
  assert((await page.locator('.eo-operation-text').textContent()).includes(catalogs.ar.opFileMissing));
  await page.evaluate(()=>{window.actionError=null;view.update({id:'escape',scope:'public',phase:'preparing'});});
  for(const phase of ['preparing','loading-runtime','initializing','converting']){
   await page.evaluate(phase=>{view.update({id:'cancel-test',scope:'public',kind:'pdf-export',phase:'preparing'});view.update({id:'cancel-test',scope:'public',kind:'pdf-export',phase});},phase);
   assert.equal(await page.locator('.eo-operation-actions button').count(),1);
   await page.locator('.eo-operation-actions button').click();assert.deepEqual((await page.evaluate(()=>actions)).at(-1),['cancel','cancel-test']);
  }
  await page.locator('.eo-operation-actions button').focus();
  await page.evaluate(()=>{window.cancelNode=document.activeElement;view.update({id:'cancel-test',scope:'public',kind:'pdf-export',phase:'converting',completed:3,total:10});});
  assert.equal(await page.evaluate(()=>document.activeElement===cancelNode&&cancelNode.isConnected),true);
  for(const phase of ['awaiting-output','writing']){
   await page.evaluate(phase=>view.update({id:'cancel-test',scope:'public',kind:'pdf-export',phase}),phase);
   assert.equal(await page.locator('.eo-operation-actions button').count(),0);
  }
  await page.evaluate(()=>view.update({id:'cancel-test',scope:'public',kind:'pdf-export',phase:'cancelled'}));
  assert.equal(await page.locator('.eo-operation-actions button').count(),1);
  await page.evaluate(()=>view.update({id:'escape',scope:'public',phase:'ready',name:'<img src=x onerror=alert(1)>',artifactId:'opaque'}));
  assert.equal(await page.locator('.eo-operation img').count(),0);
  console.log('PASS real browser DOM UI en/fr/ar indeterminate/counts/terminal actions/keyboard/focus/stale/escaping; synthetic lifecycle fixture, not native save');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
