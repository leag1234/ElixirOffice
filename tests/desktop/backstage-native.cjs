// SPDX-License-Identifier: AGPL-3.0-only
// Real desktop extension + bundled shared views/SDK on the runner's private Xvfb.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {_electron}=require(process.env.EO_PLAYWRIGHT);
const root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK,rows=[],errors=[];
const pass=name=>{rows.push({name,pass:true});console.log('PASS '+name)};
(async()=>{
 for(const format of ['docx','xlsx','pptx','pdf']){
  const file=path.join(out,'public-blank.'+format);
  if(format==='pdf'){
   const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>','<< /Length 0 >>\nstream\nendstream'];
   let pdf='%PDF-1.4\n',offsets=[0];
   for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
   const xref=Buffer.byteLength(pdf);pdf+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
   await fs.writeFile(file,pdf);
  }else await fs.copyFile(path.join(root,'desktop/assets/templates/new.'+format),file);
  let app;
  try{
   app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[path.join(root,'desktop/main.cjs'),'--ozone-platform=x11',file],env:process.env,timeout:30000});
   assert(!app.process().spawnargs.includes('--no-sandbox'));
   const context=app.context(),observe=page=>page.on('pageerror',e=>errors.push(e.message));context.pages().forEach(observe);context.on('page',observe);
   let page;
   for(let i=0;i<600&&!page;i++){page=context.pages().find(p=>p.url().endsWith('/index.html'));if(!page)await new Promise(r=>setTimeout(r,100));}
   assert(page);await page.waitForFunction(()=>window.EOLocalSession,null,{timeout:120000});
   const frame=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor|pdfeditor)\/main\//.test(f.url()));assert(frame);
   await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded(),null,{timeout:60000});
   await page.evaluate(()=>EOLocalSession.win.Common.UI.FeaturesManager);
   await frame.locator('#file[role=tab]').click();
   const rail=frame.locator('.panel-menu > .fm-btn:visible');
   const ids=await rail.evaluateAll(nodes=>nodes.map(n=>n.id));
   const print=ids.includes('fm-btn-print')?'print':'print-with-preview';
   const expected=['return','elx-home','create','elx-open','info','save','download',print,'elx-export','elx-close','settings','help','elx-about','eo-quit'].map(id=>'fm-btn-'+id);
   assert.deepEqual(ids,expected);pass(format+' exact Office rail, one Print, no Rename/tab-move rail entries');
   await frame.locator('#fm-btn-info').click();
   const info=frame.locator('#panel-info');
   await info.locator('.eo-info-action').first().waitFor();
   assert.equal(await info.locator('.eo-info-action').count(),3);
   assert.equal(await info.locator('.eo-info-action').last().innerText(),'Move to another window');
   if(format!=='pdf'){const field=info.locator('#id-info-title input');await field.fill('Public '+format+' review');await field.press('Tab');
   assert.equal(await page.evaluate(()=>EOLocalSession.api.asc_getCoreProps().asc_getTitle()),'Public '+format+' review');}
   await info.locator('.eo-info-action').first().click();
   const rename=page.locator('#desktop-rename-name');await rename.waitFor();assert.equal(await rename.inputValue(),'public-blank');
   await page.locator('dialog[open] button').filter({hasText:'Cancel'}).click();
   assert.equal(await page.locator('dialog[open]').count(),0);pass(format+' shared Info properties and native Rename cancel retain document');
   if(format!=='pdf'){await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-save').click();
   await page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:120000});
   assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
   const core=execFileSync('python3',['-c','import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("docProps/core.xml").decode())',file],{encoding:'utf8'});
   assert(core.includes('Public '+format+' review'));pass(format+' Info title saved to real OOXML core properties');}
   await frame.locator('#file[role=tab]').click();
   assert.notEqual((await frame.locator('#fm-btn-elx-export').innerText()).trim(),'PDF');
   await frame.locator('#fm-btn-elx-export').click();
   const chooser=page.locator('dialog[open]');await chooser.waitFor();
   assert(await chooser.getByText(/PDF/, {exact:false}).count()>0);
   assert(await chooser.getByText(new RegExp(format.toUpperCase(),'i'),{exact:false}).count()>0);
   await chooser.getByRole('button',{name:'Cancel',exact:true}).click();
   assert.equal(await page.locator('dialog[open]').count(),0);
   assert.equal(await page.evaluate(()=>EOLocalSession.controller.isModified()),false);pass(format+' Export offers PDF and current format; Cancel retains saved editor');
   await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-info').click();
   await page.screenshot({path:path.join(out,format+'-info.png')});
  }finally{
   // Own synthetic application only; this is source-UI evidence, not a normal-quit qualification.
   if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  }
 }
 assert.deepEqual(errors,[]);pass('all observed real shell/editor pages have no uncaught errors');
 await fs.writeFile(path.join(out,'backstage-results.json'),JSON.stringify({scope:'sandboxed Linux source UI; packages/native dialogs/other platforms unverified',rows,errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
