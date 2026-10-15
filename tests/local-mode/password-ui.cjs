// SPDX-License-Identifier: AGPL-3.0-only
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),create=require(process.env.EO_X2T_RELEASE+'/x2t.js');
assert(process.env.EO_BASE&&!/:8080(?:\/|$)/.test(process.env.EO_BASE),'Explicit own instance required');
const format=process.env.EO_PASSWORD_UI_FORMAT||'docx';
const kinds={docx:['docx',65,65,8193],odt:['docx',65,67,8193],xlsx:['xlsx',257,257,8194],ods:['xlsx',257,259,8194],pptx:['pptx',129,129,8195],odp:['pptx',129,131,8195]};
assert(kinds[format],'Supported password UI format required');
const [sourceFormat,sourceCode,formatCode,modelCode]=kinds[format];
const password=crypto.randomBytes(16).toString('hex');let stage='prepare';
async function convert(bytes,from,to,extra={}){const m=await create({noInitialRun:true,print(){},printErr(){}}),F=m.FS;['/w','/tmp/conversion','/fonts'].forEach(p=>F.mkdirTree(p));F.writeFile('/w/in',bytes);const tags={m_sFileFrom:'/w/in',m_sFileTo:'/w/out',m_nFormatFrom:from,m_nFormatTo:to,m_bIsNoBase64:'true',m_sTempDir:'/tmp/conversion',m_sFontDir:'/fonts',...extra};F.writeFile('/task.xml','<TaskQueueDataConvert>'+Object.entries(tags).map(([k,v])=>'<'+k+'>'+v+'</'+k+'>').join('')+'</TaskQueueDataConvert>');let status;try{status=m.callMain(['/task.xml'])}catch(e){status=e.status}if(status!==0)throw Error('Synthetic preparation failed');return F.readFile('/w/out');}
async function downloaded(download){const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);await download.delete();return Buffer.concat(chunks);}
(async()=>{
 const source=fs.readFileSync(process.env.EO_PASSWORD_FIXTURES+'/new.'+sourceFormat),model=await convert(source,sourceCode,modelCode),enc=await convert(model,modelCode,formatCode,{m_sSavePassword:password}),changed=crypto.randomBytes(16).toString('hex');
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.goto(process.env.EO_BASE+'/example/local.html');await page.locator('#file').setInputFiles({name:'encrypted.'+format,buffer:Buffer.from(enc)});
  const frame=await(await page.waitForSelector('iframe[name=frameEditor]',{timeout:90000})).contentFrame();await frame.locator('.open-dlg input[type=password]').waitFor({timeout:90000});await frame.locator('.open-dlg input[type=password]').fill(password);await frame.locator('.open-dlg button[result=ok]').click();await page.waitForFunction(()=>!!window.EOLocalSession,null,{timeout:90000});
  async function saveAs(choice){
   const download=page.waitForEvent('download',{timeout:90000}),operation=page.evaluate(()=>window.EOLocalSession.controller.saveAs());operation.catch(()=>{});download.catch(()=>{});
   await frame.locator('button[result='+choice+']').click({timeout:10000});
   if(choice==='change'){await frame.locator('#id-password-txt input').fill(changed);await frame.locator('#id-repeat-txt input').fill(changed);await frame.locator('button[result=ok]:visible').click();}
   if(choice==='remove')await frame.locator('button[result=yes]').click();
   await operation;return downloaded(await download);
  }
  stage='SaveAs-Keep';await convert(await saveAs('keep'),formatCode,modelCode,{m_sPassword:password});
  stage='SaveAs-Change';const changedBytes=await saveAs('change');await convert(changedBytes,formatCode,modelCode,{m_sPassword:changed});let rejected=false;try{await convert(changedBytes,formatCode,modelCode,{m_sPassword:password});}catch{rejected=true;}assert(rejected);
  stage='PDF-consent-denied';const denied=page.evaluate(async()=>{try{await window.EOLocalSession.controller.exportAs('pdf');return false;}catch(e){return e.code==='cancelled';}});await frame.locator('button[result=no]').click();assert(await denied);
  stage='SaveAs-Remove';await convert(await saveAs('remove'),formatCode,modelCode);assert(await page.evaluate(()=>!window.EOLocalSession.controller.isProtected()&&window.EOLocalSession.controller.isRecoveryLocked()));
  stage='Protect-normal-dialog';const download=page.waitForEvent('download',{timeout:90000});await frame.evaluate(()=>{const p=(window.DE||window.SSE||window.PE).getController('Common.Controllers.Protection');if(!p.api.asc_isProtectionSupport())throw Error('Local protection unavailable');p.addPassword();});await frame.locator('#id-password-txt input').fill(password);await frame.locator('#id-repeat-txt input').fill(password);await frame.locator('button[result=ok]:visible').click();await convert(await downloaded(await download),formatCode,modelCode,{m_sPassword:password});assert(await page.evaluate(()=>window.EOLocalSession.controller.isProtected()));
  console.log(format,'PASS real browser Save As Keep/Change/Remove, normal Protect dialog, PDF unprotected-copy refusal');process.exitCode=0;
 }finally{await browser.close();}
})().catch(e=>{console.error('FAIL password UI gate',stage,e.name);process.exitCode=1});
