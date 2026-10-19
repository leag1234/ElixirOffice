// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.EO_PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.EO_BASE,fixture=process.env.EO_TIP_FIXTURE,out=process.env.EO_TIP_OUT;
assert(base&&fixture&&out,'Set EO_BASE, EO_TIP_FIXTURE (public DOCX) and fresh EO_TIP_OUT');
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Owned loopback only');
(async()=>{
 await fs.mkdir(out,{recursive:true});assert.equal(await fs.stat(path.join(out,'results.json')).then(()=>true,()=>false),false,'Preserve earlier receipts');
 const original=crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex'),rows=[],browser=await chromium.launch({headless:true});
 const save=()=>fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Production tooltip manager with public target inside an actual Common.UI.info window; no provider, native or AT qualification',base,publicFixtureSha256:original,rows},null,2)+'\n');
 try{
 for(const mode of ['close','hide']){
 const row={mode,status:'running',checks:[]},context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),errors=[],outside=[];
 rows.push(row);await save();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base+'/')||u.startsWith('blob:')||u.startsWith('data:'))return route.continue();outside.push(u.split('?')[0]);return route.abort()});
 const check=(name,actual,expected)=>{try{assert.deepEqual(actual,expected);row.checks.push({name,status:'pass',actual,expected})}catch(e){row.checks.push({name,status:'fail',actual,expected,error:e.message})}};
 try{
 await page.goto(base+'/example/local.html?lang=en');await page.locator('#file').setInputFiles(fixture);await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
 const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded(),null,{timeout:60000});await page.waitForTimeout(1100);
 for(let n=0;n<8&&await frame.locator('.synch-tip-root:visible').count();n++)await frame.locator('.synch-tip-root:visible').last().locator('.btn-div,.close').first().click();
 assert.equal(await frame.locator('.synch-tip-root:visible').count(),0,'Ordinary tutorials acknowledged before control');
 await frame.evaluate(()=>{
 window.EOTargetChecks={completed:0,modal:Common.UI.info({title:'Public target lifecycle',msg:'Public dialog containing a guided target',animate:false})};
 const button=document.createElement('button');button.id='eo-public-modal-target';button.textContent='Public target';button.style.cssText='display:block;width:120px;height:28px;margin:8px';EOTargetChecks.modal.$window[0].appendChild(button);
 });
 assert.equal(await frame.locator('#eo-public-modal-target:visible').count(),1,'Control target initially visible');
 await frame.evaluate(()=>Common.UI.TooltipManager.showTip({step:'eo-public-modal-guide',name:'eo-public-modal-guide-dismissal',target:'#eo-public-modal-target',text:'Public target guide',header:'Public guide',extCls:'eo-public-modal-guide',isNewFeature:true,callback:()=>EOTargetChecks.completed++}));
 check('modal-defers-target-guide',await frame.locator('.eo-public-modal-guide:visible').count(),0);
 await frame.evaluate(mode=>EOTargetChecks.modal[mode](),mode);await page.waitForTimeout(80);
 row.targetAfterTeardown=await frame.locator('#eo-public-modal-target:visible').count();assert.equal(row.targetAfterTeardown,0,'Actual window target has disappeared');
 check('departed-target-has-no-orphan-guide',await frame.locator('.eo-public-modal-guide:visible').count(),0);
 check('teardown-does-not-complete-guide',await frame.evaluate(()=>({completed:EOTargetChecks.completed,stored:localStorage.getItem('eo-public-modal-guide-dismissal')})),{completed:0,stored:null});
 check('document-unmodified',await page.evaluate(()=>EOLocalSession.controller.isModified()),false);
 row.screenshot=path.join(out,'target-'+mode+'.png');await page.screenshot({path:row.screenshot,animations:'disabled'});
 row.status=row.checks.every(c=>c.status==='pass')?'pass':'fail';assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 }catch(e){row.status='unverified';row.error=e.message}
 finally{row.errors=errors;row.outside=outside;await context.close();await save();console.log(mode,row.status,row.checks.filter(c=>c.status==='fail').map(c=>c.name).join(','),row.error||'')}
 }
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex'),original);
 console.log('RESULT',JSON.stringify({rows:rows.length,checks:rows.reduce((n,r)=>n+r.checks.length,0),failedChecks:rows.reduce((n,r)=>n+r.checks.filter(c=>c.status==='fail').length,0),unverified:rows.filter(r=>r.status==='unverified').length,publicOriginalUnchanged:true}));
 if(rows.some(r=>r.status!=='pass'))process.exitCode=1;
 }finally{await browser.close();await save()}
})().catch(e=>{console.error(e);process.exitCode=1});
