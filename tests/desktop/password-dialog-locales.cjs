// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const product=path.resolve(process.env.EO_PRODUCT_ROOT),assets=path.resolve(process.env.EO_DESKTOP_ASSETS),upstream=path.resolve(process.env.EO_UPSTREAM),out=path.resolve(process.env.EO_PASSWORD_LOCALES_OUT),fixtures=path.resolve(process.env.EO_PASSWORD_PUBLIC_FIXTURES);
const profiles=JSON.parse(process.env.EO_PASSWORD_LOCALES_PROFILES||'[["docx","ar","theme-white",1]]'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const formats={docx:['documenteditor','DE'],xlsx:['spreadsheeteditor','SSE'],pptx:['presentationeditor','PE']};
for(const p of profiles)assert(Array.isArray(p)&&p.length===4&&formats[p[0]]&&['en','fr','de','ar','he','ur','fa','id'].includes(p[1])&&['theme-white','theme-dark'].includes(p[2])&&[1,2].includes(p[3]),'Invalid profile');
assert(profiles.length&&new Set(profiles.map(JSON.stringify)).size===profiles.length);
const resource=require(path.join(product,'desktop/resources.cjs')),engine=require(process.env.EO_PLAYWRIGHT_MODULE).firefox;
function pin(map,key,digest){if(Object.hasOwn(map,key))assert.equal(map[key],digest,'Repeated input/resource changed: '+key);else map[key]=digest;}
let server,bs,browser;const rows=[],missing=[],served={};let ownedBrowser;const fixtureSource={};
async function processIdentity(pid){try{const stat=await fs.readFile('/proc/'+pid+'/stat','utf8');return {pid,uid:(await fs.stat('/proc/'+pid)).uid,startTime:stat.slice(stat.lastIndexOf(')')+1).trim().split(/\s+/)[19],argv:(await fs.readFile('/proc/'+pid+'/cmdline','utf8')).split('\0').filter(Boolean)};}catch(error){if(error.code==='ENOENT')return null;throw error;}}
(async()=>{
 await fs.mkdir(out);const driver=await fs.readFile(__filename),source={};
 for(const rel of ['desktop/renderer.js','desktop/resources.cjs','desktop/errors.js','desktop/home.js','desktop/backstage.js'])source[rel]=sha(await fs.readFile(path.join(product,rel)));
 const upstreamSource={};
 for(const rel of ['apps/common/locale.js','apps/common/main/lib/controller/Protection.js','apps/common/main/lib/elixir-local/Password.js','apps/common/main/lib/view/PasswordDialog.js','apps/common/main/resources/less/elixir-chrome.less'])upstreamSource[rel]=sha(await fs.readFile(path.join(upstream,'web-apps',rel)));
 await fs.writeFile(path.join(out,'executed-driver.cjs'),driver);
 server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const file=u.pathname.startsWith('/example/local-assets/')?path.join(assets,u.pathname.slice(22)):path.join(product,'desktop',u.pathname.slice(1));
  if(await fs.stat(file).then(s=>s.isFile(),()=>false))pin(served,file,sha(await fs.readFile(file)));
  const result=await resource.response(new Request(resource.ORIGIN+u.pathname+u.search,{method:req.method,headers:req.headers}),assets,path.join(product,'desktop'));
  if(result.status>=400)missing.push({path:u.pathname,status:result.status});res.writeHead(result.status,Object.fromEntries(result.headers));if(result.body)for await(const b of result.body)res.write(b);res.end();
 }catch(error){missing.push({path:req.url,error:error.message});res.writeHead(500);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 bs=await engine.launchServer({headless:true});ownedBrowser={...await processIdentity(bs.process().pid),spawnargs:bs.process().spawnargs};assert(!ownedBrowser.argv.some(a=>/^--(?:no-sandbox|disable-setuid-sandbox)(?:=|$)/.test(a)));browser=await engine.connect(bs.wsEndpoint());
 const version=JSON.parse(await fs.readFile(path.join(assets,'desktop-manifest.json'))).conversion.artifact_version;
 for(const [format,requestedLanguage,theme,dpr]of profiles){
  const [editor,namespace]=formats[format],info=await require(path.join(product,'desktop/locale.cjs')).load(assets,[requestedLanguage]),language=info.language;
  const fixtureFile=path.join(fixtures,'Public-protected.'+format),fixtureBytes=await fs.readFile(fixtureFile),catalogRel='apps/'+editor+'/main/locale/'+language+'.json',catalogBytes=await fs.readFile(path.join(upstream,'web-apps',catalogRel));
  pin(fixtureSource,fixtureFile,sha(fixtureBytes));pin(upstreamSource,catalogRel,sha(catalogBytes));
  const bytes=[...fixtureBytes],catalog=JSON.parse(catalogBytes),prefix='Common.Views.PasswordDialog.';
  const expected=key=>catalog[prefix+key],context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:dpr}),page=await context.newPage(),errors=[],outside=[];
  const row={format,requestedLanguage,language,theme,dpr,status:'running',checks:{},observations:{},dialogs:[]};rows.push(row);
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text().slice(0,500));});
  await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base+'/')||u.startsWith('blob:')||u.startsWith('data:'))return route.continue();outside.push(u);return route.abort();});
  await page.addInitScript(({info,bytes,version,base,theme,format})=>{
   localStorage.setItem('ui-theme-id',theme);let initial=true;window.PublicPasswordIPC={calls:[],writes:0};
   window.eoDesktop=new Proxy({},{get(_,key){
    if(key==='onAction')return callback=>{window.PublicAction=callback};if(key==='onOperationStage')return ()=>()=>{};
    return async()=>{
     PublicPasswordIPC.calls.push(String(key));
     if(['save','export','pdf'].includes(key)){PublicPasswordIPC.writes++;throw Error('Unexpected write after a refused password action');}
     if(key==='initial'&&initial){initial=false;return {token:'public-password-Z13',name:'Public-protected.'+format,format,bytes,runtime:base+'/example/local-assets/sdkjs/common/wasm-convert/runtime/'+version+'/'};}
     if(key==='passwordLock')return {recoveryVersion:0};
     if(key==='saveAsInfo')return {nativeFormats:true,platform:'linux'};
     if(key==='saveAsChoose')return {ticket:'public-password-ticket',format};
     return {locale:info,home:{recents:[],templates:[]},fontPermission:false,fontConsent:false,fontChoice:'declined',recoveryOptions:{enabled:false,seconds:60},recoveryList:[],state:true,recoveryClear:true,author:'Public Author',aiSettings:{enabled:false},pending:null,returnHome:true,choose:null}[key];
    };
   }});
  },{info:{...info,capture:false},bytes,version,base,theme,format});
  try{
   console.log('START',format,requestedLanguage,theme,dpr);await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
   const handle=await page.waitForSelector('iframe[name=frameEditor]',{timeout:180000}),frame=await handle.contentFrame();
   const pwd=frame.locator('.open-dlg input[type=password]');await pwd.waitFor({timeout:180000});await pwd.fill('public-fixture-password-Z13');await frame.locator('.open-dlg button[result=ok]').click();
   await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:180000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
   await frame.waitForFunction(ns=>window[ns].getController('Main')._isDocReady===true,namespace,{timeout:60000});
   assert(await page.evaluate(()=>EOLocalSession.controller.isProtected()&&EOLocalSession.controller.isRecoveryLocked()),'Public encrypted document opened/protected');
   row.loadedLanguage=await frame.evaluate(()=>Common.Locale.getCurrentLanguage());row.checks.locale=row.loadedLanguage===language;
   const snapshot=async name=>{
    await frame.waitForFunction(()=>[...document.querySelectorAll('.asc-window')].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0).every(e=>e.classList.contains('notransform')));
    const value=await frame.evaluate(()=>{
     const windows=[...document.querySelectorAll('.asc-window')].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0),w=windows.at(-1);if(!w)return null;
     const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
     const buttons=[...w.querySelectorAll('[result]')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({result:e.getAttribute('result'),text:e.textContent.trim(),rect:rect(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
     const active=document.activeElement?.closest('[result]');
     return {text:w.textContent,title:w.querySelector('.title')?.textContent,rect:rect(w),buttons,labels:[...w.querySelectorAll('.body label')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({text:e.textContent.trim(),rect:rect(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth})),activeField:document.activeElement?.closest('#id-password-txt,#id-repeat-txt')?.id||null,activeResult:active?.getAttribute('result')||null,viewport:{width:innerWidth,height:innerHeight},rtl:document.body.classList.contains('rtl')};
    });
    assert(value,'Actual rendered dialog');row.dialogs.push({name,...value});await frame.locator('.asc-window:visible').last().screenshot({path:path.join(out,[format,requestedLanguage,theme,dpr,name].join('-')+'.png')});return value;
   };
   const fit=s=>s.rect.x>=-1&&s.rect.y>=-1&&s.rect.right<=s.viewport.width+1&&s.rect.bottom<=s.viewport.height+1&&s.buttons.every(b=>b.rect.x>=s.rect.x-1&&b.rect.right<=s.rect.right+1&&b.rect.y>=s.rect.y-1&&b.rect.bottom<=s.rect.bottom+1&&b.scrollWidth<=b.clientWidth+1)&&s.buttons.every((a,i)=>s.buttons.slice(i+1).every(b=>a.rect.right<=b.rect.x+1||b.rect.right<=a.rect.x+1||a.rect.bottom<=b.rect.y+1||b.rect.bottom<=a.rect.y+1));
   for(let i=0;i<12;i++){let closed=false;for(const tip of await frame.locator('.asc-synchronizetip .close,.asc-synchronizetip .btn-div,.asc-synchronizetip .show-link').all())if(await tip.isVisible()){await tip.click();closed=true;}if(!closed)break;}
   await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-download').click();
   await frame.locator('[result=keep]:visible').waitFor();const choice=await snapshot('choices');
   const byId=Object.fromEntries(choice.buttons.map(b=>[b.result,b.text]));row.checks.keep=byId.keep===expected('txtLocalKeepCurrentPassword');row.checks.change=byId.change===expected('txtLocalChangePassword');row.checks.remove=byId.remove===expected('txtLocalRemovePassword');row.checks.choicesFit=fit(choice);row.checks.choiceTitle=choice.title===expected('txtPassword');row.checks.choiceDescription=choice.text.includes(expected('txtDescription'));row.choiceViewValues=await frame.evaluate(()=>({title:Common.Views.PasswordDialog.prototype.txtPassword,staticTitle:Common.Views.PasswordDialog.txtPassword,loadedTitle:Common.Locale.get('txtPassword',{name:'Common.Views.PasswordDialog',default:'Password'}),description:Common.Views.PasswordDialog.prototype.txtDescription,loadedDescription:Common.Locale.get('txtDescription',{name:'Common.Views.PasswordDialog',default:'A Password is required to open this document'})}));
   await frame.locator('[result=cancel]:visible').click();await frame.locator('[result=keep]:visible').waitFor({state:'hidden'});
   row.checks.cancelProtected=await page.evaluate(()=>EOLocalSession.controller.isProtected()&&PublicPasswordIPC.writes===0);
   // Ordinary Save As > Change dialog, including translated mismatch validation.
   if(!await frame.locator('#fm-btn-download').isVisible())await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-download').click();
   await frame.locator('[result=change]:visible').click();await frame.locator('#id-password-txt input').waitFor();
   const changed=await snapshot('change-password');
   row.checks.changeTitle=changed.title===expected('txtTitle');
   row.checks.changeLabels=['txtDescription','txtPassword','txtRepeat','txtWarning'].every((key,i)=>changed.labels[i]?.text===expected(key));
   row.checks.changeFit=fit(changed)&&changed.labels.every(l=>l.rect.x>=changed.rect.x-1&&l.rect.right<=changed.rect.right+1&&l.rect.y>=changed.rect.y-1&&l.rect.bottom<=changed.rect.bottom+1&&l.scrollWidth<=l.clientWidth+1)&&changed.labels.every((a,i)=>changed.labels.slice(i+1).every(b=>a.rect.bottom<=b.rect.y+1||b.rect.bottom<=a.rect.y+1));
   row.checks.changeFocus=changed.activeField==='id-password-txt';
   await frame.locator('#id-password-txt input').fill('Public-candidate-only-A');await frame.locator('#id-repeat-txt input').fill('Public-candidate-only-B');await frame.locator('[result=ok]:visible').click();
   const badge=frame.locator('#id-repeat-txt .input-error');
   // The error icon is an absolutely positioned ::before on a zero-size span.
   // Move the real pointer onto that painted icon, using its actual CSS geometry.
   const icon=await badge.evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),p=getComputedStyle(e,'::before'),width=parseFloat(p.width),height=parseFloat(p.height),left=p.left==='auto'?r.width-parseFloat(p.right)-width:parseFloat(p.left),top=p.top==='auto'?r.height-parseFloat(p.bottom)-height:parseFloat(p.top);return {owner:{x:r.x,y:r.y,width:r.width,height:r.height},pseudo:{left:p.left,right:p.right,top:p.top,width,height},x:r.x+left+width/2,y:r.y+top+height/2,display:s.display,error:e.parentElement.classList.contains('error'),inputLengths:[...document.querySelectorAll('#id-password-txt input,#id-repeat-txt input')].map(i=>i.value.length),inputsEqual:document.querySelector('#id-password-txt input').value===document.querySelector('#id-repeat-txt input').value};});
   assert(icon.error&&icon.display!=='none'&&icon.pseudo.width>0&&icon.pseudo.height>0&&Number.isFinite(icon.x)&&Number.isFinite(icon.y),'Actual visible mismatch icon');
   row.mismatchIcon=icon;const frameElement=await frame.frameElement(),frameBounds=await frameElement.boundingBox();assert(frameBounds);await page.mouse.move(frameBounds.x+icon.x,frameBounds.y+icon.y);
   const tooltip=frame.locator('.tooltip-inner:visible');await tooltip.waitFor();
   await page.screenshot({path:path.join(out,[format,requestedLanguage,theme,dpr,'mismatch-tooltip'].join('-')+'.png')});
   row.checks.mismatchTranslated=(await tooltip.textContent())===expected('txtIncorrectPwd');
   row.checks.mismatchNoWrite=await page.evaluate(()=>EOLocalSession.controller.isProtected()&&EOLocalSession.controller.isRecoveryLocked()&&PublicPasswordIPC.writes===0);
   row.mismatch={text:await tooltip.textContent(),focusedRepeat:await frame.evaluate(()=>document.activeElement?.closest('#id-repeat-txt')?.id==='id-repeat-txt')};
   row.checks.mismatchFocus=row.mismatch.focusedRepeat;
   await frame.locator('[result=cancel]:visible').click();await frame.locator('#id-password-txt input').waitFor({state:'hidden'});
   row.checks.changeCancelProtected=await page.evaluate(()=>EOLocalSession.controller.isProtected()&&EOLocalSession.controller.isRecoveryLocked()&&PublicPasswordIPC.writes===0);
   if(!await frame.locator('#fm-btn-elx-export').isVisible())await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-elx-export').click();
   await frame.locator('[result=no]:visible').waitFor();const plain=await snapshot('plaintext-copy');
   row.checks.plaintext=plain.text.includes(expected('txtLocalPlaintextCopyWarning'));row.checks.plaintextFit=fit(plain);row.observations.plaintextInitialFocus={result:plain.activeResult,focusedNo:plain.activeResult==='no'};
   await page.keyboard.press('Enter');
   row.observations.plaintextEnter={warningVisible:await frame.locator('[result=no]:visible').isVisible(),state:await page.evaluate(()=>({protected:EOLocalSession.controller.isProtected(),locked:EOLocalSession.controller.isRecoveryLocked(),writes:PublicPasswordIPC.writes}))};
   await frame.locator('[result=no]:visible').click();await frame.locator('[result=no]:visible').waitFor({state:'hidden'});
   row.checks.plaintextRefusal=await page.evaluate(()=>EOLocalSession.controller.isProtected()&&EOLocalSession.controller.isRecoveryLocked()&&PublicPasswordIPC.writes===0);
   for(const method of ['escape','close']){
    if(!await frame.locator('#fm-btn-elx-export').isVisible())await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-elx-export').click();
    await frame.locator('[result=no]:visible').waitFor();await snapshot('plaintext-'+method);
    if(method==='escape')await page.keyboard.press('Escape');else await frame.locator('.asc-window:visible .tool.close').click();
    await frame.locator('[result=no]:visible').waitFor({state:'hidden'});
    row.checks['plaintextRefusal-'+method]=await page.evaluate(()=>EOLocalSession.controller.isProtected()&&EOLocalSession.controller.isRecoveryLocked()&&PublicPasswordIPC.writes===0);
   }
   // Exercise the real public protection API; native persistence remains simulated.
   await page.evaluate(()=>EOLocalSession.api.asc_resetPassword());await frame.locator('[result=no]:visible').waitFor();const remove=await snapshot('remove-warning');
   row.checks.removal=remove.text.includes(expected('txtLocalRemovePasswordWarning'));row.checks.removalFit=fit(remove);row.observations.removalInitialFocus={result:remove.activeResult,focusedNo:remove.activeResult==='no'};
   await page.keyboard.press('Enter');
   row.observations.removalEnter={warningVisible:await frame.locator('[result=no]:visible').isVisible(),state:await page.evaluate(()=>({protected:EOLocalSession.controller.isProtected(),locked:EOLocalSession.controller.isRecoveryLocked(),writes:PublicPasswordIPC.writes}))};
   await frame.locator('[result=no]:visible').click();await frame.locator('[result=no]:visible').waitFor({state:'hidden'});
   row.checks.removalRefusal=await page.evaluate(()=>EOLocalSession.controller.isProtected()&&EOLocalSession.controller.isRecoveryLocked()&&PublicPasswordIPC.writes===0);
   for(const method of ['escape','close']){
    await page.evaluate(()=>EOLocalSession.api.asc_resetPassword());await frame.locator('[result=no]:visible').waitFor();await snapshot('removal-'+method);
    if(method==='escape')await page.keyboard.press('Escape');else await frame.locator('.asc-window:visible .tool.close').click();
    await frame.locator('[result=no]:visible').waitFor({state:'hidden'});
    row.checks['removalRefusal-'+method]=await page.evaluate(()=>EOLocalSession.controller.isProtected()&&EOLocalSession.controller.isRecoveryLocked()&&PublicPasswordIPC.writes===0);
   }
   row.ipc=await page.evaluate(()=>({calls:PublicPasswordIPC.calls,writes:PublicPasswordIPC.writes,failure:window.EOLocalFailure||null}));row.checks.noFailure=row.ipc.failure===null;row.checks.noErrors=errors.length===0;row.checks.noOutside=outside.length===0;
   row.status=Object.values(row.checks).every(Boolean)?'pass':'fail';console.log('DONE',format,requestedLanguage,row.status,JSON.stringify(row.checks));
  }catch(error){row.status='error';row.error=String(error.stack||error);row.diagnostic=await page.evaluate(()=>({failure:window.EOLocalFailure||null,message:document.getElementById('message')?.textContent,ipc:window.PublicPasswordIPC})).catch(()=>null);await page.screenshot({path:path.join(out,[format,requestedLanguage,theme,dpr,'failure'].join('-')+'.png')}).catch(()=>{});console.error('UI ERROR',format,requestedLanguage,error.message);}
  finally{row.errors=errors;row.outside=outside;await context.close();}
 }
 for(const [rel,digest]of Object.entries(source))assert.equal(sha(await fs.readFile(path.join(product,rel))),digest);
 for(const [rel,digest]of Object.entries(upstreamSource))assert.equal(sha(await fs.readFile(path.join(upstream,'web-apps',rel))),digest);
 for(const [file,digest]of Object.entries(served))assert.equal(sha(await fs.readFile(file)),digest);
 for(const [file,digest]of Object.entries(fixtureSource))assert.equal(sha(await fs.readFile(file)),digest);
 assert.equal(sha(await fs.readFile(__filename)),sha(driver),'Executed driver unchanged');
 assert.equal(missing.length,0,'No missing resources');
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({driverSha:sha(driver),browser:await browser.version(),ownedBrowser,scope:'Actual production editor encrypted public open/FileSaveAs/PDF refusal; direct public reset API; simulated native IPC, no native filesystem/password acceptance',profiles,rows,source,upstreamSource,fixtureSource,served,missing},null,2)+'\n');
 process.exitCode=rows.some(r=>r.status!=='pass')?1:0;
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{
 const cleanup={ownedBrowser,started:new Date().toISOString()};
 try{if(browser)await browser.close();cleanup.browserClosed=true;}catch(error){cleanup.browserCloseError=error.message;process.exitCode=1;}
 try{if(bs)await bs.close();cleanup.browserServerClosed=true;}catch(error){cleanup.browserServerCloseError=error.message;process.exitCode=1;}
 try{if(server)await new Promise(resolve=>server.close(resolve));cleanup.resourceServerClosed=true;}catch(error){cleanup.resourceServerCloseError=error.message;process.exitCode=1;}
 cleanup.parentAfter=ownedBrowser?await processIdentity(ownedBrowser.pid):null;cleanup.parentAbsent=cleanup.parentAfter===null;
 if(!cleanup.parentAbsent)process.exitCode=1;
 cleanup.finished=new Date().toISOString();await fs.writeFile(path.join(out,'cleanup.json'),JSON.stringify(cleanup,null,2)+'\n');
});
