// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require(process.env.EO_PLAYWRIGHT||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});assert.equal(fs.readdirSync(out).length,0);
 const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.EO_CHROMIUM?{executablePath:process.env.EO_CHROMIUM}:{})}),rows=[],errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1100,height:180}});await context.route('**/*',route=>route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  async function setup({theme='light',direction='ltr',tabs=false,width=1100}={}){
   await page.setViewportSize({width,height:180});await page.emulateMedia({colorScheme:theme});
   await page.setContent(fs.readFileSync(path.join(root,'desktop/tabs.html'),'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,''));
   await page.addStyleTag({content:fs.readFileSync(path.join(root,'desktop/tabs.css'),'utf8')});
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'desktop/assets/desktop-home/home-theme.js'),'utf8')});
   await page.evaluate(({direction,tabs})=>{
    window.calls=[];window.snapshot={windowId:'owner',revision:1,activeId:'one',effectiveFrame:'compact',openInTabs:tabs,stripVisible:true,showHomeTab:false,
     documents:[{id:'one',name:'Public\u2069.docx',dirty:true,status:'ready'},{id:'two',name:'Public.xlsx',dirty:false,status:'ready'}],
     quick:Object.fromEntries(['save','undo','redo','search'].map(name=>[name,{visible:true,enabled:name!=='redo',label:name==='search'?'Search (Alt+Q)':name}]))};
    window.eoTabs={initial:async()=>({state:snapshot,direction,language:direction==='rtl'?'ar':'en',strings:{tabsLabel:'Documents',tabNew:'New document',tabClose:'Close {name}',tabCloseHint:'Delete',tabMoveHint:'Move',tabUntitled:'Untitled',tabModified:'Unsaved changes',close:'Close'}}),
     onState:callback=>{window.emit=callback},onLimit(){},appearance:async name=>calls.push(['appearance',name]),quickAction:async(...args)=>calls.push(['quick',...args]),activate:async()=>{},create:async()=>{},moveMenu:async()=>{}};
   },{direction,tabs});
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'desktop/tabs.js'),'utf8')});await page.waitForFunction(()=>window.EOTabShellReady);
  }
  await setup();assert.equal(await page.locator('#tab-bar').evaluate(e=>e.getBoundingClientRect().height),36);
  assert.equal(await page.locator('#tabs').isVisible(),false);assert.equal(await page.locator('#single-name').innerText(),'Public.docx');assert.equal(await page.locator('#single-dirty').innerText(),'●');rows.push('compact single-window title is36px, isolated and has a separate modified dot');
  await page.getByRole('button',{name:'save',exact:true}).click();assert.deepEqual(await page.evaluate(()=>calls.filter(c=>c[0]==='quick')),[['quick','one','save']]);assert(await page.getByRole('button',{name:'redo',exact:true}).isDisabled());rows.push('real shell gestures send only the displayed expected document and honor disabled state');
  await page.getByRole('button',{name:'Search (Alt+Q)',exact:true}).focus();await page.keyboard.press('Alt+q');assert.deepEqual(await page.evaluate(()=>calls.at(-1)),['quick','one','search']);rows.push('Alt+Q works while native shell controls have focus');
  await page.evaluate(()=>emit({...snapshot,revision:0,activeId:'two'}));await page.getByRole('button',{name:'undo',exact:true}).click();assert.deepEqual(await page.evaluate(()=>calls.at(-1)),['quick','one','undo']);rows.push('stale snapshots cannot retarget quick controls');
  await page.screenshot({path:path.join(out,'compact-A-en-light.png')});
  await page.evaluate(()=>emit({...snapshot,revision:3,activeId:null,documents:[],quick:null,stripVisible:false}));
  assert.equal(await page.locator('#quick-access').isVisible(),false);assert.equal(await page.locator('#single-title .document-icon').isVisible(),false);assert.equal(await page.locator('#single-name').innerText(),'ElixirOffice');
  await page.screenshot({path:path.join(out,'compact-home-en-light.png')});rows.push('empty Home shows the application caption without stale controls or a document-type icon');
  await setup({tabs:true,theme:'dark'});assert.equal(await page.locator('#tabs [role=tab]').count(),2);assert.equal(await page.locator('#single-title').isVisible(),false);assert.equal(await page.locator('html').getAttribute('data-eo-theme'),'dark');await page.screenshot({path:path.join(out,'compact-B-en-dark.png')});rows.push('tab mode shares the same36px band and actual shared dark theme');
  await setup({tabs:true,direction:'rtl',theme:'dark',width:640});
  assert.equal(await page.locator('[data-quick=undo] svg').evaluate(e=>getComputedStyle(e).transform),'matrix(-1, 0, 0, 1, 0, 0)');
  const bounds=await page.locator('#tab-bar').boundingBox();assert.equal(bounds.height,36);assert(bounds.x>=0&&bounds.x+bounds.width<=640-144+1);
  await page.screenshot({path:path.join(out,'compact-B-ar-dark-640.png')});rows.push('RTL narrow band keeps native-control safe area and horizontal document tabs');
  await page.evaluate(()=>emit({...snapshot,revision:2,effectiveFrame:'native',openInTabs:true}));assert.equal(await page.locator('#tab-bar').evaluate(e=>e.getBoundingClientRect().height),44);assert.equal(await page.locator('#quick-access').isVisible(),false);assert.equal(await page.locator('#drag-space').isVisible(),false);rows.push('native fallback retains the original44px tab strip without compact controls');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({pass:rows.length,rows,errors,scope:'real Chromium DOM with mocked preload; native buttons represented by safe-area fallback, not OS qualification'},null,2)+'\n');console.log('PASS '+rows.length+' compact shell cases');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
