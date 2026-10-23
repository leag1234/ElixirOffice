// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const {_electron}=require(process.env.EO_PLAYWRIGHT);
const root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK,language=process.env.EO_COMPACT_LOCALE||'en',theme=process.env.EO_COMPACT_THEME||'light',rows=[],errors=[];
const pass=name=>{rows.push({name,pass:true});console.log('PASS '+name)};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let app,wm;const launch=path.join(out,'launch-app'),wmRoot=process.env.EO_OPENBOX_ROOT;
 assert(wmRoot,'EO_OPENBOX_ROOT is required for actual WM qualification');
 const wmEnv={...process.env,LD_LIBRARY_PATH:path.join(wmRoot,'usr/lib/x86_64-linux-gnu'),XDG_DATA_DIRS:path.join(wmRoot,'usr/share')+':/usr/share'};
 const xenv={...process.env,LD_LIBRARY_PATH:process.env.EO_XDO_LIB},xdo=(...args)=>execFileSync(process.env.EO_XDOTOOL,args.map(String),{env:xenv,encoding:'utf8'}).trim();
 const screen=async name=>{execFileSync('python3',['-c','from PIL import ImageGrab;import os,sys;ImageGrab.grab(xdisplay=os.environ["DISPLAY"]).save(sys.argv[1])',path.join(out,name)],{env:process.env});};
 try{
  const config=path.join(out,'openbox.xml');await fs.copyFile(path.join(wmRoot,'etc/xdg/openbox/rc.xml'),config);
  wm=spawn(path.join(wmRoot,'usr/bin/openbox'),['--config-file',config],{env:wmEnv,stdio:['ignore','ignore','ignore']});
  await wait(500);assert.equal(wm.exitCode,null);
  const wmProperty=execFileSync('xprop',['-root','_NET_SUPPORTING_WM_CHECK'],{env:process.env,encoding:'utf8'});assert.match(wmProperty,/window id # 0x[1-9a-f]/i);pass('private authenticated Xvfb has an actual EWMH window manager');
  const pkg=JSON.parse(await fs.readFile(path.join(root,'desktop/package.json'),'utf8'));await fs.mkdir(launch);
  await fs.writeFile(path.join(launch,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,main:'entry.cjs'}));
  await fs.writeFile(path.join(launch,'entry.cjs'),'require('+JSON.stringify(path.join(root,'tests/desktop/compact-native-entry.cjs'))+');');
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[launch,'--ozone-platform=x11'],env:process.env,timeout:30000});
  const context=app.context(),observe=p=>p.on('pageerror',e=>errors.push(e.message));context.pages().forEach(observe);context.on('page',observe);
  let page;
  for(let n=0;n<300;n++){page=context.pages().find(p=>p.url().endsWith('/index.html'));if(page){await page.waitForFunction(()=>window.EODesktopReady);break;}await wait(100);}
  assert(page);const shell=context.pages().find(p=>p.url().endsWith('/tabs.html'));assert(shell);await shell.waitForFunction(()=>window.EOTabShellReady);
  // The fixture owns this profile. Exercise the shared editor UI preference,
  // which intentionally takes precedence over an operating-system color hint.
  await page.evaluate(theme=>{localStorage.setItem('ui-theme-id',theme==='dark'?'theme-dark':'theme-white');window.dispatchEvent(new StorageEvent('storage',{key:'ui-theme-id'}));},theme);
  await shell.waitForFunction(theme=>document.documentElement.getAttribute('data-eo-theme')===theme,theme);
  const identity={language:await page.locator('html').getAttribute('lang'),shellLanguage:await shell.locator('html').getAttribute('lang'),theme:await shell.locator('html').getAttribute('data-eo-theme')};
  assert.equal(identity.language,language);assert.equal(identity.shellLanguage,language);assert.equal(identity.theme,theme);await fs.writeFile(path.join(out,'locale-theme.json'),JSON.stringify({requested:{fixtureOSLanguage:language,fixtureUITheme:theme},actual:identity},null,2));
  const native=()=>app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return {bounds:w.getBounds(),content:w.getContentBounds(),maximized:w.isMaximized(),minimized:w.isMinimized(),id:w.getNativeWindowHandle().readUInt32LE(0),children:w.contentView.children.map(v=>v.getBounds())}});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({x:120,y:100,width:1100,height:800}));await wait(400);
  const home=await native();await fs.writeFile(path.join(out,'native-window-properties.txt'),execFileSync('xprop',['-id',String(home.id)],{env:process.env,encoding:'utf8'}));assert.equal(home.children[0].y,36);assert.equal(await shell.locator('#single-title .document-icon').isVisible(),false);assert.equal(await shell.locator('body').getAttribute('class'),'compact');await screen('home-native-'+language+'.png');
  await fs.writeFile(path.join(out,'overlay.json'),JSON.stringify({home,area:await shell.evaluate(()=>{const r=navigator.windowControlsOverlay?.getTitlebarAreaRect();return {available:!!navigator.windowControlsOverlay,visible:navigator.windowControlsOverlay?.visible,rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,band:document.querySelector('#tab-bar').getBoundingClientRect().toJSON()}})},null,2));
  pass('actual Linux window uses native overlay and36pixel empty-Home band');
  await app.evaluate(({BrowserWindow})=>{global.__compactEvents=[];const w=BrowserWindow.getAllWindows()[0];for(const name of ['move','moved','resize','resized'])w.on(name,()=>global.__compactEvents.push(name));});

  const drag=await shell.locator('#drag-space').boundingBox();assert(drag);xdo('windowactivate','--sync',home.id);
  xdo('mousemove','--sync',home.content.x+drag.x+drag.width/2,home.content.y+18);xdo('mousedown',1);await wait(100);for(let n=1;n<=10;n++){xdo('mousemove','--sync',home.content.x+drag.x+drag.width/2+n*6,home.content.y+18+n*4);await wait(30);}xdo('mouseup',1);await wait(250);
  const moved=await native();await fs.writeFile(path.join(out,'native-events.json'),JSON.stringify(await app.evaluate(()=>global.__compactEvents)));await fs.writeFile(path.join(out,'drag.json'),JSON.stringify({home,moved,drag,style:await shell.locator('#tab-bar').evaluate(e=>({region:getComputedStyle(e).getPropertyValue('app-region'),webkit:getComputedStyle(e).getPropertyValue('-webkit-app-region')}))},null,2));assert(Math.abs(moved.bounds.x-home.bounds.x)>=40);assert(Math.abs(moved.bounds.y-home.bounds.y)>=20);pass('real pointer drag moves the managed window through the compact drag region');
  async function nativeButton(offset){const value=await native();xdo('mousemove','--sync',value.content.x+value.content.width-offset,value.content.y+18);xdo('click',1);await wait(400);}
  await nativeButton(56);assert.equal((await native()).maximized,true);pass('real native maximize button works');
  await nativeButton(56);assert.equal((await native()).maximized,false);pass('real native restore button works');
  await nativeButton(94);assert.equal((await native()).minimized,true);xdo('windowmap',home.id);xdo('windowactivate','--sync',home.id);await wait(300);assert.equal((await native()).minimized,false);pass('real native minimize and window-manager restore work');
  const beforeResize=await native();xdo('mousemove','--sync',beforeResize.bounds.x+beforeResize.bounds.width-1,beforeResize.bounds.y+beforeResize.bounds.height-1);xdo('mousedown',1);
  for(let n=1;n<=10;n++){xdo('mousemove','--sync',beforeResize.bounds.x+beforeResize.bounds.width-1+n*5,beforeResize.bounds.y+beforeResize.bounds.height-1+n*4);await wait(30);}
  xdo('mouseup',1);await wait(400);const resized=await native();
  await fs.writeFile(path.join(out,'resize.json'),JSON.stringify({beforeResize,resized},null,2));
  assert(resized.bounds.width-beforeResize.bounds.width>=30);assert(resized.bounds.height-beforeResize.bounds.height>=20);
  assert.equal(resized.children[0].width,resized.content.width);assert.equal(resized.children[0].height,resized.content.height-36);pass('real pointer resize keeps document bounds exact below36pixel band');

  const file=path.join(out,'public-compact.docx');await fs.copyFile(path.join(root,'desktop/assets/templates/new.docx'),file);
  await app.evaluate(({app},file)=>app.emit('open-file',{preventDefault(){}},file),file);
  await page.waitForFunction(()=>window.EOLocalSession?.format==='docx',null,{timeout:120000});await fs.writeFile(path.join(out,'actual-editor-chrome.json'),JSON.stringify({theme:await page.evaluate(()=>{const w=EOLocalSession.win,s=w.getComputedStyle(w.document.body);return {toolbar:s.getPropertyValue('--background-toolbar'),text:s.getPropertyValue('--text-normal')}}),controls:await shell.locator('[data-quick]').evaluateAll(nodes=>nodes.map(n=>({action:n.dataset.quick,label:n.getAttribute('aria-label')})))},null,2));await shell.locator('[data-quick=save]').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>getComputedStyle(EOLocalSession.win.document.getElementById('app-title')).display),'none');
  await screen('word-native-'+language+'.png');pass('actual Word editor has one title band with original quick actions');
  await shell.locator('#command-search').click();
  try{await page.waitForFunction(()=>{const w=EOLocalSession.win;return w.document.activeElement===w.document.querySelector('.elx-search-input')})}
  catch(error){await screen('search-failure-native.png');await fs.writeFile(path.join(out,'search-failure.json'),JSON.stringify(await page.evaluate(()=>{const w=EOLocalSession.win,input=w.document.querySelector('.elx-search-input'),search=input?.parentNode;return {inputPresent:!!input,focused:w.document.activeElement===input,activeTag:w.document.activeElement?.tagName,activeClass:w.document.activeElement?.className,hidden:search?.hidden,searchDisplay:search?w.getComputedStyle(search).display:null,childHasFocus:w.document.hasFocus(),parentHasFocus:document.hasFocus(),failure:window.EOLocalFailure}}),null,2));throw error;}
  await screen('search-native-'+language+'.png');pass('real shell search focuses the existing command-search widget');
  await page.evaluate(()=>{const app=EOLocalSession.win.DE;app.getController('ElixirChrome').titleBar.closeSearch()});
  
  await page.evaluate(()=>EOLocalSession.api.asc_AddText('Public compact quick access case.'));
  await shell.locator('[data-quick=undo]:not([disabled])').waitFor();await shell.locator('[data-quick=undo]').click();
  await shell.locator('[data-quick=redo]:not([disabled])').waitFor();await shell.locator('[data-quick=redo]').click();
  await shell.locator('[data-quick=undo]:not([disabled])').waitFor();pass('actual shell Undo and Redo follow live Word readiness');
  await shell.locator('[data-quick=save]:not([disabled])').waitFor();await shell.locator('[data-quick=save]').click();
  await page.waitForFunction(()=>!!window.EOLastSave&&!EOLocalSession.controller.isModified());
  const content=execFileSync('python3',['-c','import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode())',file],{encoding:'utf8'});
  assert(content.includes('Public compact quick access case.'));pass('actual shell Save writes the edited public DOCX to its owned fixture');
  await page.evaluate(()=>eoDesktop.windowSettings({customTitleBar:false}));
  const beforeMove=await page.evaluate(()=>({id:EODocumentId,token:EOLocalSession.file.token}));
  await app.evaluate(async()=>{
   const {registry,host}=global.__EOCompactFixture,source=registry.windows().find(w=>registry.active(w.id)?.state.current),document=registry.active(source.id),target=host.createWindow();await target.ready;
   global.__EOCompactMove={source,target,document};host.moveDocument(document,target);
  });
  await page.waitForFunction(()=>!EOLocalSession.win.document.body.classList.contains('eo-compact-editor'));
  assert.equal(await page.evaluate(()=>getComputedStyle(EOLocalSession.win.document.getElementById('app-title')).display==='none'),false);
  await screen('native-fallback-'+language+'.png');

  assert.deepEqual(await page.evaluate(()=>({id:EODocumentId,token:EOLocalSession.file.token})),beforeMove);
  await app.evaluate(()=>{const {host}=global.__EOCompactFixture,{source,target,document}=global.__EOCompactMove;host.moveDocument(document,source);target.allowClose=true;target.window.destroy();});
  await page.waitForFunction(()=>EOLocalSession.win.document.body.classList.contains('eo-compact-editor'));
  pass('same live editor restores native header when moved to native owner and compacts again on return');
  if(process.env.EO_COMPACT_TABS==='1'){
   await page.evaluate(()=>eoDesktop.windowSettings({customTitleBar:true,openInTabs:true}));
   await app.evaluate(async()=>{const {host,registry}=global.__EOCompactFixture,source=registry.windows().find(w=>registry.active(w.id)?.state.current),document=registry.active(source.id),target=host.createWindow();await target.ready;host.moveDocument(document,target);source.window.hide();global.__EOCompactTabs={source,target,document};});
   let tabsPage;for(let n=0;n<100;n++){tabsPage=context.pages().find(p=>p.url().endsWith('/tabs.html')&&p!==shell);if(tabsPage){await tabsPage.waitForFunction(()=>window.EOTabShellReady);break;}await wait(50);}
   assert(tabsPage);await page.evaluate(()=>eoDesktop.create('xlsx'));
   let sheet;for(let n=0;n<1200;n++){for(const p of context.pages().filter(p=>p.url().endsWith('/index.html')&&p!==page)){if(await p.evaluate(()=>window.EOLocalSession?.format==='xlsx').catch(()=>false)){sheet=p;break;}}if(sheet)break;await wait(100);}
   assert(sheet,'Actual workbook opens in the tabbed owner');await tabsPage.locator('[role=tab]').nth(1).waitFor();assert.equal(await tabsPage.locator('[role=tab]').count(),2);
   await screen('tabs-B-'+language+'.png');pass('actual Word and Excel share one compact36pixel tab band with type icons');
   await tabsPage.locator('#new-tab').click();
   await tabsPage.locator('[role=tab]').nth(2).waitFor();assert.equal(await tabsPage.locator('[role=tab]').count(),3);
   const formats=await app.evaluate(()=>{const {registry}=global.__EOCompactFixture;return registry.windows().flatMap(w=>registry.documents(w.id)).map(d=>d.state.current?.format).filter(Boolean)});assert.equal(formats.filter(f=>f==='xlsx').length,2);
   let ready=false;for(let n=0;n<1200;n++){ready=await app.evaluate(()=>{const {registry}=global.__EOCompactFixture;const docs=registry.windows().flatMap(w=>registry.documents(w.id)).filter(d=>d.state.current);return docs.length===3&&docs.every(d=>d.status==='ready')});if(ready)break;await wait(100);}assert(ready,'All three actual editors finish opening before cleanup');
pass('compact plus creates another document of the current workbook family');
   await sheet.evaluate(()=>eoDesktop.windowSettings({showHomeTab:true}));await tabsPage.locator('#home-tab').waitFor({state:'visible'});await screen('tabs-C-'+language+'.png');pass('optional Home tab shares the same compact band');
   const documents=context.pages().filter(p=>p.url().endsWith('/index.html'));
   const states=await Promise.all(documents.map(p=>p.evaluate(()=>({format:window.EOLocalSession?.format,failure:!!window.EOLocalFailure,compact:!!window.EOLocalSession?.win.document.body.classList.contains('eo-compact-editor')}))));
   assert.equal(states.filter(s=>s.format==='xlsx'&&!s.failure&&s.compact).length,2);
   await fs.writeFile(path.join(out,'real-tab-editors.json'),JSON.stringify(states,null,2));
   async function closePage(p){let ipcError;const closed=p.waitForEvent('close',{timeout:15000}),command=p.evaluate(()=>eoDesktop.closeTab()).catch(error=>{ipcError=error});await closed;await command;if(ipcError)assert(p.isClosed(),ipcError.message);}
   for(const p of documents){if(await p.evaluate(()=>window.EOLocalSession?.format==='xlsx'))await closePage(p);}
   async function waitEditor(format){for(let n=0;n<1200;n++){for(const p of context.pages().filter(p=>p.url().endsWith('/index.html')&&p!==page)){if(await p.evaluate(format=>window.EOLocalSession?.format===format&&!window.EOLocalFailure,format).catch(()=>false))return p;}await wait(100);}throw Error('Actual '+format+' editor failed to open');}
   await page.evaluate(()=>eoDesktop.create('pptx'));const slides=await waitEditor('pptx');
   assert(await slides.evaluate(()=>EOLocalSession.win.document.body.classList.contains('eo-compact-editor')));
   await screen('presentation-'+language+'.png');pass('actual presentation editor retains the single compact title band');await closePage(slides);
   const pdf=path.join(out,'public-compact.pdf');await fs.writeFile(pdf,require('./public-print-fixture.cjs')(1));
   await app.evaluate(({app},file)=>app.emit('open-file',{preventDefault(){}},file),pdf);const viewer=await waitEditor('pdf');
   assert(await viewer.evaluate(()=>EOLocalSession.win.document.body.classList.contains('eo-compact-editor')));
   const pdfId=await viewer.evaluate(()=>window.EODocumentId);let pdfShell;
   for(const p of context.pages().filter(p=>p.url().endsWith('/tabs.html'))){const state=await p.evaluate(async()=> (await eoTabs.initial()).state);if(state.documents.some(d=>d.id===pdfId)){pdfShell=p;if(state.activeId!==pdfId)await p.locator('[data-document="'+pdfId+'"]').click();break;}}
   assert(pdfShell,'PDF actions must come from the PDF actual owner shell');
   await pdfShell.locator('#command-search:not([disabled])').waitFor();await pdfShell.locator('#command-search').click();await wait(200);
   await fs.writeFile(path.join(out,'pdf-find-diagnostic.json'),JSON.stringify(await viewer.evaluate(()=>{const w=EOLocalSession.win,v=w.PDFE.getController('Viewport'),h=v.header,b=h.btnSearch;return {pressed:b.pressed,enableToggle:b.enableToggle,componentTag:b.cmpEl?.[0]?.tagName,rootTag:b.$el?.[0]?.tagName,searchBar:v.isSearchBarVisible(),leftPanel:w.PDFE.getController('LeftMenu').isSearchPanelVisible(),compact:w.document.body.classList.contains('eo-compact-editor'),failure:window.EOLocalFailure};}),null,2));
   await viewer.waitForFunction(()=>EOLocalSession.win.PDFE.getController('Viewport').header.btnSearch.pressed===true);
   await screen('pdf-find-'+language+'.png');pass('actual PDF viewer keeps its original Find toggle in compact mode');await closePage(viewer);

   await app.evaluate(()=>{const {host,registry}=global.__EOCompactFixture,{source,target,document}=global.__EOCompactTabs;host.moveDocument(document,source);for(const item of registry.documents(target.id))host.removeDocument(item);target.allowClose=true;target.window.destroy();source.window.show();});
  }

  assert.deepEqual(errors,[]);pass('all observed real editor/shell pages have zero uncaught errors');
  const closed=app.waitForEvent('close',{timeout:15000});await nativeButton(18);await closed;app=null;pass('actual native close completes the clean saved document close protocol');
  await fs.writeFile(path.join(out,'compact-results.json'),JSON.stringify({scope:'actual sandboxed Linux source Electron under private Xvfb/Openbox; API mocked; MacWindows unverified',rows,errors},null,2));
 }finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  if(wm&&wm.exitCode===null){wm.kill('SIGTERM');await Promise.race([new Promise(r=>wm.once('exit',r)),wait(2000)]);}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
