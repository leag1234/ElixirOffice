// SPDX-License-Identifier: AGPL-3.0-only
// Own synthetic Home UI on the runner's private authenticated Linux display.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{_electron}=require(process.env.EO_PLAYWRIGHT);
const root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK,rows=[],errors=[];
const pass=name=>{rows.push({name,pass:true});console.log('PASS '+name)};
const wait=async fn=>{for(let i=0;i<1200;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw Error('Home source condition timed out')};
(async()=>{
 let app;
 try{
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(root,'desktop/main.cjs'),'--ozone-platform=x11'],env:process.env,timeout:30000});
  assert(!app.process().spawnargs.includes('--no-sandbox'));
  const context=app.context(),observe=page=>page.on('pageerror',e=>errors.push(e.message));context.pages().forEach(observe);context.on('page',observe);
  const docs=()=>context.pages().filter(p=>p.url().endsWith('/index.html'));
  let page=await wait(()=>docs()[0]);await page.waitForFunction(()=>window.EODesktopReady);
  const rail=page.locator('#home .rail');
  assert.deepEqual(await rail.locator('button').allTextContents(),['Home','New','Open','Options','Help','About']);
  assert.equal(await page.locator('#home .topbar').count(),0);
  assert.equal(await page.locator('#home .tile-blank').count(),3);assert.equal(await page.locator('#home .tile-template').count(),4);
  assert.equal(await page.locator('#home .desktop-footer').innerText(),'Documents stay on this computer');
  pass('empty start has Office application rail, three blanks, four templates and privacy, without another brand row');
  for(const image of await page.locator('#home img').all())assert(await image.evaluate(img=>img.complete&&img.naturalWidth>0));
  pass('all real localized template thumbnail resources load');
  await rail.locator('[data-view=home]').focus();
  for(const label of ['New','Open','Options','Help','About']){
   await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),label);
  }
  pass('normal Tab navigation reaches all six Home application commands in order');
  await rail.locator('[data-action=settings]').click();await page.getByRole('dialog',{name:'Options',exact:true}).waitFor();
  await page.getByRole('dialog',{name:'Options',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.locator('dialog[open]').count(),0);assert(await page.locator('#home').isVisible());
  pass('empty-window Options opens and Cancel retains the Home page');
  for(const view of ['new','open','home']){
   await page.locator('#home [data-view='+view+']').click();
   assert.equal(await page.locator('#home .tile-blank').count(),view==='open'?0:3);
   assert.equal(await page.locator('#home .rail-actions button').count(),3);
  }
  pass('Home/New/Open navigation retains application actions and the shared content renderer');
  const overflow=await page.locator('#home').evaluate(root=>({x:root.scrollWidth>root.clientWidth+1,rail:root.querySelector('.rail').getBoundingClientRect().width}));
  assert.equal(overflow.x,false);assert.equal(overflow.rail,200);
  await page.screenshot({path:path.join(out,'home-empty-en-light.png')});
  // Inject only the actual main OS-open event for a copy of a public blank;
  // this is not a claim about native file-dialog/OS event delivery.
  const file=path.join(out,'public-recent.docx');await fs.copyFile(path.join(root,'desktop/assets/templates/new.docx'),file);
  await app.evaluate(({app},file)=>app.emit('open-file',{preventDefault(){}},file),file);
  await page.waitForFunction(()=>window.EOLocalSession?.format==='docx',null,{timeout:120000});
  const identity=await page.evaluate(()=>eoDesktop.identity());
  const shell=context.pages().find(p=>p.url().endsWith('/tabs.html'));assert(shell);
  assert.equal(await shell.evaluate(id=>eoTabs.close(id),identity.documentId),true);await wait(()=>page.isClosed());
  page=await wait(()=>docs().find(p=>p!==page));await page.waitForFunction(()=>window.EODesktopReady);
  assert(await page.locator('#home').isVisible());
  const row=page.locator('#home .file-link');assert.equal(await row.count(),1);
  assert.equal(await row.locator('.file-name').innerText(),'public-recent.docx');
  assert.equal(await row.locator('.file-where').innerText(),out);
  assert.equal(await row.locator('svg use').getAttribute('href'),'/example/local-assets/desktop-home/icons.svg#i-word');
  assert.notEqual((await page.locator('#home .c-date').innerText()).trim(),'—');
  assert.equal(await page.locator('#home .rail-actions button').count(),3);
  await page.screenshot({path:path.join(out,'home-recent-en-light.png')});pass('last File Close returns shared full Home with recent type/name/folder/date and application rail');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).setContentSize(640,800));
  await wait(()=>page.evaluate(()=>innerWidth===640));
  assert.equal(await page.locator('#home').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  for(const button of await page.locator('#home .rail-actions button').all()){
   assert(await button.isVisible());assert(await button.evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
  }
  await page.screenshot({path:path.join(out,'home-narrow-ltr.png')});
  await page.evaluate(()=>document.documentElement.dir='rtl');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const railBox=await page.locator('#home .rail').boundingBox(),layoutBox=await page.locator('#home .layout').boundingBox();
  await fs.writeFile(path.join(out,'rtl-geometry.json'),JSON.stringify({railBox,layoutBox,viewport:await page.evaluate(()=>({innerWidth,clientWidth:document.documentElement.clientWidth,direction:getComputedStyle(document.querySelector('#home .layout')).direction}))},null,2));
  // Compare the actual layout edges: a vertical scrollbar can reserve pixels
  // inside the nominal640px viewport.
  assert(Math.abs(railBox.x+railBox.width-layoutBox.x-layoutBox.width)<1);
  assert.equal(await page.locator('#home').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.screenshot({path:path.join(out,'home-narrow-rtl-layout.png')});
  pass('narrow LTR and RTL layout fixtures retain visible application actions without horizontal overflow');
  await page.evaluate(()=>document.documentElement.dir='ltr');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).setContentSize(1360,960));
  await wait(()=>page.evaluate(()=>innerWidth===1360));
  const light=await page.locator('#home .rail').evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.emulateMedia({colorScheme:null});
  assert.equal(await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='dark';return nativeTheme.shouldUseDarkColors}),true);
  await page.waitForFunction(light=>matchMedia('(prefers-color-scheme: dark)').matches&&getComputedStyle(document.querySelector('#home .rail')).backgroundColor!==light,light);
  // The shared rail animates color for100ms. Measure the settled theme,
  // retaining the same4.5contrast requirement.
  await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
  const contrast=await page.locator('#home .rail-actions button').first().evaluate(el=>{
   const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
   const luminance=rgb=>rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
   const a=luminance(rgb(getComputedStyle(el).color)),b=luminance(rgb(getComputedStyle(el.closest('.rail')).backgroundColor));
   return {foreground:getComputedStyle(el).color,background:getComputedStyle(el.closest('.rail')).backgroundColor,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
  });
  await fs.writeFile(path.join(out,'dark-theme-evidence.json'),JSON.stringify(contrast,null,2));
  assert(contrast.ratio>=4.5,'dark application command contrast: '+JSON.stringify(contrast));
  await page.screenshot({path:path.join(out,'home-recent-en-dark.png')});
  pass('actual nativeTheme dark reaches Home with readable application command contrast');
  assert.deepEqual(errors,[]);pass('all observed source shell/editor pages have no uncaught errors');
  await fs.writeFile(path.join(out,'home-results.json'),JSON.stringify({scope:'actual sandboxed Linux source UI, native dialogs/WM/platforms/packages not qualified',rows,errors},null,2));
 }finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}}
})().catch(error=>{console.error(error);process.exitCode=1});
