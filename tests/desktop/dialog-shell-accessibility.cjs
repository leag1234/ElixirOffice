// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Actual renderer + HTML dialogs. The public IPC bridge fixture does not test
// native panels, file writes, permissions or Electron lifecycle.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.EO_PLAYWRIGHT_MODULE||'playwright-core');
const locale=require('../../desktop/locale.cjs');
(async()=>{
 const base=process.env.EO_BASE,assets=process.env.EO_DIALOG_ASSETS||path.resolve(__dirname,'../../desktop/assets'),out=process.env.EO_DIALOG_OUT||path.join(os.tmpdir(),'eo-shell-a11y-'+Date.now());
 assert(base&&['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Use an owned loopback renderer instance');
 await fs.mkdir(out,{recursive:true});assert.equal(await fs.stat(path.join(out,'results.json')).then(()=>true,()=>false),false,'Preserve previous receipts');
 const override=process.env.EO_DIALOG_RENDERER?await fs.readFile(process.env.EO_DIALOG_RENDERER,'utf8'):null,rows=[],browser=await chromium.launch({headless:true});
 const save=()=>fs.writeFile(path.join(out,'results.json'),JSON.stringify({kind:'Actual desktop renderer with public IPC fixture; no native/backend acceptance',rendererOverrideSha256:override?crypto.createHash('sha256').update(override).digest('hex'):null,rows},null,2)+'\n');
 try{for(const language of ['en','fr','de','ar'])for(const dark of [false,true]){
 const info=await locale.load(assets,[language]),context=await browser.newContext({viewport:{width:1366,height:900},locale:language,colorScheme:dark?'dark':'light'}),page=await context.newPage(),errors=[],outside=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&['stylesheet','script','font'].includes(r.request().resourceType()))errors.push(r.status()+' '+new URL(r.url()).pathname);});
 await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base+'/')||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();outside.push(u);return route.abort();});
 if(override)await page.route('**/renderer.js',route=>route.fulfill({contentType:'text/javascript',body:override}));
 await page.addInitScript(info=>{
  const writes=[];window.PublicDialogWrites=writes;
  window.eoDesktop=new Proxy({}, {get(_target,key){
   if(key==='onAction')return callback=>{window.PublicDialogAction=callback;};
   if(key==='onOperationStage')return ()=>{};
   const responses={locale:info,home:{recents:[],templates:[]},pending:null,recoveryOptions:{enabled:false,seconds:30},recoveryList:[{id:'public-recovery',name:'Public recovery.docx',modified:0}],author:'Public sample',fontPermission:false,fontChoice:'unset'};
   return async(...args)=>{if(['authorSave','recoverySettings','recoveryDelete','recoveryRestore','save','export','pdf'].includes(key)){writes.push(key);throw Error('Unexpected write from accessibility check');}return responses[key];};
  }});
 },{...info,capture:false});
 const headingIds=new Set();
 try{
 await page.goto(base+'/index.html');await page.waitForFunction(()=>window.EODesktopReady||window.EOLocalFailure,null,{timeout:30000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
 for(const [kind,number]of [['recovery',0],['options',1],['options',2]]){
  const row={kind,number,language,requestedDark:dark,status:'running'};rows.push(row);await save();
  try{
   if(kind==='options')await page.evaluate(()=>window.PublicDialogAction('settings'));
   const dialog=page.locator('dialog.desktop-options[open]');await dialog.waitFor();
   if(kind==='options')await dialog.locator('#computer-fonts-enabled').waitFor();
   row.aria=await dialog.ariaSnapshot();row.name=await dialog.evaluate(el=>el.getAttribute('aria-label')||(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim());
   row.headingId=await dialog.locator('h2').getAttribute('id');row.background=await dialog.evaluate(el=>getComputedStyle(el).backgroundColor);
   row.styleProof=await page.evaluate(()=>({homeCssLoaded:[...document.styleSheets].some(s=>s.href?.endsWith('/desktop-home/home.css')&&s.cssRules.length>0),surface:getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),darkPreference:matchMedia('(prefers-color-scheme: dark)').matches,bodyBackground:getComputedStyle(document.body).backgroundColor}));
   assert.equal(row.styleProof.homeCssLoaded,true,'Actual Home stylesheet is loaded');
   assert(row.styleProof.surface,'Actual Home surface variable is available');
   const alpha=row.background.startsWith('rgba(')?Number(row.background.split(',').at(-1).replace(')','')):row.background.startsWith('rgb(')?1:0;
   assert.equal(alpha,1,'Modal has an opaque styled surface');
   assert.equal(row.styleProof.darkPreference,dark,'Browser receives the requested theme preference');

   row.unnamedFields=await dialog.evaluate(el=>[...el.querySelectorAll('input,select,textarea')].filter(x=>{const r=x.getBoundingClientRect();return r.width&&r.height;}).filter(x=>!x.getAttribute('aria-label')&&!x.getAttribute('aria-labelledby')&&![...(x.labels||[])].some(l=>l.textContent.trim())).map(x=>x.id));
   row.screenshot=path.join(out,[kind,number,language,dark?'dark':'light'].join('-')+'.png');await page.screenshot({path:row.screenshot,animations:'disabled'});
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});row.escapeCloses=true;
   assert.equal(row.name,info.strings[kind==='options'?'options':'autoRecover']);assert(row.headingId&&!headingIds.has(row.headingId),'Unique heading ID for every modal');headingIds.add(row.headingId);
   assert.deepEqual(row.unnamedFields,[]);assert.deepEqual(await page.evaluate(()=>window.PublicDialogWrites),[]);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);row.status='pass';
  }catch(error){row.status='fail';row.error=error.message;}
  await save();
 }
 }catch(error){rows.push({kind:'renderer-startup',language,requestedDark:dark,status:'fail',error:error.message,errors});}
 finally{await context.close();await save();}
 }
 assert.equal(rows.length,24);assert(rows.every(x=>x.status==='pass'),'Every desktop modal name/label/lifecycle check passes');console.log('PASS desktop dialog accessibility24/24');
 }finally{await browser.close();await save();}
})().catch(error=>{console.error(error);process.exitCode=1});
