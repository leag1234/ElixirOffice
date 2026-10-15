// SPDX-License-Identifier: AGPL-3.0-only
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),create=require(process.env.EO_X2T_RELEASE+'/x2t.js');
assert(process.env.EO_BASE&&!/:8080(?:\/|$)/.test(process.env.EO_BASE),'Explicit own instance required');
const password=crypto.randomBytes(16).toString('hex');let stage='prepare';
async function convert(bytes,from,to,extra={}){const m=await create({noInitialRun:true,print(){},printErr(){}}),F=m.FS;['/w','/tmp/conversion','/fonts'].forEach(p=>F.mkdirTree(p));F.writeFile('/w/in',bytes);const tags={m_sFileFrom:'/w/in',m_sFileTo:'/w/out',m_nFormatFrom:from,m_nFormatTo:to,m_bIsNoBase64:'true',m_sTempDir:'/tmp/conversion',m_sFontDir:'/fonts',...extra};F.writeFile('/task.xml','<TaskQueueDataConvert>'+Object.entries(tags).map(([k,v])=>'<'+k+'>'+v+'</'+k+'>').join('')+'</TaskQueueDataConvert>');let status;try{status=m.callMain(['/task.xml'])}catch(e){status=e.status}if(status!==0)throw Error('Synthetic preparation failed');return F.readFile('/w/out');}
async function downloaded(download){const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);await download.delete();return Buffer.concat(chunks);}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const [office,odf,code,odfCode,bin]of [['docx','odt',65,67,8193],['xlsx','ods',257,259,8194],['pptx','odp',129,131,8195]]){
   const source=fs.readFileSync(process.env.EO_PASSWORD_FIXTURES+'/new.'+office),model=await convert(source,code,bin);
   for(const [format,inputCode]of [[office,code],[odf,odfCode]]){
    stage=format+':encrypt';const enc=await convert(model,bin,inputCode,{m_sSavePassword:password}),page=await browser.newPage(),requests=[],errors=[];
    page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.name));
    try{
     await page.goto(process.env.EO_BASE+'/example/local.html');await page.locator('#file').setInputFiles({name:'encrypted.'+format,mimeType:'application/octet-stream',buffer:Buffer.from(enc)});
     const frame=await(await page.waitForSelector('iframe[name=frameEditor]',{timeout:90000})).contentFrame();
     stage=format+':wrong-password';const field=frame.locator('.open-dlg input[type=password]');await field.waitFor({timeout:90000});await field.fill('intentionally-wrong');await frame.locator('.open-dlg button[result=ok]').click();await field.waitFor({state:'hidden',timeout:90000});await field.waitFor({state:'visible',timeout:90000});
     stage=format+':correct-password';await field.fill(password);await frame.locator('.open-dlg button[result=ok]').click();await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:90000});
     assert(await page.evaluate(()=>!!window.EOLocalSession?.controller.isProtected()&&window.EOLocalSession.controller.isRecoveryLocked()&&!window.EOLocalFailure));assert.equal(errors.length,0);
     stage=format+':edit';await frame.evaluate(()=>{const a=(window.DE||window.SSE||window.PE).getController('Main').api;if(window.PE){const doc=a.WordControl.m_oLogicDocument,control=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(s=>s.txBody);if(!shape)throw Error('No slide text fixture');control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();}a.asc_enterText(Array.from('Password smoke edit',c=>c.codePointAt(0)));if(window.SSE)a.asc_closeCellEditor();});
     assert(await page.evaluate(()=>window.EOLocalSession.controller.isModified()),'Real edit marks document modified');stage=format+':save';const pending=page.waitForEvent('download');await page.evaluate(()=>window.EOLocalSession.controller.save());const saved=await downloaded(await pending);
     await convert(saved,inputCode,bin,{m_sPassword:password});
     let rejected=false;try{await convert(saved,inputCode,bin,{m_sPassword:'intentionally-wrong'});}catch{rejected=true;}assert(rejected,'Saved output retains encryption');
     assert(requests.every(r=>r.method==='GET'&&(r.url.startsWith(process.env.EO_BASE+'/')||r.url.startsWith('blob:')||r.url.startsWith('data:'))),'No upload or external request');
     console.log('PASS browser',format,'wrong retry, open, edit, encrypted Save and reopen');
    }finally{await page.close();}
   }
  }
  process.exitCode=0;
 }finally{await browser.close();}
})().catch(e=>{console.error('FAIL browser password gate',stage,e.name);process.exitCode=1});
