// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const browserName=process.env.EO_BROWSER||'chromium',engine=require(process.env.EO_PLAYWRIGHT_MODULE||'playwright-core')[browserName];
assert(engine,'Select an available Playwright browser');
const product=path.resolve(__dirname,'../..'),assets=path.resolve(process.env.EO_DESKTOP_ASSETS),out=path.resolve(process.env.EO_LAYOUT_OUT);
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
 await new Promise(r=>server.listen(Number(process.env.EO_LAYOUT_HTTP_PORT)||0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;

 const bytes=[...await fs.readFile(path.join(assets,'desktop-home/blanks/en.docx'))],manifest=JSON.parse(await fs.readFile(path.join(assets,'desktop-manifest.json')));
 if(process.env.EO_BROWSER_WS_ENDPOINT)browser=await engine.connect(process.env.EO_BROWSER_WS_ENDPOINT);
 else{bs=await engine.launchServer({headless:true,chromiumSandbox:true});browser=await engine.connect(bs.wsEndpoint());}
 const profiles=JSON.parse(process.env.EO_LAYOUT_PROFILES||'[["en","theme-white"],["fr","theme-white"],["de","theme-night"],["ar","theme-night"]]');
 for(const [language,theme]of profiles)for(const dpr of [1,2]){
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
 if(key==='initial'&&initial){initial=false;return {token:'public-Z8',name:'Public blank.docx',format:'docx',bytes,runtime:base+'/example/local-assets/sdkjs/common/wasm-convert/runtime/'+version+'/'};}
 return values[key];};}});
 },{info:{...info,capture:false},bytes,version:manifest.conversion.artifact_version,base});
 try{
 await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:180000});
 console.log('OPEN resolved');row.failure=await page.evaluate(()=>window.EOLocalFailure||null);assert.equal(row.failure,null);
 const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
 await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded(),null,{timeout:60000});


 const focus=()=>frame.evaluate(()=>{
  const a=document.activeElement,p=document.querySelector('.elx-lo-pane'),b=document.querySelector('.elx-lo-btn');
  const region=a.closest('.elx-lo-pane,.elx-lo-btn')?'layoutoptions':a.id==='area_id'?'document':a.closest('#toolbar')?'ribbon':a.closest('#statusbar')?'statusbar':a.closest('#left-panel,#left-menu,#right-menu')?'pane':'other';
  return {tag:a.tagName,id:a.id,cls:a.className,value:a.value,wrapKey:a.dataset.wrap,pane:!!p&&p.contains(a),visible:!!p&&getComputedStyle(p).display!=='none',expanded:b&&b.getAttribute('aria-expanded'),region,layout:Asc.editor.asc_GetSelectedDrawingLayout()};
 });
 const record=async step=>{const f=await focus();row.focus.push({step,...f});return f;};
 const key=async(k,delay=80)=>{await page.keyboard.press(k);await page.waitForTimeout(delay);};
 row.focus=[];row.checks={};row.noImage=[];
 await frame.waitForFunction(()=>DE.getController('Main')._isDocReady===true,null,{timeout:60000});
 await page.mouse.click(683,450);await page.waitForTimeout(1000);
 row.initialDocumentFocus=await focus();assert.equal(row.initialDocumentFocus.region,'document','No-image F6 starts from ordinary document focus');
 for(const k of ['F6','F6','F6','F6','Shift+F6','Shift+F6','Shift+F6','Shift+F6']){await key(k);row.noImage.push({key:k,...await focus()});}
 row.checks.noImageRegionsUnchanged=JSON.stringify(row.noImage.map(x=>x.region))===JSON.stringify(['statusbar','document','statusbar','document','statusbar','document','statusbar','document']);
 await frame.locator('#ins').click();
 if(language==='ar'){
  // The existing Arabic Pictures menu has empty captions/items (separate item5).
  // The ordinary bundled Icons command generates an actual PNG picture.
  await frame.locator('#slot-elx-ins-icons button').click();
  const icon=frame.locator('.elx-icons-item').first();row.insertion={method:'Insert > Icons > first bundled icon > Insert',iconTitle:await icon.getAttribute('title')};
  await icon.click();await frame.locator('.asc-window:visible .dlg-btn[result=ok]').click();
 }else{
  row.insertion={method:'Insert > Pictures > Image from file > public PNG filechooser'};
  await frame.locator('.panel[data-tab=ins] .slot-insertimage button').click();
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),frame.locator('.slot-insertimage .dropdown-menu a.menu-item:visible').first().click()]);
  await chooser.setFiles({name:'Public blue.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEgAAAAwCAYAAACynDzrAAAAZklEQVR4nO3QMRHAIADAQOQgsWLxAgp6jGT4IXvux/zW1n/j9UA9QIAAAQIUDhAgQIAAhQMECBAgQOEAAQIECFA4QIAAAQIUDhAgQIAAhQMECBAgQOEAAQIECFA4QIAAAQIUDtClA+hqfnA9gr6kAAAAAElFTkSuQmCC','base64')});
 }
 await frame.locator('.elx-lo-btn').waitFor({state:'visible',timeout:30000});
 row.checks.ordinaryImageSelected=!!(await focus()).layout;
 await page.mouse.move(683,700);await page.waitForTimeout(1200);
 row.visibleTips=await frame.locator('.elx-tip:visible,.tooltip:visible,.modal:visible,.modal-dlg:visible').count();
 row.pointer=[];
 for(let i=0;i<2;i++){
  await frame.locator('.elx-lo-btn').click();const open=await record('pointer-open-'+i);
  await page.waitForTimeout(1000);const delayed=await record('pointer-delay-'+i);
  await key('Tab');const tab=await record('pointer-tab-'+i);
  await key('Shift+Tab');const back=await record('pointer-backtab-'+i);
  await key('Escape',150);const esc=await record('pointer-escape-'+i);
  row.pointer.push({open,delayed,tab,back,esc});
 }
 row.checks.pointerFocus=row.pointer.every(x=>x.open.pane&&x.delayed.pane);
 row.checks.tabAndBacktab=row.pointer.every(x=>x.tab.pane&&x.back.pane&&x.tab.wrapKey==='square'&&x.back.wrapKey==='inline');
 row.checks.escapeDocumentReturn=row.pointer.every(x=>!x.esc.visible&&x.esc.expanded==='false'&&x.esc.region==='document');
 await key('F6');const f6=await record('F6-toggle');
 row.checks.keyboardEntry=f6.cls.includes('elx-lo-btn');
 if(row.checks.keyboardEntry){
  await key('Enter',1000);const enter=await record('Enter-open');
  await key('F6');const next=await record('F6-from-pane');
  await key('Shift+F6');const reverse=await record('ShiftF6-return-toggle');
  row.checks.bidirectionalFlyoutRegion=enter.pane&&next.region!=='layoutoptions'&&next.region!=='document'&&reverse.cls.includes('elx-lo-btn');
  await key('Escape');await key('F6');await key('Space',1000);
  row.checks.spaceOpens=(await record('Space-open')).pane;
 }else{row.checks.bidirectionalFlyoutRegion=false;row.checks.spaceOpens=false;await frame.locator('.elx-lo-btn').click();}
 if((await focus()).pane){
  await key('ArrowRight');await key('Enter',500);const square=await record('keyboard-square');
  row.checks.keyboardWrap=square.pane&&square.wrapKey==='square'&&square.layout&&!square.layout.inline&&square.layout.wrap===1;
  await key('Escape');await key(browserName==='chromium'&&process.env.EO_REAL_MAC==='1'?'Meta+z':'Control+z',500);
  row.checks.wrapUndo=(await record('wrap-undo')).layout?.inline===true;
 }else{row.checks.keyboardWrap=false;row.checks.wrapUndo=false;await key('Escape');}
 await frame.locator('.elx-lo-btn').click();await frame.locator('.elx-lo-tile[data-wrap=square]').click();await page.waitForTimeout(300);
 await frame.locator('.elx-lo-pane input[value=move]').click();await key('ArrowDown',300);const fixed=await record('radio-fix');
 await key('ArrowUp',300);const moved=await record('radio-move');
 await key('Tab');const radioTab=await record('radio-Tab');
 row.checks.radioContinuation=fixed.pane&&fixed.value==='fix'&&!fixed.layout.moveWithText&&moved.pane&&moved.value==='move'&&moved.layout.moveWithText&&radioTab.pane;
 await key('Escape');await frame.locator('.elx-lo-btn').click();await frame.locator('.elx-lo-more').click();await page.waitForTimeout(1000);
 row.advanced=await frame.locator('.asc-window:visible').evaluateAll(es=>es.map(e=>({role:e.getAttribute('role'),named:!!(e.getAttribute('aria-label')||document.getElementById(e.getAttribute('aria-labelledby'))?.textContent),focusInside:e.contains(document.activeElement)})));
 const advancedBefore=await frame.locator('.asc-window:visible').count();
 await key('F6');const advancedAfterF6=await frame.locator('.asc-window:visible').evaluateAll(es=>es.some(e=>e.contains(document.activeElement)));
 await key('Escape',300);const cancel=await record('advanced-cancel');
 row.checks.moreAndCancel=row.advanced.length===1&&row.advanced[0].role==='dialog'&&row.advanced[0].named&&row.advanced[0].focusInside&&advancedAfterF6&&advancedBefore===1&&(await frame.locator('.asc-window:visible').count())===0&&cancel.region==='document';
 await frame.locator('.elx-lo-btn').click();await frame.locator('.elx-lo-tile[data-wrap=inline]').click();await key('Escape',500);
 const rapid=await record('wrap-then-Escape');row.checks.rapidEscape=rapid.region==='document'&&!rapid.visible&&rapid.layout.inline;
 row.rapidRegions=[];
 for(const [k,wrap]of [['F6','square'],['Shift+F6','inline']]){
  await frame.locator('.elx-lo-btn').click();await frame.locator('.elx-lo-tile[data-wrap='+wrap+']').click();await key(k,500);
  row.rapidRegions.push({key:k,...await record('wrap-then-'+k)});await key('Escape');
 }
 row.checks.rapidRegionExits=row.rapidRegions.every(x=>x.key==='F6'?x.region==='statusbar':x.region==='document');
 await frame.locator('.elx-lo-btn').click();await frame.locator('.elx-lo-close').click();await page.waitForTimeout(300);
 const close=await record('close-button');row.checks.closeDocumentReturn=close.region==='document'&&!close.visible;
 await key('F6');await key('Enter');
 row.focusCue=await frame.locator('.elx-lo-tile.active').evaluate(e=>{const c=getComputedStyle(e);return {outline:c.outline,outlineStyle:c.outlineStyle,outlineWidth:c.outlineWidth,border:c.border,focused:e===document.activeElement};});
 row.checks.visibleFocusCue=row.focusCue.focused&&row.focusCue.outlineStyle!=='none'&&parseFloat(row.focusCue.outlineWidth)>0;
 await page.screenshot({path:path.join(out,'layout-'+tag+'.png')});
 await frame.locator('.elx-lo-tile[data-wrap=square]').click();
 const vb=await frame.locator('#id_viewer').boundingBox();await page.mouse.click(vb.x+vb.width*.7,vb.y+280);await page.waitForTimeout(300);
 const outsideFocus=await record('outside');await page.keyboard.type('Z8 public typing');await page.waitForTimeout(500);
 row.documentText=await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.Content.map(e=>e.GetText?e.GetText():'').join(''));
 const typed=await record('typing');
 row.checks.rapidOutsideAndTyping=!outsideFocus.visible&&!typed.visible&&typed.region==='document'&&row.documentText.includes('Z8 public typing');
 row.status='observed';
 }catch(e){row.status='failed-setup-or-behavior';row.error=e.stack;await page.screenshot({path:path.join(out,'failure-'+tag+'.png')}).catch(()=>{});}
 finally{row.errors=errors;row.outside=outside;await context.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Actual desktop renderer and production Word/SDK/Wasm; ordinary UI/filechooser public PNG. Native IPC fixture, no native OS panel or compositor claim.',driverSha256,sourceInputs,runtime:{browser:browserName,version:browser.version(),transport:'launchServer/connect'},rows,missing,served},null,2));}
 }
 assert.equal(sha(await fs.readFile(__filename)),driverSha256,'Driver unchanged');
 for(const [f,h]of Object.entries(sourceInputs))assert.equal(sha(await fs.readFile(path.join(product,f))),h,'Source unchanged: '+f);
 for(const [f,h]of Object.entries(served))assert.equal(sha(await fs.readFile(f)),h,'Served input unchanged: '+f);
 await fs.writeFile(path.join(out,'input-guards.json'),JSON.stringify({driverSha256,sourceInputs,servedCount:Object.keys(served).length,unchanged:true},null,2)+'\n');
 console.log(JSON.stringify(rows.map(r=>({language:r.language,theme:r.theme,dpr:r.dpr,status:r.status,checks:r.checks,error:r.error,errors:r.errors}))));
 assert(rows.every(r=>r.status==='observed'&&Object.values(r.checks).every(Boolean)&&!r.errors.length&&!r.outside.length),'Every ordinary layout focus/action check must pass');assert.deepEqual(missing,[],'All local assets load');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{try{await browser?.close()}finally{await bs?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}});
