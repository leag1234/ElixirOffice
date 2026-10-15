// SPDX-License-Identifier: AGPL-3.0-only
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const create=require(process.env.EO_X2T_RELEASE+'/x2t.js');
const password=crypto.randomBytes(16).toString('hex'),changed=crypto.randomBytes(16).toString('hex');let stage='prepare';
async function convert(bytes,from,to,extra={}){const m=await create({noInitialRun:true,print(){},printErr(){}}),F=m.FS;['/w','/tmp/conversion','/fonts'].forEach(p=>F.mkdirTree(p));F.writeFile('/w/in',bytes);const tags={m_sFileFrom:'/w/in',m_sFileTo:'/w/out',m_nFormatFrom:from,m_nFormatTo:to,m_bIsNoBase64:'true',m_sTempDir:'/tmp/conversion',m_sFontDir:'/fonts',...extra};F.writeFile('/task.xml','<TaskQueueDataConvert>'+Object.entries(tags).map(([k,v])=>'<'+k+'>'+v+'</'+k+'>').join('')+'</TaskQueueDataConvert>');let status;try{status=m.callMain(['/task.xml'])}catch(e){status=e.status}if(status!==0)throw Error('Synthetic preparation failed');return F.readFile('/w/out');}
const {launch,stop,editable,root}=require('./harness.cjs');
const {modal,keys}=require('./lifecycle.cjs'),fileAction=require('./file-action.cjs');
function scanProfile(directory){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())scanProfile(file);else if(entry.isFile())assert(![password,changed].some(value=>fs.readFileSync(file).includes(Buffer.from(value))),'No document password persisted in the own application profile');}
}
(async()=>{
 let cancelled=false;
 for(const [office,odf,code,odfCode,bin]of [['docx','odt',65,67,8193],['xlsx','ods',257,259,8194],['pptx','odp',129,131,8195]]){
  const source=fs.readFileSync(process.env.EO_PASSWORD_FIXTURES+'/new.'+office),model=await convert(source,code,bin);
  for(const [format,inputCode]of [[office,code],[odf,odfCode]]){
   if(process.env.EO_PASSWORD_ONLY&&format!==process.env.EO_PASSWORD_ONLY)continue;
   stage=format+':encrypt';const encrypted=await convert(model,bin,inputCode,{m_sSavePassword:password}),file=path.join(root,'fixtures','password-smoke.'+format);fs.writeFileSync(file,encrypted);let env;
   if(!cancelled){
    stage='native-password-cancel';const stopped=await launch({file,profile:'password-cancel-'+Date.now(),onPage:async page=>{const frame=await(await page.waitForSelector('iframe[name=frameEditor]',{timeout:90000})).contentFrame();await frame.locator('.open-dlg input[type=password]').waitFor({timeout:90000});await frame.locator('.open-dlg button[result=cancel]').click();}});
    try{await stopped.page.locator('#home').waitFor({state:'visible',timeout:90000});assert.equal(await stopped.page.evaluate(()=>window.EOLocalSession),null);assert.equal(stopped.page.frames().length,1);console.log('PASS native password Cancel returns to usable Home and destroys editor');}finally{await stop(stopped);}cancelled=true;
   }

   try{
    env=await launch({file,profile:'password-'+format+'-'+Date.now(),onPage:async page=>{
     const frame=await(await page.waitForSelector('iframe[name=frameEditor]',{timeout:90000})).contentFrame(),field=frame.locator('.open-dlg input[type=password]');
     stage=format+':wrong-password';await field.waitFor({timeout:90000});const old=await field.elementHandle();await field.fill('intentionally-wrong');await frame.locator('.open-dlg button[result=ok]').click();await old.waitForElementState('hidden',{timeout:90000});await field.waitFor({timeout:90000});
     stage=format+':correct-password';await field.fill(password);await frame.locator('.open-dlg button[result=ok]').click();
    }});await editable(env);
    assert(await env.page.evaluate(()=>EOLocalSession.controller.isProtected()&&EOLocalSession.controller.isRecoveryLocked()));
    stage=format+':edit';await env.page.evaluate(()=>{const {api,format}=EOLocalSession;if(format==='pptx'||format==='odp'){const doc=api.WordControl.m_oLogicDocument,control=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(s=>s.txBody);if(!shape)throw Error('No slide text fixture');control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();}api.asc_enterText(Array.from('Password smoke edit',c=>c.codePointAt(0)));if(format==='xlsx'||format==='ods')api.asc_closeCellEditor();});assert(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),'Real edit marks document modified');
    stage=format+':save';await env.page.evaluate(()=>EOLocalSession.controller.save());const saved=fs.readFileSync(file);assert(!saved.equals(Buffer.from(encrypted)));await convert(saved,inputCode,bin,{m_sPassword:password});
    let rejected=false;try{await convert(saved,inputCode,bin,{m_sPassword:'intentionally-wrong'});}catch{rejected=true;}assert(rejected,'Native Save preserves encryption');
    assert.deepEqual(await env.page.evaluate(()=>eoDesktop.recoveryList()),[]);assert(await env.page.evaluate(()=>document.getElementById('message').textContent.includes('AutoRecover')),'Recovery policy is visible');
    stage=format+':SaveAs';
    const frame=env.page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));
    for(const choice of ['keep','change','remove']){
     if(choice==='remove'){
      stage=format+':PDF-refusal';await fileAction(env.page,'pdf');await frame.locator('button[result=no]').click();await env.page.waitForFunction(()=>document.getElementById('message').textContent.includes('AutoRecover'));
      assert.equal(await env.page.evaluate(()=>window.EOLastPdf||null),null);assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
      stage=format+':PDF-consent';await fileAction(env.page,'pdf');await frame.locator('button[result=yes]').click();const pdf=path.join(root,'results','password-'+format+'-'+Date.now()+'.pdf');await modal(env);keys(env,'save-path',pdf);await env.page.waitForFunction(()=>window.EOLastPdf||window.EOLocalFailure,null,{timeout:90000});assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);assert(fs.readFileSync(pdf).subarray(0,5).equals(Buffer.from('%PDF-')));
     }
     stage=format+':SaveAs-'+choice;await fileAction(env.page,'save-as',format);await frame.locator('button[result='+choice+']').click();
     if(choice==='change'){await frame.locator('#id-password-txt input').fill(changed);await frame.locator('#id-repeat-txt input').fill(changed);await frame.locator('button[result=ok]:visible').click();await frame.locator('#id-repeat-txt input').waitFor({state:'hidden',timeout:10000});}
     if(choice==='remove')await frame.locator('button[result=yes]').click();
     const target=path.join(root,'results','password-'+format+'-'+choice+'-'+Date.now()+'.'+format);await modal(env);keys(env,'save-path',target);
     await env.page.waitForFunction(name=>window.EOLastSave?.name===name&&!EOLocalSession.controller.isModified()&&Array.from(document.querySelectorAll('#home button')).every(b=>!b.disabled),path.basename(target),{timeout:90000});
     const copy=fs.readFileSync(target);await convert(copy,inputCode,bin,choice==='remove'?{}:{m_sPassword:choice==='keep'?password:changed});
     if(choice!=='remove'){let failed=false;try{await convert(copy,inputCode,bin,{m_sPassword:'intentionally-wrong'});}catch{failed=true;}assert(failed);}
    }
    assert(await env.page.evaluate(()=>!EOLocalSession.controller.isProtected()&&EOLocalSession.controller.isRecoveryLocked()));
    assert.equal(env.errors.length,0,'No native console failures');assert(env.requests.every(r=>r.url.startsWith('eoapp:')||r.url.startsWith('blob:')||r.url.startsWith('data:')),'No external request');
    console.log('PASS native',format,'wrong retry, encrypted open/edit/save/reopen, native Save As Keep/Change/Remove, recovery locked');
   }catch(error){
    if(env){const diagnostic=await env.page.evaluate(()=>({failure:window.EOLocalFailure||null,message:document.getElementById('message').textContent,protected:window.EOLocalSession?.controller.isProtected(),modified:window.EOLocalSession?.controller.isModified()}));
     diagnostic.dialogs=[];for(const f of env.page.frames()){diagnostic.dialogs.push(await f.evaluate(()=>Array.from(document.querySelectorAll('.asc-window')).map(e=>({title:e.querySelector('.title')?.textContent,display:getComputedStyle(e).display,buttons:Array.from(e.querySelectorAll('.dlg-btn')).map(b=>({result:b.getAttribute('result'),text:b.textContent})),passwordFields:e.querySelectorAll('input[type=password]').length,passwordFieldLengths:Array.from(e.querySelectorAll('input[type=password]')).map(input=>input.value.length),focusedPasswordField:e.contains(document.activeElement)?document.activeElement.closest('#id-password-txt,#id-repeat-txt')?.id||null:null,repeatEqual:(()=>{const a=e.querySelector('#id-password-txt input'),b=e.querySelector('#id-repeat-txt input');return !!a&&!!b&&a.value===b.value;})(),validationText:Array.from(e.querySelectorAll('.error')).map(n=>n.textContent)}))));}
     fs.writeFileSync(path.join(root,'results','password-diagnostic.json'),[password,changed].reduce((text,value)=>text.split(value).join('[redacted]'),JSON.stringify(diagnostic,null,2))+'\n');}
    throw error;
   }finally{if(env){await stop(env);scanProfile(env.directory);}}
  }
 }
 process.exitCode=0;
})().catch(e=>{console.error('FAIL native password gate',stage,e.name,[password,changed].reduce((text,value)=>text.split(value).join('[redacted]'),String(e.message)));process.exitCode=1});
