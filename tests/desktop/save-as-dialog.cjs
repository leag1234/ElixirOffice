// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {chromium}=require(process.env.EO_PLAYWRIGHT || '../../tools/node_modules/playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const work=path.resolve(process.env.EO_SAVE_AS_RESULTS||path.join(root,'results/save-as-dialog'));
(async()=>{
 await fs.mkdir(work,{recursive:true});
 const browser=await chromium.launch({headless:true});
 const results=[];
 try{
  for(const language of ['en','fr','de','ar'])for(const dark of [false,true])for(const platform of ['linux','win32','darwin']){
   const page=await browser.newPage({viewport:{width:1000,height:850},colorScheme:dark?'dark':'light'});
   const strings=JSON.parse(await fs.readFile(path.join(root,'desktop/assets/desktop-home/i18n',language+'.json'),'utf8'));
   await page.setContent('<!doctype html><html lang="'+language+'"><body><button id="trigger">Save As test</button></body></html>');
   await page.addScriptTag({path:path.join(root,'desktop/assets/desktop-home/format-dialog.js')});
   const config={language,dark,platform,title:strings.saveAs,label:strings.saveFormat,ok:strings.ok,cancel:strings.cancel,defaultFormat:'odt',
    formats:['docx','odt','rtf','txt','pdf'].map(value=>({value,name:strings['saveFormat'+value[0].toUpperCase()+value.slice(1)],description:strings['saveFormat'+value[0].toUpperCase()+value.slice(1)+'Desc']}))};
   await page.locator('#trigger').focus();
   await page.evaluate(options=>{window.dialogResult=undefined;window.EOFormatDialog.open(options).then(result=>window.dialogResult=result);},config);
   const dialog=page.getByRole('dialog',{name:strings.saveAs});await dialog.waitFor();
   assert.equal(await dialog.locator('input:checked').inputValue(),'odt');
   assert.equal(await page.locator(':focus').inputValue(),'odt');
   assert.equal(await dialog.getAttribute('dir'),language==='ar'?'rtl':'ltr');
   assert.equal(await dialog.locator('input').count(),5);
   assert.equal(await dialog.locator('bdi[dir=ltr]').count(),5,'File extensions must be isolated in RTL labels');
   assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Horizontal overflow');
   const screenshot=path.join(work,'format-dialog-'+language+'-'+(dark?'dark':'light')+'-'+platform+'.png');
   await dialog.screenshot({path:screenshot});
   await page.keyboard.press('ArrowDown');assert.equal(await dialog.locator('input:checked').inputValue(),'rtf');
   await page.keyboard.press('Tab');
   assert.equal(await page.locator(':focus').textContent(),platform==='darwin'?strings.cancel:strings.ok);
   await page.keyboard.press('Shift+Tab');assert.equal(await page.locator(':focus').inputValue(),'rtf');
   await page.keyboard.press('Shift+Tab');assert.equal(await page.locator(':focus').textContent(),platform==='darwin'?strings.ok:strings.cancel);
   await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').inputValue(),'rtf');
   await page.keyboard.press('Escape');await page.waitForFunction(()=>window.dialogResult===null);
   assert.equal(await page.locator(':focus').getAttribute('id'),'trigger');
   await page.evaluate(options=>{window.dialogResult=undefined;window.EOFormatDialog.open(options).then(result=>window.dialogResult=result);},config);
   await page.keyboard.press('Enter');await page.waitForFunction(()=>window.dialogResult==='odt');
   await page.setViewportSize({width:390,height:700});
   await page.evaluate(options=>{window.dialogResult=undefined;window.EOFormatDialog.open(options).then(result=>window.dialogResult=result);},config);
   assert.equal(await page.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().width<=window.innerWidth-30),true,'Narrow dialog overflow');
   if(platform==='linux')await page.screenshot({path:path.join(work,'format-dialog-'+language+'-'+(dark?'dark':'light')+'-narrow.png')});
   await page.getByRole('button',{name:strings.cancel,exact:true}).click();
   await page.waitForFunction(()=>window.dialogResult===null);
   results.push({language,dark,platform,screenshot,checks:['default','names','direction','arrows','tab-containment','enter','escape','focus-return','narrow']});
   await page.close();
  }
 }finally{await browser.close();await fs.writeFile(path.join(work,'format-dialog-component-results.json'),JSON.stringify(results,null,2)+'\n');}
 console.log(JSON.stringify({passed:results.length,kind:'actual shared component in headless Chromium; platform order emulation, not native OS/product acceptance'}));
})().catch(error=>{console.error(error);process.exitCode=1});
