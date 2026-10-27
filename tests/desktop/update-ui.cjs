// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{_electron}=require(process.env.EO_PLAYWRIGHT);
const root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK,rows=[],errors=[];
let app;
const pass=name=>{rows.push({name,pass:true});console.log('PASS '+name);};
async function stop(){if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});app=null;}}
async function start(number){
 app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(out,'launch-app'),'--ozone-platform=x11','--lang=en-US'],
  env:{...process.env,EO_UI_CASE:String(number)},timeout:30000});
 assert(!app.process().spawnargs.includes('--no-sandbox'));
 const context=app.context();context.pages().forEach(observe);context.on('page',observe);
 function observe(page){page.on('pageerror',error=>errors.push(error.message));}
 for(let n=0;n<300;n++){
  const page=context.pages().find(p=>p.url().endsWith('/index.html'));
  if(page){await page.waitForFunction(()=>window.EODesktopReady);return page;}
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error('Source UI did not initialize');
}
async function snapshot(){return app.evaluate(()=>global.__EOUpdateFixture.snapshot());}
async function finish(){await app.evaluate(()=>global.__EOUpdateFixture.finish());}
async function options(page){await page.locator('#home [data-action=settings]').click();const box=page.getByRole('dialog',{name:'Options',exact:true});await box.waitFor();return box;}
(async()=>{
 try{
  const pkg=JSON.parse(await fs.readFile(path.join(root,'desktop/package.json'),'utf8')),launcher=path.join(out,'launch-app');
  await fs.mkdir(launcher);await fs.writeFile(path.join(launcher,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,main:'entry.cjs'}));
  await fs.writeFile(path.join(launcher,'entry.cjs'),'require('+JSON.stringify(path.join(root,'tests/desktop/update-ui-entry.cjs'))+');');
  let page=await start(1),banner=page.locator('.desktop-release-notice');
  await banner.getByRole('button',{name:'Install update',exact:true}).waitFor({timeout:5000});
  let box=await options(page),automatic=box.getByRole('checkbox',{name:'Install updates automatically',exact:true});
  assert.equal(await automatic.isChecked(),false);await automatic.check();await box.getByRole('button',{name:'Cancel',exact:true}).click();
  box=await options(page);assert.equal(await box.locator('#release-install-automatically').isChecked(),false);await box.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal((await snapshot()).factory,0);pass('automatic defaults OFF and Options Cancel leaves no job/preference');
  await banner.getByRole('button',{name:'Install update',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-release-action=install]')?.disabled===true);
  assert.equal(await banner.getByRole('button',{name:'Install update',exact:true}).isDisabled(),true);
  await app.evaluate(()=>global.__EOUpdateFixture.progress({downloaded:4,total:10}));
  await page.getByRole('progressbar',{name:'Update download',exact:true}).waitFor();
  assert.equal(await page.getByRole('progressbar').getAttribute('value'),'40');
  await page.screenshot({path:path.join(out,'download-en.png')});pass('manual action shows bounded download progress without exiting');
  box=await options(page);await box.locator('#release-checks-enabled').uncheck();await box.getByRole('button',{name:'Save',exact:true}).click();await box.waitFor({state:'hidden'});
  await banner.waitFor({state:'detached'});assert.equal((await snapshot()).abort,1);assert.equal((await snapshot()).nativeLaunch,0);
  pass('Checks OFF aborts preparation, hides banner and never installs');
  box=await options(page);await box.locator('#release-checks-enabled').check();await box.getByRole('button',{name:'Save',exact:true}).click();await box.waitFor({state:'hidden'});
  await banner.getByRole('button',{name:'Install update',exact:true}).waitFor();
  await banner.getByRole('button',{name:'Install update',exact:true}).click();
  for(let n=0;n<50&&(await snapshot()).prepare<2;n++)await new Promise(r=>setTimeout(r,20));assert.equal((await snapshot()).prepare,2);await finish();
  await banner.locator('[data-update-phase=ready]').waitFor();assert.equal((await snapshot()).nativeLaunch,0);
  await page.screenshot({path:path.join(out,'ready-en.png')});pass('ready completion keeps the real window open for a fresh explicit exit');
  box=await options(page);await box.locator('#release-install-automatically').check();
  await page.screenshot({path:path.join(out,'options-en.png')});await box.getByRole('button',{name:'Save',exact:true}).click();await box.waitFor({state:'hidden'});
  const prefs=JSON.parse(await fs.readFile(path.join(out,'profile/desktop-settings.json'),'utf8'));assert.equal(prefs.updateAutomatic,true);
  const exiting=app.waitForEvent('close',{timeout:15000});
  await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.close();});await exiting;app=null;
  const first=JSON.parse(await fs.readFile(path.join(out,'exit-1.json'),'utf8'));
  assert.equal(first.nativeLaunch,0);assert(first.exits.every(reason=>reason!=='user'));pass('native last-window close remains a normal no-install exit');
  page=await start(2);banner=page.locator('.desktop-release-notice');
  for(let n=0;n<50&&(await snapshot()).prepare<1;n++)await new Promise(r=>setTimeout(r,20));
  await finish();await banner.locator('[data-update-phase=ready]').waitFor();
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.isVisible());w.focus();w.webContents.focus();});
  const closed=app.waitForEvent('close',{timeout:15000});
  const menu=await app.evaluate(({BrowserWindow,Menu})=>{const item=Menu.getApplicationMenu().getMenuItemById('eo-menu-quit');const value={focused:!!BrowserWindow.getFocusedWindow(),accelerator:item?.accelerator};item.click();return value;});
  assert.equal(menu.focused,true);assert.equal(menu.accelerator,undefined);await closed;app=null;
  const last=JSON.parse(await fs.readFile(path.join(out,'exit-2.json'),'utf8'));
  assert.equal(last.nativeLaunch,1);assert(last.exits.includes('user'));assert.equal(last.network,0);
  pass('actual native File Quit has no Ctrl+Q accelerator, conveys user intent and launches only the mocked adapter');
  assert.deepEqual(errors,[]);pass('real main/preload/renderer have zero uncaught page errors');
  await fs.writeFile(path.join(out,'ui-results.json'),JSON.stringify({rows,errors,scope:'X11 source UI; synthetic test policy/session/OS install and release API; not native installer or production activation'},null,2));
 }finally{await stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
