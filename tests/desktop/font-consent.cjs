// SPDX-License-Identifier: AGPL-3.0-only
// Observe the real native dialog; never replace its result or bypass consent.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(process.env.EO_DESKTOP_ROOT||path.join(__dirname,'../..'));
const {_electron}=require(process.env.EO_PLAYWRIGHT||'../../tools/node_modules/playwright-core');
(async()=>{
 const executable=process.env.EO_PACKAGE_EXECUTABLE;assert(executable,'Actual packaged executable required');
 const file=path.join(root,'fixtures/font-consent.docx');
 const generator=process.env.EO_FONT_GENERATOR||path.join(root,'tests/localfonts/mkdocx.py');
 cp.execFileSync('python3',[generator,file,'ElixirOffice Consent Test Font']);
 for(const entry of (process.env.EO_FONT_ENTRY||'bar,options').split(',')){
  const profile=path.join(root,'profiles','font-'+entry+'-'+Date.now());await fs.mkdir(profile,{recursive:true});
  const app=await _electron.launch({executablePath:executable,args:[file],env:{...process.env,DISPLAY:':0',XAUTHORITY:path.join(root,'desktop.Xauthority'),EO_DESKTOP_PROFILE:profile,LANG:'en_US.UTF-8',LC_ALL:'en_US.UTF-8'},timeout:120000});
  const processHandle=app.process();
  try{
   await app.evaluate(({dialog})=>{
    globalThis.EOFontDialogs=[];
    const original=dialog.showMessageBox;
    dialog.showMessageBox=function(...args){
     const options=args[args.length-1],record={message:options.message,detail:options.detail,buttons:options.buttons,pending:true};
     EOFontDialogs.push(record);
     const result=original.apply(this,args);
     result.then(()=>record.pending=false,()=>record.pending=false);
     return result;
    };
   });
   const page=await app.firstWindow();await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});
   assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
   const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
   await frame.evaluate(()=>{
    window.EOFontBrowserCalls=[];
    if(window.queryLocalFonts){const original=window.queryLocalFonts;window.queryLocalFonts=function(...args){EOFontBrowserCalls.push('queryLocalFonts');return original.apply(this,args)};}
    if(navigator.permissions){const original=navigator.permissions.query;navigator.permissions.query=function(...args){if(args[0]?.name==='local-fonts')EOFontBrowserCalls.push('permissions');return original.apply(this,args)};}
   });
   assert.deepEqual(await page.evaluate(()=>eoDesktop.fonts()),[],'Fonts enumerated before native consent');
   await new Promise(resolve=>setTimeout(resolve,1500));
   for(let i=0;i<12;i++){const tips=frame.locator('.asc-synchronizetip .close,.asc-synchronizetip .btn-div,.asc-synchronizetip .show-link');let closed=false;for(const tip of await tips.all())if(await tip.isVisible()){await tip.click();closed=true;}await new Promise(resolve=>setTimeout(resolve,300));if(!closed&&i>2)break;}
   assert.equal(await frame.locator('.asc-synchronizetip:visible').count(),0,'Desktop feature tips must be suppressed');
   if(entry==='bar')await frame.locator('.elx-lf-btn.primary').filter({hasText:/Use my fonts|Utiliser mes polices/}).click({timeout:20000});
   else {await page.evaluate(()=>{const win=EOLocalSession.win;(win.DE||win.SSE||win.PE).getController('ElixirChrome').openBackstage('elx-home')});await frame.locator('#fm-btn-settings').click();await page.locator('.desktop-options #computer-fonts-enabled').click();}
   let dialogs=[];
   for(let i=0;i<100;i++){dialogs=await app.evaluate(()=>globalThis.EOFontDialogs);if(dialogs.length)break;await new Promise(resolve=>setTimeout(resolve,100));}
   const text=await frame.locator('body').innerText();
   console.log('font entry',entry,'native dialogs',JSON.stringify(dialogs),'browser API calls',JSON.stringify(await frame.evaluate(()=>EOFontBrowserCalls)),'font message',await frame.locator('.elx-lf-bar').allTextContents());
   assert.equal(dialogs.length,1,'Click must open the real desktop font consent dialog');
   const language=await page.evaluate(()=>eoDesktop.locale());
   assert.equal(dialogs[0].message,language.strings.fontAsk);
   assert.equal(dialogs[0].detail,language.strings.fontDetail);
   assert.deepEqual(dialogs[0].buttons.map(label=>label.replace('&','')),[language.strings.cancel,language.strings.allow]);
   assert.equal(dialogs[0].pending,true,'Real consent dialog must await the user');
   assert.deepEqual(await frame.evaluate(()=>EOFontBrowserCalls),[],'Desktop must not invoke browser font APIs');
   assert(!/lock icon|browser permission|browser settings|icône de cadenas|réglages du navigateur/.test(text),'Browser-permission message shown in desktop');
   assert.deepEqual(await page.evaluate(()=>eoDesktop.fonts()),[],'Dialog alone must not grant access');
   console.log('PASS real packaged desktop font consent',process.platform,entry,'no browser API/message; no enumeration before consent');
  }finally{
   // Stop only this test's process; a pending native sheet can block app.close.
   if(processHandle.exitCode===null)processHandle.kill('SIGTERM');
   await Promise.race([app.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1000))]);
  }
 }
// A deliberately unanswered native dialog leaves inspector requests pending.
 // Every tested app was stopped above by its own PID; finish this test process.
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1)});

