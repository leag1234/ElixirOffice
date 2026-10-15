// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';import assert from 'node:assert/strict';import * as L from '../nextcloud/lib.mjs';
const server=process.env.NC_BASE;if(!server)throw Error('Set NC_BASE to an owned Nextcloud fixture');
const user='alice',base=process.env.EO_BASE,browser=await L.chromium.launch();
const auth='Basic '+Buffer.from(user+':'+L.password(user)).toString('base64');
const dav=async(method,p,body)=>fetch(server+'/remote.php/dav/files/'+user+p.split('/').map(encodeURIComponent).join('/'),{method,body,headers:{Authorization:auth}});
try{
 const folder='/PublicE-'+Date.now();assert.equal((await dav('MKCOL',folder)).status,201);
 assert.equal((await dav('MKCOL',folder+'/Copies')).status,201);
 const doc=folder+'/Public Source.docx';assert.equal((await dav('PUT',doc,fs.readFileSync(new URL('../fixtures/docx/selection-fills.docx',import.meta.url)))).status,201);
 const ctx=await browser.newContext({viewport:{width:1920,height:1080}}),page=await ctx.newPage();
 await page.goto(base+'/example/?lang=en');
 if(await page.evaluate(()=>document.getElementById('profile-dialog').open))await page.click('#profile-skip');
 const start=await ctx.request.post(base+'/example/elixir/nc/connect',{headers:{'X-Elixir':'1'},data:{server}});const flow=await start.json();assert(flow.login,'Login Flow v2 did not start');
 const popup=await ctx.newPage();await popup.goto(flow.login);
 const loginButton=popup.getByRole('button',{name:/log in/i});if(await loginButton.count())await loginButton.first().click();
 await popup.locator('input[name=user]').fill(user);await popup.locator('input[name=password]').fill(L.password(user));await popup.locator('input[name=password]').press('Enter');
 await popup.getByRole('button',{name:/grant access/i}).click({timeout:30000});
 let connected=false;for(let i=0;i<40;i++){const state=await (await ctx.request.post(base+'/example/elixir/nc/connect/poll',{headers:{'X-Elixir':'1'}})).json();if(state.status==='connected'){connected=true;break;}await page.waitForTimeout(500);}assert(connected);
 await page.goto(base+'/example/elixir/nc/open?path='+encodeURIComponent(doc)+'&lang=en');const frame=await L.editorFrame(page);
 const result=await frame.evaluate(()=>{const m=DE.getController('Main').appOptions;return{canRename:!!m.canRename,canRequestSaveAs:!!m.canRequestSaveAs,isEdit:!!m.isEdit}});
 assert(result.canRename&&result.canRequestSaveAs&&result.isEdit,JSON.stringify(result));
 const before=Buffer.from(await (await dav('GET',doc)).arrayBuffer()),name='Public Renamed.docx',target=folder+'/'+name;
 await frame.locator('#toolbar a[data-tab=file]').click();await frame.locator('#fm-btn-download').click();await frame.locator('#panel-saveas [data-action=rename]').click();
 await frame.waitForFunction(()=>document.querySelector('#id-dlg-newname input')?.value==='Public Source');
 await frame.locator('#id-dlg-newname input').fill('Public Renamed');const renameResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/elixir/nc/rename'));
 await frame.locator('.asc-window:visible .dlg-btn[result=ok]').click();const renamed=await renameResponse;assert.equal(renamed.status(),200,await renamed.text());
 await frame.waitForFunction(name=>Asc.editor.asc_getDocumentName()===name,name);
 assert.equal((await dav('GET',doc)).status,404);assert.deepEqual(Buffer.from(await(await dav('GET',target)).arrayBuffer()),before);
 // A real edit and force-save after rename must follow the new DAV path.
 const marker='PUBLIC-NC-RENAMED ';
 await L.typeAtStart(page,frame,marker);await page.keyboard.press('Control+s');
 let saved;for(let i=0;i<120;i++){const r=await dav('GET',target);saved=Buffer.from(await r.arrayBuffer());if(L.docxText(saved).includes(marker))break;await page.waitForTimeout(500)}
 assert(L.docxText(saved).includes(marker),'The renamed cloud file did not receive subsequent edits');assert.equal((await dav('GET',doc)).status,404);
 // Conversion followed by a folder picker writes an independent, collision-safe copy.
 await frame.locator('#toolbar a[data-tab=file]').click();await frame.locator('#fm-btn-download').click();await frame.locator('#panel-saveas .elx-copy-formats .elx-format[format="65"]').click();
 // Older Word documents ask to leave compatibility mode before conversion.
 await frame.waitForTimeout(300);
 const compatibility=frame.locator('.dlg-btn[result=ok]:visible');
 if(await compatibility.count()){
  const message=await frame.locator('.modal-dlg:visible,.asc-window:visible').allTextContents();
  assert(message.some(text=>/compatibility/i.test(text)),'Unexpected conversion dialog');
  await compatibility.first().click();
 }
 const picker=page.locator('dialog[data-storage-folder-picker=nc]');await picker.waitFor({timeout:120000});await picker.locator('button[data-folder="'+folder+'/Copies"]').click();
 await picker.locator('p').first().filter({hasText:folder+'/Copies'}).waitFor();await picker.locator('input').fill('Independent.docx');
 const copyResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/elixir/nc/copy'));await picker.getByRole('button',{name:'Save',exact:true}).click();
 const copied=await copyResponse;assert.equal(copied.status(),200,await copied.text());const copy=await copied.json(),copyRequest=copied.request().postDataJSON();assert.equal(copy.path,folder+'/Copies/Independent.docx');
 assert(L.docxText(Buffer.from(await(await dav('GET',copy.path)).arrayBuffer())).includes(marker));
 assert.deepEqual(Buffer.from(await(await dav('GET',target)).arrayBuffer()),saved);
 await picker.getByRole('button',{name:'Close',exact:true}).click();
 assert.equal((await dav('PUT',folder+'/Conflict.docx',before)).status,201);
 const conflictBefore=Buffer.from(await(await dav('GET',folder+'/Conflict.docx')).arrayBuffer());
 const conflict=await ctx.request.post(base+'/example/elixir/nc/rename',{headers:{'X-Elixir':'1'},data:{key:await frame.evaluate(()=>DE.getController('Main').document.key),name:'Conflict'}});
 assert.equal(conflict.status(),409,await conflict.text());assert.deepEqual(Buffer.from(await(await dav('GET',folder+'/Conflict.docx')).arrayBuffer()),conflictBefore);
 // A collision must preserve the existing converted copy.
 const copyBefore=Buffer.from(await(await dav('GET',copy.path)).arrayBuffer());
 const copyClash=await ctx.request.post(base+'/example/elixir/nc/copy',{headers:{'X-Elixir':'1'},data:copyRequest});
 assert.equal(copyClash.status(),409,await copyClash.text());assert.deepEqual(Buffer.from(await(await dav('GET',copy.path)).arrayBuffer()),copyBefore);
 // A real read-only folder share must disable Save and reject direct copy requests.
 const readonly='/ReadonlyE-'+Date.now();
 assert.equal((await L.dav('bob','MKCOL',readonly)).status,201);
 assert.equal((await L.dav('bob','PUT',readonly+'/Read Only.docx',before)).status,201);
 const shared=await L.ocs('bob','POST','/apps/files_sharing/api/v1/shares',{path:readonly,shareType:'0',shareWith:user,permissions:'1'});
 assert.equal(shared.ocs.meta.statuscode,200);
 assert.equal((await dav('GET',readonly+'/Read Only.docx')).status,200);
 const listing=await (await ctx.request.get(base+'/example/elixir/nc/list?path='+encodeURIComponent(readonly))).json();
 assert.equal(listing.canUpload,false);
 const denied=await ctx.request.post(base+'/example/elixir/nc/copy',{headers:{'X-Elixir':'1'},data:{...copyRequest,folder:readonly,name:'Denied.docx'}});
 assert.equal(denied.status(),403,await denied.text());assert.equal((await dav('GET',readonly+'/Denied.docx')).status,404);console.log('PASS Nextcloud copy collisions and read-only target denial');
 // An external write blocks Rename; a later force-save follows its conflict copy.
 assert.equal((await dav('PUT',target,before)).status,204);
 const externalRename=await ctx.request.post(base+'/example/elixir/nc/rename',{headers:{'X-Elixir':'1'},data:{key:copyRequest.key,name:'External Collision'}});
 assert.equal(externalRename.status(),409,await externalRename.text());
 assert.deepEqual(Buffer.from(await(await dav('GET',target)).arrayBuffer()),before);
 await frame.locator('#toolbar a[data-tab=home]').click();await L.typeAtStart(page,frame,'PUBLIC-CONFLICT-SAVED ');assert((await L.docText(frame)).includes('PUBLIC-CONFLICT-SAVED'),'The conflict edit did not reach the document');await page.keyboard.press('Control+s');
 const conflictPath=target.replace(/\.docx$/,' (conflict).docx');
 for(let i=0;i<120;i++){const response=await dav('GET',conflictPath);if(response.status===200&&L.docxText(Buffer.from(await response.arrayBuffer())).includes('PUBLIC-CONFLICT-SAVED'))break;await page.waitForTimeout(500)}
 assert(L.docxText(Buffer.from(await(await dav('GET',conflictPath)).arrayBuffer())).includes('PUBLIC-CONFLICT-SAVED'));
 const followConflict=await ctx.request.post(base+'/example/elixir/nc/rename',{headers:{'X-Elixir':'1'},data:{key:copyRequest.key,name:'Conflict Renamed'}});
 assert.equal(followConflict.status(),200,await followConflict.text());
 assert.equal((await dav('GET',conflictPath)).status,404);
 assert(L.docxText(Buffer.from(await(await dav('GET',folder+'/Conflict Renamed.docx')).arrayBuffer())).includes('PUBLIC-CONFLICT-SAVED'));
 assert.deepEqual(Buffer.from(await(await dav('GET',target)).arrayBuffer()),before);
 console.log('PASS Nextcloud external change and rename of active conflict copy');
 await page.goto(base+'/example/elixir/nc/open?path='+encodeURIComponent(copy.path)+'&lang=en');const fresh=await L.editorFrame(page);assert((await L.docText(fresh)).includes(marker));
 // Show the actual cloud picker inside a read-only file, and choose a writable destination.
 await page.goto(base+'/example/elixir/nc/open?path='+encodeURIComponent(readonly+'/Read Only.docx')+'&lang=en');const ro=await L.editorFrame(page);
 const permissions=await ro.evaluate(()=>{const o=DE.getController('Main').appOptions;return{rename:!!o.canRename,edit:!!o.isEdit,copy:!!o.canRequestSaveAs}});
 assert.deepEqual(permissions,{rename:false,edit:false,copy:true});
 await ro.locator('#toolbar a[data-tab=file]').click();await ro.locator('#fm-btn-download').click();await ro.locator('#panel-saveas .elx-copy-formats .elx-format[format="65"]').click();
 await ro.waitForTimeout(300);
 const roCompatibility=ro.locator('.dlg-btn[result=ok]:visible');if(await roCompatibility.count()){assert((await ro.locator('.modal-dlg:visible,.asc-window:visible').allTextContents()).some(text=>/compatibility/i.test(text)));await roCompatibility.first().click()}
 const roPicker=page.locator('dialog[data-storage-folder-picker=nc]');await roPicker.waitFor({timeout:120000});
 await roPicker.locator('p').first().filter({hasText:readonly}).waitFor();
 assert(await roPicker.getByRole('button',{name:'Save',exact:true}).isDisabled());
 await roPicker.locator('button[data-folder="/"]').click();await roPicker.locator('button[data-folder="'+folder+'"]').click();await roPicker.locator('button[data-folder="'+folder+'/Copies"]').click();
 await roPicker.locator('input').fill('Read Only Copy.docx');await roPicker.getByRole('button',{name:'Save',exact:true}).click();
 await roPicker.locator('a').filter({hasText:'Open copy'}).waitFor();assert.equal((await dav('GET',folder+'/Copies/Read Only Copy.docx')).status,200);
 // The legacy denied-download sample user cannot bypass app policy through cloud callbacks.
 await page.goto(base+'/example/elixir/nc/open?path='+encodeURIComponent(folder+'/Conflict Renamed.docx')+'&lang=en&userid=uid-3');
 const limited=await L.editorFrame(page),limits=await limited.evaluate(()=>{const o=DE.getController('Main').appOptions;return{rename:!!o.canRename,copy:!!o.canRequestSaveAs,key:DE.getController('Main').document.key}});
 assert.equal(limits.rename,false);assert.equal(limits.copy,false);
 const deniedRename=await ctx.request.post(base+'/example/elixir/nc/rename',{headers:{'X-Elixir':'1'},data:{key:limits.key,name:'Forbidden sample'}});
 assert.equal(deniedRename.status(),403);assert.equal((await deniedRename.json()).message,'The file operation is unavailable for the current user');
 const deniedSampleCopy=await ctx.request.post(base+'/example/elixir/nc/copy',{headers:{'X-Elixir':'1'},data:{...copyRequest,key:limits.key,name:'Forbidden sample.docx'}});
 assert.equal(deniedSampleCopy.status(),403);assert.equal((await deniedSampleCopy.json()).message,'The file operation is unavailable for the current user');
 assert.equal((await dav('GET',folder+'/Forbidden sample.docx')).status,404);
 console.log('PASS Nextcloud app-level denied-download sample capabilities and Rename/copy403');
 console.log('PASS real Nextcloud rename/MOVE, future save, selected-folder copy/PUT, collisions, read-only folder/file permissions, external change, conflict-copy identity, original and copy reopen');
 await ctx.close();
}finally{await browser.close();}
