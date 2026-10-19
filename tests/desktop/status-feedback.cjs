// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const browserName=process.env.EO_BROWSER||'chromium',engine=require(process.env.EO_PLAYWRIGHT_MODULE||'playwright-core')[browserName];
assert(engine,'Select an available Playwright browser');
const product=path.resolve(__dirname,'../..'),assets=path.resolve(process.env.EO_DESKTOP_ASSETS),out=path.resolve(process.env.EO_STATUS_OUT);
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
 await new Promise(r=>server.listen(Number(process.env.EO_STATUS_HTTP_PORT)||0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;

 const bytes=[...await fs.readFile(path.join(assets,'desktop-home/blanks/en.docx'))],manifest=JSON.parse(await fs.readFile(path.join(assets,'desktop-manifest.json')));
 if(process.env.EO_BROWSER_WS_ENDPOINT)browser=await engine.connect(process.env.EO_BROWSER_WS_ENDPOINT);
 else{bs=await engine.launchServer({headless:true,chromiumSandbox:true});browser=await engine.connect(bs.wsEndpoint());}
 for(const [language,theme]of [['en','theme-white'],['ar','theme-night']])for(const dpr of [1,2]){
 const info=await require(path.join(product,'desktop/locale.cjs')).load(assets,[language]);
 const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:dpr}),page=await context.newPage(),errors=[],outside=[],row={dpr,language,theme,status:'running'};
 rows.push(row);const tag=language+'-'+theme+'-dpr'+dpr;await context.addInitScript(theme=>localStorage.setItem('ui-theme-id',theme),theme);console.log('START',tag);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
 await context.route('**/*',r=>{const u=r.request().url();if(u.startsWith(base+'/')||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();outside.push(u);return r.abort();});
 await page.addInitScript(({info,bytes,version,base})=>{
 window.PublicIPC={calls:[],mode:'cancel'};let initial=true;
 window.eoDesktop=new Proxy({}, {get(_,key){
 if(key==='onAction')return fn=>{window.PublicAction=fn;};
 if(key==='onOperationStage')return ()=>()=>{};
 return async(...args)=>{
 PublicIPC.calls.push({key,args:args.map(a=>a instanceof Uint8Array?'bytes:'+a.length:typeof a==='object'?'object':a)});
 const values={locale:info,home:{recents:[],templates:[]},fontPermission:false,fontChoice:'declined',author:'Public sample',recoveryOptions:{enabled:false,seconds:30},recoveryList:[],state:true,recoveryClear:true,aiSettings:{enabled:false},pending:null};
 if(key==='initial'&&initial){initial=false;return {token:'public-Z7',name:'Public blank.docx',format:'docx',bytes,runtime:base+'/example/local-assets/sdkjs/common/wasm-convert/runtime/'+version+'/'};}
 if(key==='save'){PublicIPC.completed='save';if(PublicIPC.mode==='cancel')throw Error('Save cancelled');if(PublicIPC.mode==='wrapped')throw Error("Error invoking remote method 'eo:save': Error: Save cancelled");if(PublicIPC.mode==='abort')throw Object.assign(Error('Conversion cancelled'),{name:'AbortError'});if(PublicIPC.mode==='permission')throw Error('EACCES: fixture denied');return {name:'Public blank.docx',recoveryVersion:1};}
 if(key==='pdf'){PublicIPC.completed='pdf';if(PublicIPC.mode==='print-error')throw Error('PDF saving cancelled');return {printed:false,reason:'cancelled'};}
 return values[key];};}});
 },{info:{...info,capture:false},bytes,version:manifest.conversion.artifact_version,base});
 try{
 await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:180000});
 console.log('OPEN resolved');row.failure=await page.evaluate(()=>window.EOLocalFailure||null);assert.equal(row.failure,null);
 const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
 await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded(),null,{timeout:60000});
 row.geometry=await frame.evaluate(()=>{const box=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,margin:c.margin,transform:c.transform};};return {dpr:devicePixelRatio,body:document.body.className,outer:box('#status-zoom-slider'),slider:box('#status-zoom-slider .slider'),track:box('#status-zoom-slider .track'),thumb:box('#status-zoom-slider .thumb'),plus:box('#btn-zoom-up'),minus:box('#btn-zoom-down')};});
 await page.screenshot({path:path.join(out,'editor-'+tag+'.png')});
 row.controls=await frame.evaluate(()=>{
 const c=DE.getController('Statusbar'),slider=c.zoomSlider;
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right};};
 const endpoints=[];
 for(const value of [0,100]){slider.setValue(value);endpoints.push({value,thumb:box(slider.thumb[0]),track:box(slider.track[0]),outer:box(document.querySelector('#status-zoom-slider'))});}
 slider.setValue(50);return {endpoints,zoomBefore:parseInt(document.querySelector('#label-zoom').textContent,10)};
 });
 await frame.locator('#btn-zoom-up').click();await page.waitForTimeout(100);
 row.controls.zoomAfterPlus=await frame.evaluate(()=>parseInt(document.querySelector('#label-zoom').textContent,10));
 await frame.locator('#btn-zoom-down').click();await page.waitForTimeout(100);
 row.controls.zoomAfterMinus=await frame.evaluate(()=>parseInt(document.querySelector('#label-zoom').textContent,10));
 row.controls.pointerEndpoints=[];
 const isRTL=await frame.evaluate(()=>document.body.classList.contains('rtl'));
 for(const side of ['left','right']){
  await frame.evaluate(()=>DE.getController('Statusbar').zoomSlider.setValue(50));
  const thumb=await frame.locator('#status-zoom-slider .thumb').boundingBox(),outer=await frame.locator('#status-zoom-slider').boundingBox();
  await page.mouse.move(thumb.x+thumb.width/2,thumb.y+thumb.height/2);await page.mouse.down();
  await page.mouse.move(side==='left'?outer.x-2:outer.x+outer.width+2,thumb.y+thumb.height/2,{steps:8});await page.mouse.up();await page.waitForTimeout(150);
  row.controls.pointerEndpoints.push({side,expected:(side==='left')!==isRTL?10:500,actual:await frame.evaluate(()=>parseInt(document.querySelector('#label-zoom').textContent,10))});
 }
 await frame.evaluate(()=>DE.getController('Statusbar').api.zoom(100));
 await page.mouse.click(683,450);await page.waitForTimeout(600);
 await frame.locator('#btn-zoom-up').hover();await page.waitForTimeout(2500);
 row.controls.tooltipsShown=await frame.locator('.tooltip:visible').count();
 await page.mouse.move(683,450);await page.waitForTimeout(600);
 row.controls.tooltipsAfterLeave=await frame.locator('.tooltip:visible').count();
 row.feedback=[];
 for(const [action,mode]of [['save','cancel'],['save','wrapped'],['save','abort'],['save','permission'],['save','cancel'],['print','cancel'],['print','print-error']]){
  await page.evaluate(({action,mode})=>{delete PublicIPC.completed;PublicIPC.mode=mode;PublicAction(action);},{action,mode});
  await page.waitForFunction(action=>PublicIPC.completed===(action==='print'?'pdf':'save'),action,{timeout:120000});
  await page.waitForTimeout(400);
  const observed=await page.locator('#message').evaluate(e=>({text:e.textContent,hidden:e.hidden}));
  row.feedback.push({action,mode,...observed});
  await page.screenshot({path:path.join(out,[action,mode,tag].join('-')+'.png')});
 }
 await page.waitForTimeout(2500);row.afterDelay=await page.locator('#message').evaluate(e=>({text:e.textContent,hidden:e.hidden}));
 // Existing optional-font warnings must survive cancellation cleanup.
 await frame.evaluate(()=>{EOComputerFontWarning='Public existing font warning';});
 await page.evaluate(()=>{delete PublicIPC.completed;PublicIPC.mode='cancel';PublicAction('save');});
 await page.waitForFunction(()=>PublicIPC.completed==='save');await page.waitForTimeout(400);
 row.warning=await page.locator('#message').evaluate(e=>({text:e.textContent,hidden:e.hidden}));
 await frame.evaluate(()=>{EOComputerFontWarning=null;});
 row.checks={
  pointerDragEndpoints:row.controls.pointerEndpoints.every(x=>x.actual===x.expected),
  endpointThumbsInside:row.controls.endpoints.every(e=>e.thumb.x>=e.outer.x-0.1&&e.thumb.right<=e.outer.right+0.1),
  zoomButtonsWork:row.controls.zoomAfterPlus>row.controls.zoomBefore&&row.controls.zoomAfterMinus===row.controls.zoomBefore,
  realTooltipsWork:row.controls.tooltipsShown>0&&row.controls.tooltipsAfterLeave===0,
  fontWarningPreserved:!row.warning.hidden&&row.warning.text==='Public existing font warning',
  trackInsideWrapper:row.geometry.track.x>=row.geometry.outer.x-0.1&&row.geometry.track.right<=row.geometry.outer.right+0.1,
  trackClearOfPlus:row.geometry.track.right<row.geometry.plus.x||row.geometry.track.x>row.geometry.plus.right,
  noCancellationMessage:row.feedback.filter(x=>x.mode!=='permission').every(x=>x.hidden&&x.text===''),
  permissionErrorVisible:row.feedback.filter(x=>x.mode==='permission').every(x=>!x.hidden&&x.text===info.strings.savePermission),
  noLateCancellationMessage:row.afterDelay.hidden&&row.afterDelay.text===''
 };
 row.calls=await page.evaluate(()=>PublicIPC.calls);row.status='observed';
 }catch(e){row.status='failed-setup-or-behavior';row.error=e.stack;await page.screenshot({path:path.join(out,'failure-'+tag+'.png')}).catch(()=>{});}
 finally{row.errors=errors;row.outside=outside;await context.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Actual current desktop renderer, production Word UI/SDK and public Wasm input; native IPC is explicit fixture, no native dialog/Arch/niri acceptance',driverSha256,sourceInputs,runtime:{browser:browserName,version:browser.version(),transport:'launchServer/connect'},rows,missing,served},null,2));}
 }
 assert.equal(sha(await fs.readFile(__filename)),driverSha256,'Driver unchanged throughout run');
 for(const [f,h]of Object.entries(sourceInputs))assert.equal(sha(await fs.readFile(path.join(product,f))),h,'Source input unchanged: '+f);
 for(const [f,h]of Object.entries(served))assert.equal(sha(await fs.readFile(f)),h,'Served input unchanged: '+f);
 await fs.writeFile(path.join(out,'input-guards.json'),JSON.stringify({driverSha256,sourceInputs,servedCount:Object.keys(served).length,unchanged:true},null,2)+'\n');
 console.log(JSON.stringify(rows));assert(rows.every(r=>r.status==='observed'&&Object.values(r.checks).every(Boolean)&&!r.errors.length&&!r.outside.length),'Every cancellation and zoom geometry check must pass');assert.deepEqual(missing,[],'All requested local assets load');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{try{await browser?.close()}finally{await bs?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}});
