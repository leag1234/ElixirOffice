// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {firefox}=require(process.env.EO_PLAYWRIGHT||'../../tools/node_modules/playwright-core'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage(),catalogs=require('../../tools/desktop/i18n-extra.json');
  await page.addScriptTag({content:await fs.readFile(path.join(root,'desktop/feedback.js'),'utf8')});
  for(const [language,strings]of Object.entries(catalogs)){
   await page.evaluate(strings=>{
    window.copyCount=0;window.panel?.dispose();
    window.panel=EOOperationFeedback.mount(document,document.body,strings,{diagnostics:()=>{copyCount++}});panel.reset('document-a');
    panel.update({scope:'document-a',id:'save-a',kind:'save',phase:'preparing'});
    panel.update({scope:'document-a',id:'save-a',kind:'save',phase:'error',reason:strings.saveBusy});
   },strings);
   const copy=page.getByRole('button',{name:strings.opCopyDiagnostics,exact:true});
   await copy.focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>copyCount),1,language);
   assert.equal(await page.locator('.eo-operation-text').textContent(),strings.opFailed.replace('{reason}','\u2068'+strings.saveBusy+'\u2069'));
   await page.evaluate(()=>panel.update({scope:'document-a',id:'save-a',kind:'save',phase:'cancelled'}));
   assert.equal(await copy.count(),0,language+' cancellation removes diagnostics action');
   for(const kind of ['open','print']){
    await page.evaluate(kind=>{panel.update({scope:'document-a',id:kind,kind,phase:'preparing'});panel.update({scope:'document-a',id:kind,kind,phase:'error',reason:'Public failure'});},kind);
    assert.equal(await copy.count(),0,language+' '+kind+' must not offer stale save diagnostics');
   }
  }
  console.log('PASS diagnostic copy action: keyboard activation/error guidance/cancellation in all 45 locales');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
