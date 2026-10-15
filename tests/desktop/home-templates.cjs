// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(process.env.EO_DESKTOP_ROOT),exe=path.resolve(process.env.EO_PACKAGE_EXECUTABLE),{_electron}=require(process.env.EO_PLAYWRIGHT);
assert(exe.startsWith(root+path.sep));assert(!exe.startsWith('/Applications/'));
(async()=>{
 const profile=path.join(root,'profiles','templates-smoke-'+Date.now());await fs.mkdir(profile,{recursive:true});
 const app=await _electron.launch({executablePath:exe,args:['--user-data-dir='+profile],env:{...process.env,EO_DESKTOP_PROFILE:profile},timeout:120000}),child=app.process(),rows=[];
 try{
  assert(cp.execFileSync('/bin/ps',['-ww','-p',String(child.pid),'-o','command='],{encoding:'utf8'}).includes(exe));
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
  const assets=path.resolve(path.dirname(exe),'../Resources/assets');
  const sources=JSON.parse(await fs.readFile(path.join(assets,'licenses/home/template-sources.json'),'utf8'));
  const page=await app.firstWindow();await page.waitForFunction(()=>window.EODesktopReady,null,{timeout:120000});
  const locale=await page.evaluate(()=>eoDesktop.locale()),data=await page.evaluate(()=>eoDesktop.home());
  assert.equal(data.templates.length,4);assert.equal(await page.locator('[data-template]').count(),4);
  await page.waitForFunction(()=>{const images=[...document.querySelectorAll('[data-template] img')];return images.length===4&&images.every(image=>image.complete&&image.naturalWidth===264)},null,{timeout:15000});
  assert(await page.locator('[data-template] img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth===264)));
  await page.screenshot({path:path.join(root,'results','templates-home-'+locale.language+'.png')});
  for(const template of data.templates){
   await page.locator('[data-template="'+template.id+'"]').click();
   await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
   const result=await page.evaluate(language=>{
    const s=EOLocalSession;
    return {name:s.file.name,format:s.format,language:s.api.WordControl.m_oLogicDocument.GetDefaultLanguage(),
     expectedLanguage:Number(s.win.Common.util.LanguageInfo.getDefaultLanguageCode(language)),source:Array.from(s.file.bytes)};
   },locale.language);
   assert.equal(result.format,'docx');assert.equal(result.language,result.expectedLanguage);assert.equal(result.name,template.title+'.docx');
   const record=sources.files.find(item=>item.file===template.file);assert(record);
   assert.equal(crypto.createHash('sha256').update(Buffer.from(result.source)).digest('hex'),record.sha256);
   delete result.source;rows.push({id:template.id,...result,sourceHashVerified:true});
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('eo:action','home'));
   await page.waitForFunction(()=>!window.EOLocalSession&&document.getElementById('workspace').hidden,null,{timeout:15000});
  }
  await fs.writeFile(path.join(root,'results/template-entry-smoke.json'),JSON.stringify({pid:child.pid,profile,language:locale.language,rows},null,2));
  console.log('PASS owned MacHome fourlocalizedpreviews/titles/sourcehashes andfourrealWord opens/proofing language');
 }finally{
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await new Promise(r=>setTimeout(r,300));
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,500))]);
 }
})().catch(error=>{console.error(error);process.exitCode=1});
