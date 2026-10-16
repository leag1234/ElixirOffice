// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Content/keyboard projection of real native-message options; this is not native OS layout acceptance.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.EO_PLAYWRIGHT||'playwright-core'),decisions=require('../../desktop/decisions.cjs');
const product=path.resolve(__dirname,'../..'),out=path.resolve(process.env.EO_QUIT_CAPTURE_OUT||path.join(product,'quit-captures'));
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true}),rows=[];
 try{
 for(const language of ['en','fr','de','ar']){
  const strings=JSON.parse(await fs.readFile(path.join(product,'desktop/assets/desktop-home/i18n',language+'.json'))),t=key=>strings[key];
  for(const platform of ['win32','darwin'])for(const busy of [false,true])for(const width of [360,900]){
   const name='Public annual report — مرحبا — '+('long name '.repeat(8))+'$&.docx',options=busy?decisions.busy(t,name):decisions.unsaved(t,true,name,platform);
   const page=await browser.newPage({viewport:{width,height:720}}),id=[language,platform,busy?'busy':'normal',width].join('-');
   await page.setContent('<!doctype html><meta charset=utf-8><style>body{margin:0;background:#eef1f0;font:15px/1.5 system-ui}dialog{box-sizing:border-box;width:min(580px,calc(100vw - 24px));border:1px solid #a8b1ac;border-radius:10px;padding:24px;color:#202923;box-shadow:0 10px 35px #0003}h1{font-size:18px;overflow-wrap:anywhere}p{white-space:pre-line;overflow-wrap:anywhere}footer{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}button{font:inherit;min-height:38px;padding:5px 14px;border:1px solid #b9c1bd;border-radius:5px;background:#fff;white-space:normal}button:focus-visible{outline:3px solid #245f48;outline-offset:2px}button[data-default]{background:#235f49;color:white}</style><dialog aria-labelledby=question aria-describedby=detail><h1 id=question></h1><p id=detail></p><footer></footer></dialog>');
   await page.evaluate(({options,language,platform})=>{
    document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';
    const dialog=document.querySelector('dialog'),footer=dialog.querySelector('footer');
    document.querySelector('#question').textContent=options.message;document.querySelector('#detail').textContent=options.detail||'';
    // AppKit lays out its first button at the trailing edge; keep IDs tied to supplied options.
    const indexes=options.buttons.map((_,i)=>i);if(platform==='darwin')indexes.reverse();
    for(const index of indexes){const button=document.createElement('button');button.textContent=options.buttons[index].replace(/&/g,'');button.dataset.response=index;
     if(index===options.defaultId)button.dataset.default='';button.addEventListener('click',()=>{window.choice=index;dialog.close();});footer.append(button);}
    dialog.addEventListener('cancel',()=>{window.choice=options.cancelId;});
    dialog.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();document.querySelector('button[data-default]').click();}});
    dialog.showModal();document.querySelector('button[data-default]').focus();
   },{options,language,platform});
   const label=options.buttons[options.defaultId].replace(/&/g,'');
   assert.equal(await page.locator('button[data-default]').textContent(),label);
   assert(await page.locator('button[data-default]').evaluate(el=>el===document.activeElement));
   assert.equal(await page.evaluate(()=>document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth),true,id+':no horizontal overflow');
   const boxes=await page.locator('button').evaluateAll(elements=>elements.map(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,text:el.textContent})));
   assert(boxes.every(b=>b.scrollWidth<=b.width),id+':button text fits');
   const aria=await page.locator('dialog').ariaSnapshot();assert(aria.includes(name));
   await page.screenshot({path:path.join(out,id+'.png')});
   await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.choice),options.cancelId);
   assert.equal(await page.locator('dialog').isVisible(),false);
   await page.evaluate(()=>{window.choice=null;document.querySelector('dialog').showModal();document.querySelector('button[data-default]').focus();});
   await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.choice),options.defaultId);
   rows.push({id,language,platform,busy,width,options,buttons:boxes,aria,escape:options.cancelId,enter:options.defaultId,evidence:'DOM projection of actual native options, not native OS rendering'});await page.close();
  }
 }
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(rows,null,2)+'\n');console.log('PASS localized quit option DOM projections',rows.length);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
