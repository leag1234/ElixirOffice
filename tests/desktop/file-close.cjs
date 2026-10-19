// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Visible File > Close with real conversion and injected native dialog answers.
const {_electron}=require(process.env.EO_PLAYWRIGHT||'playwright'),{spawn,execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),work=process.env.EO_NATIVE_WORK;
const wrapper=[
"const {dialog}=require('electron');",
"global.fileCloseProbe={answers:[],saveAnswers:[],dialogs:[]};",
"dialog.showMessageBox=async(_win,options)=>{fileCloseProbe.dialogs.push(options);if(!fileCloseProbe.answers.length)throw Error('Unexpected question');return {response:fileCloseProbe.answers.shift()}};",
"dialog.showSaveDialog=async()=>{if(!fileCloseProbe.saveAnswers.length)throw Error('Unexpected Save As');return fileCloseProbe.saveAnswers.shift()};",
"require(process.env.EO_NATIVE_PRODUCT+'/desktop/main.cjs');"
].join('\n');
async function exited(child,ms=5000){if(child.exitCode!==null||child.signalCode!==null)return true;await new Promise(resolve=>{const timer=setTimeout(resolve,ms);child.once('exit',()=>{clearTimeout(timer);resolve()})});return child.exitCode!==null||child.signalCode!==null;}
(async()=>{
 assert.equal(process.platform,'linux');assert(work&&path.isAbsolute(work));for(const k of ['EO_ELECTRON','EO_XVFB'])assert(process.env[k],k);
 fs.mkdirSync(work,{recursive:true});const run=fs.mkdtempSync(path.join(work,'run-'));fs.writeFileSync(path.join(run,'main.cjs'),wrapper);
 const display=spawn(process.env.EO_XVFB,['-screen','0','1360x960x24','-nolisten','tcp','-displayfd','1'],{stdio:['ignore','pipe','pipe']});let app,success=false,displayError='';const rows=[],errors=[],requests=[];display.stderr.on('data',data=>displayError+=data);
 try{
  const number=await new Promise((resolve,reject)=>{display.stdout.once('data',data=>resolve(String(data).trim()));display.once('exit',code=>reject(Error('Xvfb '+code+': '+displayError)));setTimeout(()=>reject(Error('Xvfb timeout')),10000).unref()});
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(run,'main.cjs')],env:{...process.env,DISPLAY:':'+number,EO_DESKTOP_PROFILE:path.join(run,'profile'),EO_NATIVE_PRODUCT:root,DBUS_SESSION_BUS_ADDRESS:'unix:path='+path.join(run,'no-bus')},timeout:30000});assert(!app.process().spawnargs.includes('--no-sandbox'));
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));await page.waitForFunction(()=>window.EODesktopReady,null,{timeout:60000});
  async function create(){await page.locator('#home [data-new=docx]').click();await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);await page.evaluate(()=>{const api=EOLocalSession.api;api.WordControl.m_oLogicDocument.MoveCursorToStartPos();api.asc_enterText(Array.from('PUBLIC FILE CLOSE SAVE CHECK',c=>c.codePointAt(0)))});await page.waitForFunction(()=>EOLocalSession.controller.isModified());}
  async function close(answer,saveAnswer,formatCancel=false){await app.evaluate((_e,value)=>{fileCloseProbe.answers.push(value.answer);if(value.saveAnswer)fileCloseProbe.saveAnswers.push(value.saveAnswer)},{answer,saveAnswer});const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);if(!await frame.locator('#fm-btn-elx-close').isVisible())await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-elx-close').click();await page.waitForTimeout(100);if(answer===0){const box=page.locator('.eo-format-dialog');await box.waitFor({state:'visible'});if(formatCancel)await box.locator('button[type=button]').click();else{assert(await box.locator('input[value=docx]').isChecked());await box.locator('button[type=submit]').click();}}}
  await create();const name=await page.evaluate(()=>EOLocalSession.file.name);await close(2);await page.waitForFunction(()=>EOLocalSession?.controller.isModified()&&!EODesktopState(false).opening);
  const options=await app.evaluate(()=>fileCloseProbe.dialogs[0]);assert.deepEqual(options.buttons.map(s=>s.replace(/&/g,'')),['Save',"Don't Save",'Cancel']);assert.equal(options.defaultId,0);assert.equal(options.cancelId,2);assert(options.message.includes('\u2068'+name+'\u2069'));rows.push({action:'cancel',namedThreeChoices:true,options});
  await close(0,undefined,true);await page.waitForFunction(()=>EOLocalSession?.controller.isModified()&&!EODesktopState(false).opening);rows.push({action:'format-cancel',liveDirtyDocument:true});
  await close(0,{canceled:true});await page.waitForFunction(()=>EOLocalSession?.controller.isModified()&&!EODesktopState(false).opening);assert.equal(await page.evaluate(()=>document.getElementById('workspace').hidden),false);rows.push({action:'save-as-cancel',documentKept:true});
  const target=path.join(run,'public-file-close.docx');await close(0,{canceled:false,filePath:target});await page.waitForFunction(()=>!window.EOLocalSession&&!document.getElementById('home').hidden,null,{timeout:120000});assert(fs.readFileSync(target).subarray(0,2).equals(Buffer.from('PK')));const saved=await page.evaluate(()=>window.EOLastSave);assert(saved?.bytes>0);const text=execFileSync('python3',['-c',"import sys,zipfile,xml.etree.ElementTree as E;z=zipfile.ZipFile(sys.argv[1]);print(''.join(E.fromstring(z.read('word/document.xml')).itertext()))",target],{encoding:'utf8'});assert(text.includes('PUBLIC FILE CLOSE SAVE CHECK'),'Saved Word edit is missing');rows.push({action:'save',home:true,bytes:saved.bytes,savedEditVerified:true});
  await create();await close(1);await page.waitForFunction(()=>!window.EOLocalSession&&!document.getElementById('home').hidden);rows.push({action:'dont-save',home:true});
  assert.deepEqual(errors,[]);assert(requests.every(url=>/^(eoapp:|blob:|data:)/.test(url)));assert.equal(app.process().exitCode,null);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());assert(await exited(app.process()),'Clean Home did not exit');success=true;
 }finally{
  const cleanup={forced:false};if(app){const child=app.process();await app.close().catch(()=>{});if(!await exited(child)){cleanup.forced=true;child.kill('SIGTERM');if(!await exited(child))child.kill('SIGKILL');await exited(child);}}
  display.kill('SIGTERM');if(!await exited(display))display.kill('SIGKILL');await exited(display);fs.writeFileSync(path.join(work,'file-close-ui.json'),JSON.stringify({success,rows,errors,requests:requests.length,cleanup},null,2)+'\n');
 }
 assert(success);console.log('PASS visible File Close: Cancel, Save As Cancel, real DOCX Save to Home, Don\'t Save; named3choices; no egress; app preserved');
})().catch(error=>{console.error(error);process.exitCode=1});
