// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Real storage/media events plus explicit public host-state and opaque-origin fixtures.
// These are Home component checks, not editor Options/native/backend acceptance.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const upstream=path.resolve(process.env.UPSTREAM),product=path.resolve(__dirname,'../..'),nodeRoot=path.join(upstream,'document-server-integration/web/documentserver-example/nodejs'),out=path.resolve(process.env.EO_HOME_OUT);
process.chdir(nodeRoot);
const home=require(path.join(nodeRoot,'helpers/elixirHome')),ejs=require('ejs'),{firefox}=require(process.env.EO_PLAYWRIGHT||'playwright'),inspect=require('./contrast.cjs');
let server,browser,browserServer;
(async()=>{
 await fs.mkdir(out,{recursive:true});const rows=[],errors=[],outside=[],unmodeled=[],provenance={};
 const testSources={driverSHA256:crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),inspectorSHA256:crypto.createHash('sha256').update(await fs.readFile(require.resolve('./contrast.cjs'))).digest('hex'),inspectorFunctionSHA256:crypto.createHash('sha256').update(inspect.toString()).digest('hex')};
 for(const f of ['views/home.ejs','helpers/elixirHome.js','public/elixir/home.css','public/elixir/home.js','public/elixir/home-theme.js',...['en','fr','ar'].map(l=>'public/elixir/i18n/'+l+'.json')])provenance[f]=crypto.createHash('sha256').update(await fs.readFile(path.join(nodeRoot,f))).digest('hex');
 const template=await fs.readFile(path.join(nodeRoot,'views/home.ejs'),'utf8'),en=JSON.parse(await fs.readFile(path.join(nodeRoot,'public/elixir/i18n/en.json')));
 server=http.createServer(async(req,res)=>{
  try{
   const u=new URL(req.url,'http://127.0.0.1');res.setHeader('Content-Type','text/html; charset=utf-8');
   if(u.pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}
   if(u.pathname==='/preferences'){res.end('<!doctype html><title>Public preference controller</title>');return;}
   if(u.pathname==='/opaque'){
    res.end('<!doctype html><meta charset="utf-8"><script src="/example/elixir/home-theme.js"></script><link rel="stylesheet" href="/example/elixir/home.css"><body><main><h1 class="section-title">Public theme fixture</h1></main>');return;
   }
   if(u.pathname==='/example/'){
    const requested=u.searchParams.get('lang')||'en',lang=home.resolveLanguage({query:{lang:requested},headers:{}}),t=home.translator(lang.ui),strings={...en,...JSON.parse(await fs.readFile(path.join(nodeRoot,'public/elixir/i18n',lang.ui+'.json')))};
    res.end(ejs.render(template,{appName:'ElixirOffice',lang,t,strings,iconSprite:await fs.readFile(path.join(nodeRoot,'public/elixir/icons.svg'),'utf8'),hasLogo:false,hasFavicon:false,
     account:{source:'local',name:'Public اسم',named:true,asked:true,initials:'PS',color:'#0082c9',server:'https://cloud.example.org',serverHost:'cloud.example.org',serverName:'Public cloud',testUsers:[]},
     nc:{connected:false,defaultServer:'https://cloud.example.org',allowHttp:false,lastFolder:'/'},devMode:u.searchParams.get('dev')==='1',templates:[],files:[],uploadExts:['docx'],convertExts:[],maxFileSize:100000,apiUrl:'',csrf:'public-theme-fixture'}));return;
   }
   const files={'/example/elixir/home.css':'public/elixir/home.css','/example/elixir/home.js':'public/elixir/home.js','/example/elixir/home-theme.js':'public/elixir/home-theme.js'};
   if(files[u.pathname]){res.setHeader('Content-Type',u.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(await fs.readFile(path.join(nodeRoot,files[u.pathname])));return;}
   if(u.pathname==='/example/elixir-local/launch.js'){res.setHeader('Content-Type','text/javascript');res.end('');return;}
   if(u.pathname.endsWith('/manifest.webmanifest')){res.setHeader('Content-Type','application/manifest+json');res.end('{}');return;}
   if(u.pathname==='/example/elixir/api/files'||u.pathname==='/example/elixir/api/notices'){res.setHeader('Content-Type','application/json');res.end('{"files":[],"notices":[]}');return;}
   unmodeled.push({path:u.pathname,method:req.method});res.statusCode=404;res.end();
  }catch(e){errors.push(e.stack);res.statusCode=500;res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browserServer=await firefox.launchServer({headless:true});browser=await firefox.connect(browserServer.wsEndpoint());
 const save=()=>fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Actual Home EJS/helper/CSS/JS and browser storage/media events; controlled public cache and opaque-origin fixtures; no native/backend/Options UI acceptance',provenance,testSources,runtime:{node:process.version,browser:browser.version()},rows,errors,outside,unmodeled},null,2)+'\n');
 const cases=[
  {name:'os-light',os:'light',expected:'light'},{name:'os-dark',os:'dark',expected:'dark'},
  {name:'explicit-light',os:'dark',id:'theme-white',expected:'light'},{name:'explicit-dark',os:'light',id:'theme-night',expected:'dark'},
  {name:'system-stale-cache',os:'light',id:'theme-system',cache:JSON.stringify({id:'theme-system',type:'dark'}),expected:'light'},
  {name:'custom-dark',os:'light',id:'public-custom',cache:JSON.stringify({id:'public-custom',type:'dark'}),expected:'dark'},
  {name:'malformed-cache',os:'dark',id:'unknown',cache:'not-json',expected:'dark'},
  {name:'content-is-not-UI',os:'dark',id:'theme-white',content:'dark',expected:'light'},
  {name:'live-storage',os:'light',expected:'light'},
  {name:'rail-hover-light',os:'light',expected:'light',rail:true},{name:'rail-hover-dark',os:'dark',expected:'dark',rail:true},
  {name:'placeholders-light',os:'light',expected:'light',placeholders:true},{name:'placeholders-dark',os:'dark',expected:'dark',placeholders:true}
 ];
 for(const c of cases){
  const context=await browser.newContext({viewport:{width:1366,height:900},colorScheme:c.os}),page=await context.newPage(),controller=await context.newPage(),row={...c,captures:[]};rows.push(row);
  for(const p of [page,controller])p.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){outside.push(route.request().url());return route.abort();}return route.continue();});
  const check=async(name,expected)=>{
   await page.waitForFunction(theme=>document.documentElement.getAttribute('data-eo-theme')===theme,expected);await page.waitForTimeout(200);
   const a=await page.evaluate(inspect);assert.equal(a.colorScheme,expected);assert.equal(a.bodyBackground,expected==='dark'?'rgb(34, 34, 34)':'rgb(246, 246, 247)');
   const screenshot=path.join(out,c.name+'-'+name+'.png');await page.screenshot({path:screenshot,animations:'disabled'});row.captures.push({name,expected,appearance:a,screenshot});
   for(const x of [...a.text,...a.fields,...a.borders,...(a.focus?[a.focus]:[])])assert(x.ratio+.01>=x.minimum,'contrast '+name+' '+(x.selector||x.id)+' '+x.ratio.toFixed(2));await save();
  };
  try{
   await controller.goto(origin+'/preferences');await controller.evaluate(c=>{localStorage.clear();if(c.id)localStorage.setItem('ui-theme-id',c.id);if(c.cache)localStorage.setItem('ui-theme',c.cache);if(c.content)localStorage.setItem('content-theme',c.content)},c);
   await page.goto(origin+'/example/?lang=ar&dev='+(c.rail?'1':'0'));await page.locator('#account-btn').waitFor();await check('initial',c.expected);
   if(c.name.startsWith('os-')){const opposite=c.os==='dark'?'light':'dark';await page.emulateMedia({colorScheme:opposite});await check('OS-change',opposite);}
   if(c.id==='theme-white'||c.id==='theme-night'){await page.emulateMedia({colorScheme:c.os==='dark'?'light':'dark'});await check('explicit-override',c.expected);}
   if(c.name==='system-stale-cache'){await page.emulateMedia({colorScheme:'dark'});await check('system-change','dark');}
   if(c.name==='live-storage'){
    for(const [id,expected]of [['theme-night','dark'],['theme-white','light']]){await controller.evaluate(id=>localStorage.setItem('ui-theme-id',id),id);await check('storage-'+id,expected);}
    await controller.evaluate(()=>{localStorage.setItem('ui-theme-id','public-custom');localStorage.setItem('ui-theme',JSON.stringify({id:'public-custom',type:'dark'}));});await check('custom-storage-dark','dark');
    await controller.evaluate(()=>localStorage.setItem('ui-theme',JSON.stringify({id:'public-custom',type:'light'})));await check('custom-storage-light','light');
    await controller.evaluate(()=>localStorage.clear());await check('storage-clear','light');
   }
   if(c.placeholders){
    await page.locator('#account-btn').click();await page.locator('#acct-rename').click();await page.locator('#profile-name').fill('');await check('profile-placeholder',c.expected);await page.keyboard.press('Escape');
    await page.locator('#connect-card [data-connect]').click();await page.locator('#connect-server').fill('');await check('URL-placeholder',c.expected);await page.keyboard.press('Escape');
   }
   if(c.rail){
    await page.locator('.rail-dev').hover();await check('dev-hover',c.expected);
    await page.evaluate(()=>window.dispatchEvent(new Event('beforeinstallprompt',{cancelable:true})));await page.locator('#install-app').waitFor();await page.locator('#install-app').hover();await check('install-hover',c.expected);
   }
   row.status='PASS';
  }catch(e){row.status='FAIL';row.failure=e.stack;console.log('FAIL',c.name,e.message);}
  finally{await context.close();await save();}
 }
 for(const os of ['light','dark']){
  const context=await browser.newContext({colorScheme:os,viewport:{width:1366,height:900}}),page=await context.newPage(),row={name:'opaque-storage-'+os,captures:[]};rows.push(row);
  try{
   await page.goto(origin+'/preferences');await page.evaluate(url=>{const frame=document.createElement('iframe');frame.id='opaque';frame.sandbox='allow-scripts';frame.style='width:100%;height:850px;border:0';frame.src=url;document.body.append(frame)},origin+'/opaque');
   const frame=await(await page.waitForSelector('#opaque')).contentFrame();await frame.waitForFunction(()=>window.EOHomeTheme);
   row.storage=await frame.evaluate(()=>{try{localStorage.getItem('ui-theme-id');return'available'}catch(e){return e.name}});
   assert.equal(row.storage,'SecurityError');await frame.waitForFunction(t=>document.documentElement.getAttribute('data-eo-theme')===t,os);
   row.appearance=await frame.evaluate(inspect);assert.equal(row.appearance.bodyBackground,os==='dark'?'rgb(34, 34, 34)':'rgb(246, 246, 247)');row.screenshot=path.join(out,row.name+'.png');await page.screenshot({path:row.screenshot});row.status='PASS';
  }catch(e){row.status='FAIL';row.failure=e.stack;}finally{await context.close();await save();}
 }
 assert(rows.every(r=>r.status==='PASS'),'Preference cases failed; see results');assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(unmodeled,[]);
 for(const [f,h]of Object.entries(provenance))assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(nodeRoot,f))).digest('hex'),h);
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),testSources.driverSHA256,'driver changed');
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(require.resolve('./contrast.cjs'))).digest('hex'),testSources.inspectorSHA256,'inspector changed');
 console.log('PASS Home preferences',rows.length,'cases');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await browserServer?.close();if(server)await new Promise(r=>server.close(r));});
