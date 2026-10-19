// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const product=path.resolve(process.env.EO_PRODUCT_ROOT||path.resolve(__dirname,'../..')),assets=path.resolve(process.env.EO_DESKTOP_ASSETS),out=path.resolve(process.env.EO_OPTIONS_OUT);
const browserName=process.env.EO_BROWSER||'firefox',engine=require(process.env.EO_PLAYWRIGHT_MODULE)[browserName],resource=require(path.join(product,'desktop/resources.cjs')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const profiles=JSON.parse(process.env.EO_OPTIONS_PROFILES||'[["en","theme-white",1]]');
assert(Array.isArray(profiles)&&profiles.length>0,'At least one browser profile is required');
for(const profile of profiles){
 assert(Array.isArray(profile)&&profile.length===3,'Each profile is [language, theme, DPR]');
 assert(['en','fr','de','ar'].includes(profile[0]),'Unsupported test language');
 assert(['theme-white','theme-dark'].includes(profile[1]),'Unsupported test theme');
 assert([1,2].includes(profile[2]),'DPR must be 1 or 2');
}
assert.equal(new Set(profiles.map(p=>JSON.stringify(p))).size,profiles.length,'Profiles must be unique');
let server,bs,browser,ownedBrowser;
(async()=>{
 await fs.mkdir(out);const driver=await fs.readFile(__filename),driverSha256=sha(driver);await fs.writeFile(path.join(out,'executed-driver.cjs'),driver);
 const sourceInputs={};for(const rel of ['desktop/renderer.js','desktop/resources.cjs','desktop/errors.js','desktop/home.js','desktop/backstage.js'])sourceInputs[rel]=sha(await fs.readFile(path.join(product,rel)));
 const served={},missing=[],rows=[];
 server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const file=u.pathname.startsWith('/example/local-assets/')?path.join(assets,u.pathname.slice(22)):path.join(product,'desktop',u.pathname.slice(1));
  if(await fs.stat(file).then(s=>s.isFile(),()=>false))served[file]=sha(await fs.readFile(file));
  const r=await resource.response(new Request(resource.ORIGIN+u.pathname+u.search,{method:req.method,headers:req.headers}),assets,path.join(product,'desktop'));
  if(r.status>=400)missing.push({path:u.pathname,status:r.status});res.writeHead(r.status,Object.fromEntries(r.headers));if(r.body)for await(const b of r.body)res.write(b);res.end();
 }catch(e){missing.push({path:req.url,error:e.message});res.writeHead(500);res.end();}});
 await new Promise(r=>server.listen(Number(process.env.EO_OPTIONS_HTTP_PORT)||0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const bytes=[...await fs.readFile(path.join(assets,'desktop-home/blanks/en.docx'))],manifest=JSON.parse(await fs.readFile(path.join(assets,'desktop-manifest.json')));
 if(process.env.EO_BROWSER_WS_ENDPOINT)browser=await engine.connect(process.env.EO_BROWSER_WS_ENDPOINT);
 else{bs=await engine.launchServer({headless:true,chromiumSandbox:true});ownedBrowser={pid:bs.process().pid,argv:bs.process().spawnargs};assert(!ownedBrowser.argv.some(a=>/^--(?:no-sandbox|disable-setuid-sandbox)(?:=|$)/.test(a)));browser=await engine.connect(bs.wsEndpoint());}

 for(const [language,theme,dpr]of profiles){
  const info=await require(path.join(product,'desktop/locale.cjs')).load(assets,[language]);
  const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:dpr}),page=await context.newPage(),errors=[],outside=[];
  const row={language,theme,dpr,status:'running',focus:[],checks:{}};rows.push(row);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500));});
  await context.route('**/*',r=>{const u=r.request().url();if(u.startsWith(base+'/')||u.startsWith('blob:')||u.startsWith('data:'))return r.continue();outside.push(u);return r.abort();});
  await page.addInitScript(({info,bytes,version,base,theme})=>{
   localStorage.setItem('ui-theme-id',theme);
   const state={author:'Public Z10 Author',recovery:{enabled:false,seconds:30}};
   window.PublicIPC={calls:[],state,gates:{},pending:{},events:[]};let initial=true;
   const active=()=>{const a=document.activeElement,d=document.querySelector('dialog[open]');return {tag:a?.tagName,id:a?.id,cls:typeof a?.className==='string'?a.className:'',inside:!!d&&d.contains(a),dialogs:document.querySelectorAll('dialog[open]').length};};
   if(window===top){
    for(const type of ['focusin','cancel','close','keydown'])document.addEventListener(type,e=>{if(type==='keydown'&&!['Escape','Tab'].includes(e.key))return;PublicIPC.events.push({type,key:e.key,shift:e.shiftKey,trusted:e.isTrusted,at:performance.now(),...active()});},true);
    new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('dialog')||n.querySelector('dialog')))))PublicIPC.events.push({type:'dialog-observed',at:performance.now(),...active()});}).observe(document,{subtree:true,childList:true});
   }
   window.eoDesktop=new Proxy({},{get(_,key){
    if(key==='onAction')return fn=>{window.PublicAction=fn;};if(key==='onOperationStage')return ()=>()=>{};
    return async(...args)=>{
     PublicIPC.calls.push({key,at:performance.now(),focus:{outer:document.activeElement?.tagName,inner:document.querySelector('iframe')?.contentDocument?.activeElement?.id},args:args.map(a=>a instanceof Uint8Array?'bytes:'+a.length:typeof a==='object'?'object':a)});
     const value=key==='author'?state.author:key==='recoveryOptions'?{...state.recovery}:undefined;
     if(PublicIPC.gates[key]){delete PublicIPC.gates[key];await new Promise(resolve=>PublicIPC.pending[key]=()=>{delete PublicIPC.pending[key];resolve();});}
     if(key==='author'||key==='recoveryOptions')return value;
     if(key==='authorSave'){state.author=String(args[0]);return state.author;}
     if(key==='recoverySettings'){state.recovery={...args[0]};return {...state.recovery};}
     if(key==='initial'&&initial){initial=false;return {token:'public-Z10',name:'Public blank.docx',format:'docx',bytes,runtime:base+'/example/local-assets/sdkjs/common/wasm-convert/runtime/'+version+'/'};}
     const values={locale:info,home:{recents:[],templates:[]},fontPermission:false,fontChoice:'declined',recoveryList:[],state:true,recoveryClear:true,aiSettings:{enabled:false},pending:null,returnHome:true,choose:null};
     return values[key];
    };
   }});
  },{info:{...info,capture:false},bytes,version:manifest.conversion.artifact_version,base,theme});
  try{
   console.log('START',language,theme,dpr);await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
   const readyFrame=async()=>{
    await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:180000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
    const f=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(f);
    await f.waitForFunction(()=>DE.getController('Main')._isDocReady===true,null,{timeout:60000});return f;
   };
   let frame=await readyFrame();
   const reloadDocument=async()=>{await page.reload({waitUntil:'domcontentloaded'});frame=await readyFrame();};
   const snap=async step=>{const s=await page.evaluate(()=>{
    const a=document.activeElement,d=document.querySelector('dialog[open]'),f=document.querySelector('iframe'),ia=f?.contentDocument?.activeElement;
    return {at:performance.now(),active:{tag:a?.tagName,id:a?.id,cls:typeof a?.className==='string'?a.className:''},inside:!!d&&d.contains(a),hasFocus:document.hasFocus(),controlIndex:d?[...d.querySelectorAll('input,select,button')].indexOf(a):-1,dialogs:document.querySelectorAll('dialog[open]').length,name:d&&document.getElementById(d.getAttribute('aria-labelledby'))?.textContent,inner:{tag:ia?.tagName,id:ia?.id,cls:typeof ia?.className==='string'?ia.className:''},controls:d?[...d.querySelectorAll('input,select,button')].map(e=>({tag:e.tagName,id:e.id,text:e.textContent,type:e.type,disabled:e.disabled})):[],state:structuredClone(PublicIPC.state)};
   });row.focus.push({step,...s});return s;};
   const open=async()=>{await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-settings').click();await page.locator('dialog[open]').waitFor({state:'visible'});};
   const settled=async()=>{await page.locator('dialog[open] button').filter({hasText:info.strings.cancel}).waitFor({state:'visible'});};
   const closed=async()=>{await page.locator('dialog').waitFor({state:'detached'});};

   // Use ordinary keyboard input and the File menu; SDK calls below only read text.
   const readText=()=>frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.Content.map(e=>e.GetText?e.GetText():'').join(''));
   await page.mouse.click(683,450);await page.waitForTimeout(200);
   row.caretPrecondition=await snap('ordinary-document-before-typing');
   await page.keyboard.type('Z10 before AFTER',{delay:100});for(let i=0;i<5;i++)await page.keyboard.press('ArrowLeft');
   row.caretBefore=await readText();assert(row.caretBefore.includes('Z10 before AFTER'),'Public text inserted by ordinary keyboard');
   await open();await settled();await page.waitForTimeout(500);
   row.caretModal=await snap('caret-Options');await page.keyboard.press('Escape');await closed();await page.waitForTimeout(150);
   await page.keyboard.type('INSERT ');await page.waitForTimeout(150);row.caretAfter=await readText();
   row.checks.ordinaryDocumentPrecondition=row.caretPrecondition.active.tag==='IFRAME'&&row.caretPrecondition.inner.id==='area_id';
   row.checks.caretAndTypingReturn=row.caretAfter.includes('Z10 before INSERT AFTER');

   // Independent fresh-document scenarios avoid cascading a known baseline focus failure.
   await reloadDocument();
   // Independently establish a noncollapsed selection by normal keyboard input.
   await page.mouse.click(683,450);await frame.waitForFunction(()=>document.hasFocus()&&document.activeElement?.id==='area_id',null,{timeout:5000});await page.waitForTimeout(200);
   row.selectionPrecondition=await snap('ordinary-document-before-selection');
   await page.keyboard.type('Z10 before SELECTION!',{delay:100});await page.keyboard.press('ArrowLeft');for(let i=0;i<9;i++)await page.keyboard.press('Shift+ArrowLeft');
   row.selectionBefore=await readText();assert.equal(row.selectionBefore.split('SELECTION').length,2,'One selection marker in the fresh public document');assert(row.selectionBefore.includes('Z10 before SELECTION!'),'Nonblank prefix and trailing punctuation established');row.selectedBefore=await frame.evaluate(()=>Asc.editor.asc_GetSelectedText(true));assert.equal(row.selectedBefore,'SELECTION','Ordinary keyboard created the noncollapsed selection');
   await open();await settled();await page.keyboard.press('Escape');await closed();await page.waitForTimeout(150);
   row.selectedAfter=await frame.evaluate(()=>Asc.editor.asc_GetSelectedText(true));row.checks.selectionPreserved=row.selectedAfter==='SELECTION';
   await page.keyboard.type('REPLACED');await page.waitForTimeout(150);row.selectionAfter=await readText();
   row.expectedSelectionAfter=row.selectionBefore.replace('SELECTION','REPLACED');
   row.checks.selectionAndTypingReturn=row.selectionAfter===row.expectedSelectionAfter&&!row.selectionAfter.includes('SELECTION');

   await reloadDocument();
   await open();const initial=await snap('ordinary-initial');await settled();await page.waitForTimeout(500);const settle=await snap('ordinary-settled');
   row.checks.ordinaryNamedModal=initial.dialogs===1&&!!initial.name;row.checks.initialModalFocus=initial.inside&&settle.inside;
   row.checks.initialRecoveryControl=initial.active.id==='recovery-enabled'&&settle.active.id==='recovery-enabled';

   row.entryTabs=[];let entry=await snap('Tab-entry-before');
   for(let i=0;i<3&&entry.controlIndex!==0;i++){await page.keyboard.press('Tab');entry=await snap('Tab-entry-'+i);row.entryTabs.push(entry);}
   assert.equal(entry.controlIndex,0,'Ordinary Tab reaches first native control before cycle comparison');
   row.nativeCycles=[];
   for(const key of ['Tab','Shift+Tab']){
    const cycleStart=await snap(key+'-cycle-start'),states=[],seen=new Set(cycleStart.controlIndex>=0?[cycleStart.controlIndex]:[]);
    for(let i=0;i<settle.controls.length+2;i++){
     await page.keyboard.press(key);const f=await snap(key+'-cycle-'+i);states.push(f);
     if(f.controlIndex>=0)seen.add(f.controlIndex);
     if(browserName==='chromium'&&f.controlIndex===0&&seen.size===settle.controls.length)break;
    }
    const boundary=states.filter(x=>!x.inside);
    const complete=seen.size===settle.controls.length;
    const chromiumCycle=cycleStart.inside&&cycleStart.hasFocus&&cycleStart.dialogs===1&&states.filter(x=>x.inside).every(x=>x.hasFocus&&x.dialogs===1)&&boundary.length===(key==='Tab'?1:0)&&boundary.every(x=>x.active.tag==='BODY'&&!x.hasFocus&&x.dialogs===1)&&states.at(-1).controlIndex===0;
    const firefoxEdge=key==='Tab'?states.slice(-2).every(x=>x.controlIndex===settle.controls.length-1):states.slice(-2).every(x=>x.active.tag==='DIALOG'&&x.controlIndex===-1);
    const firefoxTraversal=boundary.length===0&&states.every(x=>x.inside&&x.hasFocus&&x.dialogs===1)&&firefoxEdge;
    row.nativeCycles.push({key,start:cycleStart,states,seen:[...seen].sort((a,b)=>a-b),boundaryCount:boundary.length,valid:complete&&(browserName==='chromium'?chromiumCycle:firefoxTraversal)});
   }
   row.originalStrictAllStepsInside=row.nativeCycles.every(c=>c.states.every(x=>x.inside));
   row.checks.nativeTabAndBacktabCycles=row.nativeCycles.every(c=>c.valid);
   await page.screenshot({path:path.join(out,'options-'+language+'-'+dpr+'.png')});
   await page.keyboard.press('Escape');await closed();await page.waitForTimeout(300);await snap('settled-Escape');
   row.checks.settledEscape=await page.locator('dialog').count()===0;
   row.repeated=[];
   for(let i=0;i<3;i++){await open();const a=await snap('early-open-'+i);await page.keyboard.press('Escape');await closed();const b=await snap('early-Escape-'+i);row.repeated.push({a,b});}
   row.checks.repeatedEarlyEscape=row.repeated.every(x=>x.b.dialogs===0);row.checks.repeatedInitialFocus=row.repeated.every(x=>x.a.inside);
   row.checks.repeatedRecoveryControl=row.repeated.every(x=>x.a.active.id==='recovery-enabled');
   await open();await settled();const before=await page.evaluate(()=>structuredClone(PublicIPC.state));
   await page.locator('#author-name').fill('Public cancelled change');await page.locator('#recovery-enabled').check();await page.locator('#recovery-interval').selectOption('120');
   await page.locator('dialog button').filter({hasText:info.strings.cancel}).click();await closed();
   row.checks.cancelPreservesSettings=JSON.stringify(await page.evaluate(()=>PublicIPC.state))===JSON.stringify(before);
   await open();await settled();await page.locator('#author-name').fill('Public saved Z10');await page.locator('#recovery-enabled').check();await page.locator('#recovery-interval').selectOption('120');
   await page.locator('dialog').getByRole('button',{name:info.strings.save,exact:true}).click();await closed();
   const saved=await snap('saved');row.checks.savePersistsSettings=saved.state.author==='Public saved Z10'&&saved.state.recovery.enabled&&saved.state.recovery.seconds===120;
   await open();await settled();row.checks.reopenRetainsSettings=(await page.locator('#author-name').inputValue())==='Public saved Z10'&&await page.locator('#recovery-enabled').isChecked()&&(await page.locator('#recovery-interval').inputValue())==='120';
   await page.keyboard.press('Escape');await closed();
   row.pending=[];
   for(const gate of ['author','fontPermission']){
    await page.evaluate(key=>PublicIPC.gates[key]=true,gate);await open();await page.waitForFunction(key=>!!PublicIPC.pending[key],gate);
    const a=await snap('pending-'+gate);await page.keyboard.press('Escape');await closed();const b=await snap('pending-Escape-'+gate);
    await page.evaluate(key=>PublicIPC.pending[key](),gate);await page.waitForTimeout(300);const c=await snap('pending-released-'+gate);
    row.pending.push({gate,a,b,c});
   }
   row.checks.pendingDialogEscape=row.pending.every(x=>x.b.dialogs===0&&x.c.dialogs===0&&JSON.stringify(x.b.active)===JSON.stringify(x.c.active));row.checks.pendingInitialFocus=row.pending.every(x=>x.a.inside);
   row.checks.pendingRecoveryControl=row.pending.every(x=>x.a.active.id==='recovery-enabled');
   await page.evaluate(()=>PublicIPC.gates.author=true);await open();await page.waitForFunction(()=>!!PublicIPC.pending.author);
   await page.keyboard.press('Escape');await closed();await open();await settled();await page.locator('#author-name').fill('Public current dialog');
   const owner=await snap('new-dialog-before-old-release');await page.evaluate(()=>PublicIPC.pending.author());await page.waitForTimeout(300);const late=await snap('new-dialog-after-old-release');
   row.checks.oldReadCannotStealCurrentDialog=owner.inside&&late.inside&&late.active.id==='author-name'&&(await page.locator('#author-name').inputValue())==='Public current dialog'&&late.dialogs===1;
   await page.keyboard.press('Escape');await closed();
   row.backstageAfterClose=await frame.locator('#fm-btn-settings').isVisible();
   if(row.backstageAfterClose){await page.keyboard.press('Escape');await frame.locator('#fm-btn-settings').waitFor({state:'hidden'});}
   const typingBefore=await snap('ordinary-return-before-typing');await page.keyboard.type('Z10 public typing');await page.waitForTimeout(300);
   row.documentText=await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.Content.map(e=>e.GetText?e.GetText():'').join(''));
   const typingAfter=await snap('ordinary-return-after-typing');row.checks.ordinaryReturnAndTyping=row.documentText.includes('Z10 public typing');

   const arm=async mode=>page.evaluate(({mode,cancelText})=>{
    const box=document.querySelector('dialog[open]');PublicIPC.oldBox=box;PublicIPC.races=[];
    const state=phase=>{const d=document.querySelector('dialog[open]');return {phase,at:performance.now(),oldOpen:box.open,openCount:document.querySelectorAll('dialog[open]').length,newDialogShown:!!d&&d!==box,activeTag:document.activeElement.tagName,activeId:document.activeElement.id,otherOwns:!!next&&next.ownerDocument.activeElement===next,newInside:!!d&&d.contains(document.activeElement),editorAlive:!!window.EOLocalSession};};
    let next;
    if(mode==='control'){next=document.querySelector('iframe').contentDocument.querySelector('.elx-search-input');if(!next)throw Error('Actual ribbon search input missing');}
    box.addEventListener('close',e=>{
     if(e.target!==box)return;
     PublicIPC.races.push(state('capture-before-action'));
     if(mode==='control'){next.focus();PublicIPC.races.push(state('capture-focused-control'));}
     if(mode==='options')PublicAction('settings');
     if(mode==='home')PublicAction('home');
     queueMicrotask(()=>PublicIPC.races.push(state('before-product-listeners')));
    },{capture:true,once:true});
    box.addEventListener('close',e=>{if(e.target===box)PublicIPC.races.push(state('after-product-listeners'));},{once:true});
   },{mode,cancelText:info.strings.cancel});
   row.races=[];
   await open();await settled();await arm('control');
   await page.locator('dialog[open] button').filter({hasText:info.strings.cancel}).click();await closed();await page.waitForTimeout(100);
   let records=await page.evaluate(()=>PublicIPC.races);row.races.push({mode:'control',records});
   row.checks.controlPrecondition=records.some(x=>x.phase==='capture-before-action'&&!x.oldOpen&&x.openCount===0)&&records.some(x=>x.phase==='capture-focused-control'&&x.otherOwns&&x.activeTag==='IFRAME');
   await snap('queued-close-other-control');row.checks.queuedClosePreservesOtherControl=await frame.locator('.elx-search-input').evaluate(e=>e===document.activeElement);
   await snap('after-other-search-control');
   await open();await settled();await arm('options');
   await page.locator('dialog[open] button').filter({hasText:info.strings.cancel}).click();
   await page.waitForFunction(()=>document.querySelector('dialog[open]')&&document.querySelector('dialog[open]')!==PublicIPC.oldBox);
   await settled();await page.locator('#author-name').fill('Public newer Options');await page.waitForTimeout(100);
   records=await page.evaluate(()=>PublicIPC.races);row.races.push({mode:'options',records});
   row.checks.newOptionsPrecondition=records.some(x=>x.phase==='capture-before-action'&&!x.oldOpen&&x.openCount===0)&&records.some(x=>x.phase==='before-product-listeners'&&x.newDialogShown&&x.openCount===1);
   const newOwner=await snap('queued-close-new-Options');row.checks.queuedClosePreservesNewOptions=newOwner.inside&&newOwner.active.id==='author-name'&&newOwner.dialogs===1;
   await page.keyboard.press('Escape');await closed();await page.waitForTimeout(100);await snap('queued-close-chain-return');
   await page.keyboard.type('Z10 chained typing');await page.waitForTimeout(150);
   row.chainText=await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.Content.map(e=>e.GetText?e.GetText():'').join(''));
   row.checks.chainedReturnAndTyping=row.chainText.includes('Z10 chained typing');
   await open();await settled();
   await page.locator('dialog[open] button').filter({hasText:'Elixir — '+info.strings.settings}).click();
   await page.locator('dialog').waitFor({state:'detached'});await frame.locator('#elixir-ai-settings').waitFor({state:'visible'});await page.waitForTimeout(150);
   row.aiOwner=await frame.locator('#elixir-ai-settings').evaluate(e=>({inside:e.contains(document.activeElement),active:document.activeElement.id}));
   await frame.locator('#elixir-ai-model').fill('Public Z10 unsaved model');await page.waitForTimeout(100);
   row.checks.queuedClosePreservesAI=row.aiOwner.inside&&await frame.locator('#elixir-ai-model').evaluate(e=>e===document.activeElement);
   await frame.locator('#elixir-ai-settings [data-act=close]').click();await frame.locator('#elixir-ai-settings').waitFor({state:'detached'});
   await open();await settled();await arm('home');
   await page.locator('dialog[open] button').filter({hasText:info.strings.cancel}).click();await closed();
   await page.waitForFunction(()=>!window.EOLocalSession&&!document.getElementById('home').hidden);
   records=await page.evaluate(()=>PublicIPC.races);row.races.push({mode:'home',records});
   row.checks.homePrecondition=records.some(x=>x.phase==='before-product-listeners'&&!x.editorAlive);
   row.checks.queuedClosePreservesHome=(await page.locator('iframe').count())===0&&await page.locator('#home').isVisible();
   await page.evaluate(()=>PublicAction('prepare-close'));await page.evaluate(()=>PublicAction('settings'));await page.waitForTimeout(100);
   row.checks.busySettingsGuard=await page.locator('dialog').count()===0;await page.evaluate(()=>PublicAction('resume-close'));
   await page.keyboard.press('Tab');row.homeInvoker=await snap('Home-native-boundary-invoker');
   await page.evaluate(()=>PublicAction('settings'));await page.locator('dialog[open]').waitFor({state:'visible'});await settled();
   const homeOpen=await snap('Home-native-boundary-Options');row.checks.homeNativeBoundaryOptions=homeOpen.inside&&homeOpen.active.id==='recovery-enabled';
   await page.keyboard.press('Escape');await closed();await page.waitForTimeout(100);row.homeReturn=await snap('Home-native-boundary-return');
   row.checks.homeRemainsUsable=await page.locator('#home [data-new=docx]').isEnabled()&&row.homeReturn.dialogs===0&&!await page.evaluate(()=>!!window.EOLocalSession);
   row.events=await page.evaluate(()=>PublicIPC.events);row.calls=await page.evaluate(()=>PublicIPC.calls);
   row.status='observed';
  }catch(e){row.status='failed-or-unmet-precondition';row.error=e.stack;await page.screenshot({path:path.join(out,'failure-'+language+'-'+dpr+'.png')}).catch(()=>{});}
  finally{row.errors=errors;row.outside=outside;await context.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify({productRoot:product,profilePlan:profiles,oracle:'Chromium forward complete control cycle includes one browser-chrome boundary and reentry; the subsequent reverse cycle stays within controls. Firefox complete traversal clamps at last button forward and DIALOG backward. Original strict inside-only observation retained.',scope:'Ordinary File > Options on actual current desktop renderer/Word/SDK/Wasm with public stateful native IPC fixtures. Delayed reads are controlled IPC timing variants; no native OS or AT claim.',driverSha256,sourceInputs,runtime:{browser:browserName,version:browser.version(),ownedBrowser:ownedBrowser||null,externalBrowser:!!process.env.EO_BROWSER_WS_ENDPOINT},rows,served,missing},null,2));}
 }
 assert.equal(sha(await fs.readFile(__filename)),driverSha256);
 for(const [rel,h]of Object.entries(sourceInputs))assert.equal(sha(await fs.readFile(path.join(product,rel))),h);
 for(const [f,h]of Object.entries(served))assert.equal(sha(await fs.readFile(f)),h);
 await fs.writeFile(path.join(out,'input-guards.json'),JSON.stringify({driverSha256,sourceInputs,servedPaths:Object.keys(served).length,unchanged:true},null,2)+'\n');
 console.log(JSON.stringify(rows.map(r=>({language:r.language,dpr:r.dpr,status:r.status,checks:r.checks,error:r.error,errors:r.errors}))));
 assert(rows.length===profiles.length&&rows.every(r=>r.status==='observed'&&Object.values(r.checks).every(Boolean)&&!r.errors.length&&!r.outside.length),'All observed ordinary Options checks pass');assert.deepEqual(missing,[]);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 try{await browser?.close()}finally{
  await bs?.close();
  let ownedBrowserAbsent=null;
  if(ownedBrowser){try{process.kill(ownedBrowser.pid,0);ownedBrowserAbsent=false;}catch(e){if(e.code!=='ESRCH')throw e;ownedBrowserAbsent=true;}}
  await fs.writeFile(path.join(out,'browser-closed.json'),JSON.stringify({ownedBrowser:ownedBrowser||null,ownedBrowserAbsent,externalBrowser:!!process.env.EO_BROWSER_WS_ENDPOINT,clientClosed:true},null,2)+'\n');
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  assert(ownedBrowserAbsent!==false,'Owned browser process must be absent after close');
 }
});
