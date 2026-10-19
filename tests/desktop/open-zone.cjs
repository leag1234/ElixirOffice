// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Trusted clicks/keys in the real sandboxed app; native chooser cancels are injected.
const {_electron}=require(process.env.EO_PLAYWRIGHT||'playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),work=process.env.EO_NATIVE_WORK;
const wrapper=["const {dialog}=require('electron');","global.openZoneProbe={calls:0};","dialog.showOpenDialog=async()=>{openZoneProbe.calls++;return {canceled:true,filePaths:[]}};","dialog.showMessageBox=async()=>{throw Error('Unexpected native question')};","require(process.env.EO_NATIVE_PRODUCT+'/desktop/main.cjs');"].join('\n');
async function exited(child,ms=5000){if(child.exitCode!==null||child.signalCode!==null)return true;await new Promise(resolve=>{const timer=setTimeout(resolve,ms);child.once('exit',()=>{clearTimeout(timer);resolve()})});return child.exitCode!==null||child.signalCode!==null;}
(async()=>{
 assert.equal(process.platform,'linux');assert(work&&path.isAbsolute(work));for(const k of ['EO_ELECTRON','EO_XVFB'])assert(process.env[k],k);
 fs.mkdirSync(work,{recursive:true});const run=fs.mkdtempSync(path.join(work,'run-'));fs.writeFileSync(path.join(run,'main.cjs'),wrapper);
 const display=spawn(process.env.EO_XVFB,['-screen','0','1360x960x24','-nolisten','tcp','-displayfd','1'],{stdio:['ignore','pipe','pipe']});let app,success=false,displayError='';const rows=[],errors=[],requests=[];display.stderr.on('data',data=>displayError+=data);
 try{
  const number=await new Promise((resolve,reject)=>{display.stdout.once('data',data=>resolve(String(data).trim()));display.once('exit',code=>reject(Error('Xvfb '+code+': '+displayError)));setTimeout(()=>reject(Error('Xvfb timeout')),10000).unref()});
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(run,'main.cjs')],env:{...process.env,DISPLAY:':'+number,EO_DESKTOP_PROFILE:path.join(run,'profile'),EO_NATIVE_PRODUCT:root,DBUS_SESSION_BUS_ADDRESS:'unix:path='+path.join(run,'no-bus')},timeout:30000});assert(!app.process().spawnargs.includes('--no-sandbox'));
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));await page.waitForFunction(()=>window.EODesktopReady,null,{timeout:60000});
  const calls=()=>app.evaluate(()=>openZoneProbe.calls);
  async function chooser(location,action,runAction){
   const before=await calls();await runAction();let count;
   for(let n=0;n<30;n++){count=await calls();if(count>before)break;await page.waitForTimeout(50);}
   assert.equal(count,before+1,location+' '+action+' must invoke the same chooser once');
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('#home button')).every(button=>!button.disabled));
   rows.push({location,action,chooserCalls:count-before});console.log('PASS',location,action);
  }
  async function check(location,zone){
   await chooser(location,'background click',()=>zone.click({position:{x:10,y:10}}));
   const label=await page.evaluate(()=>EODesktopStrings.browse);
   assert.equal(await zone.getAttribute('role'),'button');assert.equal(await zone.evaluate(el=>el.style.width),'','Width belongs to the built stylesheet');assert.equal(await zone.getAttribute('aria-label'),label);
   assert.equal(await zone.locator('button').count(),0,'One control, without nested buttons');
   const size=await zone.evaluate(el=>({width:el.getBoundingClientRect().width,availableWidth:el.parentElement.clientWidth-parseFloat(getComputedStyle(el.parentElement).paddingLeft)-parseFloat(getComputedStyle(el.parentElement).paddingRight)}));assert(size.width>=size.availableWidth-5,'Whole panel width retained');
   rows.push({location,action:'role/name/full-width',label,...size});
   await chooser(location,'Browse visual click',()=>zone.locator('.btn-primary').click());
   await zone.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert(await zone.evaluate(el=>document.activeElement===el),'Zone participates in tab order');
   const focus=await zone.evaluate(el=>{const s=getComputedStyle(el);return {style:s.outlineStyle,width:s.outlineWidth}});assert.notEqual(focus.style,'none');assert(parseFloat(focus.width)>0);rows.push({location,action:'visible keyboard focus',...focus});
   await chooser(location,'Enter',()=>zone.press('Enter'));await chooser(location,'Space',()=>zone.press('Space'));
   const before=await calls();await zone.press('ArrowDown');await page.waitForTimeout(100);assert.equal(await calls(),before);rows.push({location,action:'unrelated key',chooserCalls:0});
  }
  await page.locator('#home [data-view=open]').click();const zone=page.locator('#home .dropzone');await check('Home Open',zone);await page.screenshot({path:path.join(work,'home-open.png')});
  const source=path.join(root,'desktop/assets/templates/new.docx'),file=path.join(run,'public-drop.docx');fs.copyFileSync(source,file);const digest=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),box=await zone.boundingBox(),cdp=await page.context().newCDPSession(page);
  for(const type of ['dragEnter','dragOver','drop'])await cdp.send('Input.dispatchDragEvent',{type,x:box.x+10,y:box.y+10,data:{items:[],files:[file],dragOperationsMask:1}});await cdp.detach();
  await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);assert.equal(await page.evaluate(()=>EOLocalSession.file.format),'docx');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),digest);rows.push({location:'Home Open',action:'real document drop',opened:'docx',sourceUnchanged:true});
  const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-elx-open').click();await check('Editor Open',frame.locator('.dropzone:visible'));await frame.locator('.dropzone:visible').screenshot({path:path.join(work,'editor-open-zone.png')});
  assert.deepEqual(errors,[]);assert(requests.every(url=>/^(eoapp:|blob:|data:)/.test(url)));assert.equal(app.process().exitCode,null);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());assert(await exited(app.process()),'Clean document close did not exit');success=true;
 }finally{
  const cleanup={forced:false};if(app){const child=app.process();void app.close().catch(()=>{});if(!await exited(child)){cleanup.forced=true;child.kill('SIGTERM');if(!await exited(child))child.kill('SIGKILL');await exited(child);}}
  display.kill('SIGTERM');if(!await exited(display))display.kill('SIGKILL');await exited(display);fs.writeFileSync(path.join(work,'open-zone-ui.json'),JSON.stringify({success,rows,errors,requests:requests.length,cleanup},null,2)+'\n');
 }
 assert(success);console.log('PASS accessible whole Open zone in Home and editor; trusted Enter/Space, exact-once chooser, real document drop, no egress');
})().catch(error=>{console.error(error);process.exitCode=1});
