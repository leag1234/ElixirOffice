// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Exercise the real desktop Home renderer and assembled assets in a browser.
// No Electron lifecycle, filesystem action, native dialog or packaged app claim.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const product=path.resolve(__dirname,'../..'),assets=path.resolve(process.env.EO_HOME_ASSETS),out=path.resolve(process.env.EO_HOME_OUT);
const {load}=require(path.join(product,'desktop/locale.cjs')),{resolve}=require(path.join(product,'desktop/templates.cjs')),{firefox}=require(process.env.EO_PLAYWRIGHT||'playwright');
const inspect=require('../home-theme/contrast.cjs'),themeChecks=process.env.EO_HOME_THEME_TEST==='1';
let browser,browserServer,server;
(async()=>{
 await fs.mkdir(out,{recursive:true});const rows=[],errors=[],outside=[],served={},provenance={};
 const testSources={driverSHA256:crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),inspectorSHA256:crypto.createHash('sha256').update(await fs.readFile(require.resolve('../home-theme/contrast.cjs'))).digest('hex'),inspectorFunctionSHA256:crypto.createHash('sha256').update(inspect.toString()).digest('hex')};
 const head=await fs.readFile(path.join(product,'desktop/index.html'),'utf8'),themeScript=head.match(/<script src="[^"]*desktop-home\/home-theme\.js"><\/script>/)?.[0];if(themeChecks)assert(themeScript,'actual desktop theme script');
 for(const f of ['desktop/index.html','desktop/home.js','desktop/style.css','desktop/locale.cjs','desktop/templates.cjs','desktop/backstage.js'])provenance[f]=crypto.createHash('sha256').update(await fs.readFile(path.join(product,f))).digest('hex');
 const templateManifest=JSON.parse(await fs.readFile(path.join(assets,'desktop-home/templates.json')));
 const backstageSource=await fs.readFile(path.join(product,'desktop/backstage.js'),'utf8');
 const literal=/style\.textContent=('(?:[^'\\]|\\.)*');/.exec(backstageSource);assert(literal,'actual backstage style literal');
 const backstageCSS=vm.runInNewContext(literal[1],Object.create(null),{timeout:50});assert.equal(typeof backstageCSS,'string');assert(!backstageCSS.includes('</style'));
 server=http.createServer(async(req,res)=>{
  try{
   const u=new URL(req.url,'http://127.0.0.1');
   if(u.pathname==='/'){
    const info=await load(assets,[u.searchParams.get('lang')]),embedded=u.searchParams.get('embedded')==='1';
    info.embedded=embedded;info.recents=[{id:'public',name:'Public تقرير <img>.docx',folder:'ملفات عامة',modified:1700000000000}];info.templates=templateManifest.map(t=>resolve(t,info.language));
    res.setHeader('Content-Type','text/html; charset=utf-8');
    const html='<!doctype html><html lang="'+info.language+'" dir="'+(['ar','he','ur'].includes(info.language)?'rtl':'ltr')+'"><meta charset="utf-8">'+(themeScript||'')+'<link rel="stylesheet" href="/example/local-assets/desktop-home/'+(embedded?'backstage-home.css':'home.css')+'"><link rel="stylesheet" href="/style.css"><body><section id="home"></section><script src="/home.js"></script><script>const info='+JSON.stringify(info).replace(/</g,'\\u003c')+';window.actions=[];EODesktopHome.render(document.getElementById("home"),info,(...args)=>actions.push(args));</script>';res.end(html.replace('<body>',(embedded?'<style>'+backstageCSS+'</style>':'')+'<body>'));return;
   }
   let file;
   if(u.pathname==='/style.css')file=path.join(product,'desktop/style.css');
   else if(u.pathname==='/home.js')file=path.join(product,'desktop/home.js');
   else if(u.pathname.startsWith('/example/local-assets/desktop-home/')){
    file=path.resolve(assets,'desktop-home',u.pathname.slice('/example/local-assets/desktop-home/'.length));
    assert(file.startsWith(path.join(assets,'desktop-home')+path.sep));
   }
   if(!file){res.statusCode=404;res.end();return;}
   res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'image/png');
   const bytes=await fs.readFile(file);served[file]=crypto.createHash('sha256').update(bytes).digest('hex');res.end(bytes);
  }catch(e){res.statusCode=500;res.end();errors.push(e.stack);}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browserServer=await firefox.launchServer({headless:true});browser=await firefox.connect(browserServer.wsEndpoint());
 try{
  for(const language of (process.env.EO_HOME_LANGS||'en,fr,ar,he,ur').split(','))for(const scheme of ['light','dark'])for(const embedded of [false,true])for(const preference of (themeChecks?['system','opposite']:['system'])){
   const context=await browser.newContext({locale:language,colorScheme:scheme,viewport:{width:1366,height:900}}),page=await context.newPage(),row={language,scheme,embedded,preference};
   const expected=preference==='opposite'?(scheme==='dark'?'light':'dark'):scheme;
   await context.addInitScript(id=>{localStorage.clear();if(id)localStorage.setItem('ui-theme-id',id)},preference==='opposite'?(expected==='dark'?'theme-night':'theme-white'):null);
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){outside.push(route.request().url());return route.abort();}return route.continue();});
   try{
    await page.goto(origin+'/?lang='+language+'&embedded='+(embedded?'1':'0'));await page.locator('.tile-template img').last().waitFor();
    await page.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
    if(themeChecks){await page.waitForTimeout(200);row.appearance=await page.evaluate(inspect);const a=row.appearance;assert.equal(a.theme,expected);assert.equal(a.colorScheme,expected);assert.equal(await page.locator('#home').getAttribute('data-eo-theme'),expected);const bg=embedded?await page.locator('#home').evaluate(el=>getComputedStyle(el).backgroundColor):a.bodyBackground;assert.equal(bg,expected==='dark'?'rgb(34, 34, 34)':'rgb(246, 246, 247)');for(const c of [...a.text,...a.fields,...a.borders,...(a.focus?[a.focus]:[])])assert(c.ratio+.01>=c.minimum,'contrast '+(c.selector||c.id)+' '+c.ratio);}
    row.observation=await page.evaluate(()=>{
     const p=document.getElementById('home'),r=p.getBoundingClientRect(),link=p.querySelector('.file-link');
     return{language:document.documentElement.lang,direction:getComputedStyle(p).direction,background:getComputedStyle(p).backgroundColor,
      overflow:document.documentElement.scrollWidth>innerWidth,names:[...p.querySelectorAll('.file-name,.file-where')].map(el=>{const bdi=el.querySelector('bdi'),r=el.getBoundingClientRect(),b=bdi?.getBoundingClientRect();return{tag:el.tagName,text:el.textContent,dir:getComputedStyle(el).direction,bdiTag:bdi?.tagName,bidi:bdi&&getComputedStyle(bdi).unicodeBidi,rect:{x:r.x,width:r.width},content:b&&{x:b.x,width:b.width}};}),
      textAlign:getComputedStyle(link).textAlign,labels:[...p.querySelectorAll('.tile-label')].map(el=>el.textContent),unwanted:p.querySelectorAll('.file-link img').length,
      rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
    });
    assert.equal(row.observation.language,language);assert.equal(row.observation.direction,['ar','he','ur'].includes(language)?'rtl':'ltr');assert.equal(row.observation.overflow,false);
    assert.equal(row.observation.unwanted,0);
    for(const n of row.observation.names){assert.equal(n.bdiTag,'BDI');assert.equal(n.bidi,'isolate');const rtl=['ar','he','ur'].includes(language);const distance=rtl?n.rect.x+n.rect.width-n.content.x-n.content.width:n.content.x-n.rect.x;assert(Math.abs(distance)<2,'recent label aligns to Home logical start');}
    assert.equal(row.observation.textAlign,'start');
    const strings=(await load(assets,[language])).strings;assert.deepEqual(row.observation.labels.slice(0,3),[strings.blankDoc,strings.blankBook,strings.blankSlide]);
    await page.locator('.file-link').click();assert.deepEqual(await page.evaluate(()=>actions),[['recent','public']]);
    row.aria=await page.locator('#home').ariaSnapshot();row.screenshot=path.join(out,language+'-'+scheme+'-'+(embedded?'embedded':'standalone')+'-'+preference+'.png');await page.screenshot({path:row.screenshot,animations:'disabled'});
    if(!embedded){await page.locator('[data-view="open"]').click();assert.equal(await page.locator('.dropzone button').textContent(),strings.browse);}
    row.localeSHA256=crypto.createHash('sha256').update(await fs.readFile(path.join(assets,'desktop-home/i18n',language+'.json'))).digest('hex');rows.push(row);console.log('PASS desktop Home',language,scheme,embedded?'embedded':'standalone');
   }catch(e){row.failure=e.stack;row.screenshot=path.join(out,language+'-'+scheme+'-'+(embedded?'embedded':'standalone')+'-'+preference+'-failure.png');await page.screenshot({path:row.screenshot}).catch(()=>{});rows.push(row);throw e;}finally{await context.close();}
  }
  assert.equal(crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),testSources.driverSHA256);assert.equal(crypto.createHash('sha256').update(await fs.readFile(require.resolve('../home-theme/contrast.cjs'))).digest('hex'),testSources.inspectorSHA256);
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  for(const [f,hash]of Object.entries(served))assert.equal(crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex'),hash,'served asset changed');
  for(const [f,hash]of Object.entries(provenance))assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(product,f))).digest('hex'),hash,'source changed');
 }finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify({testSources,scope:'Actual desktop Home renderer/assets in browser only; no native lifecycle or host file actions',provenance,served,runtime:{node:process.version,browser:browser.version(),driverSHA256:crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex')},rows,errors,outside,rendererSHA256:crypto.createHash('sha256').update(await fs.readFile(path.join(product,'desktop/home.js'))).digest('hex')},null,2)+'\n');}
 console.log('PASS desktop Home',rows.length,'profiles/captures');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await browserServer?.close();if(server)await new Promise(r=>server.close(r));});
