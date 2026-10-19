// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const browserName=process.env.EO_BROWSER||'firefox',engine=require(process.env.EO_PLAYWRIGHT_MODULE||'playwright-core')[browserName];
assert(engine,'Select an available Playwright browser');
const product=path.resolve(process.env.EO_PRODUCT_ROOT||path.join(__dirname,'../..')),assets=path.resolve(process.env.EO_DESKTOP_ASSETS),out=path.resolve(process.env.EO_FORMULA_OUT);
// Real renderer/editor/Wasm; only the native IPC boundary uses public fixtures.
// This does not exercise native panels, compositor scaling or OS focus changes.
const resource=require(path.join(product,'desktop/resources.cjs')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let server,bs,browser;
(async()=>{
 await fs.mkdir(out);const driver=await fs.readFile(__filename),driverSha256=sha(driver);await fs.writeFile(path.join(out,'executed-driver.cjs'),driver);
 const sourceInputs={};for(const f of ['desktop/renderer.js','desktop/resources.cjs','desktop/errors.js'])sourceInputs[f]=sha(await fs.readFile(path.join(product,f)));
 const served={},missing=[],rows=[];
 server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const file=u.pathname.startsWith('/example/local-assets/')?path.join(assets,u.pathname.slice(22)):path.join(product,'desktop',u.pathname.slice(1));if(await fs.stat(file).then(s=>s.isFile(),()=>false))served[file]=sha(await fs.readFile(file));
 const r=await resource.response(new Request(resource.ORIGIN+u.pathname+u.search,{method:req.method,headers:req.headers}),assets,path.join(product,'desktop'));
 if(r.status>=400)missing.push({path:u.pathname,status:r.status});
 res.writeHead(r.status,Object.fromEntries(r.headers));if(r.body)for await(const b of r.body)res.write(b);res.end();
 }catch(e){missing.push({path:req.url,error:e.message});res.writeHead(500);res.end();}});
 await new Promise(r=>server.listen(Number(process.env.EO_FORMULA_HTTP_PORT)||0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;

 const bytes=[...await fs.readFile(process.env.EO_FORMULA_FIXTURE||path.join(assets,'templates/new.xlsx'))],manifest=JSON.parse(await fs.readFile(path.join(assets,'desktop-manifest.json')));
 if(process.env.EO_BROWSER_WS_ENDPOINT)browser=await engine.connect(process.env.EO_BROWSER_WS_ENDPOINT);
 else{bs=await engine.launchServer({headless:true,chromiumSandbox:true});browser=await engine.connect(bs.wsEndpoint());}
 const profiles=JSON.parse(process.env.EO_FORMULA_PROFILES||'[["en","theme-white"],["fr","theme-white"],["de","theme-night"],["ar","theme-night"]]');
 const dprs=JSON.parse(process.env.EO_FORMULA_DPRS||'[1,2]');
 assert(Array.isArray(profiles)&&profiles.length>0&&profiles.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='string'&&p[0].length>0&&['theme-white','theme-night'].includes(p[1])),'Select nonempty valid language/theme profiles');
 assert(new Set(profiles.map(p=>p.join('/'))).size===profiles.length,'Profiles must be unique');
 assert(Array.isArray(dprs)&&dprs.length>0&&dprs.every(d=>Number.isFinite(d)&&d>0&&d<=4)&&new Set(dprs).size===dprs.length,'Select nonempty unique positive DPRs');
 const expectedRows=profiles.length*dprs.length;
 for(const [language,theme]of profiles)for(const dpr of dprs){
 const info=await require(path.join(product,'desktop/locale.cjs')).load(assets,[language]);
 const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:dpr}),page=await context.newPage(),errors=[],outside=[],row={dpr,language,theme,status:'running'};
 rows.push(row);const tag=language+'-'+theme+'-dpr'+dpr;await context.addInitScript(theme=>localStorage.setItem('ui-theme-id',theme),theme);console.log('START',tag);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
 await context.route('**/*',r=>{const u=r.request().url();if(u.startsWith(base+'/')||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();outside.push(u);return r.abort();});
 await page.addInitScript(({info,bytes,version,base})=>{
 window.PublicIPC={calls:[]};let initial=true;
 window.eoDesktop=new Proxy({}, {get(_,key){
 if(key==='onAction')return fn=>{window.PublicAction=fn;};
 if(key==='onOperationStage')return ()=>()=>{};
 return async(...args)=>{
 PublicIPC.calls.push({key,args:args.map(a=>a instanceof Uint8Array?'bytes:'+a.length:typeof a==='object'?'object':a)});
 const values={locale:info,home:{recents:[],templates:[]},fontPermission:false,fontChoice:'declined',author:'Public sample',recoveryOptions:{enabled:false,seconds:30},recoveryList:[],state:true,recoveryClear:true,aiSettings:{enabled:false},pending:null};
 if(key==='initial'&&initial){initial=false;return {token:'public-Z9',name:'Public blank.xlsx',format:'xlsx',bytes,runtime:base+'/example/local-assets/sdkjs/common/wasm-convert/runtime/'+version+'/'};}
 return values[key];};}});
 },{info:{...info,capture:false},bytes,version:manifest.conversion.artifact_version,base});
 try{
 await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:180000});
 console.log('OPEN resolved');row.failure=await page.evaluate(()=>window.EOLocalFailure||null);assert.equal(row.failure,null);
 const frame=page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/'));assert(frame);
 await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded(),null,{timeout:60000});




 row.checks={};row.trace=[];row.rapid=[];
 await frame.waitForFunction(()=>SSE.getController('Main')._isDocReady===true,null,{timeout:60000});
 await page.waitForTimeout(700);
 const mod=await frame.evaluate(()=>Common.Utils.isMac?'Meta':'Control');
 await frame.evaluate(()=>{
  window.PublicFocus=[];window.PublicWizardShows=[];window.PublicWizardCloses=[];window.PublicFormulaChoiceShows=[];window.PublicWizardClicks=[];window.PublicWizardNodeIds=new WeakMap();
  document.addEventListener('focusin',e=>PublicFocus.push({at:performance.now(),id:e.target.id,tag:e.target.tagName,result:e.target.getAttribute('result'),inWindow:!!e.target.closest('.asc-window')}),true);
  document.addEventListener('click',e=>{const b=e.target.closest('.dlg-btn');if(b?.closest('.asc-window')?.querySelector('#formula-wizard-panel-args'))PublicWizardClicks.push({at:performance.now(),cid:PublicWizardNodeIds.get(b.closest('.asc-window')),result:b.getAttribute('result')});},true);
  Common.NotificationCenter.on('window:show',w=>{
   if(w.$window?.find('#formula-wizard-panel-args').length){PublicWizardNodeIds.set(w.$window[0],w.cid);PublicWizardShows.push({at:performance.now(),cid:w.cid});w.once('close',()=>PublicWizardCloses.push({at:performance.now(),cid:w.cid}));}
   if(w.$window?.find('#formula-dlg-search').length)PublicFormulaChoiceShows.push({at:performance.now(),cid:w.cid});
  });
 });
 const wizard=()=>frame.locator('.asc-window:visible').filter({has:frame.locator('#formula-wizard-panel-args')});
 const choice=()=>frame.locator('.asc-window:visible').filter({has:frame.locator('#formula-dlg-search')});
 const state=async step=>{
  const f=await frame.evaluate(()=>{
   const a=document.activeElement,w=[...document.querySelectorAll('.asc-window')].filter(x=>x.offsetWidth&&x.offsetHeight),s=getComputedStyle(a);
   return {at:performance.now(),id:a.id,tag:a.tagName,result:a.getAttribute('result'),inside:w.some(x=>x.contains(a)),wizardInside:w.some(x=>x.querySelector('#formula-wizard-panel-args')&&x.contains(a)),visibleWindows:w.length,
    name:document.querySelector('#ce-cell-name')?.value,formula:document.querySelector('#ce-cell-content')?.value,sdkText:Asc.editor.asc_getCellInfo().asc_getText(),text:Asc.editor.wbModel.getWorksheet(0).getRange2(document.querySelector('#ce-cell-name').value).getValue(),cellEdited:Asc.editor.wb.getCellEditMode(),canUndo:Asc.editor.asc_getCanUndo(),history:{index:AscCommon.History.Index,points:AscCommon.History.Points.length},
    cue:{visible:a.matches(':focus-visible'),outline:s.outline,shadow:s.boxShadow,border:s.borderColor},lastWizardShow:PublicWizardShows.at(-1),lastWizardClose:PublicWizardCloses.at(-1),wizardShowCount:PublicWizardShows.length,lastWizardClick:PublicWizardClicks.at(-1),lastFormulaChoiceShow:PublicFormulaChoiceShows.at(-1)};
  });row.trace.push({step,...f});console.log('STATE',step,JSON.stringify({id:f.id,tag:f.tag,result:f.result,text:f.text}));return f;
 };
 const key=async(k,ms=120)=>{await page.keyboard.press(k);if(ms)await page.waitForTimeout(ms);};
 const cell=async name=>{await frame.locator('#ce-cell-name').fill(name);await frame.locator('#ce-cell-name').press('Enter');await page.waitForTimeout(100);};
 const openNew=async(name,keyboard=false,rapid=false)=>{
  if(keyboard)await page.keyboard.press('Shift+F3');else await frame.locator('#ce-func-label').click();
  await choice().waitFor();const localized=await frame.evaluate(n=>Asc.editor.asc_getFormulaLocaleName(n),name);
  await frame.locator('#formula-dlg-search input').fill(localized);
  // Prepare the event marker before confirmation, outside the measured timer interval.
  const marker=rapid?await frame.evaluate(()=>({count:PublicWizardShows.length,cid:PublicWizardShows.at(-1)?.cid})):null;
  if(keyboard||rapid)await frame.locator('#formula-dlg-search input').press('Enter');else await frame.locator('#formula-dlg-btn-ok').click();
  if(rapid)return marker;
  await wizard().waitFor();return localized;
 };
 const named=async()=>wizard().evaluate(el=>({role:el.getAttribute('role'),name:el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim(),direction:getComputedStyle(el).direction}));
 // Stable ordinary baseline/control: a repeated-argument formula keeps its input route.
 await cell('A2');await page.keyboard.type('3');await key('Enter');await cell('A1');
 row.sumName=await openNew('SUM');await page.waitForTimeout(1100);
 const sumStart=await state('SUM initial');row.sumNameAX=await named();
 row.checks.argumentInitial=sumStart.id.endsWith('-0')&&sumStart.wizardInside;
 row.checks.namedDialog=row.sumNameAX.role==='dialog'&&!!row.sumNameAX.name;
 const first=()=>frame.locator('#formula-wizard-txt-arg0 input'),second=()=>frame.locator('#formula-wizard-txt-arg1 input');
 await first().fill('2');await first().press('Tab');await page.waitForTimeout(150);
 await second().fill('A2');await second().press('Tab');await page.waitForTimeout(150);
 row.checks.repeatedArguments=await wizard().locator('#formula-wizard-tbl-args input').count()>=3;
 // Actual range picker accept/cancel must return to argument2, retaining values.
 await frame.locator('#formula-wizard-txt-arg1 .select-button button').click();
 const range=()=>frame.locator('.asc-window:visible').filter({has:frame.locator('#id-dlg-cell-range')});
 await range().waitFor();await range().locator('input').fill('A2');await range().locator('.dlg-btn[result=ok]').click();
 await wizard().waitFor();await page.waitForTimeout(300);
 row.rangeAccept=await state('range accept returns argument2');
 row.checks.rangeAccept=row.rangeAccept.id.endsWith('-1')&&await first().inputValue()==='2'&&(await second().inputValue()).includes('A2');
 await frame.locator('#formula-wizard-txt-arg1 .select-button button').click();await range().waitFor();await range().locator('input').fill('B9');await range().locator('.dlg-btn[result=cancel]').click();
 await wizard().waitFor();await page.waitForTimeout(300);
 row.rangeCancel=await state('range cancel returns argument2');
 row.checks.rangeCancel=row.rangeCancel.id.endsWith('-1')&&await first().inputValue()==='2'&&(await second().inputValue()).includes('A2');
 await wizard().locator('.dlg-btn[result=ok]').click();await page.waitForTimeout(250);await cell('A1');
 row.sumAccepted=await state('SUM accepted');row.checks.sumResult=String(row.sumAccepted.text)==='5'&&row.sumAccepted.formula.includes(row.sumName);
 await key(mod+'+z',250);await cell('A1');row.sumUndone=await state('SUM Undo');
 await key(mod==='Meta'?'Meta+Shift+z':'Control+y',250);await cell('A1');row.sumRedone=await state('SUM Redo');
 row.checks.undoRedo=row.sumUndone.text===''&&String(row.sumRedone.text)==='5';
 await frame.locator('#ce-func-label').click();await wizard().waitFor();await page.waitForTimeout(250);
 await first().fill('99');await wizard().locator('.dlg-btn[result=cancel]').click();await page.waitForTimeout(200);await cell('A1');
 row.cancelledEdit=await state('SUM modified argument cancelled');row.checks.editCancel=String(row.cancelledEdit.text)==='5'&&row.cancelledEdit.formula===row.sumAccepted.formula;
 // Valid zero-argument function, entered entirely through ordinary controls.
 await cell('B1');row.nowName=await openNew('NOW',true);await page.waitForTimeout(1100);
 const nowStart=await state('NOW initial');row.nowNameAX=await named();row.nowAria=await wizard().ariaSnapshot();
 row.checks.zeroArgumentInitial=nowStart.wizardInside&&nowStart.result==='ok'&&await wizard().locator('input').count()===0;
 row.checks.zeroArgumentNamed=row.nowNameAX.role==='dialog'&&!!row.nowNameAX.name;
 row.focusCue=nowStart.cue;await page.screenshot({path:path.join(out,'zeroarg-'+tag+'.png')});
 row.zeroTabs=[];for(const [i,k]of ['Tab','Tab','Shift+Tab','Shift+Tab'].entries()){await key(k);row.zeroTabs.push(await state('NOW '+k));if(i===0)row.primaryBlurredCue=await wizard().locator('.dlg-btn[result=ok]').evaluate(el=>({shadow:getComputedStyle(el).boxShadow}));}
 row.checks.zeroArgumentFocusCue=nowStart.wizardInside&&nowStart.result==='ok'&&nowStart.cue.shadow!=='none'&&/[1-9]\d*(?:\.\d+)?px/.test(nowStart.cue.shadow)&&nowStart.cue.shadow!==row.primaryBlurredCue.shadow;
 row.checks.zeroArgumentCycle=row.zeroTabs.every(x=>x.wizardInside)&&row.zeroTabs.map(x=>x.result).join(',')==='cancel,ok,cancel,ok';
 // Enter on the initial/returned primary button accepts the actual function.
 await key('Enter',250);await cell('B1');row.nowAccepted=await state('NOW Enter accepted');
 row.checks.zeroArgumentAccept=String(row.nowAccepted.text).length>0&&Number.isFinite(Number(row.nowAccepted.text))&&Number(row.nowAccepted.text)>0&&row.nowAccepted.formula.includes(row.nowName);
 await key(mod+'+z',200);await cell('B1');row.nowUndone=await state('NOW Undo');// release review: baseline NOW contributes two history points; retain the original wrong oracle in checks.md.
 await key(mod+'+z',200);await cell('B1');row.nowUndo2=await state('NOW second Undo');
 await key(mod==='Meta'?'Meta+Shift+z':'Control+y',200);await cell('B1');row.nowRedo1=await state('NOW first Redo');
 await key(mod==='Meta'?'Meta+Shift+z':'Control+y',200);await cell('B1');row.nowRedo2=await state('NOW second Redo');
 const hasNow=x=>String(x.text).length>0&&Number.isFinite(Number(x.text))&&Number(x.text)>0&&x.formula===row.nowAccepted.formula;
 row.checks.zeroArgumentUndoRedo=[row.nowAccepted,row.nowUndone,row.nowUndo2,row.nowRedo1,row.nowRedo2].map(x=>x.history.index).join(',')==='3,2,1,2,3'&&hasNow(row.nowUndone)&&row.nowUndo2.text===''&&hasNow(row.nowRedo1)&&hasNow(row.nowRedo2);
 await cell('F1');row.reopens=[];for(let i=0;i<3;i++){await openNew('NOW');await page.waitForTimeout(250);row.reopens.push(await state('NOW reopen '+i));await key('Escape',200);}
 row.checks.repeatedZeroArgumentFocus=row.reopens.every(x=>x.wizardInside&&x.result==='ok');
 // Exercise the existing shared100ms focus timer after ordinary rapid closure.
 for(const [kind,address,text]of [['Escape','C1','Z9 rapid escape'],['Cancel','D1','Z9 rapid cancel']]){
  await cell(address);const marker=await openNew('NOW',false,true);
  if(kind==='Escape')await page.keyboard.press('Escape');
  else{const r=await wizard().locator('.dlg-btn[result=cancel]').boundingBox();assert(r,'Current animated Cancel target');await page.mouse.click(r.x+r.width/2,r.y+r.height/2);}
  const closed=await state('rapid '+kind+' closed');await page.keyboard.type(text);await page.waitForTimeout(350);await key('Enter',120);await cell(address);
  const typed=await state('rapid '+kind+' grid typed');row.rapid.push({kind,marker,showToCloseMs:closed.lastWizardClose?.at-closed.lastWizardShow.at,closed,typed});
 }
 row.checks.rapidEscapeCancel=row.rapid.every(x=>x.closed.wizardShowCount===x.marker.count+1&&x.closed.lastWizardShow.cid!==x.marker.cid&&x.showToCloseMs>=0&&x.showToCloseMs<100&&(x.kind!=='Cancel'||x.closed.lastWizardClick?.result==='cancel'&&x.closed.lastWizardClick?.cid===x.closed.lastWizardShow.cid&&x.closed.lastWizardClick.at>=x.closed.lastWizardShow.at&&x.closed.lastWizardClick.at<=x.closed.lastWizardClose.at)&&x.closed.lastWizardClose?.cid===x.closed.lastWizardShow.cid&&x.closed.visibleWindows===0&&x.typed.text===(x.kind==='Escape'?'Z9 rapid escape':'Z9 rapid cancel'));
 await cell('E1');const otherMarker=await openNew('NOW',false,true);
 await page.keyboard.press('Escape');await page.keyboard.press('Shift+F3');await choice().waitFor();const otherOpen=await state('rapid other dialog opened');
 await page.waitForTimeout(350);row.otherSettled=await state('other dialog settled');
 row.checks.rapidOtherDialog=otherOpen.wizardShowCount===otherMarker.count+1&&otherOpen.lastWizardShow.cid!==otherMarker.cid&&otherOpen.lastWizardClose?.cid===otherOpen.lastWizardShow.cid&&otherOpen.lastFormulaChoiceShow.at-otherOpen.lastWizardShow.at>=0&&otherOpen.lastFormulaChoiceShow.at-otherOpen.lastWizardShow.at<100&&await choice().evaluate(el=>el.contains(document.activeElement))&&await frame.locator('#formula-dlg-search input').evaluate(el=>el===document.activeElement);
 row.otherTiming={marker:otherMarker,showToOtherMs:otherOpen.lastFormulaChoiceShow.at-otherOpen.lastWizardShow.at};await key('Escape',200);await page.keyboard.type('Z9 final grid');await key('Enter',200);await cell('E1');
 row.finalGrid=await state('final grid typing');row.checks.finalGridTyping=row.finalGrid.text==='Z9 final grid'&&row.finalGrid.visibleWindows===0;
 row.focusEvents=await frame.evaluate(()=>PublicFocus);row.status='observed';
 }catch(e){row.status='failed-setup-or-behavior';row.error=e.stack;await page.screenshot({path:path.join(out,'failure-'+tag+'.png')}).catch(()=>{});console.error(row.error);}
 finally{row.errors=errors;row.outside=outside;await context.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Actual desktop renderer/current production Spreadsheet/SDKcell/Wasm; ordinary fx or ShiftF3, localized search and controls, public blank workbook; native IPC fixture only, native/AT/hosted unqualified',driverSha256,sourceInputs,profiles,dprs,expectedRows,runtime:{browser:browserName,version:browser.version(),transport:'launchServer/connect'},rows,missing,served},null,2)+'\n');}
 }
 assert.equal(sha(await fs.readFile(__filename)),driverSha256,'Executed driver unchanged');
 for(const [f,x]of Object.entries(sourceInputs))assert.equal(sha(await fs.readFile(path.join(product,f))),x,'Product input unchanged: '+f);
 for(const [f,x]of Object.entries(served))assert.equal(sha(await fs.readFile(f)),x,'Served input unchanged: '+f);
 await fs.writeFile(path.join(out,'input-guards.json'),JSON.stringify({driverSha256,sourceInputs,servedCount:Object.keys(served).length,unchanged:true},null,2)+'\n');
 console.log(JSON.stringify(rows.map(r=>({language:r.language,dpr:r.dpr,status:r.status,checks:r.checks,rapid:r.rapid?.map(x=>({kind:x.kind,ms:x.showToCloseMs})),otherTiming:r.otherTiming,error:r.error}))));
 assert.equal(rows.length,expectedRows,'Every requested profile/DPR must produce a row');
 assert(rows.every(r=>r.status==='observed'&&Object.values(r.checks).every(Boolean)&&!r.errors.length&&!r.outside.length),'Every ordinary formula lifecycle/focus check must pass');assert.deepEqual(missing,[],'All local assets load');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{try{await browser?.close();}finally{await bs?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}});
