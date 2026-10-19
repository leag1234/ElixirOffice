// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Public Home rendering fixture: production EJS/helper/JS/CSS, intercepted API results.
// This does not certify backend storage, cloud authentication or native desktop lifecycle.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const product=path.resolve(__dirname,'../..'),upstream=path.resolve(process.env.UPSTREAM),nodeRoot=path.join(upstream,'document-server-integration/web/documentserver-example/nodejs'),out=path.resolve(process.env.EO_HOME_OUT);
process.chdir(nodeRoot);
const home=require(path.join(nodeRoot,'helpers/elixirHome')),ejs=require('ejs'),{firefox}=require(process.env.EO_PLAYWRIGHT||'playwright');
const themeChecks=process.env.EO_HOME_THEME_TEST==='1',inspectAppearance=require('../home-theme/contrast.cjs');
const languages=(process.env.EO_HOME_LANGS||'en,fr,ar,he,ur').split(','),observe=process.env.EO_HOME_OBSERVE==='1',rows=[],errors=[],requests=[],outside=[];
const sample='Public تقرير <img>.docx',accountName='Public اسم <img>',rtl=lang=>['ar','he','ur'].includes(lang);
let server,browser,browserServer;
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const driverSHA256=crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),inspectorFile=require.resolve('../home-theme/contrast.cjs'),inspectorSHA256=crypto.createHash('sha256').update(await fs.readFile(inspectorFile)).digest('hex'),inspectorFunctionSHA256=crypto.createHash('sha256').update(inspectAppearance.toString()).digest('hex');
 const template=await fs.readFile(path.join(nodeRoot,'views/home.ejs'),'utf8'),en=JSON.parse(await fs.readFile(path.join(nodeRoot,'public/elixir/i18n/en.json'))),provenance={};
 const inputFiles=['views/home.ejs','helpers/elixirHome.js','public/elixir/home.js','public/elixir/home.css',...((await fs.stat(path.join(nodeRoot,'public/elixir/home-theme.js')).catch(()=>null))?['public/elixir/home-theme.js']:[]),...(await fs.readdir(path.join(nodeRoot,'public/elixir/i18n'))).filter(f=>f.endsWith('.json')).sort().map(f=>'public/elixir/i18n/'+f)];
 for(const f of inputFiles){
  provenance[f]=crypto.createHash('sha256').update(await fs.readFile(path.join(nodeRoot,f))).digest('hex');
 }
 const save=async()=>fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Production Home renderer with explicit public render locals and fixture HTTP responses; no cloud/backend/native acceptance',observe,provenance,runtime:{node:process.version,browser:browser?.version(),driverSHA256,inspectorSHA256,inspectorFunctionSHA256},rows,errors,requests,outside},null,2)+'\n');
 server=http.createServer(async(req,res)=>{
  try{
   const u=new URL(req.url,'http://127.0.0.1');
   if(u.pathname==='/example/'){
    const lang=home.resolveLanguage({query:{lang:u.searchParams.get('lang')},headers:{'accept-language':req.headers['accept-language']||''}}),t=home.translator(lang.ui);
    const catalog=JSON.parse(await fs.readFile(path.join(nodeRoot,'public/elixir/i18n',lang.ui+'.json'))),connected=u.searchParams.get('connected')==='1';
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(ejs.render(template,{appName:'ElixirOffice',lang,t,strings:{...en,...catalog},
     iconSprite:await fs.readFile(path.join(nodeRoot,'public/elixir/icons.svg'),'utf8'),hasLogo:false,hasFavicon:false,
     account:{source:connected?'nextcloud':'local',name:accountName,named:true,asked:true,initials:'PS',color:'#0082c9',server:'https://cloud.example.org',serverHost:'cloud.example.org',serverName:'Public سحابة',testUsers:[]},
     nc:{connected,defaultServer:'https://cloud.example.org',allowHttp:false,lastFolder:'/Public مجلد'},devMode:false,templates:[],files:[{name:sample,documentType:'word',time:1700000000000,size:128}],
     uploadExts:['docx'],convertExts:[],maxFileSize:100000,apiUrl:'',csrf:'public-fixture-token'}));return;
   }
   const rel=u.pathname.replace(/^\/example\//,'');
   const allowed=new Map([['elixir/home.css','public/elixir/home.css'],['elixir/home.js','public/elixir/home.js'],['elixir/home-theme.js','public/elixir/home-theme.js']]);
   if(allowed.has(rel)){res.setHeader('Content-Type',rel.endsWith('.css')?'text/css':'text/javascript');res.end(await fs.readFile(path.join(nodeRoot,allowed.get(rel))));return;}
   res.statusCode=404;res.end();
  }catch(e){res.statusCode=500;res.end('Public Home fixture render failure');errors.push(e.stack);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browserServer=await firefox.launchServer({headless:true});browser=await firefox.connect(browserServer.wsEndpoint());
 for(const requested of languages)for(const scheme of ['light','dark']){
  const context=await browser.newContext({viewport:{width:1366,height:900},locale:requested,colorScheme:scheme}),page=await context.newPage(),row={requested,scheme,captures:[],failures:[],api:[]};
  rows.push(row);page.on('pageerror',e=>{errors.push(e.message);row.failures.push(e.message)});
  await context.addInitScript(()=>{window.open=()=>null;localStorage.setItem('eo-local-conversion','false')});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url()),p=u.pathname;
   if(u.origin!==origin){outside.push(u.href);return route.abort();}
   if(p==='/example/'||['/example/elixir/home.css','/example/elixir/home.js','/example/elixir/home-theme.js'].includes(p))return route.continue();
   if(p==='/example/elixir-local/launch.js')return route.fulfill({contentType:'text/javascript',body:''});
   if(p.endsWith('/manifest.webmanifest'))return route.fulfill({contentType:'application/manifest+json',body:'{}'});
   const json=(status,body)=>{row.api.push({path:p,method:route.request().method(),body:route.request().postData()});return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});};
   if(p==='/example/elixir/api/files')return json(200,{files:[{name:sample,documentType:'word',time:1700000000000,size:128}]});
   if(p==='/example/elixir/api/notices')return json(200,{notices:[]});
   if(p==='/example/elixir/nc/recent')return json(200,{files:[]});
   if(p==='/example/elixir/nc/list')return json(200,{items:[{kind:'file',name:sample,path:'/Public مجلد/'+sample,documentType:'word',time:1700000000000,size:128,supported:true}],canCreate:true});
   if(p==='/example/elixir/nc/connect')return json(400,{error:'httpsRequired'});
   requests.push({path:p,method:route.request().method()});return route.abort();
  });
  const capture=async state=>{
   await page.waitForTimeout(200); // Match baseline/candidate settling after production120ms transitions and handlers.
   const record=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};
    const visible=el=>!!el.getClientRects().length;
    return{viewportWidth:innerWidth,viewportHeight:innerHeight,language:document.documentElement.lang,direction:getComputedStyle(document.body).direction,background:getComputedStyle(document.body).backgroundColor,
     rail:rect(document.querySelector('.rail')),main:rect(document.querySelector('main')),account:rect(document.getElementById('account-btn')),
     overflow:document.documentElement.scrollWidth>innerWidth,
     surfaces:[...document.querySelectorAll('#account-panel,dialog,#toast,#menu')].filter(visible).map(el=>({id:el.id,text:el.innerText,role:el.getAttribute('role'),direction:getComputedStyle(el).direction,background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,rect:rect(el),overflow:el.scrollWidth>el.clientWidth})),
     fields:[...document.querySelectorAll('dialog input')].filter(visible).map(el=>({id:el.id,direction:getComputedStyle(el).direction,value:el.value})),
     links:[...document.querySelectorAll('#files-body a')].map(el=>({text:el.textContent,dir:el.getAttribute('dir'),bidi:getComputedStyle(el).unicodeBidi})),
     menuAnchor:(el=>el?rect(el):null)(document.querySelector('#files-body button[aria-expanded="true"]')),
     sizes:[...document.querySelectorAll('#files-body .c-size')].map(el=>({text:el.textContent,bdi:el.querySelector('bdi')?.getAttribute('dir')})),
     unwantedMarkup:document.querySelectorAll('#acct-name img,#files-body .file-link img').length,focus:document.activeElement.id};
   });
   if(themeChecks)record.appearance=await page.evaluate(inspectAppearance);
   const shot=path.join(out,requested+'-'+scheme+'-'+state+'.png');await page.screenshot({path:shot,animations:'disabled'});
   row.captures.push({state,...record,screenshot:shot,aria:await page.locator('body').ariaSnapshot()});await save();
   if(themeChecks){const a=record.appearance;assert.equal(a.theme,scheme);assert.equal(a.colorScheme,scheme);assert.equal(a.bodyBackground,scheme==='dark'?'rgb(34, 34, 34)':'rgb(246, 246, 247)');for(const check of [...a.text,...a.fields,...a.borders,...(a.focus?[a.focus]:[])])assert(check.ratio+0.01>=check.minimum,'contrast '+state+' '+(check.selector||check.id)+' '+check.ratio.toFixed(2)+' < '+check.minimum);}
   if(!observe){
    assert.equal(record.language,requested);assert.equal(record.direction,rtl(requested)?'rtl':'ltr');
    assert.equal(record.unwantedMarkup,0);assert.equal(record.overflow,false,state+' page overflow');
    for(const s of record.surfaces){assert.equal(s.direction,rtl(requested)?'rtl':'ltr');assert.equal(s.overflow,false,state+' surface overflow');}
    assert.equal(record.rail.x>record.main.x,rtl(requested),'rail on logical start');
    const panel=record.surfaces.find(s=>s.id==='account-panel');
    if(panel)assert(Math.abs((rtl(requested)?panel.rect.x:record.viewportWidth-panel.rect.x-panel.rect.width)-12)<1,'account anchored to logical end');
    const menu=record.surfaces.find(s=>s.id==='menu');
    if(menu){const r=menu.rect,a=record.menuAnchor;assert(a);const edge=rtl(requested)?a.x:a.x+a.width-r.width;const expected=Math.max(8,Math.min(edge,record.viewportWidth-r.width-8));assert(Math.abs(r.x-expected)<1,'menu logical anchor');assert(r.x>=8&&r.x+r.width<=record.viewportWidth-8&&r.y>=8&&r.y+r.height<=record.viewportHeight-8,'menu viewport clamp');}
    for(const size of record.sizes)if(size.text)assert.equal(size.bdi,'ltr','numeric size display isolation');
   }
   return record;
  };
  try{
   await page.goto(origin+'/example/?lang='+requested);await page.locator('#files-body tr').first().waitFor();await capture('home');
   await page.locator('#files-body tr').first().hover();const menuButton=page.locator('#files-body .row-menu').first();await menuButton.click();await capture('row-menu');
   assert.equal(await page.locator('#menu').evaluate(el=>el.contains(document.activeElement)),true);await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#menu').evaluate(el=>el.contains(document.activeElement)),true);await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#menu [data-action="delete"]').evaluate(el=>el===document.activeElement),true);await capture('row-menu-danger');await page.keyboard.press('Escape');assert.equal(await menuButton.evaluate(el=>el===document.activeElement),true);
   await page.locator('#account-btn').click();await capture('account');await page.keyboard.press('Escape');
   assert.equal(await page.locator('#account-panel').isHidden(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'account-btn');
   await page.locator('#account-btn').click();await page.locator('#acct-rename').click();await capture('profile');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'profile-name');await page.keyboard.press('Tab');assert.equal(await page.locator('#profile-dialog').evaluate(el=>el.contains(document.activeElement)),true);await page.locator('#profile-name').fill('اسم عام 123');if(!observe)assert.equal(await page.locator('#profile-name').evaluate(el=>getComputedStyle(el).direction),'rtl');await capture('profile-filled');await page.keyboard.press('Escape');
   await page.locator('#connect-card [data-connect]').click();let connect=await capture('cloud');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'connect-server');
   if(!observe)assert.equal(connect.fields.find(f=>f.id==='connect-server').direction,'ltr');
   await page.locator('#connect-server').fill('http://cloud.example.org');await page.locator('#connect-server').press('Enter');await page.locator('#connect-error:visible').waitFor();assert.equal(await page.evaluate(()=>document.activeElement.id),'connect-server','keyboard URL submission retains field focus on inline error');
   assert.equal(await page.locator('#connect-error').textContent(),home.translator(requested)('nc.error.httpsRequired'));
   const connectRequest=row.api.find(r=>r.path==='/example/elixir/nc/connect');assert.equal(connectRequest.method,'POST');assert.equal(JSON.parse(connectRequest.body).server,'http://cloud.example.org');await capture('cloud-error');await page.keyboard.press('Escape');
   await page.locator('#file-input').setInputFiles({name:'Public تقرير.unsupported',mimeType:'application/octet-stream',buffer:Buffer.from('Public fixture')});
   await page.locator('#toast:visible').waitFor();const expected=home.translator(requested)('error.unsupported',{name:observe?'Public تقرير.unsupported':'\u2068Public تقرير.unsupported\u2069'});
   assert.equal(await page.locator('#toast-text').textContent(),expected);await capture('toast');await page.locator('#toast-close').click();
   await page.setViewportSize({width:800,height:900});await capture('narrow-home');await page.locator('#files-body tr').first().hover();await page.locator('#files-body .row-menu').first().click();await capture('narrow-row-menu');await page.keyboard.press('Escape');
   await page.goto(origin+'/example/?lang='+requested+'&connected=1#cloud');await page.locator('#crumbs:visible').waitFor();await page.locator('#files-body tr').first().waitFor();await capture('cloud-folder');await page.locator('#account-btn').click();await capture('connected-account');await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#account-panel').evaluate(el=>el.contains(document.activeElement)),true);await capture('connected-account-focus');await page.keyboard.press('Escape');
   row.status='PASS';
  }catch(e){row.status='FAIL';row.failures.push(e.stack);await page.screenshot({path:path.join(out,requested+'-'+scheme+'-failure.png')}).catch(()=>{});}
  finally{await context.close();await save();console.log(requested,scheme,row.status,row.failures[0]||'');}
 }
 assert.equal(outside.length,0);assert.equal(requests.length,0,JSON.stringify(requests));assert.equal(errors.length,0,JSON.stringify(errors));assert(rows.every(r=>r.status==='PASS'),'Home cases failed; see results.json');
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),driverSHA256,'driver changed');assert.equal(crypto.createHash('sha256').update(await fs.readFile(inspectorFile)).digest('hex'),inspectorSHA256,'inspector changed');
 for(const [f,hash]of Object.entries(provenance))assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(nodeRoot,f))).digest('hex'),hash,'input changed during capture: '+f);
 console.log('PASS Home DOM',rows.length,'profiles',rows.reduce((n,r)=>n+r.captures.length,0),'captures');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await browserServer?.close();if(server)await new Promise(resolve=>server.close(resolve));});
