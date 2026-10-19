// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Actual hosted DocsAPI/DocService PDF, trusted browser input and observed SDK effects.
// The small wrappers record and delegate actual methods; they do not supply results.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const pw=require(process.env.EO_PLAYWRIGHT_PATH||'playwright'),engine=process.env.EO_BROWSER||'firefox',base=process.env.EO_BASE,out=path.resolve(process.env.EO_OUT),observe=process.env.EO_OBSERVE==='1',phase=process.env.EO_PHASE||'current';
assert(base&&['127.0.0.1','localhost'].includes(new URL(base).hostname),'Owned loopback hosted instance required');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let browser,browserServer;
(async()=>{
 await fs.mkdir(out);const expected=JSON.parse(await fs.readFile(process.env.EO_EXPECTED)),rows=[],driverSHA256=sha(await fs.readFile(__filename));
 const options={headless:true};if(engine==='chromium'){options.chromiumSandbox=true;options.executablePath=process.env.EO_CHROMIUM_EXECUTABLE;assert(options.executablePath)}
 browserServer=await pw[engine].launchServer(options);
 assert(!browserServer.process().spawnargs.includes('--no-sandbox'));assert(!browserServer.process().spawnargs.includes('--disable-setuid-sandbox'));
 browser=await pw[engine].connect(browserServer.wsEndpoint());
 const runtime={node:process.version,browser:browser.version(),engine,chromiumSandbox:engine==='chromium',noSandboxFlag:false};
 const save=()=>fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Actual hosted PDF DocsAPI/DocService and trusted wheel input; no local-mode/native/physical trackpad claim',observe,phase,runtime,driverSHA256,expected,rows},null,2)+'\n');
 for(const [mode,lang]of [['view','en'],['edit','fr']]){
  const row={mode,lang,checks:[],states:[],resources:{},loadedResources:{},resourceCapture:'Native browser re-fetch/hash of originally loaded immutable resource URLs; no static payload replacement',errors:[],failed:[],outside:[],websocketPaths:[]};rows.push(row);
  const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1,locale:lang}),page=await context.newPage(),pending=[];
  page.on('pageerror',e=>row.errors.push(e.message));page.on('websocket',w=>row.websocketPaths.push(new URL(w.url()).pathname));
  page.on('response',r=>{
   const u=new URL(r.url()),p=u.pathname.replace(/^\/\d+\.\d+\.\d+-[^/]+\//,'/');
   if(r.status()>=400)row.failed.push({path:p,status:r.status()});
   if(expected[p]&&r.status()===200&&!row.loadedResources[p])row.loadedResources[p]={url:r.url(),status:r.status()};
  });
  await context.route('**/*',r=>{
   const u=new URL(r.request().url());if(u.origin===new URL(base).origin||['data:','blob:'].includes(u.protocol))return r.continue();
   row.outside.push(u.origin+u.pathname);return r.abort();
  });
  let frame;
  const check=(name,ok,details)=>row.checks.push({name,pass:!!ok,details});
  try{
   await page.goto(base+'/z5-public/index.html?mode='+mode+'&lang='+lang+'&key='+encodeURIComponent('Z5-'+phase+'-'+engine+'-'+mode));
   await page.waitForFunction(()=>document.querySelector('iframe'));
   const until=Date.now()+45000;
   while(Date.now()<until){
    for(const f of page.frames())if(await f.evaluate(()=>!!window.Asc?.editor?.DocumentRenderer?.file?.pages?.length).catch(()=>false)){frame=f;break}
    if(frame)break;await page.waitForTimeout(100);
   }
   assert(frame,'Actual hosted PDF renderer initialized');
   row.hosted=await frame.evaluate(()=>({offline:Asc.editor.DocInfo.get_OfflineApp(),localSession:!!window.EOLocalSession,pages:Asc.editor.DocumentRenderer.file.pages.length,apiViewMode:Asc.editor.isViewMode,appEdit:window.PDFE?.getController('Main')?.appOptions?.isEdit,permissions:Asc.editor.DocInfo.get_Permissions?.(),pdfMode:(()=>{const m=PDFE.getController('Main');return{requested:m.editorConfig.mode,canPDFEdit:m.appOptions.canPDFEdit,canPDFAnnotate:m.appOptions.canPDFAnnotate,isPDFAnnotate:m.appOptions.isPDFAnnotate,isPDFEdit:m.appOptions.isPDFEdit,isPDFFill:m.appOptions.isPDFFill}})()}));
   assert.equal(row.hosted.offline,false);assert.equal(row.hosted.localSession,false);assert.equal(row.hosted.pages,12);
   assert.equal(row.hosted.pdfMode.requested,mode);
   for(const key of ['edit','comment','fillForms'])assert.equal(row.hosted.permissions[key],mode==='edit');
   assert.equal(row.hosted.pdfMode.canPDFEdit,mode==='edit');assert.equal(row.hosted.pdfMode.canPDFAnnotate,mode==='edit');
   assert.equal(row.hosted.pdfMode.isPDFEdit,false,'No original PDF text-editing claim');

   const resourceDeadline=Date.now()+15000;
   while(Object.keys(expected).some(p=>!row.loadedResources[p])&&Date.now()<resourceDeadline)await page.waitForTimeout(100);
   const loaded=JSON.parse(JSON.stringify(row.loadedResources));
   row.resources=await frame.evaluate(async loaded=>{
    const records={};for(const [p,r]of Object.entries(loaded)){
     const response=await fetch(r.url,{cache:'no-store'}),bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
     records[p]={sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join(''),bytes:bytes.byteLength,status:response.status,originallyLoaded:true};
    }return records;
   },loaded);
   await frame.evaluate(()=>{
    const api=Asc.editor,v=api.DocumentRenderer,t=window.Z5Trace={api:[],vertical:[],horizontal:[],wheel:[]};
    for(const name of ['zoomIn','zoomOut']){const original=api[name];api[name]=function(...args){t.api.push({name,time:Date.now()});return original.apply(this,args)}}
    for(const [axis,obj]of [['vertical',v.m_oScrollVerApi],['horizontal',v.m_oScrollHorApi]]){const original=obj.scrollBy;obj.scrollBy=function(...args){t[axis].push({args,time:Date.now()});return original.apply(this,args)}}
    document.addEventListener('wheel',e=>{const r={trusted:e.isTrusted,deltaX:e.deltaX,deltaY:e.deltaY,mode:e.deltaMode,ctrl:e.ctrlKey,meta:e.metaKey,shift:e.shiftKey,time:Date.now()};t.wheel.push(r);setTimeout(()=>r.prevented=e.defaultPrevented,0)},true);
   });
   const state=async name=>{
    await page.waitForTimeout(50);
    const s=await frame.evaluate(()=>{const v=Asc.editor.DocumentRenderer,r=v.canvasForms.getBoundingClientRect();return{scrollX:v.scrollX,scrollY:v.scrollY,zoom:v.zoom,horizontal:v.isVisibleHorScroll,width:v.width,height:v.height,legacy:typeof v.parent.onmousewheel,dpr:devicePixelRatio,visualScale:visualViewport?.scale,canvas:{x:r.x,y:r.y,width:r.width,height:r.height},trace:JSON.parse(JSON.stringify(Z5Trace))}});
    row.states.push({name,...s});await save();return s;
   };
   const point=async()=>{
    const box=await(await frame.frameElement()).boundingBox(),r=await frame.evaluate(()=>{const r=Asc.editor.DocumentRenderer.canvasForms.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}});
    assert(box&&r.width>0&&r.height>0);await page.mouse.move(box.x+r.x+Math.min(r.width/2,500),box.y+r.y+Math.min(r.height/2,250));
   };
   const shot=async name=>{await page.screenshot({path:path.join(out,engine+'-'+mode+'-'+name+'.png')})};
   await point();await page.mouse.down();await page.mouse.up();
   let keyBefore=await state('keyboard-ready');await page.keyboard.press('PageDown');await page.waitForTimeout(150);
   let keyAfter=await state('keyboard-page-down');check('trusted PageDown keeps scrolling',keyAfter.scrollY>keyBefore.scrollY,{before:keyBefore.scrollY,after:keyAfter.scrollY});
   await page.keyboard.press('PageUp');await page.waitForTimeout(150);keyBefore=await state('keyboard-page-up');
   check('trusted PageUp reverses scrolling',keyBefore.scrollY<keyAfter.scrollY,{before:keyAfter.scrollY,after:keyBefore.scrollY});
   let a=await state('ready');await shot('ready');await point();await page.mouse.wheel(0,240);await page.waitForTimeout(200);let b=await state('vertical-down');
   check('trusted vertical scroll',b.scrollY>a.scrollY,{before:a.scrollY,after:b.scrollY});check('vertical not duplicated',b.trace.vertical.length-a.trace.vertical.length===1,{calls:b.trace.vertical.length-a.trace.vertical.length});
   check('trusted wheel input',b.trace.wheel.slice(a.trace.wheel.length).some(e=>e.trusted),b.trace.wheel.slice(a.trace.wheel.length));await shot('vertical');
   a=b;await point();await page.mouse.wheel(0,-120);await page.waitForTimeout(150);b=await state('vertical-up');check('vertical reverse',b.scrollY<a.scrollY,{before:a.scrollY,after:b.scrollY});
   for(let i=0;i<12&&!b.horizontal;i++){await frame.evaluate(()=>Asc.editor.zoomIn());b=await state('horizontal-setup-'+i)}
   assert(b.horizontal,'Real horizontal scrollbar available');a=b;await point();await page.keyboard.down('Shift');try{await page.mouse.wheel(0,180)}finally{await page.keyboard.up('Shift')}await page.waitForTimeout(150);b=await state('shift-horizontal');
   check('Shift horizontal',b.scrollX>a.scrollX,{before:a.scrollX,after:b.scrollX});check('Shift keeps vertical',Math.abs(b.scrollY-a.scrollY)<1,{before:a.scrollY,after:b.scrollY});check('horizontal not duplicated',b.trace.horizontal.length-a.trace.horizontal.length===1,{calls:b.trace.horizontal.length-a.trace.horizontal.length});await shot('shift');
   await page.waitForTimeout(350);await point();a=await state('before-small-pinch');await page.keyboard.down('Control');
   try{
    for(let i=0;i<8;i++)await page.mouse.wheel(0,-10);
    b=await state('small-pinch-prefix');check('small Ctrl/pinch prefix does not zoom',b.trace.api.length===a.trace.api.length,{calls:b.trace.api.slice(a.trace.api.length),wheel:b.trace.wheel.slice(a.trace.wheel.length)});
    await page.mouse.wheel(0,-20);b=await state('small-pinch-threshold');check('100px Ctrl/pinch zooms once',b.trace.api.length-a.trace.api.length===1&&b.trace.api.at(-1)?.name==='zoomIn'&&b.zoom>a.zoom,{calls:b.trace.api.slice(a.trace.api.length),before:a.zoom,after:b.zoom});
   }finally{await page.keyboard.up('Control')}
   check('handled Ctrl/pinch prevents browser default',b.trace.wheel.slice(a.trace.wheel.length).filter(e=>e.ctrl&&e.deltaY).every(e=>e.prevented===true),b.trace.wheel.slice(a.trace.wheel.length));check('browser page zoom stable',a.dpr===b.dpr&&a.visualScale===b.visualScale,{before:[a.dpr,a.visualScale],after:[b.dpr,b.visualScale]});await shot('pinch');
   await page.waitForTimeout(350);await point();a=await state('before-meta');await page.keyboard.down('Meta');try{await page.mouse.wheel(0,-100)}finally{await page.keyboard.up('Meta')}b=await state('meta-threshold');
   check('Meta zoom threshold once',b.trace.api.length-a.trace.api.length===1&&b.trace.api.at(-1)?.name==='zoomIn',{calls:b.trace.api.slice(a.trace.api.length)});
   await page.waitForTimeout(350);await point();a=await state('before-reset');await page.keyboard.down('Control');
   try{await page.mouse.wheel(0,-90);await page.waitForTimeout(350);await page.mouse.wheel(0,-10);b=await state('gesture-reset')}finally{await page.keyboard.up('Control')}
   check('250ms gesture reset',b.trace.api.length===a.trace.api.length,{calls:b.trace.api.slice(a.trace.api.length),wheel:b.trace.wheel.slice(a.trace.wheel.length)});
   await page.waitForTimeout(350);await point();a=await state('before-reverse');await page.keyboard.down('Control');
   try{for(const delta of [-90,10,90])await page.mouse.wheel(0,delta);b=await state('pinch-reverse')}finally{await page.keyboard.up('Control')}
   check('direction reversal resets accumulation',b.trace.api.length-a.trace.api.length===1&&b.trace.api.at(-1)?.name==='zoomOut',{calls:b.trace.api.slice(a.trace.api.length),wheel:b.trace.wheel.slice(a.trace.wheel.length)});
   await page.waitForTimeout(350);await point();a=await state('before-clamp');await page.keyboard.down('Control');
   try{await page.mouse.wheel(0,100000);b=await state('event-clamp')}finally{await page.keyboard.up('Control')}
   check('300px per-event clamp',b.trace.api.length-a.trace.api.length===3&&b.trace.api.slice(a.trace.api.length).every(c=>c.name==='zoomOut'),{calls:b.trace.api.slice(a.trace.api.length),wheel:b.trace.wheel.slice(a.trace.wheel.length)});
   await shot('complete');row.status=row.checks.every(c=>c.pass)?'PASS':'FAIL';
  }catch(e){row.status='ERROR';row.failure=e.stack;await page.screenshot({path:path.join(out,engine+'-'+mode+'-failure.png')}).catch(()=>{})}
  finally{
   await Promise.allSettled(pending);
   for(const [p,h]of Object.entries(expected)){check('actual loaded resource '+p,row.resources[p]?.sha256===h,row.resources[p]||'not loaded')}
   check('no page errors',row.errors.length===0,row.errors);check('no failed resources',row.failed.length===0,row.failed);check('no outside network',row.outside.length===0,row.outside);
   if(row.status!=='ERROR')row.status=row.checks.every(c=>c.pass)?'PASS':'FAIL';await context.close();await save();console.log(engine,mode,row.status,row.checks.filter(c=>!c.pass).map(c=>c.name).join('; '),row.failure||'');
  }
 }
 assert.equal(sha(await fs.readFile(__filename)),driverSHA256,'driver unchanged');
 if(!observe)assert(rows.every(r=>r.status==='PASS'),'Hosted wheel checks failed; retained exact observations');
 console.log(observe?'OBSERVED hosted baseline':'PASS hosted PDF wheel',engine,rows.length,'profiles');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await browserServer?.close()});
