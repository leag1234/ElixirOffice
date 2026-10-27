// SPDX-License-Identifier: AGPL-3.0-only
const {launch,stop,editable,root,sleep,fixture}=require('./harness.cjs'),{modal,keys,edit,text}=require('./lifecycle.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const report=[];
async function create(format){
 const target=path.join(await fs.mkdtemp(path.join(require('node:os').tmpdir(),'eo-template-')),'new.'+format);
 const env=await launch({profile:'new-'+format+'-'+Date.now()});
 try{
  assert.equal(await env.page.locator('[data-new]').count(),3);
  await env.page.locator('[data-new="'+format+'"]').click();await editable(env);await edit(env);
  await require('./file-action.cjs')(env.page,'save-as');await require('./save-as-native.cjs').path(env,target);
  await env.page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);assert(text(target).includes('EODESKTOP'));
  assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),false);
  report.push({check:'new/save-as',format,bytes:(await fs.stat(target)).size,errors:env.errors});
 }finally{await stop(env)}
}
async function closeCases(){
 const target=await fixture('sample.docx');
 const env=await launch({file:target,profile:'close-'+Date.now()});
 try{
  await editable(env);
  // Request native close immediately after editing, without waiting for the 500 ms state poll.
  await env.page.evaluate(()=>{EOLocalSession.api.asc_enterText(Array.from('CLOSERACE',c=>c.codePointAt(0)))});
  keys(env,'close');await modal(env);keys(env,'escape');await sleep(300);
  assert(!env.page.isClosed());assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()));
  if(process.env.EO_XVFB_PID)keys(env,'focus-main');
  keys(env,'close');await modal(env);const closed=env.page.waitForEvent('close',{timeout:90000});keys(env,'save');
  await closed;
  assert(text(target).includes('CLOSERACE'));
  report.push({check:'immediate-dirty-close/cancel/save',saved:true});
 }finally{await stop(env)}
}
async function privacyFonts(){
 const profile='privacy-'+Date.now();
 await require('./font-profile.cjs').prepareDeclinedProfile(root,profile);
 const env=await launch({profile});
 try{
  assert.equal(await env.page.evaluate(()=>eoDesktop.fontPermission()),false);
  await require('./font-profile.cjs').assertNoFonts(env.page);
  assert(await env.page.evaluate(async()=>{try{await eoDesktop.font('/etc/passwd');return false}catch(e){return /permission/.test(e.message)}}));
  const privacy=await require('./privacy.cjs').networkDenied(env.page),blocked=privacy.rendererRequestsReceived===0;
  assert(blocked);assert.equal(await env.page.evaluate(()=>typeof require),'undefined');
  const labels=await env.page.evaluate(async()=> (await eoDesktop.locale()).strings);
  const openOptions=async()=>{await env.page.locator('#home [data-action=settings]').click();await options.getByRole('button',{name:labels.cancel,exact:true}).waitFor({state:'visible',timeout:20000})};
  const options=env.page.locator('dialog.desktop-preferences[open]'),font=options.locator('#computer-fonts-enabled');
  const closeOptions=()=>options.getByRole('button',{name:labels.cancel,exact:true}).click();
  await openOptions();await font.check();await modal(env);keys(env,'escape');
  await env.page.waitForFunction(()=>{const field=document.getElementById('computer-fonts-enabled');return field&&!field.disabled&&!field.checked});
  await require('./font-profile.cjs').assertNoFonts(env.page);
  await font.check();await modal(env);keys(env,'allow');
  await env.page.waitForFunction(()=>{const field=document.getElementById('computer-fonts-enabled');return field&&!field.disabled&&field.checked});
  assert.equal(await options.locator('#computer-fonts-status').textContent(),labels.fontEnabled);
  const list=await env.page.evaluate(()=>eoDesktop.fonts());assert(list.length>0);
  const bytes=await env.page.evaluate(id=>eoDesktop.font(id).then(b=>b.byteLength),list[0].id);assert(bytes>0&&bytes<=20*1024*1024);
  assert(await env.page.evaluate(async()=>{try{await eoDesktop.font('/etc/passwd');return false}catch(e){return /Unknown font/.test(e.message)}}));
  await closeOptions();await openOptions();
  await env.page.waitForFunction(()=>{const field=document.getElementById('computer-fonts-enabled');return field&&!field.disabled&&field.checked});
  assert(await font.isChecked());assert(await font.isEnabled());await closeOptions();
  report.push({check:'network-block/node-isolation/font-consent',faces:list.length,bytes,privacy,requests:env.requests});
 }finally{await stop(env)}
 const reopened=await launch({profile});
 try{assert((await reopened.page.evaluate(()=>eoDesktop.fonts())).length>0);assert.equal(await reopened.page.evaluate(()=>eoDesktop.fontConsent()),true);report.push({check:'font-consent-persists-after-restart'});}finally{await stop(reopened)}
}
async function single(){
 const first=await fixture('sample.docx'),second=await fixture('sample.xlsx');
 const env=await launch({file:first,profile:'single-'+Date.now()});
 try{
  await editable(env);
  const log=await fs.open(path.join(root,'results/single-second.log'),'w');
  const other=cp.spawn(env.launchSpec.executable,[...env.launchSpec.entry,second],{cwd:root,env:env.launchSpec.environment,stdio:['ignore',log.fd,log.fd]});
  const exit=await new Promise((resolve,reject)=>{other.once('error',reject);other.once('exit',resolve)});await log.close();assert.equal(exit,0);
  const documents=require('./document-pages.cjs');let selected;
  const deadline=Date.now()+120000;
  while(!selected&&Date.now()<deadline){
   assert.equal(env.application.exitCode,null,'First instance exited during argument forwarding');
   for(const shell of documents.shellPages(env.browser)){
    const state=await shell.evaluate(async()=> (await window.eoTabs.initial()).state);
    for(const page of env.documentPages()){
     const identity=await page.evaluate(()=>eoDesktop.identity());
     if(identity.documentId!==state.activeId||identity.windowId!==state.windowId)continue;
     assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
     if(await page.evaluate(()=>window.EOLocalSession?.format==='xlsx')){selected=page;break}
    }
   }
   if(!selected)await sleep(100);
  }
  assert(selected,'Second argument did not activate the spreadsheet in an owned tab shell');
  await editable({...env,page:selected});
  report.push({check:'single-instance/second-argument',pid:env.application.pid,secondExit:exit});
 }finally{await stop(env)}
}
if(require.main===module)(async()=>{
 for(const format of ['docx','xlsx','pptx']){await create(format);console.log('PASS new/save-as',format);await fs.writeFile(path.join(root,'results/advanced.json'),JSON.stringify(report,null,2))}
 await closeCases();await privacyFonts();await single();
 await fs.writeFile(path.join(root,'results/advanced.json'),JSON.stringify(report,null,2));console.log('PASS advanced',report);
})().catch(e=>{console.error(e);process.exitCode=1});

module.exports={create,closeCases,privacyFonts,single,report};
