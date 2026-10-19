// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.EO_PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.EO_BASE,fixture=process.env.EO_TIP_FIXTURE,out=process.env.EO_TIP_OUT;
assert(base&&fixture&&out,'Explicit owned base, public DOCX and fresh output required');
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname));
(async()=>{
 await fs.mkdir(out,{recursive:true});assert.equal(await fs.stat(path.join(out,'results.json')).then(()=>true,()=>false),false,'Preserve previous receipt');
 const original=crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex'),browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),checks=[],errors=[],outside=[];
 const row={scope:'Actual production manager and Common.UI.info; constructor observer retains real instances to inspect warning anchors; public controls, no backend-warning/native/AT qualification',base,publicFixtureSha256:original};
 const check=(name,actual,expected)=>{try{assert.deepEqual(actual,expected);checks.push({name,status:'pass',actual,expected})}catch(e){checks.push({name,status:'fail',actual,expected,error:e.message})}};
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>{const u=r.request().url();if(u.startsWith(base+'/')||u.startsWith('blob:')||u.startsWith('data:'))return r.continue();outside.push(u.split('?')[0]);return r.abort()});
 try{
 await page.goto(base+'/example/local.html?lang=en');await page.locator('#file').setInputFiles(fixture);await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
 const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded(),null,{timeout:60000});await page.waitForTimeout(1100);
 for(let n=0;n<8&&await frame.locator('.synch-tip-root:visible').count();n++)await frame.locator('.synch-tip-root:visible').last().locator('.btn-div,.close').first().click();
 assert.equal(await frame.locator('.synch-tip-root:visible').count(),0);
 row.observed=await frame.evaluate(()=>{
 const Original=Common.UI.SynchronizeTip,state={tips:{},completed:0};window.EOStackChecks=state;
 function Observe(options){const instance=new Original(options);for(const name of ['a','b','c','d'])if(options.extCls?.includes('eo-stack-'+name))state.tips[name]=instance;return instance}
 Observe.prototype=Original.prototype;Object.setPrototypeOf(Observe,Original);Common.UI.SynchronizeTip=Observe;
 try{
 const show=(name,guided=false)=>Common.UI.TooltipManager.showTip({step:'eo-stack-'+name,name:guided?'eo-stack-guide-dismissal':undefined,target:'#toolbar',header:'Public stack heading',text:'Public stack control '+name,extCls:'eo-stack-'+name,isNewFeature:guided,noHighlight:true,callback:guided?()=>state.completed++:undefined});
 show('a');show('b',true);
 state.modal=Common.UI.info({title:'Public stack lifecycle',msg:'Public actual modal',animate:false});
 Common.UI.TooltipManager.closeTip('eo-stack-a');
 show('c');
 const cVisible=state.tips.c.isVisible();
 Common.UI.TooltipManager.removeTip('eo-stack-b');
 show('d');
 return {cVisible,dTargetsSurvivingC:state.tips.d.target[0]===state.tips.c.cmpEl[0],actualDTargetClass:state.tips.d.target[0].className,completed:state.completed,stored:localStorage.getItem('eo-stack-guide-dismissal')};
 }finally{Common.UI.SynchronizeTip=Original}
 });
 check('surviving-warning-visible',row.observed.cVisible,true);
 check('next-warning-targets-newest-surviving-warning',row.observed.dTargetsSurvivingC,true);
 check('removing-suspended-guide-does-not-complete-it',{completed:row.observed.completed,stored:row.observed.stored},{completed:0,stored:null});
 check('document-unmodified',await page.evaluate(()=>EOLocalSession.controller.isModified()),false);
 check('no-js-errors-or-egress',{errors,outside},{errors:[],outside:[]});
 row.screenshot=path.join(out,'warning-stack.png');await page.screenshot({path:row.screenshot,animations:'disabled'});
 row.status=checks.every(x=>x.status==='pass')?'pass':'fail';
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex'),original);
 }catch(e){row.status='unverified';row.error=e.message}
 finally{await context.close();await browser.close();row.checks=checks;row.errors=errors;row.outside=outside;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(row,null,2)+'\n')}
 console.log('RESULT',JSON.stringify({status:row.status,checks:checks.length,failures:checks.filter(x=>x.status==='fail').map(x=>x.name),unverified:row.status==='unverified'?1:0,error:row.error||null}));
 if(row.status!=='pass')process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
