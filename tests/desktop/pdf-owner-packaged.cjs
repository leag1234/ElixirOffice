// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {launch,stop,idle}=require('./owned-mac-app.cjs');
const root=process.env.EO_DESKTOP_ROOT,exe=process.env.EO_PACKAGE_EXECUTABLE;assert(root&&exe);
const rows=[];const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
async function step(env,fn){idle();return fn();}
async function run(name,fixture,check){
 const folder=path.join(root,'fixtures',name+'-'+Date.now());await fs.mkdir(folder,{recursive:true});const file=path.join(folder,path.basename(fixture));await fs.copyFile(fixture,file);
 let env;try{env=await launch(root,exe,file);await env.page.waitForURL('eoapp://desktop.elixiroffice.invalid/index.html');await env.page.evaluate(()=>{const original=setTimeout;window.setTimeout=function(fn,ms,...args){if(ms===60000&&String(fn).includes('recoveryCopy'))window.RecordedRecoveryTimer=fn;return original(fn,ms,...args);};});
 await env.page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await env.page.evaluate(()=>window.EOLocalFailure||null),null);
 await check(env,file);rows.push({name,pass:true});
 }finally{if(env){const pids=await stop(env);await fs.writeFile(path.join(root,'results','cleanup-'+name+'.json'),JSON.stringify({pids,confirmedExit:true,stdioFiles:true},null,2));}}
}
(async()=>{
 await run('tagged',path.join(root,'fixtures/public-issue.pdf'),async env=>{
  const page=env.page,initial=await page.evaluate(()=>({policy:EOLocalSession.stats.policy,noFeedback:!document.querySelector('.eo-operation')&&typeof EOLocalSession.controller.beginOperation==='undefined',name:EOLocalSession.file.name}));
  assert.equal(initial.policy.reason,'unsupported-catalog');assert.equal(initial.noFeedback,true);
  await step(env,()=>page.evaluate(()=>EOLocalSession.api.asc_Save()));const reason=await page.evaluate(()=>document.querySelector('#message').textContent);assert(reason.includes('PDF')&&reason.length>80);assert.notEqual(reason,'Erreur');
  await step(env,()=>page.evaluate(()=>{EOLocalSession.api.asc_EditPage();}));const explanation=await page.evaluate(()=>document.querySelector('#message').textContent);assert(/texte original|original text/.test(explanation));
  const iframe=await page.locator('#workspace iframe').boundingBox();const geometry=await page.evaluate(()=>{const v=EOLocalSession.api.DocumentRenderer,r=v.canvasForms.getBoundingClientRect();window.WheelEvents=[];EOLocalSession.win.document.addEventListener('wheel',e=>WheelEvents.push({trusted:e.isTrusted,deltaY:e.deltaY}),true);return {x:r.x,y:r.y,width:r.width,height:r.height,scroll:v.scrollY};});
  await step(env,async()=>{await page.mouse.move(iframe.x+geometry.x+geometry.width/2,iframe.y+geometry.y+Math.min(300,geometry.height/2));await page.mouse.wheel(0,240);await page.waitForTimeout(400);});
  const wheel=await page.evaluate(()=>({scroll:EOLocalSession.api.DocumentRenderer.scrollY,events:WheelEvents}));assert(wheel.scroll>geometry.scroll);assert(wheel.events.some(e=>e.trusted));
  const zoom=await page.evaluate(()=>EOLocalSession.api.DocumentRenderer.zoom);
  await step(env,async()=>{await page.keyboard.down('Meta');await page.mouse.wheel(0,-100);await page.keyboard.up('Meta');await page.waitForTimeout(300);});const zoomed=await page.evaluate(()=>EOLocalSession.api.DocumentRenderer.zoom);assert(zoomed>zoom);
  await step(env,()=>page.evaluate(async()=>{const s=EOLocalSession,b=await s.controller.snapshot();if(await eoDesktop.recoverySave(s.file.token,s.file.recoveryVersion||0,b.bytes)!==false)throw Error('PDF recovery must stay disabled');if(window.RecordedRecoveryTimer)await RecordedRecoveryTimer();}));
  const bytes=await page.evaluate(async()=>Array.from(await EOLocalSession.controller.serialize()));await fs.writeFile(path.join(root,'results/tagged-copy-backend.pdf'),Buffer.from(bytes));
  await fs.writeFile(path.join(root,'results/tagged.json'),JSON.stringify({initial,reason,explanation,wheel,zoom,zoomed,copyBytes:bytes.length,nativeSavePanel:'unverified',nativeWheel:'CG post permission unavailable'},null,2));await page.screenshot({path:path.join(root,'results/tagged.png')});
 });
 await run('preserved',path.join(root,'fixtures/public-forms.pdf'),async(env,file)=>{
  const page=env.page;assert(await page.evaluate(()=>EOLocalSession.controller.canSave()));
  await step(env,()=>page.evaluate(()=>{const s=EOLocalSession,c=new s.win.Asc.asc_CCommentDataWord(null);c.asc_putText('Public narrow-fix annotation');c.asc_putUserName('Public author');c.asc_putUserId('local');c.asc_putTime(String(Date.now()));s.api.asc_addComment(c);s.api.CheckChangedDocument();}));
  const before=await fs.readFile(file),parent=path.dirname(file);await fs.chmod(parent,0o555);
  try{await step(env,()=>page.evaluate(()=>EOLocalSession.api.asc_Save()));await page.waitForFunction(()=>window.EOLocalFailure,null,{timeout:120000});const reason=await page.evaluate(()=>window.EOLocalFailure);assert(/Accès refusé|Permission denied/.test(reason));assert.equal(digest(await fs.readFile(file)),digest(before));}
  finally{await fs.chmod(parent,0o755);}
  await step(env,()=>page.evaluate(async()=>{window.EOLocalFailure=null;await EOLocalSession.controller.save();}));assert(!await page.evaluate(()=>EOLocalSession.controller.isModified()));
  const saved=await fs.readFile(file);assert.deepEqual(saved.subarray(0,before.length),before);
  await step(env,()=>env.inspector.evaluate('process.stdout.emit("error",{code:"EPIPE"});process.stderr.emit("error",{code:"ERR_STREAM_DESTROYED"});console.error("SYNTHETIC_PRIVATE_LOG");true'));
  await step(env,()=>env.inspector.evaluate('process.emit("unhandledRejection",Error("SYNTHETIC_PRIVATE_REJECTION"));true'));
  await step(env,()=>page.evaluate(()=>eoDesktop.recoveryOptions()));const log=await fs.readFile(path.join(env.profile,'desktop-safety.log'),'utf8');assert(log.includes('console-error'));assert(!log.includes('SYNTHETIC_PRIVATE'));
  await fs.writeFile(path.join(root,'results/preserved.json'),JSON.stringify({atomicSave:true,prefixPreserved:true,permissionErrorLocalized:true,originalUnchangedOnFailure:true,pipeEventsNoFatal:true,logContentFree:true},null,2));
 });
 await run('word',path.join(root,'fixtures/public-long.docx'),async env=>{
  const page=env.page,iframe=await page.locator('#workspace iframe').boundingBox();const before=await page.evaluate(()=>{const w=EOLocalSession.api.WordControl,r=w.m_oMainContent.HtmlElement.getBoundingClientRect();return {scroll:w.m_dScrollY,x:r.x,y:r.y,width:r.width,height:r.height};});
  await step(env,async()=>{await page.mouse.move(iframe.x+before.x+before.width/2,iframe.y+before.y+Math.min(300,before.height/2));await page.mouse.wheel(0,240);await page.waitForTimeout(400);});const after=await page.evaluate(()=>EOLocalSession.api.WordControl.m_dScrollY);assert(after>before.scroll);
  await step(env,()=>page.evaluate(async()=>{EOLocalSession.api.asc_AddText('Public Office recovery case.');if(!window.RecordedRecoveryTimer)throw Error('Actual Office recovery callback not observed');await RecordedRecoveryTimer();}));
  const copies=await page.evaluate(()=>eoDesktop.recoveryList());assert(copies.some(c=>c.format==='docx'));await fs.writeFile(path.join(root,'results/word.json'),JSON.stringify({scrollBefore:before.scroll,scrollAfter:after,officeRecovery:true},null,2));
 });
 let fatalEnv;
 try{
  fatalEnv=await launch(root,exe);await fatalEnv.page.waitForFunction(()=>window.EODesktopReady,null,{timeout:120000});
  const modulePath=path.join(fatalEnv.appRoot,'Contents/Resources/app.asar/main.cjs'),helper=path.join(root,'helpers/ui.node');
  await step(fatalEnv,()=>fatalEnv.inspector.evaluate('globalThis.NativeTest=process.getBuiltinModule("module").createRequire('+JSON.stringify(modulePath)+')('+JSON.stringify(helper)+');globalThis.TestElectron=process.getBuiltinModule("module").createRequire('+JSON.stringify(modulePath)+')("electron");globalThis.FriendlyDialogs=[];globalThis.RawDialogs=0;const oldMessage=TestElectron.dialog.showMessageBox;TestElectron.dialog.showMessageBox=function(...args){FriendlyDialogs.push(args.at(-1));return oldMessage.apply(this,args);};const oldRaw=TestElectron.dialog.showErrorBox;TestElectron.dialog.showErrorBox=function(...args){RawDialogs++;return oldRaw.apply(this,args);};true'));
  await step(fatalEnv,()=>fatalEnv.inspector.evaluate('process.emit("uncaughtException",Error("SYNTHETIC_PRIVATE_FATAL"));process.emit("unhandledRejection","SYNTHETIC_PRIVATE_REJECTION");true'));
  await new Promise(resolve=>setTimeout(resolve,300));const state=await fatalEnv.inspector.evaluate('({friendly:FriendlyDialogs.length,raw:RawDialogs,message:FriendlyDialogs[0]?.message})');assert.equal(state.friendly,1);assert.equal(state.raw,0);assert(!state.message.includes('SYNTHETIC_PRIVATE'));
  const label=await fatalEnv.page.evaluate(async()=> (await eoDesktop.locale()).strings.close).catch(()=>null);
  // Fatal IPC is intentionally closed; use the already observed localized Close label.
  const titles=[label,'Fermer','Close'].filter(Boolean);let pressed=false;
  for(let n=0;n<30&&!pressed;n++){for(const title of titles){pressed=await step(fatalEnv,()=>fatalEnv.inspector.evaluate('NativeTest.pressButton('+JSON.stringify(title)+')'));if(pressed)break;}if(!pressed)await new Promise(resolve=>setTimeout(resolve,100));}
  assert(pressed,'Friendly native Close was not pressed');
  await new Promise(resolve=>fatalEnv.child.exitCode!==null?resolve():fatalEnv.child.once('exit',resolve));assert.equal(fatalEnv.child.exitCode,1);
  await fs.writeFile(path.join(root,'results/fatal.json'),JSON.stringify({...state,actualNativeClose:true,exitCode:1},null,2));rows.push({name:'fatal',pass:true});
 }finally{if(fatalEnv)await stop(fatalEnv);}
 await fs.writeFile(path.join(root,'results/package-cases.json'),JSON.stringify({rows,allRunCasesPass:true,nativeCG:'unverified',nativeSavePanel:'unverified',fatalNativeDialog:'passed'},null,2));console.log('PASS packaged narrow PDF cases; explicit native gaps retained');
})().catch(async error=>{await fs.writeFile(path.join(root,'results/package-failure.json'),JSON.stringify({message:error.message,rows},null,2));console.error(error.message);process.exitCode=1;});
