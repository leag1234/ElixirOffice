// SPDX-License-Identifier: AGPL-3.0-only
// Rebuild checked-in PNGs with the existing Playwright Chromium tooling.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
async function render(){
 const {chromium}=require(process.env.EO_PLAYWRIGHT||'../../node_modules/playwright-core');
 const browser=await chromium.launch({headless:true});
 try{
  for(const [name,width,height] of [['mac-icon',1024,1024],['dmg-background',640,420]]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   await page.route('**/*',route=>route.abort());
   await page.setContent('<style>html,body{margin:0;background:transparent}</style>'+await fs.readFile(path.join(__dirname,name+'.svg'),'utf8'));
   await page.evaluate(()=>document.fonts.ready);
   await page.screenshot({path:path.join(__dirname,name+'.png'),omitBackground:true,animations:'disabled'});
   await page.close();
  }
  console.log('Rendered Mac icon1024 and language-neutral DMG640x420 with sandboxed Chromium '+browser.version());
 }finally{await browser.close()}
}
if(require.main===module)render().catch(e=>{console.error(e);process.exitCode=1});
module.exports={render};
