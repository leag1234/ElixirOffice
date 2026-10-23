// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{_electron}=require(process.env.EO_PLAYWRIGHT);
const root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK,rows=[],errors=[];
const pass=name=>{rows.push({name,pass:true});console.log('PASS '+name)};
(async()=>{
 let app;
 const launch=path.join(out,'launch-app');
 const stop=async()=>{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});app=null;}};
 async function start(){
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[launch,'--ozone-platform=x11'],env:process.env,timeout:30000});
  assert(!app.process().spawnargs.includes('--no-sandbox'));
  const context=app.context(),observe=page=>page.on('pageerror',e=>errors.push(e.message));context.pages().forEach(observe);context.on('page',observe);
  for(let n=0;n<300;n++){
   const page=context.pages().find(p=>p.url().endsWith('/index.html'));
   if(page){await page.waitForFunction(()=>window.EODesktopReady);return page;}
   await new Promise(r=>setTimeout(r,100));
  }
  throw Error('Source desktop did not become ready');
 }
 try{
  const pkg=JSON.parse(await fs.readFile(path.join(root,'desktop/package.json'),'utf8'));
  await fs.mkdir(launch);await fs.writeFile(path.join(launch,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,main:'entry.cjs'}));
  await fs.writeFile(path.join(launch,'entry.cjs'),'require('+JSON.stringify(path.join(root,'tests/desktop/release-native-entry.cjs'))+');');
  let page=await start();
  await new Promise(resolve=>setTimeout(resolve,100));
  await fs.writeFile(path.join(out,'startup-metadata.json'),JSON.stringify({
   fixture:await app.evaluate(()=>global.__EOReleaseFixture),
   options:await page.evaluate(()=>eoDesktop.releaseOptions()),
   state:await page.evaluate(()=>eoDesktop.releaseState()),
   saved:JSON.parse(await fs.readFile(path.join(out,'profile/desktop-settings.json'),'utf8')),
   pageErrors:errors
  },null,2));
  assert.equal(await app.evaluate(({app})=>app.getVersion()),pkg.version,'The synthetic launcher must retain the running product version');
  const banner=page.locator('.desktop-release-notice');
  await banner.waitFor();assert((await banner.innerText()).includes('99.0.0-beta.1'));
  assert.equal(await app.evaluate(()=>global.__EOReleaseFixture.calls),1);pass('real source startup shows a mocked prerelease without document data/network');
  async function options(){
   await page.locator('#home [data-action=settings]').click();
   const box=page.getByRole('dialog',{name:'Options',exact:true});await box.waitFor();await box.locator('#release-checks-enabled').waitFor();return box;
  }
  let box=await options();
  assert(await box.getByRole('checkbox',{name:'Check for updates',exact:true}).isChecked());
  assert((await box.locator('#release-checks-privacy').innerText()).includes('github.com'));
  await box.getByRole('checkbox',{name:'Check for updates',exact:true}).uncheck();await box.getByRole('button',{name:'Cancel',exact:true}).click();
  box=await options();assert(await box.locator('#release-checks-enabled').isChecked());pass('Options defaults ON, discloses GitHub, and Cancel leaves the choice unchanged');
  await box.locator('#release-checks-enabled').uncheck();await box.getByRole('button',{name:'Save',exact:true}).click();
  await banner.waitFor({state:'detached'});
  let state=JSON.parse(await fs.readFile(path.join(out,'profile/desktop-settings.json'),'utf8'));assert.equal(state.releaseNotice.enabled,false);
  box=await options();assert.equal(await box.locator('#release-checks-enabled').isChecked(),false);
  await page.screenshot({path:path.join(out,'options-updates-off-en.png')});pass('Save OFF removes the banner and persists the real preference');
  await box.locator('#release-checks-enabled').check();await box.getByRole('button',{name:'Save',exact:true}).click();await banner.waitFor();
  assert.equal(await app.evaluate(()=>global.__EOReleaseFixture.calls),1);pass('reenabling shows cached metadata without another daily API attempt');
  await banner.getByRole('button',{name:'Download',exact:true}).click();
  const opened=await app.evaluate(()=>global.__EOReleaseFixture.opened);
  assert.deepEqual(opened,['https://github.com/leag1234/elixiroffice/releases/tag/v99.0.0-beta.1']);pass('real preload reaches the repository-only browser action (browser mocked)');
  await page.screenshot({path:path.join(out,'home-with-release-en.png')});
  const file=path.join(out,'public-update-document.docx');await fs.copyFile(path.join(root,'desktop/assets/templates/new.docx'),file);
  await app.evaluate(({app},file)=>app.emit('open-file',{preventDefault(){}},file),file);
  await page.waitForFunction(()=>window.EOLocalSession?.format==='docx',null,{timeout:120000});
  const geometry=await page.evaluate(()=>{
   const a=document.getElementById('workspace').getBoundingClientRect(),b=document.querySelector('.desktop-release-notice').getBoundingClientRect();
   return {workspaceBottom:a.bottom,noticeTop:b.top,noticeHeight:b.height};
  });
  assert(geometry.workspaceBottom<=geometry.noticeTop+1);await page.screenshot({path:path.join(out,'word-with-release-en.png')});
  pass('actual Word editor/ribbon/status area stays above the notification');
  await banner.getByRole('button',{name:'Skip this version',exact:true}).click();await banner.waitFor({state:'detached'});
  state=JSON.parse(await fs.readFile(path.join(out,'profile/desktop-settings.json'),'utf8'));assert.equal(state.releaseNotice.skipped,'99.0.0-beta.1');
  await stop();page=await start();assert.equal(await page.locator('.desktop-release-notice').count(),0);
  assert.equal(await app.evaluate(()=>global.__EOReleaseFixture.calls),0);pass('skip and daily attempt survive an actual app relaunch');
  await stop();
  // Seed the next independent reminder case in this runner-owned profile only.
  state=JSON.parse(await fs.readFile(path.join(out,'profile/desktop-settings.json'),'utf8'));state.releaseNotice.skipped=null;state.releaseNotice.remindUntil=0;
  await fs.writeFile(path.join(out,'profile/desktop-settings.json'),JSON.stringify(state));
  page=await start();await page.locator('.desktop-release-notice').waitFor();
  await page.getByRole('button',{name:'Remind me later',exact:true}).click();await page.locator('.desktop-release-notice').waitFor({state:'detached'});
  state=JSON.parse(await fs.readFile(path.join(out,'profile/desktop-settings.json'),'utf8'));assert(state.releaseNotice.remindUntil>Date.now());assert.equal(state.releaseNotice.remindVersion,'99.0.0-beta.1');
  pass('real remind action persists a version-bound24hour reminder');
  assert.deepEqual(errors,[]);pass('all observed real shell/editor pages have zero uncaught errors');
  await fs.writeFile(path.join(out,'release-results.json'),JSON.stringify({scope:'sandboxed Linux source main/preload/renderer; API and external browser mocked, no package/native browser/WM/platform qualification',rows,errors},null,2));
 }finally{
  if(app)await fs.writeFile(path.join(out,'fixture-at-exit.json'),JSON.stringify(await app.evaluate(({app,BrowserWindow})=>({fixture:global.__EOReleaseFixture,version:app.getVersion(),loading:BrowserWindow.getAllWindows().map(w=>w.webContents.isLoading())})),null,2)).catch(()=>{});
  await stop()
 }
})().catch(error=>{console.error(error);process.exitCode=1});
