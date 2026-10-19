// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Real XTest keyboard input on a private Xvfb display, never the user's desktop.
// EO_ELECTRON, EO_XVFB, EO_XDOTOOL and EO_NATIVE_WORK must name local test tools.
const { _electron }=require(process.env.EO_PLAYWRIGHT||'playwright');
const {spawn,execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),work=path.resolve(process.env.EO_NATIVE_WORK);
function pdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << >> /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream'];
 let text='%PDF-1.4\n',offsets=[0];
 objects.forEach((value,index)=>{offsets.push(Buffer.byteLength(text));text+=(index+1)+' 0 obj\n'+value+'\nendobj\n';});
 const xref=Buffer.byteLength(text);text+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return text;
}
const wrapper=`
const {app,dialog}=require('electron');
global.shortcutProbe={sent:[],inputs:[],dialogs:[],about:[],nextOpen:null,deliverSaveAs:false};
app.on('web-contents-created',(_event,wc)=>{
 const send=wc.send.bind(wc);
 wc.send=(channel,...args)=>{
  if(channel==='eo:action'&&['new-docx','new-xlsx','new-pptx','open','save','save-as','pdf','print'].includes(args[0])){
   global.shortcutProbe.sent.push(args[0]);
   // Verify command routing without creating/printing/changing documents.
   // Open is delivered end to end; the test dialog cancels unless given its own PDF.
   if(args[0]!=='open'&&!(args[0]==='save-as'&&global.shortcutProbe.deliverSaveAs))return;
  }
  return send(channel,...args);
 };
 wc.on('before-input-event',(_event,input)=>{if(input.type==='keyDown')global.shortcutProbe.inputs.push(input);});
});
dialog.showMessageBox=async(_win,options)=>{if(options.message==='ElixirOffice'){global.shortcutProbe.about.push(options);return {response:0};}const index=(options.buttons||[]).findIndex(s=>/^(Don't Save|Do not Save)$/.test(s.replaceAll('&','')));if(index<0)throw Error('Unexpected test message box: '+options.message);return {response:index};};
dialog.showOpenDialog=async()=>{global.shortcutProbe.dialogs.push('open');const file=global.shortcutProbe.nextOpen;global.shortcutProbe.nextOpen=null;return file?{canceled:false,filePaths:[file]}:{canceled:true,filePaths:[]}};
require(process.env.EO_NATIVE_PRODUCT+'/desktop/main.cjs');
`;
async function exited(child,ms=3000){
 if(child.exitCode!==null||child.signalCode!==null)return;
 await new Promise(resolve=>{const timer=setTimeout(resolve,ms);child.once('exit',()=>{clearTimeout(timer);resolve()})});
}
(async()=>{
 assert.equal(process.platform,'linux','This gate uses a private Linux Xvfb only');
 for(const name of ['EO_ELECTRON','EO_XVFB','EO_XDOTOOL','EO_NATIVE_WORK'])assert(process.env[name],name+' required');
 fs.mkdirSync(work,{recursive:true});const run=fs.mkdtempSync(path.join(work,'native-'));fs.writeFileSync(path.join(run,'main.cjs'),wrapper);const publicPdf=path.join(run,'public.pdf');fs.writeFileSync(publicPdf,pdf());
 const display=spawn(process.env.EO_XVFB,['-screen','0','1360x960x24','-nolisten','tcp','-displayfd','1'],{stdio:['ignore','pipe','pipe']});
 let app,errors='',completed=false;display.stderr.on('data',b=>errors+=b);
 const rows=[];
 try{
 const number=await new Promise((resolve,reject)=>{display.stdout.once('data',b=>resolve(String(b).trim()));display.once('exit',code=>reject(Error('Xvfb '+code+': '+errors)));setTimeout(()=>reject(Error('Xvfb timeout '+errors)),10000).unref()});
 const env={...process.env,DISPLAY:':'+number,EO_DESKTOP_PROFILE:path.join(run,'profile'),EO_NATIVE_PRODUCT:root};
 const keypress=key=>execFileSync(process.env.EO_XDOTOOL,['key','--clearmodifiers',key],{env});
 app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(run,'main.cjs')],env,timeout:30000});
 assert(!app.process().spawnargs.includes('--no-sandbox')); const page=await app.firstWindow();await page.waitForFunction(()=>window.EODesktopReady,null,{timeout:60000});
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMenuBarVisible()),false,"Native menu hidden while shortcuts stay installed");
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].focus());
 async function keys(location,newAction,frame){
  for(const [key,expected] of [['ctrl+o','open'],['ctrl+s','save'],['F12','save-as'],['ctrl+p','print'],['ctrl+n',newAction]]){
   const previous=await app.evaluate(()=>global.shortcutProbe.sent.length), previousDialogs=await app.evaluate(()=>global.shortcutProbe.dialogs.length);
   keypress(key);await page.waitForTimeout(180);
   const value=await app.evaluate((_e,start)=>({sent:global.shortcutProbe.sent.slice(start),inputs:global.shortcutProbe.inputs.slice(-3),dialogs:global.shortcutProbe.dialogs.slice()}),previous);
   assert.deepEqual(value.sent,[expected],location+' '+key+' dispatched exactly once');
   assert(value.inputs.some(i=>i.type==='keyDown'&&(key==='F12'?!i.control&&i.key==='F12':i.control&&i.key.toLowerCase()===key.split('+').pop())),'Real native input required');
   if(expected==='open')assert.equal(value.dialogs.length,previousDialogs+1,'Open reached the actual main-process dialog once');
   rows.push({location,key,...value});console.log(location,key,'PASS');
  }
  if(frame){
   await frame.evaluate(()=>{window.nativeProbeKeys=[];window.addEventListener('keydown',e=>nativeProbeKeys.push({key:e.key,trusted:e.isTrusted}),true)});
   const start=await app.evaluate(()=>global.shortcutProbe.sent.length);
   for(const key of ['ctrl+z','ctrl+c','ctrl+alt+s']){keypress(key);await page.waitForTimeout(80);keypress('Escape');}
   assert.equal(await app.evaluate(()=>global.shortcutProbe.sent.length),start,'Unowned editor keys stay in editor');
   const received=await frame.evaluate(()=>nativeProbeKeys);assert(received.some(e=>e.trusted&&e.key.toLowerCase()==='z'),'Actual editor received undo');
   rows.push({location,unownedKeys:received});
   if(location==='documenteditor'){
    const start=await app.evaluate(()=>global.shortcutProbe.sent.length);
    keypress('ctrl+shift+s');
    await frame.waitForFunction(()=>DE.getController('WordFormatting').applyStylesDlg?.isVisible());
    keypress('Escape');await frame.waitForFunction(()=>!DE.getController('WordFormatting').applyStylesDlg?.isVisible());
    const beforeTrack=await frame.evaluate(()=>DE.getController('Main').api.asc_IsTrackRevisions());
    keypress('ctrl+shift+e');await frame.waitForFunction(before=>DE.getController('Main').api.asc_IsTrackRevisions()!==before,beforeTrack);
    keypress('ctrl+shift+e');await frame.waitForFunction(before=>DE.getController('Main').api.asc_IsTrackRevisions()===before,beforeTrack);
    const beforePara=await frame.evaluate(()=>{const api=DE.getController('Main').api;api.put_PrAlign(AscCommon.align_Center);return {center:AscCommon.align_Center,direct:api.WordControl.m_oLogicDocument.GetCurrentParagraph().Pr.Jc??null}});
    assert.equal(beforePara.direct,beforePara.center);
    keypress('ctrl+q');await frame.waitForFunction(()=>DE.getController('Main').api.WordControl.m_oLogicDocument.GetCurrentParagraph().Pr.Jc===undefined);
    assert.equal(app.process().exitCode,null,'CtrlQ must not quit Word');
    assert.equal(await app.evaluate(()=>global.shortcutProbe.sent.length),start,'Office editing chords never invoke desktop file commands');
    rows.push({location,officeEffects:{applyStylesOpened:true,trackChangesToggledAndRestored:true,paragraphDirectFormattingRemoved:true,ctrlQDidNotQuit:true}});
    await app.evaluate(()=>{global.shortcutProbe.deliverSaveAs=true});keypress('F12');
    await page.locator('.eo-format-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('.eo-format-dialog').count(),1);
    assert(await page.locator('.eo-format-dialog input[value=docx]').isChecked());
    await page.locator('.eo-format-dialog button[type=button]').click();
    await page.locator('.eo-format-dialog').waitFor({state:'hidden'});
    await app.evaluate(()=>{global.shortcutProbe.deliverSaveAs=false});
    rows.push({location,f12ActualSaveAsChooser:true,cancelled:true});
   }
   const notice=await frame.evaluate(()=>{
    const bk=Common.ElixirBrowserKeys;if(!bk?.controller)return {available:false};
    bk.controller.showHint(true);bk.controller.showDialog();
    return {available:true,local:bk.isLocal(),hint:!!document.getElementById('elx-bk-hint'),dialog:!!document.querySelector('.elx-bk-dlg')};
   });
   if(notice.available){assert.equal(notice.local,true);assert.equal(notice.hint,false);assert.equal(notice.dialog,false)}
   rows.push({location,notice});
  }
 }
 await keys('home','new-docx');
 for(const [format,editor,newAction] of [['docx','documenteditor','new-docx'],['xlsx','spreadsheeteditor','new-xlsx'],['pptx','presentationeditor','new-pptx'],['pdf','pdfeditor','new-docx']]){
  if(format==='pdf'){
   await app.evaluate((_electron,file)=>{global.shortcutProbe.nextOpen=file},publicPdf);keypress('ctrl+o');
  }else await page.locator('[data-new='+format+']').click();
  await page.waitForFunction(format=>window.EOLocalSession?.format===format,format,{timeout:120000});
  const frame=page.frames().find(f=>f.url().includes('/'+editor+'/'));assert(frame,editor+' iframe');
  await frame.locator('body').click({position:{x:700,y:400}});
  await keys(editor,newAction,frame);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].focus());keypress('F1');
  await page.waitForFunction(()=>true);
  await new Promise(async(resolve,reject)=>{const deadline=Date.now()+10000;while(Date.now()<deadline){if(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.getParentWindow()&&!w.webContents.isLoadingMainFrame()&&w.webContents.getURL().includes('/resources/help/')))){resolve();return;}await new Promise(r=>setTimeout(r,50));}reject(Error('F1 did not open Help'));});
  console.log(editor,'F1 Help loaded');
  const help=await app.evaluate(({BrowserWindow})=>{const child=BrowserWindow.getAllWindows().find(w=>w.getParentWindow());const result={url:child.webContents.getURL(),menuVisible:child.isMenuBarVisible()};child.close();BrowserWindow.getAllWindows()[0].focus();return result;});
  assert.equal(help.menuVisible,false);assert.match(help.url,/resources\/help/);rows.push({location:editor,f1NativeHelp:true,helpMenuHidden:true});
  console.log(editor,'Help closed');await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded(),null,{timeout:30000});
  await frame.evaluate(()=>{const app=window.DE||window.SSE||window.PE||window.PDFE;app.getController('ElixirChrome').openBackstage('elx-home');});
  for(const id of ['fm-btn-help','fm-btn-elx-about','fm-btn-eo-quit'])assert(await frame.locator('#'+id).isVisible(),editor+' backstage '+id);
  console.log(editor,'Backstage entries visible');const aboutBefore=await app.evaluate(()=>global.shortcutProbe.about.length);await frame.locator('#fm-btn-elx-about').click();await page.waitForTimeout(100);assert.equal(await app.evaluate(()=>global.shortcutProbe.about.length),aboutBefore+1);rows.push({location:editor,backstageHelpAboutQuit:true,actualNativeAboutBridge:true});

  if(format==='pdf')break;
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('eo:action','home'));
  await page.locator('#home').waitFor({state:'visible'});
 }
 // Quit uses the real guarded close path; distinguish its exit from cleanup.
 const finalFrame=page.frames().find(f=>f.url().includes('/pdfeditor/'));await finalFrame.evaluate(()=>PDFE.getController('ElixirChrome').openBackstage('elx-home'));await finalFrame.locator('#fm-btn-eo-quit').click();await exited(app.process(),5000);
 assert.equal(app.process().exitCode,0,'Guarded window close exits normally');
 rows.push({location:'pdfeditor-iframe',action:'window-close',exitCode:app.process().exitCode});
 completed=true;
 fs.writeFileSync(path.join(work,'native-keyboard.json'),JSON.stringify({pass:true,scope:'Linux X11/XTest, actual Electron/editor; no Arch/niri/hardware claim',commandRoutingOnly:['new','save','save-as','pdf','print'],openDialog:'actual main handler with test cancel',close:'actual guarded window close',rows},null,2)+'\n');
 console.log(JSON.stringify({pass:true,rows:rows.length,normalWindowClose:true}));
 }finally{
  if(app){
   if(app.process().exitCode===null&&app.process().signalCode===null){app.process().kill('SIGTERM');await exited(app.process());}
   await app.close().catch(()=>{});
  }
  if(display.exitCode===null&&display.signalCode===null){display.kill('SIGTERM');await exited(display);}
  if(!completed)fs.writeFileSync(path.join(work,'native-keyboard-partial.json'),JSON.stringify({pass:false,rows},null,2));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
