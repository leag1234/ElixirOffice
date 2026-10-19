// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Actual native unsaved Save activation and trusted shared-dialog click on an owned Xvfb.
// Native destination selection is injected; the ticket, conversion and disk commit are real.
const {_electron}=require(process.env.EO_PLAYWRIGHT||'playwright'),{spawn,execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),work=process.env.EO_NATIVE_WORK;
const wrapper=[
"const {app,dialog,ipcMain}=require('electron');",
"global.untitledProbe={events:[],actions:[],homeResults:[],consumed:[],questionPending:false,saveBlocked:false,abort:false};",
"const stamp=(name,phase)=>untitledProbe.events.push({name,phase});",
"const SaveAs=require(process.env.EO_NATIVE_PRODUCT+'/desktop/save-as.cjs'),take=SaveAs.Destinations.prototype.take;",
"SaveAs.Destinations.prototype.take=async function(id,current,format,route){const result=await take.call(this,id,current,format,route);untitledProbe.consumed.push({id,format,route});return result};",
"app.on('web-contents-created',(_event,wc)=>{const send=wc.send.bind(wc);wc.send=(channel,...args)=>{if(channel==='eo:action')untitledProbe.actions.push(args[0]);return send(channel,...args)}});",
"const question=dialog.showMessageBox.bind(dialog);dialog.showMessageBox=async(...args)=>{untitledProbe.questionPending=true;try{const result=await question(...args);untitledProbe.questionResponse=result.response;return result}finally{untitledProbe.questionPending=false}};",
"dialog.showSaveDialog=async()=>({canceled:false,filePath:process.env.EO_UNTITLED_TARGET});",
"const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,fn)=>handle(name,async(event,...args)=>{stamp(name,'start');if(name==='eo:save'){untitledProbe.saveTicket=args[5];untitledProbe.saveBlocked=true;await new Promise(resolve=>untitledProbe.release=resolve);untitledProbe.saveBlocked=false;if(untitledProbe.abort)throw Error('Injected aborted test write')}const result=await fn(event,...args);if(name==='eo:save-as-choose')untitledProbe.ticket=result?.ticket;if(name==='eo:save')untitledProbe.committed=!!result?.artifactId;if(name==='eo:return-home')untitledProbe.homeResults.push(result);stamp(name,'result');return result});",
"require(process.env.EO_NATIVE_PRODUCT+'/desktop/main.cjs');"
].join('\n');
async function exited(child,ms=5000){if(child.exitCode!==null||child.signalCode!==null)return true;await new Promise(resolve=>{const timer=setTimeout(resolve,ms);child.once('exit',()=>{clearTimeout(timer);resolve()})});return child.exitCode!==null||child.signalCode!==null;}
(async()=>{
 assert.equal(process.platform,'linux');assert(work&&path.isAbsolute(work));for(const key of ['EO_ELECTRON','EO_XVFB'])assert(process.env[key],key);
 fs.mkdirSync(work,{recursive:true});const run=fs.mkdtempSync(path.join(work,'run-')),target=path.join(run,'public-untitled-close.docx');fs.writeFileSync(path.join(run,'main.cjs'),wrapper);
 let number=200+process.pid%600;while(fs.existsSync('/tmp/.X11-unix/X'+number)||fs.existsSync('/tmp/.X'+number+'-lock'))number++;
 const displayName=':'+number,display=spawn(process.env.EO_XVFB,[displayName,'-screen','0','1360x960x24','-nolisten','tcp'],{stdio:['ignore','ignore','pipe']});
 let app,success=false,displayError='';const rows=[],errors=[],requests=[];display.stderr.on('data',data=>displayError+=data);
 try{
  const xenv={...process.env,DISPLAY:displayName};
  let ready=false;for(let n=0;n<100;n++){if(display.exitCode!==null)throw Error('Xvfb exited: '+displayError);try{execFileSync('xprop',['-root','_NET_CLIENT_LIST'],{env:xenv,stdio:'pipe'});ready=true;break}catch{}await new Promise(resolve=>setTimeout(resolve,50));}assert(ready,'Owned display unavailable');
  process.env.EO_DESKTOP_ROOT=root;process.env.EO_DESKTOP_DISPLAY=displayName;process.env.EO_XVFB_PID=String(display.pid);
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(run,'main.cjs')],env:{...xenv,EO_DESKTOP_PROFILE:path.join(run,'profile'),EO_NATIVE_PRODUCT:root,EO_UNTITLED_TARGET:target,DBUS_SESSION_BUS_ADDRESS:'unix:path='+path.join(run,'no-bus')},timeout:30000});assert(!app.process().spawnargs.includes('--no-sandbox'));
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));await page.waitForFunction(()=>window.EODesktopReady,null,{timeout:60000});
  await page.locator('#home [data-new=docx]').click();await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
  await page.evaluate(()=>{const api=EOLocalSession.api;api.WordControl.m_oLogicDocument.MoveCursorToStartPos();api.asc_enterText(Array.from('PUBLIC UNTITLED CLOSE TICKET CHECK',c=>c.codePointAt(0)));window.closeLockClicks=0;const b=document.createElement('button');b.id='owned-close-lock-probe';b.hidden=true;b.onclick=()=>closeLockClicks++;document.body.append(b);b.click()});
  await page.waitForFunction(()=>EOLocalSession.controller.isModified());assert.equal(await page.evaluate(()=>closeLockClicks),1);
  const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-elx-close').click();
  for(let n=0;n<100&&!await app.evaluate(()=>untitledProbe.questionPending);n++)await page.waitForTimeout(50);assert(await app.evaluate(()=>untitledProbe.questionPending));
  await page.evaluate(()=>document.getElementById('owned-close-lock-probe').click());assert.equal(await page.evaluate(()=>closeLockClicks),1,'prepare-close must block renderer clicks');
  rows.push({stage:'prepare-close',rendererClickBlocked:true});
  const {modal,keys}=require(path.join(root,'tests/desktop/lifecycle.cjs'));
  await modal({page,application:app.process(),errors,requests:[]},'ElixirOffice');keys({application:app.process()},'return');
  for(let n=0;n<100&&await app.evaluate(()=>untitledProbe.questionPending);n++)await page.waitForTimeout(50);assert.equal(await app.evaluate(()=>untitledProbe.questionResponse),0,'Actual native default action must be Save');
  await page.locator('.eo-format-dialog').waitFor({state:'visible',timeout:5000});
  await page.evaluate(()=>document.getElementById('owned-close-lock-probe').click());assert.equal(await page.evaluate(()=>closeLockClicks),2,'resume-close must unlock the shared dialog');
  assert(await page.locator('.eo-format-dialog input[value=docx]').isChecked());await page.locator('.eo-format-dialog button[type=submit]').evaluate(button=>button.addEventListener('click',event=>{window.sharedSaveClicks=(window.sharedSaveClicks||[]).concat(event.isTrusted)}));await page.screenshot({path:path.join(work,'untitled-save-as.png')});
  await page.locator('.eo-format-dialog button[type=submit]').click();assert.deepEqual(await page.evaluate(()=>sharedSaveClicks),[true]);
  for(let n=0;n<2400&&!await app.evaluate(()=>untitledProbe.saveBlocked);n++)await page.waitForTimeout(50);assert(await app.evaluate(()=>untitledProbe.saveBlocked),'Real save must reach the pre-commit gate');
  const before=await app.evaluate(()=>({ticket:untitledProbe.ticket,saveTicket:untitledProbe.saveTicket,homeResults:untitledProbe.homeResults,committed:!!untitledProbe.committed}));
  assert.equal(typeof before.ticket,'string');assert.equal(before.saveTicket,before.ticket);assert.deepEqual(before.homeResults,['save-as']);assert.equal(before.committed,false);assert(!fs.existsSync(target));assert(await page.evaluate(()=>!!EOLocalSession&&!document.getElementById('workspace').hidden));
  rows.push({stage:'before-commit',ticketed:true,liveDocument:true,outputAbsent:true,sharedSaveClickTrusted:true});
  await app.evaluate(()=>untitledProbe.release());await page.waitForFunction(()=>!window.EOLocalSession&&!document.getElementById('home').hidden,null,{timeout:120000});
  const after=await app.evaluate(()=>({events:untitledProbe.events,actions:untitledProbe.actions,homeResults:untitledProbe.homeResults,consumed:untitledProbe.consumed,committed:untitledProbe.committed,ticket:untitledProbe.ticket}));
  assert.deepEqual(after.homeResults,['save-as',true]);assert(after.committed);assert.equal(after.consumed.length,1);assert.equal(after.consumed[0].id,after.ticket);assert.equal(after.consumed[0].route,'save');
  const commit=after.events.findIndex(row=>row.name==='eo:save'&&row.phase==='result'),second=after.events.map((row,index)=>({...row,index})).filter(row=>row.name==='eo:return-home'&&row.phase==='start')[1].index;assert(second>commit,'Second returnHome must follow committed save');
  const text=execFileSync('python3',['-c',"import sys,zipfile,xml.etree.ElementTree as E;z=zipfile.ZipFile(sys.argv[1]);print(''.join(E.fromstring(z.read('word/document.xml')).itertext()))",target],{encoding:'utf8'});assert(text.includes('PUBLIC UNTITLED CLOSE TICKET CHECK'));
  rows.push({stage:'after-commit',ticketConsumedOnce:true,secondReturnHomeAfterCommit:true,editVerified:true,bytes:fs.statSync(target).size,actions:after.actions});
  assert.deepEqual(errors,[]);assert(requests.every(url=>/^(eoapp:|blob:|data:)/.test(url)));await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());assert(await exited(app.process()));success=true;
 }finally{
  const cleanup={forced:false};if(app){const child=app.process();if(child.exitCode===null&&child.signalCode===null){cleanup.forced=true;await app.evaluate(({BrowserWindow})=>{untitledProbe.abort=true;untitledProbe.release?.();for(const window of BrowserWindow.getAllWindows())window.destroy()}).catch(()=>{});}void app.close().catch(()=>{});if(!await exited(child)){child.kill('SIGTERM');if(!await exited(child))child.kill('SIGKILL');await exited(child);}}
  display.kill('SIGTERM');if(!await exited(display))display.kill('SIGKILL');await exited(display);fs.writeFileSync(path.join(work,'untitled-close-ui.json'),JSON.stringify({success,rows,errors,requests:requests.length,cleanup},null,2)+'\n');
 }
 assert(success);console.log('PASS actual native Close Save, shared trusted Save click, destination ticket, blocked precommit disposal and committed Word edit before Home');
})().catch(error=>{console.error(error);process.exitCode=1});
