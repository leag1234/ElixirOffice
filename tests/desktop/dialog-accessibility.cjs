// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.EO_PLAYWRIGHT_MODULE||'playwright-core');
const os=require('node:os');
const fixtures=process.env.EO_DIALOG_FIXTURES,baseUrl=process.env.EO_BASE;
assert(fixtures&&baseUrl,'Set EO_DIALOG_FIXTURES (public new.docx/new.xlsx) and EO_BASE (owned local-mode instance)');
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(baseUrl).hostname),'Use an owned loopback instance');
const out=process.env.EO_DIALOG_OUT||path.join(os.tmpdir(),'eo-dialog-a11y-'+Date.now());
const attempt='actual-current-dialog-accessibility';
const cases=[
 ['shared-review-changes','docx','Explicit actual component with empty public review collection; no acceptance/rejection',()=>{
 const c=DE.getController('Common.Controllers.ReviewChanges');
 window.StudyWindow=new Common.Views.ReviewChangesDialog({popoverChanges:new Common.Collections.ReviewChanges(),mode:c.appConfig||{},docProtection:c._state.docProtection});StudyWindow.show(450,220);
 }],
 ['word-image-layout-options','docx','Real SDK insertion of public embedded PNG, selection and actual Layout Options button; never saved',async()=>{
 Asc.editor.AddImageUrl(['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=']);
 for(let i=0;i<100;i++){if(document.querySelector('.elx-lo-btn')?.getBoundingClientRect().width){await new Promise(r=>setTimeout(r,700));document.querySelector('.elx-lo-btn').click();return;} await new Promise(r=>setTimeout(r,50));}
 throw Error('Real image layout button unavailable after SDK insert');
 }],
 ['word-image-advanced','docx','Real SDK public PNG insertion, selected image and actual ContextTabs openImageAdvanced; cancelled',async()=>{
 Asc.editor.AddImageUrl(['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=']);
 for(let i=0;i<100;i++){if(Asc.editor.getSelectedElements().some(x=>x.get_ObjectType()===Asc.c_oAscTypeSelectElement.Image)){DE.getController('ContextTabs').openImageAdvanced(9);return;}await new Promise(r=>setTimeout(r,50));}
 throw Error('Real inserted image not selected');
 }],
 ['cell-formula-wizard','xlsx','Actual SDK asc_startWizard SUM on disposable public workbook; no formula acceptance',()=>Asc.editor.asc_startWizard(Asc.editor.asc_getFormulaLocaleName('SUM'),true)],
 ['cell-sheet-rename-dialog','xlsx','Actual constructor with public current sheet name and current workbook name list; no rename',()=>{
 const api=Asc.editor,names=Array.from({length:api.asc_getWorksheetsCount()},(_,i)=>api.asc_getWorksheetName(i));
 window.StudyWindow=new SSE.Views.Statusbar.RenameDialog({current:names[0],names,handler:()=>{}});StudyWindow.show();
 }],
 ['cell-sheet-copy-dialog','xlsx','Actual Statusbar.moveWorksheet controller and current workbook capabilities; cancelled',()=>SSE.getController('Statusbar').moveWorksheet([0],false)],
 ['blocked-hyperlink-warning-word','docx','Actual security handler with inert unsupported-scheme string; must not open a window',()=>DE.getController('DocumentHolder').onHyperlinkClick('javascript:void(0)')],
 ['blocked-hyperlink-warning-cell','xlsx','Actual security handler with inert unsupported-scheme string; must not open a window',()=>SSE.getController('DocumentHolder').onApiHyperlinkClick('javascript:void(0)')]
];
(async()=>{
 await fs.mkdir(out,{recursive:true});assert.equal(await fs.stat(path.join(out,'results.json')).then(()=>true,()=>false),false,'Use a fresh output directory; preserve failed receipts');const base=baseUrl,rows=[],hashes={};
 for(const ext of ['docx','xlsx'])hashes[ext]=crypto.createHash('sha256').update(await fs.readFile(path.join(fixtures,'new.'+ext))).digest('hex');
 const browser=await chromium.launch({headless:true});
 const save=()=>fs.writeFile(path.join(out,'results.json'),JSON.stringify({attempt,kind:'Current source actual components and public SDK fixtures; per-row trigger qualification',rows},null,2)+'\n');
 try{
 for(const lang of (process.env.EO_DIALOG_LANGS||'en,fr,de,ar').split(','))for(const dark of [false,true])for(const [id,ext,stimulus,trigger]of cases){
 const row={family:id,language:lang,requestedDark:dark,stimulus,status:'running'},context=await browser.newContext({viewport:{width:1366,height:900},locale:lang,colorScheme:dark?'dark':'light'}),page=await context.newPage(),errors=[],outside=[],downloads=[],popups=[];
 rows.push(row);await save();page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d.suggestedFilename()));page.on('popup',p=>{popups.push(p.url());p.close().catch(()=>{});});
 await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base+'/')||u.startsWith('blob:')||u.startsWith('data:'))return route.continue();outside.push(u);return route.abort();});
 await context.addInitScript(theme=>localStorage.setItem('ui-theme-id',theme),dark?'theme-night':'theme-white');
 try{
 await page.goto(base+'/example/local.html?lang='+lang);await page.locator('#file').setInputFiles(path.join(fixtures,'new.'+ext));
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
 const frame=page.frames().find(f=>f.url().includes('/'+(ext==='docx'?'documenteditor':'spreadsheeteditor')+'/main/'));assert(frame);await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded(),null,{timeout:60000});
 row.dismissedTips=[];
 async function closeTips(stage){
  for(let n=0;n<8;n++){const tip=frame.locator('.synch-tip-root:visible').first();if(!await tip.count())return;
   const text=await tip.innerText(),button=tip.locator('.close:visible,.btn-div:visible').first();
   if(!await button.count()){row.dismissedTips.push({stage,text,closed:false});return;}
   row.dismissedTips.push({stage,text,closed:true});await button.click({force:true});await page.waitForTimeout(60);
  }
 }
 await closeTips('before target');
 if(id==='shared-review-changes'){
  row.primitiveNames=await frame.evaluate(()=>{
   const A=new Common.UI.Window({title:'Public first heading',modal:false});A.show();A.setTitle('Public updated heading');
   const B=new Common.UI.Window({title:'Public visible heading',ariaLabel:'Public explicit name',modal:false});B.show();B.setTitle('Public changed heading');
   const label=document.createElement('p');label.id='public-dialog-label-'+A.cid;label.textContent='Public external label';document.body.append(label);
   const C=new Common.UI.Window({title:'Public another heading',ariaLabelledby:label.id,modal:false});C.show();
   const name=w=>{const el=w.$window[0],id=el.getAttribute('aria-labelledby');return id?document.getElementById(id)?.textContent:el.getAttribute('aria-label');};
   const result={updated:name(A),explicit:name(B),external:name(C),headingIds:[A,B,C].map(w=>w.$window.find('> .header > .title').attr('id'))};
   C.close();B.close();A.close();label.remove();return result;
  });
  assert.equal(row.primitiveNames.updated,'Public updated heading');assert.equal(row.primitiveNames.explicit,'Public explicit name');assert.equal(row.primitiveNames.external,'Public external label');assert.equal(new Set(row.primitiveNames.headingIds).size,3);
 }
 await frame.evaluate('('+trigger.toString()+')()');
 await page.waitForTimeout(500);await closeTips('after target');
 const sel=id==='word-image-layout-options'?'.elx-lo-pane':'.asc-window',dlg=frame.locator(sel+':visible').last();await dlg.waitFor({timeout:10000});await page.waitForTimeout(350);
 row.observation=await dlg.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),v=x=>{const r=x.getBoundingClientRect();return r.width>0&&r.height>0;};
 return {text:el.innerText,role:el.getAttribute('role'),ariaModal:el.getAttribute('aria-modal'),ariaLabel:el.getAttribute('aria-label'),labelledby:el.getAttribute('aria-labelledby'),direction:s.direction,background:s.backgroundColor,color:s.color,font:s.font,bodyClass:document.body.className,theme:window.uitheme?.id,rect:{x:r.x,y:r.y,width:r.width,height:r.height},overflow:el.scrollWidth>el.clientWidth,focusedInside:el.contains(document.activeElement),focus:document.activeElement?.outerHTML?.slice(0,300),fields:[...el.querySelectorAll('input,select,textarea')].filter(v).map(x=>({id:x.id,aria:x.getAttribute('aria-label'),labels:[...(x.labels||[])].map(l=>l.textContent)})),buttons:[...el.querySelectorAll('button,[role=button]')].filter(v).map(x=>({text:x.textContent,aria:x.getAttribute('aria-label'),result:x.getAttribute('result')}))};});
 row.accessibility=await dlg.evaluate(el=>{
 const name=x=>{const refs=x.getAttribute('aria-labelledby');return refs?refs.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim():x.getAttribute('aria-label')||[...(x.labels||[])].map(l=>l.textContent).join(' ').trim()||x.getAttribute('title')||'';};
 const visible=x=>{const r=x.getBoundingClientRect();return r.width>0&&r.height>0;};
 return {workbookLabel:[...el.querySelectorAll('.label-spreadsheet')].filter(visible).map(x=>x.textContent.trim()),labelledFields:[...el.querySelectorAll('input')].filter(visible).filter(x=>/^(?:image-(?:Width|Height)-|sheet-name-|spreadsheet-name-|formula-argument-)/.test(x.id)).map(x=>({id:x.id,name:name(x),expected:[...(x.labels||[])].map(l=>l.textContent).join(' ').trim()})),sheetList:[...el.querySelectorAll('#status-list-names [role=list],#status-list-names[role=list]')].filter(visible).map(x=>({name:name(x),expected:el.querySelector('.label-move-before')?.textContent.trim()})),spreadsheetButtons:[...el.querySelectorAll('#status-cmb-spreadsheet button')].filter(visible).map(x=>({name:name(x),expected:el.querySelector('.label-spreadsheet')?.textContent.trim()})),name:name(el),unnamedFields:[...el.querySelectorAll('input,select,textarea')].filter(visible).filter(x=>!name(x)).map(x=>({tag:x.tagName,type:x.type,id:x.id}))};
 });row.aria=await dlg.ariaSnapshot();row.screenshot=path.join(out,id+'-'+lang+'-'+(dark?'dark':'light')+'.png');await page.screenshot({path:row.screenshot,animations:'disabled'});
 await page.keyboard.press('Tab');row.tabInside=await dlg.evaluate(el=>el.contains(document.activeElement));await page.keyboard.press('Escape');await page.waitForTimeout(150);row.escapeCloses=!(await dlg.isVisible().catch(()=>false));
 assert.equal(row.escapeCloses,true,'Escape still closes the observed dialog');
 if(['word-image-advanced','cell-sheet-rename-dialog','cell-sheet-copy-dialog','blocked-hyperlink-warning-word','blocked-hyperlink-warning-cell'].includes(id))assert.equal(row.tabInside,true,'Tab containment in baseline-stable modal family');
 if(id==='cell-sheet-copy-dialog'){
  assert.equal(row.accessibility.sheetList.length,1,'Exactly one visible sheet list');
  assert(row.accessibility.sheetList[0].expected,'Translated sheet-list label is nonempty');
  assert.equal(row.accessibility.sheetList[0].name,row.accessibility.sheetList[0].expected,'Sheet list uses its visible translated label');
  assert.equal(row.accessibility.workbookLabel.length,1,'Workbook label branch is exercised');
  assert.equal(row.accessibility.spreadsheetButtons.length,1,'Exactly one visible workbook dropdown control');
  for(const button of row.accessibility.spreadsheetButtons)assert.equal(button.name,button.expected,'Workbook dropdown uses its visible translated label');
 }
 const labelled=row.accessibility.labelledFields;
 if(id==='word-image-advanced')assert.equal(labelled.length,2,'Width and height fields');
 if(id==='cell-sheet-rename-dialog')assert.equal(labelled.length,1,'Rename field');
 if(id==='cell-formula-wizard')assert(labelled.length>0,'Formula argument fields');
 for(const field of labelled){assert(field.expected,'Visible field label is nonempty');assert.equal(field.name,field.expected,'Field resolves to its corresponding visible label');}
 row.documentModified=await page.evaluate(()=>EOLocalSession.controller.isModified());assert.equal(downloads.length,0);assert.equal(outside.length,0);assert.equal(popups.length,0);assert.equal(errors.length,0,'No JavaScript errors');row.status='observed-render';
 }catch(e){row.status='unverified';row.error=e.message;row.failureScreenshot=path.join(out,'unverified-'+id+'-'+lang+'-'+dark+'.png');await page.screenshot({path:row.failureScreenshot}).catch(()=>{});}
 finally{row.pageErrors=errors;row.outside=outside;row.downloads=downloads;row.popups=popups;await context.close();await save();console.log(id,lang,dark,row.status,row.error||'');}
 }
 for(const ext of ['docx','xlsx'])assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(fixtures,'new.'+ext))).digest('hex'),hashes[ext]);
 const missing=rows.filter(x=>x.status!=='observed-render'||!x.accessibility?.name||['Title','Window'].includes(x.accessibility.name)||x.accessibility.unnamedFields.length);console.log('ACCESSIBILITY_ASSERTIONS',JSON.stringify({failedRows:missing.length,totalRows:rows.length}));if(missing.length)process.exitCode=1;
 console.log('DONE',JSON.stringify({observed:rows.filter(r=>r.status==='observed-render').length,unverified:rows.filter(r=>r.status==='unverified').length,publicOriginalsUnchanged:true}));
 }finally{await browser.close();await save();}
})().catch(e=>{console.error(e);process.exitCode=1;});
