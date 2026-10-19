// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Actual parent renderer/helper bound to a foreign ownerDocument with controlled public host UI state.
// No editor Options UI, Electron lifecycle or backend acceptance.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const product=path.resolve(__dirname,'../..'),assets=path.resolve(process.env.EO_HOME_ASSETS),out=path.resolve(process.env.EO_HOME_OUT);
const {firefox}=require(process.env.EO_PLAYWRIGHT||'playwright'),{load}=require(path.join(product,'desktop/locale.cjs')),inspect=require('./contrast.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
let server,browser,browserServer;
(async()=>{
 await fs.mkdir(out,{recursive:true});const rows=[],errors=[],outside=[],served={},provenance={};
 for(const f of ['desktop/home.js','desktop/backstage.js','desktop/locale.cjs','tests/home-theme/contrast.cjs','tests/home-theme/embedded.cjs'])provenance[f]=hash(await fs.readFile(path.join(product,f)));
 const literal=/style\.textContent=('(?:[^'\\]|\\.)*');/.exec(await fs.readFile(path.join(product,'desktop/backstage.js'),'utf8'));assert(literal);
 const css=vm.runInNewContext(literal[1],Object.create(null),{timeout:50}),info=await load(assets,['ar']);
 info.embedded=true;info.templates=[];info.recents=[{id:'public',name:'Public تقرير.docx',folder:'مجلد',modified:1700000000000}];
 server=http.createServer(async(req,res)=>{
  try{
   const u=new URL(req.url,'http://127.0.0.1');res.setHeader('Content-Type','text/html; charset=utf-8');
   if(u.pathname==='/'){res.end('<!doctype html><meta charset="utf-8"><script src="/example/local-assets/desktop-home/home-theme.js"></script><script src="/home.js"></script><body><iframe id="host" src="/host" style="width:100%;height:850px;border:0"></iframe>');return;}
   if(u.pathname==='/preferences'){res.end('<!doctype html><title>Public preference controller</title>');return;}
   if(u.pathname==='/host'){res.end('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><script>window.uitheme={id:"theme-night",type:"dark"}</script><link rel="stylesheet" href="/example/local-assets/desktop-home/backstage-home.css"><style>'+css+'</style><body class="theme-night"><section id="home"></section>');return;}
   if(u.pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}
   let file;if(u.pathname==='/home.js')file=path.join(product,'desktop/home.js');
   else if(u.pathname.startsWith('/example/local-assets/desktop-home/')){file=path.resolve(assets,'desktop-home',u.pathname.slice('/example/local-assets/desktop-home/'.length));assert(file.startsWith(path.join(assets,'desktop-home')+path.sep));}
   if(!file)throw new Error('Unmodeled path '+u.pathname);
   const bytes=await fs.readFile(file);served[file]=hash(bytes);res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'image/svg+xml');res.end(bytes);
  }catch(e){errors.push(e.stack);res.statusCode=500;res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browserServer=await firefox.launchServer({headless:true});browser=await firefox.connect(browserServer.wsEndpoint());
 const save=()=>fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Real shared helper/desktop renderer/assembled scoped CSS/full backstage inline style; controlled foreign host UI state, stable panel reuse and explicit bind disposer only; no native/editor Options UI acceptance',provenance,served,inspectorFunctionSHA256:hash(inspect.toString()),runtime:{node:process.version,browser:browser.version()},rows,errors,outside},null,2)+'\n');
 for(const os of ['light','dark']){
  const context=await browser.newContext({colorScheme:os,viewport:{width:1366,height:900}}),page=await context.newPage(),controller=await context.newPage(),row={os,captures:[]};rows.push(row);
  page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('ui-theme-id','theme-white')});
  await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){outside.push(r.request().url());return r.abort();}return r.continue()});
  try{
   await page.goto(origin+'/');const frame=await(await page.waitForSelector('#host')).contentFrame();await frame.waitForSelector('#home',{state:'attached'});
   assert.equal(await frame.evaluate(()=>typeof EOHomeTheme),'undefined','foreign child does not load helper');
   await page.evaluate(info=>{const d=document.querySelector('#host').contentDocument;window.actions=[];for(let i=0;i<20;i++)EODesktopHome.render(d.getElementById('home'),info,(...args)=>actions.push(args));},info);
   const check=async(name,expected)=>{
    if(name==='live-system'||name==='live-system-OS-change')await frame.waitForFunction(d=>matchMedia('(prefers-color-scheme: dark)').matches===d,expected==='dark');
    row.mediaDiagnostics=row.mediaDiagnostics||[];row.mediaDiagnostics.push({name,expected,actual:await frame.evaluate(()=>({media:matchMedia('(prefers-color-scheme: dark)').matches,live:uitheme,theme:document.getElementById('home').getAttribute('data-eo-theme')})),parent:await page.evaluate(()=>({media:matchMedia('(prefers-color-scheme: dark)').matches,rootScheme:getComputedStyle(document.documentElement).colorScheme,iframeScheme:getComputedStyle(document.querySelector('iframe')).colorScheme}))});await save();
    await frame.waitForFunction(t=>document.getElementById('home').getAttribute('data-eo-theme')===t,expected);await page.waitForTimeout(200);
    const a=await frame.evaluate(inspect),component=await frame.locator('#home').evaluate(el=>({theme:el.getAttribute('data-eo-theme'),colorScheme:getComputedStyle(el).colorScheme,bg:getComputedStyle(el).backgroundColor,dir:getComputedStyle(el).direction}));
    assert.equal(a.theme,null,'bind must not change host root');assert.equal(await frame.locator('body').getAttribute('data-eo-theme'),null);assert.equal(component.theme,expected);assert.equal(component.colorScheme,expected);assert.equal(component.dir,'rtl');assert.equal(component.bg,expected==='dark'?'rgb(34, 34, 34)':'rgb(246, 246, 247)');
    for(const x of [...a.text,...a.fields,...a.borders,...(a.focus?[a.focus]:[])])assert(x.ratio+.01>=x.minimum,'contrast '+name+' '+(x.selector||x.id)+' '+x.ratio);
    const screenshot=path.join(out,os+'-'+name+'.png');await page.screenshot({path:screenshot});row.captures.push({name,expected,appearance:a,component,screenshot});await save();
   };
   await check('live-night-beats-saved-white','dark');
   await page.evaluate(()=>{const d=document.querySelector('#host').contentDocument;const probe=d.createElement('aside');probe.id='disposed-probe';d.body.append(probe);const dispose=EOHomeTheme.bind(probe);dispose();});
   await frame.evaluate(()=>{uitheme={id:'theme-white',type:'light'};document.body.className='theme-white'});await check('live-white','light');
   assert.equal(await frame.locator('#disposed-probe').getAttribute('data-eo-theme'),'dark','disposed target no longer changes');
   await frame.evaluate(()=>{uitheme={id:'public-custom',type:'dark'};document.body.className='public-custom'});await check('live-custom-type','dark');
   await controller.goto(origin+'/preferences');await controller.evaluate(()=>localStorage.setItem('ui-theme-id','theme-system'));
   await frame.evaluate(()=>{uitheme={id:'theme-system',type:'dark'};document.body.className='theme-system'});await check('live-system',os);
   const opposite=os==='dark'?'light':'dark';await page.emulateMedia({colorScheme:opposite});await check('live-system-OS-change',opposite);
   await frame.locator('.file-link').click();assert.deepEqual(await page.evaluate(()=>actions),[['recent','public']]);row.status='PASS';
  }catch(e){row.status='FAIL';row.failure=e.stack;console.error(e);}finally{await context.close();await save();}
 }
 for(const [f,h]of Object.entries(provenance))assert.equal(hash(await fs.readFile(path.join(product,f))),h,'source changed');
 for(const [f,h]of Object.entries(served))assert.equal(hash(await fs.readFile(f)),h,'asset changed');
 assert(rows.every(r=>r.status==='PASS'));assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 console.log('PASS foreign-owner Home',rows.length,'profiles',rows.reduce((n,r)=>n+r.captures.length,0),'captures');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await browserServer?.close();if(server)await new Promise(r=>server.close(r))});
