// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Real DOM gestures with a mocked preload bridge; no API or asset download.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'desktop/release-banner.js'),'utf8');
const {chromium}=require(process.env.EO_PLAYWRIGHT||'playwright');
(async()=>{
 const output=path.resolve(process.argv[2]);fs.mkdirSync(output,{recursive:true});assert.equal(fs.readdirSync(output).length,0,'Choose a new output folder');
 const browser=await chromium.launch({...(process.env.EO_CHROMIUM?{executablePath:process.env.EO_CHROMIUM}:{}),headless:true,chromiumSandbox:true});
 const results=[],errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1100,height:760}});await context.route('**/*',route=>route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  async function setup(language='en',theme='light',deferred=false){
   await page.emulateMedia({colorScheme:theme});
   await page.setContent('<!doctype html><html data-theme="'+theme+'" dir="'+(language==='ar'?'rtl':'ltr')+'"><body><button id="outside">Existing document action</button><main id="workspace" hidden><div id="editor"></div></main><div id="home"><div class="layout">Home content</div></div></body></html>');
   await page.addStyleTag({content:fs.readFileSync(path.join(root,'desktop/assets/desktop-home/home.css'),'utf8')});
   await page.addStyleTag({content:fs.readFileSync(path.join(root,'desktop/style.css'),'utf8')});
   await page.addStyleTag({content:fs.readFileSync(path.join(root,'desktop/feedback.css'),'utf8')});
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'desktop/assets/desktop-home/home-theme.js'),'utf8')});
   assert.equal(await page.locator('html').getAttribute('data-eo-theme'),theme);
   await page.addScriptTag({content:source});
   const strings=JSON.parse(fs.readFileSync(path.join(root,'tools/desktop/i18n-extra.json'),'utf8'))[language];
   await page.evaluate(({strings,deferred})=>{
    window.calls=[];window.candidate={version:'0.4.0-beta.1',url:'https://github.com/leag1234/elixiroffice/releases/tag/v0.4.0-beta.1'};
    document.getElementById('outside').focus();
    window.bridge={releaseState:()=>deferred?new Promise(resolve=>{window.resolveState=resolve}):Promise.resolve(window.candidate),
     onReleaseNotice(callback){window.notify=value=>{window.candidate=value;callback(value)};return ()=>{window.unsubscribed=true}},
     async releaseAction(...args){window.calls.push(args);if(args[1]!==window.candidate?.version)return false;if(['later','skip'].includes(args[0])){window.candidate=null;window.notify(null)}return true}};
    window.banner=EOReleaseBanner.create({document,bridge:window.bridge,t:key=>strings[key]});
   },{strings,deferred});
   return strings;
  }
  let labels=await setup();
  await page.getByRole('button',{name:labels.releaseDownload,exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'outside','Notification must not steal focus');
  await page.getByRole('button',{name:labels.releaseDownload,exact:true}).click();
  await page.getByRole('button',{name:labels.releaseNotes,exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.calls),[['download','0.4.0-beta.1'],['notes','0.4.0-beta.1']]);
  results.push({case:'named actions contain only expected version, not URL',pass:true});
  await page.getByRole('button',{name:labels.releaseLater,exact:true}).click();
  assert.equal(await page.locator('.desktop-release-notice').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'outside');
  results.push({case:'remind hides and restores existing document focus',pass:true});
  labels=await setup();await page.getByRole('button',{name:labels.releaseSkip,exact:true}).click();
  assert.equal(await page.locator('.desktop-release-notice').count(),0);
  results.push({case:'skip closes banner through the trusted bridge',pass:true});
  await setup('en','light',true);
  await page.evaluate(()=>{window.notify({version:'0.5.0',url:'ignored'});window.resolveState({version:'0.4.0',url:'ignored'})});
  await page.waitForTimeout(20);
  assert((await page.locator('.desktop-release-notice').textContent()).includes('0.5.0'));
  results.push({case:'newer push cannot be overwritten by an older in-flight getter',pass:true});
  await page.evaluate(()=>{window.oldSkip=document.querySelector('[data-release-action=skip]');window.notify({version:'0.6.0'});window.oldSkip.click()});
  await page.waitForTimeout(20);assert((await page.locator('.desktop-release-notice').textContent()).includes('0.6.0'));
  assert.deepEqual((await page.evaluate(()=>window.calls)).at(-1),['skip','0.5.0']);
  results.push({case:'detached old action retains its displayed version and cannot dismiss a newer one',pass:true});
  await page.evaluate(()=>window.notify({version:'<img src=x onerror="window.injected=true">',url:'https://evil.invalid/'}));
  assert.equal(await page.locator('.desktop-release-notice img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  results.push({case:'untrusted version text is never HTML',pass:true});
  for(const [language,theme,width] of [['en','light',1100],['fr','dark',1100],['ar','light',640]]){
   await page.setViewportSize({width,height:760});labels=await setup(language,theme);
   await page.getByRole('button',{name:labels.releaseDownload,exact:true}).waitFor();
   await page.evaluate(()=>{document.getElementById('home').hidden=true;document.getElementById('workspace').hidden=false});
   await page.waitForTimeout(50);
   const bounds=await page.evaluate(()=>{
    const notice=document.querySelector('.desktop-release-notice'),workspace=document.getElementById('workspace');
    const a=notice.getBoundingClientRect(),b=workspace.getBoundingClientRect();
    return {notice:{top:a.top,bottom:a.bottom,height:a.height,left:a.left,right:a.right},workspace:{bottom:b.bottom,height:b.height},viewport:{width:innerWidth,height:innerHeight}};
   });
   assert(bounds.workspace.bottom<=bounds.notice.top+1,'Banner must not cover editor/status area');
   assert(bounds.notice.left>=-1&&bounds.notice.right<=width+1,'No horizontal overflow');
   assert(bounds.notice.height>0&&bounds.notice.height<380,'Non-modal bounded banner');
   const contrast=await page.locator('.desktop-release-notice').evaluate(el=>{
    const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),luminance=rgb=>rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
    const a=luminance(rgb(getComputedStyle(el).color)),b=luminance(rgb(getComputedStyle(el).backgroundColor));
    return {foreground:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
   });
   assert(contrast.ratio>=4.5,JSON.stringify(contrast));bounds.contrast=contrast;
   await page.screenshot({path:path.join(output,language+'-'+theme+'.png')});
   results.push({case:language+' '+theme+' normal-flow workspace, no overlap/overflow',pass:true,bounds});
  }
  await page.evaluate(()=>{
   const operation=document.createElement('div');operation.className='eo-operation';operation.textContent='Existing print status';document.body.append(operation);
   const message=document.createElement('div');message.id='message';message.textContent='Existing important warning';document.body.append(message);
  });
  const overlap=await page.evaluate(()=>{
   const top=document.querySelector('.desktop-release-notice').getBoundingClientRect().top;
   return {top,messageBottom:document.getElementById('message').getBoundingClientRect().bottom,operationBottom:document.querySelector('.eo-operation').getBoundingClientRect().bottom};
  });
  assert(overlap.messageBottom<=overlap.top,'Existing warning must remain above the release banner');
  assert(overlap.operationBottom<=overlap.top,'Existing print status must remain above the release banner');
  results.push({case:'important warning and print status remain visible above the notification',pass:true});
  await page.evaluate(()=>window.banner.dispose());assert.equal(await page.locator('.desktop-release-notice').count(),0);assert.equal(await page.evaluate(()=>window.unsubscribed),true);
  assert.equal(errors.length,0);results.push({case:'disposal unsubscribes and removes layout reservation',pass:true});
  await context.close();
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,pageErrors:errors},null,2)+'\n');
  console.log('PASS',results.length,'actual Chromium banner cases; zero page errors');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
