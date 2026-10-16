// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.EO_PLAYWRIGHT||'../../tools/node_modules/playwright-core');
const web=process.env.EO_WEB_APPS,root=path.resolve(__dirname,'../..'),out=process.env.EO_SAVE_AS_RESULTS;
assert(web&&path.isAbsolute(web)&&out,'Explicit owned EO_WEB_APPS and EO_SAVE_AS_RESULTS required');
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];
 try{
  for(const language of ['en','fr','de','ar'])for(const dark of [false,true]){
   const page=await browser.newPage({viewport:{width:1100,height:900},colorScheme:dark?'dark':'light'});
   const catalog=JSON.parse(await fs.readFile(path.join(web,'apps/documenteditor/main/locale',language+'.json'),'utf8'));
   const strings=JSON.parse(await fs.readFile(path.join(root,'desktop/assets/desktop-home/i18n',language+'.json'),'utf8'));
   const key=suffix=>catalog['DE.Views.ElixirBackstage.'+suffix];
   const options={title:key('txtSaveAs'),label:key('txtSaveFormat'),language,dark,ok:strings.ok,cancel:strings.cancel,platform:'linux',defaultFormat:'odt',
    formats:['docx','odt','rtf','txt','pdf'].map(value=>{const suffix=value[0].toUpperCase()+value.slice(1);return{value,name:key('txtFmt'+suffix),description:key('txtFmt'+suffix+'Desc')};}),
    fileName:{label:key('txtSaveName'),value:'Public copy',error:key('txtSaveNameInvalid')}};
   await page.setContent('<!doctype html><html lang="'+language+'"><head><style>legend{color:#ddd;border-bottom:1px solid #ddd}</style></head><body><button id="trigger">Open</button></body></html>');
   await page.evaluate(()=>document.addEventListener('keydown',event=>{if(event.key==='Escape')event.preventDefault();}));
   await page.addScriptTag({path:path.join(web,'apps/common/main/lib/elixir-local/FileNames.js')});
   await page.addScriptTag({path:path.join(web,'apps/common/main/lib/elixir-local/FormatDialog.js')});
   async function open(){
    await page.locator('#trigger').focus();
    await page.evaluate(options=>{
     options.fileName.validate=(name,format)=>!!Common.ElixirLocalFileNames.resolve(name,format);
     window.choice=undefined;EOFormatDialog.chooseFile(options).then(value=>window.choice=value);
    },options);
    await page.getByRole('dialog',{name:options.title}).waitFor();
   }
   await open();const dialog=page.getByRole('dialog'),input=dialog.getByRole('textbox',{name:options.fileName.label});
   assert.deepEqual(await dialog.locator('legend').evaluate(element=>({color:getComputedStyle(element).color,border:getComputedStyle(element).borderBottomWidth})),{color:await dialog.evaluate(element=>getComputedStyle(element).color),border:'0px'});
   assert.equal(await dialog.locator('input:checked').inputValue(),'odt');assert.equal(await page.locator(':focus').inputValue(),'odt');
   await page.keyboard.press('Shift+Tab');assert.equal(await page.locator(':focus').getAttribute('type'),'text');
   await page.keyboard.press('Shift+Tab');assert.equal(await page.locator(':focus').textContent(),strings.cancel);
   await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('type'),'text');
   await input.fill('CON');await page.keyboard.press('Enter');
   assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal(await dialog.getByRole('alert').textContent(),options.fileName.error);
   assert.equal(await page.evaluate(()=>window.choice),undefined);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>window.choice===null);
   assert.equal(await page.locator(':focus').getAttribute('id'),'trigger');
   await open();await input.fill('Cafe\u0301.docx');await dialog.locator('input[value=pdf]').check();
   await page.screenshot({path:path.join(out,'browser-dialog-'+language+'-'+(dark?'dark':'light')+'.png')});
   await dialog.getByRole('button',{name:strings.ok,exact:true}).click();await page.waitForFunction(()=>window.choice);
   assert.deepEqual(await page.evaluate(()=>({format:choice.format,name:Common.ElixirLocalFileNames.resolve(choice.name,choice.format)})),{format:'pdf',name:'Café.pdf'});
   await page.setViewportSize({width:390,height:700});await open();
   assert.equal(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth),true);
   await page.screenshot({path:path.join(out,'browser-dialog-'+language+'-'+(dark?'dark':'light')+'-narrow.png')});
   await dialog.getByRole('button',{name:strings.cancel,exact:true}).click();await page.waitForFunction(()=>window.choice===null);
   results.push({language,dark,checks:['source-default','name-label','invalid-device','no-premature-result','NFC','chosen-extension','tab-trap','escape','focus-return','narrow']});await page.close();
  }
 }finally{await browser.close();await fs.writeFile(path.join(out,'name-dialog-results.json'),JSON.stringify(results,null,2)+'\n');}
 console.log(JSON.stringify({passed:results.length,kind:'Actual shared browser dialog component; full editor integration not claimed'}));
})().catch(error=>{console.error(error);process.exitCode=1});
