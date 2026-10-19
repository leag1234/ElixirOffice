// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.EO_PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.EO_BASE,fixture=process.env.EO_TIP_FIXTURE,out=process.env.EO_TIP_OUT;
assert(base&&fixture&&out,'Set EO_BASE, EO_TIP_FIXTURE (public DOCX) and a fresh EO_TIP_OUT');
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Owned loopback only');
(async()=>{
 await fs.mkdir(out,{recursive:true});assert.equal(await fs.stat(path.join(out,'results.json')).then(()=>true,()=>false),false,'Preserve previous attempts');
 const original=crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex'),rows=[],browser=await chromium.launch({headless:true});
 const save=()=>fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Ordinary local open/Alt+I plus explicitly labeled production manager/real-alert controls; no provider, tool, native or AT qualification',base,publicFixtureSha256:original,rows},null,2)+'\n');
 try{
 for(const language of (process.env.EO_TIP_LANGS||'en,fr,de,ar').split(','))for(const theme of (process.env.EO_TIP_THEMES||'theme-white,theme-night').split(',')){
 const row={language,theme,status:'running',checks:[],screenshots:[]},context=await browser.newContext({viewport:{width:1366,height:900},locale:language,colorScheme:theme==='theme-night'?'dark':'light'}),page=await context.newPage(),errors=[],outside=[],downloads=[],popups=[];
 rows.push(row);await save();
 page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d.suggestedFilename()));page.on('popup',p=>{popups.push(p.url());p.close().catch(()=>{})});
 await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base+'/')||u.startsWith('blob:')||u.startsWith('data:'))return route.continue();outside.push(u.split('?')[0]);return route.abort()});
 await context.addInitScript(value=>localStorage.setItem('ui-theme-id',value),theme);
 const check=(name,actual,expected)=>{try{assert.deepEqual(actual,expected);row.checks.push({name,status:'pass',actual,expected})}catch(e){row.checks.push({name,status:'fail',actual,expected,error:e.message})}};
 async function shot(name){const f=path.join(out,name+'-'+language+'-'+theme+'.png');await page.screenshot({path:f,animations:'disabled'});row.screenshots.push(f);await save();}
 try{
 await page.goto(base+'/example/local.html?lang='+language);await page.locator('#file').setInputFiles(fixture);await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
 const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded(),null,{timeout:60000});await page.waitForTimeout(1100);
 check('actual-editor-theme',await frame.evaluate(()=>window.uitheme?.id),theme);
 check('ordinary-tutorial-present',await frame.locator('.synch-tip-root:visible').count()>0,true);
 await shot('ordinary-open');
 await frame.locator('#editor_sdk').click({position:{x:80,y:100}});await page.keyboard.press('Alt+i');await frame.locator('.elixir-ai-bar:visible').waitFor();await page.waitForTimeout(200);
 row.ordinaryActions=await frame.locator('.elixir-ai-actions button:visible').evaluateAll(buttons=>buttons.map(el=>{const r=el.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:el.textContent,centerHit:el===top||el.contains(top),hitClass:top?.className}}));
 check('ordinary-ai-has-actions',row.ordinaryActions.length>=2,true);
 check('ordinary-ai-actions-uncovered',row.ordinaryActions.every(a=>a.centerHit),true);
 check('ordinary-ai-suspends-guided-tip',await frame.locator('.synch-tip-root:visible').count(),0);
 check('suspension-does-not-persist-dismissal',await frame.evaluate(()=>localStorage.getItem('de-help-tip-multipage-view-statusbar')),null);
 await shot('ordinary-ai');
 await frame.locator('.elixir-ai-bar').press('Escape');await page.waitForTimeout(150);
 check('ordinary-ai-escape-closes',await frame.locator('.elixir-ai-bar:visible').count(),0);
 check('ordinary-tip-resumes',await frame.locator('.synch-tip-root:visible').count()>0,true);
 await page.keyboard.press('Alt+i');await frame.locator('.elixir-ai-bar:visible').waitFor();
 await frame.evaluate(()=>DE.getController('Common.Controllers.ElixirAI').openSettings(false));
 check('custom-settings-nested-with-bar',await frame.locator('#elixir-ai-settings:visible').count(),1);
 await frame.evaluate(()=>{const b=DE.getController('Common.Controllers.ElixirAI').bar;b.setState('running');b.close()});
 check('running-bar-refuses-close',await frame.locator('.elixir-ai-bar:visible').count(),1);
 check('running-bar-keeps-guides-suspended',await frame.locator('.synch-tip-root:visible').count(),0);
 await frame.evaluate(()=>{const b=DE.getController('Common.Controllers.ElixirAI').bar;b.setState('idle');b.close();b.close()});
 check('custom-settings-retains-independent-owner',await frame.locator('.synch-tip-root:visible').count(),0);
 await frame.locator('#elixir-ai-settings [data-act=close]').click();
 check('last-custom-surface-restores-tip',await frame.locator('.synch-tip-root:visible').count()>0,true);
 // Ordinary tutorial acknowledgement, then explicit production-component controls.
 for(let n=0;n<8&&await frame.locator('.synch-tip-root:visible').count();n++)await frame.locator('.synch-tip-root:visible').last().locator('.btn-div,.close').first().click();
 check('ordinary-got-it-persists',await frame.evaluate(()=>localStorage.getItem('de-help-tip-multipage-view-statusbar')),'1');
 await frame.evaluate(()=>{
 window.EOTipChecks={first:0,next:0,pending:0,alerts:[]};
 Common.UI.TooltipManager.addTips({
 'eo-s2-first':{name:'eo-public-s2-first',target:'#toolbar',text:'Public first tutorial',header:'Public first heading',extCls:'eo-s2-first',isNewFeature:true,next:'eo-s2-next',callback:()=>EOTipChecks.first++},
 'eo-s2-next':{name:'eo-public-s2-next',target:'#status-btn-multiple-pages',placement:'top-left',text:'Public next tutorial',header:'Public next heading',extCls:'eo-s2-next',isNewFeature:true,prev:'eo-s2-first',callback:()=>EOTipChecks.next++}
 });
 Common.UI.TooltipManager.showTip('eo-s2-first');
 EOTipChecks.alerts.push(Common.UI.info({title:'Public alert heading',msg:'Public alert message',animate:false}));
 const desc=document.createElement('p');desc.id='eo-s2-explicit-description';desc.textContent='Public explicit description';document.body.appendChild(desc);EOTipChecks.desc=desc;
 EOTipChecks.alerts.push(Common.UI.confirm({title:'Public nested heading',msg:'Public nested message',ariaDescribedby:desc.id,animate:false}));
 });
 check('real-alerts-nested',await frame.locator('.asc-window.modal:visible').count(),2);
 check('real-alert-message-description',await frame.evaluate(()=>{const [a,b]=EOTipChecks.alerts,el=a.$window[0],id=el.getAttribute('aria-describedby');return {role:el.getAttribute('role'),message:document.getElementById(id)?.textContent,distinct:el.querySelector('.info-box .text > span').id!==b.$window[0].querySelector('.info-box .text > span').id}}),{role:'alertdialog',message:'Public alert message',distinct:true});
 check('real-alert-explicit-description-precedence',await frame.evaluate(()=>EOTipChecks.alerts[1].$window.attr('aria-describedby')),'eo-s2-explicit-description');
 check('nested-modals-suspend-existing-guide',await frame.locator('.eo-s2-first:visible').count(),0);
 await frame.evaluate(()=>{
 Common.UI.TooltipManager.addTips({'eo-s2-first':{target:'#toolbar',text:'Replacement must not overwrite a suspended tip',isNewFeature:true,callback:()=>EOTipChecks.first+=100}});
 Common.UI.TooltipManager.showTip('eo-s2-first');
 Common.UI.TooltipManager.showTip({step:'eo-s2-pending',name:'eo-public-s2-pending',target:'#toolbar',text:'Public pending tutorial without a header',extCls:'eo-s2-pending',isNewFeature:true,callback:()=>EOTipChecks.pending++});
 Common.UI.TooltipManager.showTip({step:'eo-s2-warning',target:'#toolbar',text:'Public SDK warning control',header:'Public warning',extCls:'eo-s2-warning',noHighlight:true,showButton:false,multiple:true});
 EOTipChecks.directWarning=new Common.UI.SynchronizeTip({target:$('#toolbar'),text:'Public direct SDK warning control',textHeader:'Public direct warning',extCls:'eo-s2-direct-warning',showLink:false});EOTipChecks.directWarning.show();
 });
 check('nested-modals-defer-new-guide',await frame.locator('.eo-s2-pending:visible').count(),0);
 check('manager-warning-preserved',await frame.locator('.eo-s2-warning:visible').count(),1);
 check('direct-sdk-warning-preserved',await frame.locator('.eo-s2-direct-warning:visible').count(),1);
 check('suspension-has-no-completion-effects',await frame.evaluate(()=>({first:EOTipChecks.first,next:EOTipChecks.next,pending:EOTipChecks.pending,firstStored:localStorage.getItem('eo-public-s2-first'),pendingStored:localStorage.getItem('eo-public-s2-pending')})),{first:0,next:0,pending:0,firstStored:null,pendingStored:null});
 await shot('nested-modal-warning-controls');
 await frame.evaluate(()=>{EOTipChecks.directWarning.close();Common.UI.TooltipManager.closeTip('eo-s2-warning');EOTipChecks.alerts[1].close();});await page.waitForTimeout(100);
 check('closing-inner-keeps-guides-suspended',await frame.locator('.eo-s2-first:visible,.eo-s2-pending:visible').count(),0);
 check('closing-inner-keeps-outer',await frame.locator('.asc-window.modal:visible').count(),1);
 await frame.evaluate(()=>EOTipChecks.alerts[0].hide());await page.waitForTimeout(100);
 check('last-modal-hide-restores-existing',await frame.locator('.eo-s2-first:visible').count(),1);
 check('last-modal-hide-does-not-burst-queued-guides',await frame.locator('.eo-s2-pending:visible').count(),0);
 check('resume-does-not-complete-guides',await frame.evaluate(()=>({first:EOTipChecks.first,pending:EOTipChecks.pending,firstStored:localStorage.getItem('eo-public-s2-first')})),{first:0,pending:0,firstStored:null});
 await frame.locator('.eo-s2-first .btn-div').click();await page.waitForTimeout(100);
 check('ordinary-acknowledgement-calls-once',await frame.evaluate(()=>({first:EOTipChecks.first,pending:EOTipChecks.pending,firstStored:localStorage.getItem('eo-public-s2-first'),pendingStored:localStorage.getItem('eo-public-s2-pending')})),{first:1,pending:0,firstStored:'1',pendingStored:null});
 check('ordinary-chain-advances',await frame.locator('.eo-s2-next:visible').count(),1);
 await frame.locator('.eo-s2-next .btn-div').click();
 check('next-guide-completes-once',await frame.evaluate(()=>({next:EOTipChecks.next,stored:localStorage.getItem('eo-public-s2-next')})),{next:1,stored:'1'});
 check('queued-guide-follows-normal-chain',await frame.locator('.eo-s2-pending:visible').count(),1);
 check('pending-absent-heading-omitted',await frame.locator('.eo-s2-pending .tip-header').count(),0);
 await frame.locator('.eo-s2-pending .btn-div').click();
 check('pending-guide-completes-once',await frame.evaluate(()=>({pending:EOTipChecks.pending,stored:localStorage.getItem('eo-public-s2-pending')})),{pending:1,stored:'1'});
 await frame.evaluate(()=>{EOTipChecks.alerts[0].close();EOTipChecks.desc.remove()});
 // Defensive controls: direct manager input, not an ordinary missing-header diagnosis.
 for(const variant of ['missing','null','empty','provided']){
 await frame.evaluate(variant=>{
 const o={step:'eo-s2-header-'+variant,target:'#toolbar',text:'Public header lifecycle control',extCls:'eo-s2-header-'+variant,isNewFeature:true,multiple:true};
 if(variant==='null')o.header=null;else if(variant==='empty')o.header='';else if(variant==='provided')o.header='Public supplied heading';
 Common.UI.TooltipManager.showTip(o);
 },variant);
 for(let repeat=0;repeat<2;repeat++){
 if(repeat)await frame.evaluate(variant=>Common.UI.TooltipManager.showTip('eo-s2-header-'+variant),variant);
 const header=await frame.locator('.eo-s2-header-'+variant).evaluate(el=>({count:el.querySelectorAll('.tip-header').length,badges:el.querySelectorAll('.tip-header > span').length,text:el.querySelector('.tip-header')?.textContent||''}));
 if(variant==='provided'){check('provided-heading-one-badge-'+repeat,header.badges,1);check('provided-heading-retained-'+repeat,header.text.endsWith('Public supplied heading'),true)}
 else check('absent-heading-'+variant+'-'+repeat,header.count,0);
 await frame.locator('.eo-s2-header-'+variant+' .btn-div').click();
 }
 await frame.evaluate(variant=>Common.UI.TooltipManager.removeTip('eo-s2-header-'+variant),variant);
 }
 check('document-unmodified',await page.evaluate(()=>EOLocalSession.controller.isModified()),false);
 check('no-js-errors',errors,[]);check('no-outside-requests',outside,[]);check('no-downloads',downloads,[]);check('no-popups',popups,[]);
 row.status=row.checks.every(c=>c.status==='pass')?'pass':'fail';
 }catch(e){row.status='unverified';row.error=e.message;await shot('unverified').catch(()=>{})}
 finally{row.errors=errors;row.outside=outside;row.downloads=downloads;row.popups=popups;await context.close();await save();console.log(language,theme,row.status,row.checks.filter(c=>c.status==='fail').map(c=>c.name).join(','),row.error||'')}
 }
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex'),original);
 console.log('RESULT',JSON.stringify({rows:rows.length,pass:rows.filter(r=>r.status==='pass').length,fail:rows.filter(r=>r.status==='fail').length,unverified:rows.filter(r=>r.status==='unverified').length,checks:rows.reduce((n,r)=>n+r.checks.length,0),failedChecks:rows.reduce((n,r)=>n+r.checks.filter(c=>c.status==='fail').length,0),publicOriginalUnchanged:true}));
 if(rows.some(r=>r.status!=='pass'))process.exitCode=1;
 }finally{await browser.close();await save()}
})().catch(e=>{console.error(e);process.exitCode=1});
