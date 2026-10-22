// SPDX-License-Identifier: AGPL-3.0-only
// Actual sandboxed source app on the runner's own authenticated Linux display.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.EO_PLAYWRIGHT);
const root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK,origin='eoapp://desktop.elixiroffice.invalid',rows=[],errors=[];
const wait=async(fn,label)=>{for(let i=0;i<1200;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+label)};
const pass=name=>{rows.push({name,pass:true});console.log('PASS '+name)};
(async()=>{
 let app;
 try{
  await fs.copyFile(__filename,path.join(out,'executed-navigation-driver.cjs'));
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(root,'desktop/main.cjs'),'--ozone-platform=x11'],env:process.env,timeout:30000});
  assert(!app.process().spawnargs.includes('--no-sandbox'));
  const context=app.context(),observe=page=>page.on('pageerror',e=>errors.push(e.message));context.pages().forEach(observe);context.on('page',observe);
  const docs=()=>context.pages().filter(p=>p.url()===origin+'/index.html'),shells=()=>context.pages().filter(p=>p.url()===origin+'/tabs.html');
  const a=await wait(()=>docs()[0],'startup');await a.waitForFunction(()=>window.EODesktopReady);
  const firstShell=await wait(()=>shells()[0],'startup shell');await firstShell.waitForFunction(()=>window.EOTabShellReady);
  assert.equal(await firstShell.locator('#tab-bar').isVisible(),false);
  assert.equal(await a.locator('#home').isVisible(),true);
  const geometry=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html'));return {height:w.getContentSize()[1],bounds:w.contentView.children.at(-1).getBounds()};});
  assert.equal(geometry.bounds.y,0);assert.equal(geometry.bounds.height,geometry.height);pass('A startup fills client area without a document strip');
  const requested={x:33,y:44,width:1180,height:820};
  await app.evaluate(({BrowserWindow},bounds)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).setBounds(bounds),requested);
  const settingsFile=path.join(process.env.EO_DESKTOP_PROFILE,'desktop-settings.json');
  await wait(async()=>{try{return JSON.stringify(JSON.parse(await fs.readFile(settingsFile,'utf8')).windowState?.bounds)===JSON.stringify(requested)}catch{return false}},'persist moved/resized normal window');
  pass('actual normal move/resize persists before the next document');
  await a.locator('[data-new=docx]').click();await a.waitForFunction(()=>window.EOLocalSession?.format==='docx',null,{timeout:120000});
  assert.equal(docs().length,1);const original=await a.evaluate(()=>eoDesktop.identity());pass('first blank reuses empty startup window');
  // Call the actual main IPC; native keyboard delivery is separate qualification.
  await a.evaluate(()=>eoDesktop.create('xlsx'));await wait(()=>docs().length===2,'A second document');
  const b=docs().find(p=>p!==a);await b.waitForFunction(()=>window.EOLocalSession?.format==='xlsx',null,{timeout:120000});
  assert.notEqual((await b.evaluate(()=>eoDesktop.identity())).windowId,original.windowId);assert.equal(shells().length,2);
  const bounds=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith('/tabs.html')).map(w=>w.getBounds()));
  assert(bounds.some(r=>r.x===61&&r.y===72&&r.width===1180&&r.height===820));pass('additional A window restores size with a bounded cascade');
  assert.equal(await a.evaluate(()=>EOLocalSession.format),'docx');pass('A creates another window without disposing the original editor');
  await b.evaluate(()=>eoDesktop.windowSettings({openInTabs:true,showHomeTab:false}));
  const shellB=await wait(async()=>{for(const shell of shells()){const state=await shell.evaluate(async()=>(await eoTabs.initial()).state);if(state.windowId===(await b.evaluate(()=>eoDesktop.identity())).windowId)return shell;}},'B owner');
  await b.evaluate(()=>eoDesktop.create('pptx'));await wait(()=>docs().length===3,'B second tab');
  const c=docs().find(p=>p!==a&&p!==b);await c.waitForFunction(()=>window.EOLocalSession?.format==='pptx',null,{timeout:120000});
  assert.equal((await c.evaluate(()=>eoDesktop.identity())).windowId,(await b.evaluate(()=>eoDesktop.identity())).windowId);
  assert.equal(shells().length,2);assert.equal(await shellB.locator('#tab-bar').isVisible(),true);pass('B opens a new document as a tab without moving existing windows');
  await shellB.getByRole('button',{name:'New document',exact:true}).click();await wait(()=>docs().length===4,'current-family plus');
  const d=docs().find(p=>p!==a&&p!==b&&p!==c);await d.waitForFunction(()=>window.EOLocalSession?.format==='pptx',null,{timeout:120000});
  pass('B plus opens a ready current-family blank presentation');
  await d.evaluate(()=>eoDesktop.windowSettings({openInTabs:true,showHomeTab:true}));
  await shellB.locator('#home-tab').waitFor({state:'visible'});await shellB.locator('#home-tab').click();
  await wait(()=>d.evaluate(()=>document.querySelector('iframe')?.contentWindow?.document.querySelector('#panel-elx-home')?.getClientRects().length>0),'C shared Backstage Home');
  assert.equal(docs().length,4);pass('C Home opens Backstage without allocating an editor or losing its handle');
  await d.screenshot({path:path.join(out,'C-home.png')});
  await d.evaluate(()=>eoDesktop.create('docx'));await wait(()=>docs().length===5,'real Word modification');
  const edited=docs().find(p=>![a,b,c,d].includes(p));await edited.waitForFunction(()=>window.EOLocalSession?.format==='docx',null,{timeout:120000});
  await edited.evaluate(()=>{const api=EOLocalSession.api;api.WordControl.m_oLogicDocument.MoveCursorToStartPos();api.asc_enterText(Array.from('PUBLIC UI POLISH CHECK',c=>c.codePointAt(0)));});
  await edited.waitForFunction(()=>EOLocalSession.controller.isModified());
  const editIdentity=await edited.evaluate(()=>eoDesktop.identity()),tab=shellB.locator('.document-label[data-document="'+editIdentity.documentId+'"]');
  await wait(async()=>String(await tab.getAttribute('aria-label')).includes('Unsaved changes'),'real modified event reaches accessible tab state');
  assert.equal(await tab.locator('use').getAttribute('href'),'/example/local-assets/desktop-home/icons.svg#i-word');
  assert.equal(await tab.locator('.document-dirty').textContent(),'●');assert(!(await tab.locator('.document-name').textContent()).includes('*'));
  assert(await edited.locator('.eo-operation:not(.eo-operation-backstage)').isHidden());
  await shellB.locator('#tab-bar').screenshot({path:path.join(out,'B-types-modified-light.png')});
  // Playwright defaults to a light media override; clear it to observe Electron's theme.
  await shellB.emulateMedia({colorScheme:null});
  const nativeThemeState=await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='dark';return {source:nativeTheme.themeSource,dark:nativeTheme.shouldUseDarkColors};});
  assert.equal(nativeThemeState.dark,true);
  await wait(async()=>(await tab.locator('svg').evaluate(n=>getComputedStyle(n).color))==='rgb(131, 180, 255)','dark tab icon contrast');
  assert.equal(await shellB.evaluate(()=>matchMedia('(prefers-color-scheme:dark)').matches),true);
  await fs.writeFile(path.join(out,'theme-evidence.json'),JSON.stringify({nativeThemeState,mediaDark:true,wordIconColor:await tab.locator('svg').evaluate(n=>getComputedStyle(n).color)},null,2));
  await shellB.locator('#tab-bar').screenshot({path:path.join(out,'B-types-modified-dark.png')});
  pass('real SDK edit reaches Fluent type icon and localized modified dot; no opened toast');
  // Cancel/Save/native dialogs stay covered by unit fault injections and later native acceptance.
  assert.equal(await firstShell.evaluate(id=>eoTabs.close(id),original.documentId),true);await wait(()=>a.isClosed(),'last A close');
  const home=await wait(async()=>{for(const p of docs())if((await p.evaluate(()=>eoDesktop.identity())).windowId===original.windowId)return p;},'retained Home');
  await home.waitForFunction(()=>window.EODesktopReady);assert.equal(await home.locator('#home').isVisible(),true);
  assert.equal(await firstShell.locator('#tab-bar').isVisible(),false);pass('last File Close retains full-window Home');
  await home.screenshot({path:path.join(out,'A-home.png')});
  const savedState=JSON.parse(await fs.readFile(settingsFile,'utf8')).windowState;
  await app.evaluate(({app})=>app.exit(0)).catch(error=>{if(!/closed|Target/.test(error.message))throw error;});await app.close();app=null;
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(root,'desktop/main.cjs'),'--ozone-platform=x11'],env:process.env,timeout:30000});
  app.context().pages().forEach(observe);app.context().on('page',observe);
  const reopened=await wait(()=>app.context().pages().find(p=>p.url()===origin+'/index.html'),'fresh process Home');await reopened.waitForFunction(()=>window.EODesktopReady);
  const restored=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/tabs.html')).getBounds());
  assert.deepEqual(restored,savedState.bounds);pass('fresh source process restores persisted normal bounds');
  assert.deepEqual(errors,[]);pass('all observed document and shell pages have no uncaught errors');
  await fs.writeFile(path.join(out,'navigation-results.json'),JSON.stringify({scope:'actual Linux X11 source app; native key/dialog/window-manager, maximized restoration, normal app shutdown and package acceptance not claimed',rows,errors},null,2));
 }finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(error=>{if(!/closed|Target/.test(error.message))throw error;});await app.close();}}
})().catch(e=>{console.error(e);process.exitCode=1});
