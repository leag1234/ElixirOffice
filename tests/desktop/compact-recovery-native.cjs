// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process'),{_electron}=require(process.env.EO_PLAYWRIGHT);
const root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK,mode=process.env.EO_RECOVERY_CASE,rows=[],errors=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
const pass=name=>{rows.push({name,pass:true});console.log('PASS '+name)};
(async()=>{
 let app,wm;
 try{
  assert(['startup','runtime','runtime-missing'].includes(mode));const wmRoot=process.env.EO_OPENBOX_ROOT,config=path.join(out,'openbox.xml');await fs.copyFile(path.join(wmRoot,'etc/xdg/openbox/rc.xml'),config);
  wm=spawn(path.join(wmRoot,'usr/bin/openbox'),['--config-file',config],{env:{...process.env,LD_LIBRARY_PATH:path.join(wmRoot,'usr/lib/x86_64-linux-gnu'),XDG_DATA_DIRS:path.join(wmRoot,'usr/share')+':/usr/share'},stdio:'ignore'});await wait(400);assert.equal(wm.exitCode,null);
  const launch=path.join(out,'launch-app'),pkg=JSON.parse(await fs.readFile(path.join(root,'desktop/package.json'),'utf8'));await fs.mkdir(launch);
  await fs.writeFile(path.join(launch,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,main:'entry.cjs'}));await fs.writeFile(path.join(launch,'entry.cjs'),'require('+JSON.stringify(path.join(root,'tests/desktop/compact-native-entry.cjs'))+');');
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[launch,'--ozone-platform=x11'],env:process.env,timeout:30000});assert(!app.process().spawnargs.includes('--no-sandbox'));
  const context=app.context(),observe=p=>p.on('pageerror',e=>errors.push(e.message));context.pages().forEach(observe);context.on('page',observe);
  let page;for(let n=0;n<300;n++){page=context.pages().find(p=>p.url().endsWith('/index.html'));if(page){await page.waitForFunction(()=>window.EODesktopReady);break;}await wait(100);}assert(page);
  let shell=context.pages().find(p=>p.url().endsWith('/tabs.html'));assert(shell);await shell.waitForFunction(()=>window.EOTabShellReady);
  const file=path.join(out,'public-frame-recovery.docx');await fs.copyFile(path.join(root,'desktop/assets/templates/new.docx'),file);
  await app.evaluate(({app},file)=>app.emit('open-file',{preventDefault(){}},file),file);await page.waitForFunction(()=>window.EOLocalSession?.format==='docx',null,{timeout:120000});
  if(mode.startsWith('runtime')){
   await page.evaluate(()=>{EOLocalSession.api.asc_AddText('Public live native frame recovery.');window.__frameSession=EOLocalSession;window.__frameApi=EOLocalSession.api;window.__frameId=EODocumentId;});
   await page.waitForFunction(()=>EOLocalSession.controller.isModified());
   const before=await page.evaluate(()=>eoDesktop.identity());await app.evaluate((_electron,missing)=>{const {registry}=global.__EOCompactFixture,owner=registry.windows()[0];owner.window.setTitleBarOverlay=missing?undefined:()=>{throw Error('Injected runtime overlay failure')};},mode==='runtime-missing');
   const retired=shell.waitForEvent('close',{timeout:15000});let retiredError;
   const action=shell.evaluate(()=>eoTabs.appearance('dark')).catch(error=>{retiredError=error;});await retired;await action;if(retiredError)assert(shell.isClosed());
   const after=await page.evaluate(()=>eoDesktop.identity());assert.equal(after.documentId,before.documentId);assert.equal(after.windowId,before.windowId);
   assert(await page.evaluate(()=>EOLocalSession===__frameSession&&EOLocalSession.api===__frameApi&&EODocumentId===__frameId&&EOLocalSession.controller.isModified()));
   pass('runtime fallback retains the same live dirty session, SDK and document identity');
   await page.evaluate(()=>EOLocalSession.controller.save());await page.waitForFunction(()=>!!window.EOLastSave&&!EOLocalSession.controller.isModified());
   const xml=execFileSync('python3',['-c','import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode())',file],{encoding:'utf8'});assert(xml.includes('Public live native frame recovery.'));
   pass('the retained document saves real edited DOCX bytes after native replacement');
   shell=context.pages().find(p=>p.url().endsWith('/tabs.html'));assert(shell);await shell.waitForFunction(()=>window.EOTabShellReady);
  }
  const state=await app.evaluate(()=>{
   const {registry,windows}=global.__EOCompactFixture,owner=registry.windows()[0],window=owner.window;
   return {count:windows.length,firstDestroyed:windows[0].window.isDestroyed(),firstCompact:windows[0].compact,lastCompact:windows.at(-1).compact,owners:registry.windows().length,frame:owner.frame.effectiveFrame,outer:window.getBounds(),content:window.getContentBounds(),nativeId:window.getNativeWindowHandle().readUInt32LE(0),documents:registry.documents(owner.id).map(d=>({alive:!d.contents.isDestroyed(),status:d.status,moving:!!d.state.moving})),sandbox:window.webContents.getLastWebPreferences().sandbox};
  });
  assert.equal(state.count,2);assert.equal(state.firstDestroyed,true);assert.equal(state.firstCompact,true);assert.equal(state.lastCompact,false);assert.equal(state.owners,1);assert.equal(state.frame,'native');assert.equal(state.sandbox,true);
  // X11 can report the client origin for both Electron rectangles. Prove the
  // actual window-manager decoration rather than assuming a rectangle delta.
  let frameProperties,decorated=false;
  for(let n=0;n<100;n++){
   frameProperties=execFileSync('xprop',['-id',String(state.nativeId),'_NET_FRAME_EXTENTS'],{env:process.env,encoding:'utf8'});
   const values=/=\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/.exec(frameProperties);
   if(values&&Number(values[3])>0){decorated=true;break;}await wait(20);
  }
  await fs.writeFile(path.join(out,'native-frame-state.json'),JSON.stringify({state,frameProperties},null,2));
  execFileSync('python3',['-c','from PIL import ImageGrab;import os,sys;ImageGrab.grab(xdisplay=os.environ["DISPLAY"]).save(sys.argv[1])',path.join(out,mode+'-native-recovery.png')],{env:process.env});
  assert(decorated,'the replacement has a real window-manager native title frame');assert(state.documents.every(d=>d.alive&&!d.moving));pass(mode+' failure creates exactly one native replacement and retires only the failed shell');
  assert.equal(await page.evaluate(()=>getComputedStyle(EOLocalSession.win.document.getElementById('app-title')).display==='none'),false);pass('the existing editor native header and window controls are restored');
  const prefs=JSON.parse(await fs.readFile(path.join(out,'profile/desktop-settings.json'),'utf8'));assert.equal(prefs.customTitleBar,false);assert.equal((await page.evaluate(()=>eoDesktop.windowOptions())).customTitleBarAvailable,false);pass('native fallback is durable and the failed capability is disabled for this process');
  execFileSync('python3',['-c','from PIL import ImageGrab;import os,sys;ImageGrab.grab(xdisplay=os.environ["DISPLAY"]).save(sys.argv[1])',path.join(out,mode+'-native-recovery.png')],{env:process.env});
  assert.deepEqual(errors,[]);pass('observed real source pages have zero uncaught errors');
  const closed=app.waitForEvent('close',{timeout:15000});await app.evaluate(()=>global.__EOCompactFixture.registry.windows()[0].window.close());await closed;app=null;pass('the recovered native window completes normal guarded close');
  await fs.writeFile(path.join(out,'recovery-results.json'),JSON.stringify({mode,scope:'actual sandboxed Linux/X11/Openbox source; compact failure injected, API mocked, public fixture only',rows,errors,state},null,2));
 }finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  if(wm&&wm.exitCode===null){wm.kill('SIGTERM');await Promise.race([new Promise(r=>wm.once('exit',r)),wait(2000)]);}
 }
})().catch(error=>{console.error(error.stack);process.exitCode=1});
