// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.EO_PLAYWRIGHT||'../../tools/node_modules/playwright-core');
const root=path.resolve(__dirname,'../..'),base=process.env.EO_BASE,out=process.env.EO_LOCAL_OUT,web=process.env.EO_WEB_APPS;
assert(base&&!/:8080(?:\/|$)/.test(base)&&out&&web,'Explicit isolated EO_BASE, EO_LOCAL_OUT and EO_WEB_APPS required');
const languages=(process.env.EO_SAVE_AS_LANGS||'en,fr,de,ar').split(','),formats=(process.env.EO_SAVE_AS_FORMATS||'docx,xlsx,pptx').split(',');
const pairs={docx:['odt','documenteditor','DE'],odt:['docx','documenteditor','DE'],xlsx:['ods','spreadsheeteditor','SSE'],ods:['xlsx','spreadsheeteditor','SSE'],pptx:['odp','presentationeditor','PE'],odp:['pptx','presentationeditor','PE'],pdf:['pdf','pdfeditor','Common']};
const families={DE:['docx','odt','rtf','txt','pdf'],SSE:['xlsx','ods','csv','pdf'],PE:['pptx','odp','pdf'],Common:['pdf']};
const jobs=languages.flatMap(language=>formats.flatMap(format=>(process.env.EO_SAVE_AS_ALL_OUTPUTS==='1'?families[pairs[format][2]]:[pairs[format][0]]).map(target=>({language,format,target}))));
const {execFileSync}=require('node:child_process');
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];
 try{
  for(const {language,format,target} of jobs){
   const [,editor,prefix]=pairs[format],fixture=path.join(process.env.EO_LOCAL_FIXTURES||path.join(root,'desktop/assets/templates'),'new.'+format);
   const before=await fs.readFile(fixture),beforeHash=crypto.createHash('sha256').update(before).digest('hex');
   const catalog=JSON.parse(await fs.readFile(path.join(web,'apps',format==='pdf'?'documenteditor':editor,'main/locale',language+'.json'),'utf8'));
   const labelPrefix=format==='pdf'?'DE':prefix;
   const strings=JSON.parse(await fs.readFile(path.join(root,'desktop/assets/desktop-home/i18n',language+'.json'),'utf8'));
   const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[],bad=[],downloads=[];
   page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
   page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>bad.push('socket '+new URL(socket.url()).pathname));
   page.on('download',download=>downloads.push(download));
   page.on('request',request=>{
    const url=new URL(request.url());
    if(!['data:','blob:'].includes(url.protocol)&&(request.method()!=='GET'||url.origin!==new URL(base).origin||!/^\/example\/(?:local\.html|elixir-local\/|local-assets\/)/.test(url.pathname)))bad.push(request.method()+' '+url.pathname);
   });
   page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+new URL(response.url()).pathname);});
   try{
    console.log('Opening '+language+' '+format);
    await page.goto(base+'/example/local.html?lang='+language);await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
    const frame=page.frames().find(frame=>new RegExp('/'+editor+'/main/').test(frame.url()));assert(frame);
    if(process.env.EO_SAVE_AS_EDIT==='1'){
     await frame.evaluate(format=>{
      const api=Asc.editor;
      if(['docx','odt'].includes(format))api.WordControl.m_oLogicDocument.MoveCursorToStartPos();
      if(['pptx','odp'].includes(format)){
       const doc=api.WordControl.m_oLogicDocument,control=doc.GetCurrentController(),shape=doc.Slides[0].cSld.spTree.find(shape=>shape.txBody);
       if(!shape)throw Error('No editable public fixture shape');
       control.resetSelection();shape.select(control,0);control.selection.textSelection=shape;shape.txBody.content.MoveCursorToStartPos();
      }
      api.asc_enterText(Array.from('SAVEAS021 café ',char=>char.codePointAt(0)));
      if(['xlsx','ods'].includes(format))api.asc_closeCellEditor();
     },format);
     await page.waitForFunction(()=>EOLocalSession.controller.isModified());
    }
    const originalName=await frame.evaluate(()=>Asc.editor.asc_getDocumentName()),originalDirty=await page.evaluate(()=>EOLocalSession.controller.isModified());
    async function open(){
     if(!await frame.locator('#fm-btn-download').isVisible())await frame.locator('#file[role=tab]').click();
     await frame.locator('#fm-btn-download').click();
     await frame.locator('.eo-format-dialog').waitFor({timeout:20000});
    }
    await open();const dialog=frame.locator('.eo-format-dialog');
    assert.equal(await dialog.locator('input:checked').inputValue(),format);
    assert.equal(await dialog.locator('h2').textContent(),catalog[labelPrefix+'.Views.ElixirBackstage.txtSaveAs']);
    assert.equal(await dialog.locator('legend').textContent(),catalog[labelPrefix+'.Views.ElixirBackstage.txtSaveFormat']);
    assert.deepEqual(await dialog.locator('legend').evaluate(element=>({color:getComputedStyle(element).color,border:getComputedStyle(element).borderBottomWidth})),{color:await dialog.evaluate(element=>getComputedStyle(element).color),border:'0px'},'Host editor styles must not mute the format label');
    assert.equal(await dialog.locator('.eo-format-file label').textContent(),catalog[labelPrefix+'.Views.ElixirBackstage.txtSaveName']);
    assert.equal(await dialog.getAttribute('lang'),language);assert.equal(await dialog.getAttribute('dir'),language==='ar'?'rtl':'ltr');
    assert.equal(await dialog.getByRole('textbox').getAttribute('aria-invalid'),null);
    await page.screenshot({path:path.join(out,'editor-'+language+'-'+format+'-to-'+target+'.png')});
    await frame.locator('.eo-format-dialog').press('Escape');await dialog.waitFor({state:'detached'});
    assert.equal(downloads.length,0);assert.equal(await frame.evaluate(()=>Asc.editor.asc_getDocumentName()),originalName);
    assert.equal(await page.evaluate(()=>EOLocalSession.controller.isModified()),originalDirty);
    await open();await dialog.getByRole('textbox').fill('CON');await dialog.getByRole('button',{name:strings.ok,exact:true}).click();
    assert.equal(await dialog.getByRole('alert').textContent(),catalog[labelPrefix+'.Views.ElixirBackstage.txtSaveNameInvalid']);assert.equal(downloads.length,0);
    await dialog.getByRole('textbox').fill('Cafe\u0301 Downloaded Copy.docx');await dialog.locator('input[value='+target+']').check();
    if(format==='pdf')page.once('dialog',async consent=>{assert.equal(consent.message(),catalog['DE.Views.ElixirBackstage.txtPdfCopyWarning']);await consent.accept();});
    const downloadEvent=page.waitForEvent('download',{timeout:120000});downloadEvent.catch(()=>{});
    await dialog.getByRole('button',{name:strings.ok,exact:true}).click();
    const lossKey={rtf:'DE.Controllers.LeftMenu.warnDownloadAsRTF',txt:'DE.Controllers.LeftMenu.warnDownloadAs',csv:'SSE.Controllers.LeftMenu.warnDownloadCsv',ods:'SSE.Controllers.LeftMenu.warnDownloadOds'}[target];
    if(lossKey){
     const warning=frame.locator('.asc-window.alert:visible'),message=warning.locator('.info-box .text > span');
     await warning.waitFor();
     const expected=await frame.evaluate(html=>{const element=document.createElement('div');element.innerHTML=html;return element.textContent;},catalog[lossKey]);
     assert.equal(await message.textContent(),expected,'Selected-format loss warning must use this UI language');
     await page.screenshot({path:path.join(out,'loss-warning-'+language+'-'+format+'-to-'+target+'.png')});
     await warning.locator('.dlg-btn[result=ok]').click();
    }
    if(target==='txt'||target==='csv'){
     const settings=await frame.waitForFunction(()=>{const dlg=(window.DE||window.SSE).getController('Main')._state.openDlg;return dlg?.isVisible()&&dlg.$window[0];});
     const ok=await settings.asElement().$('.dlg-btn[result=ok]');assert(ok,'Text export settings have an OK control');await ok.click();await settings.dispose();
    }
    if(target==='pdf'&&prefix==='SSE'){
     const settings=await frame.waitForFunction(()=>{const print=SSE.getController('Print');return print.printSettingsDlg?.isVisible()&&print.printSettingsDlg.$window[0];});
     assert.equal(await frame.evaluate(()=>SSE.getController('Print').downloadFormat),513);
     const ok=await settings.asElement().$('.dlg-btn[result=ok]');assert(ok,'PDF settings have an OK control');await ok.click();await settings.dispose();
    }
    const download=await downloadEvent;assert.equal(download.suggestedFilename(),'Café Downloaded Copy.'+target);
    const destination=path.join(out,'copy-'+language+'-'+format+'-to-'+target+'.'+target);await download.saveAs(destination);
    const bytes=await fs.readFile(destination);
    if(target==='pdf')assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
    else if(target==='rtf')assert(bytes.toString().startsWith('{\\rtf'));
    else if(['txt','csv'].includes(target))new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    else assert.equal(bytes.subarray(0,2).toString(),'PK');
    if(process.env.EO_SAVE_AS_EDIT==='1'){
     const content=target==='pdf'?execFileSync('pdftotext',[destination,'-'],{encoding:'utf8'}):
      ['txt','csv','rtf'].includes(target)?bytes.toString().replace(/\\u(-?\d+)[*?]/g,(_,n)=>String.fromCharCode((Number(n)+65536)%65536)):
      execFileSync('python3',['-c',"import sys,zipfile,xml.etree.ElementTree as E;z=zipfile.ZipFile(sys.argv[1]);print(' '.join(''.join(E.fromstring(z.read(n)).itertext()) for n in z.namelist() if n.endswith('.xml')))",destination],{encoding:'utf8'});
     assert(content.includes('SAVEAS021'),'Real edit is present in selected-format output');
    }
    assert.equal(await page.evaluate(()=>EOLocalSession.controller.isModified()),originalDirty);
    assert.equal(crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex'),beforeHash);
    if(process.env.EO_SAVE_AS_REOPEN==='1'){
     const reopened=await context.newPage();
     reopened.on('pageerror',error=>errors.push(error.message));reopened.on('websocket',()=>bad.push('reopen socket'));
     reopened.on('request',request=>{const url=new URL(request.url());if(!['blob:','data:'].includes(url.protocol)&&(request.method()!=='GET'||url.origin!==new URL(base).origin))bad.push('reopen '+request.method()+' '+url.pathname);});
     await reopened.goto(base+'/example/local.html');await reopened.locator('#file').setInputFiles(destination);
     await reopened.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});
     assert.equal(await reopened.evaluate(()=>EOLocalFailure),null);
     assert.equal(await reopened.evaluate(()=>EOLocalSession.sourceFormat),target);
     assert.equal(await reopened.evaluate(()=>EOLocalSession.format),{rtf:'docx',txt:'docx',csv:'xlsx'}[target]||target);
     await reopened.close();
    }
    assert.deepEqual(bad,[]);assert.deepEqual(errors,[]);
    results.push({language,format,target,bytes:bytes.length,checks:['actual production bundles','proper modal','source-default','cancel-no-download','name-validation','NFC-format-agreement',...(target==='ods'?['localized-existing-loss-consent']:[]),'source-preserved','dirty-preserved','static-only']});
    console.log('PASS '+language+' '+format+' -> '+target);
   }catch(error){
    await page.screenshot({path:path.join(out,'failure-'+language+'-'+format+'-to-'+target+'.png')}).catch(()=>{});
    await fs.writeFile(path.join(out,'failure-'+language+'-'+format+'-to-'+target+'.json'),JSON.stringify({message:error.message,errors,bad,session:await page.evaluate(()=>({failure:window.EOLocalFailure||null,ready:!!window.EOLocalSession,message:document.getElementById('message')?.textContent})).catch(()=>null)},null,2)+'\n');
    throw error;
   }finally{await context.close();}
  }
 }finally{await browser.close();await fs.writeFile(path.join(out,'browser-save-as-results.json'),JSON.stringify(results,null,2)+'\n');}
 console.log(JSON.stringify({passed:results.length,kind:'actual production web bundle browser-local editors'}));
})().catch(error=>{console.error(error);process.exitCode=1});
