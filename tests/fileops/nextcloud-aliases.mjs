// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';import assert from 'node:assert/strict';import * as L from '../nextcloud/lib.mjs';
const base=process.env.EO_BASE,server=process.env.NC_BASE;assert(base&&server,'Use owned EO_BASE/NC_BASE/NC_ENV fixtures');
const browser=await L.chromium.launch(),fixture=fs.readFileSync(new URL('../fixtures/docx/selection-fills.docx',import.meta.url));
async function connect(user){
 const ctx=await browser.newContext({viewport:{width:1920,height:1080}}),page=await ctx.newPage();
 await page.goto(base+'/example/?lang=en');if(await page.evaluate(()=>document.getElementById('profile-dialog').open))await page.click('#profile-skip');
 const flow=await(await ctx.request.post(base+'/example/elixir/nc/connect',{headers:{'X-Elixir':'1'},data:{server}})).json();assert(flow.login,'Login Flow v2 did not start');
 const popup=await ctx.newPage();await popup.goto(flow.login);
 const button=popup.getByRole('button',{name:/log in/i});if(await button.count())await button.first().click();
 await popup.locator('input[name=user]').fill(user);await popup.locator('input[name=password]').fill(L.password(user));await popup.locator('input[name=password]').press('Enter');
 await popup.getByRole('button',{name:/grant access/i}).click();let ready=false;
 for(let i=0;i<40;i++){const state=await(await ctx.request.post(base+'/example/elixir/nc/connect/poll',{headers:{'X-Elixir':'1'}})).json();if(state.status==='connected'){ready=true;break}await page.waitForTimeout(500)}
 assert(ready);await popup.close();return{ctx,page};
}
try{
 const folder='/SharedE-'+Date.now(),mounted='/MountedE-'+Date.now(),original=folder+'/Original.docx';
 assert.equal((await L.dav('alice','MKCOL',folder)).status,201);assert.equal((await L.dav('alice','PUT',original,fixture)).status,201);
 assert.equal((await L.share('alice',folder,'bob')).ocs.meta.statuscode,200);
 const mount=await L.dav('bob','MOVE',folder,undefined,{Destination:server+'/remote.php/dav/files/bob'+mounted,Overwrite:'F'});assert([201,204].includes(mount.status),'Fixture shared mount rename failed');
 assert.equal((await L.dav('alice','GET',original)).status,200);assert.equal((await L.dav('bob','GET',mounted+'/Original.docx')).status,200);
 const a=await connect('alice'),b=await connect('bob');
 await a.page.goto(base+'/example/elixir/nc/open?path='+encodeURIComponent(original)+'&lang=en');const af=await L.editorFrame(a.page);
 await b.page.goto(base+'/example/elixir/nc/open?path='+encodeURIComponent(mounted+'/Original.docx')+'&lang=en');const bf=await L.editorFrame(b.page);
 const key=await af.evaluate(()=>DE.getController('Main').document.key);assert.equal(await bf.evaluate(()=>DE.getController('Main').document.key),key);
 const rename=async(name)=>a.ctx.request.post(base+'/example/elixir/nc/rename',{headers:{'X-Elixir':'1'},data:{key,name}});
 const moved=await rename('Shared Renamed');assert.equal(moved.status(),200,await moved.text());
 const renamed=folder+'/Shared Renamed.docx',bobRenamed=mounted+'/Shared Renamed.docx';
 assert.equal((await L.dav('bob','GET',mounted+'/Original.docx')).status,404);assert.deepEqual(Buffer.from(await(await L.dav('bob','GET',bobRenamed)).arrayBuffer()),fixture);
 // An external version creates a conflict copy through Bob's distinct mount.
 assert.equal((await L.dav('alice','PUT',renamed,fixture)).status,204);
 await b.page.bringToFront();await bf.locator('#toolbar a[data-tab=home]').click();
 await L.typeAtStart(b.page,bf,'PUBLIC-SHARED-CONFLICT ');assert((await L.docText(bf)).includes('PUBLIC-SHARED-CONFLICT'));await b.page.keyboard.press('Control+s');
 const bobCopy=mounted+'/Shared Renamed (conflict).docx';
 let bytes;
 for(let i=0;i<120;i++){const response=await L.dav('bob','GET',bobCopy);if(response.status===200){bytes=Buffer.from(await response.arrayBuffer());if(L.docxText(bytes).includes('PUBLIC-SHARED-CONFLICT'))break}await b.page.waitForTimeout(500)}
 assert(bytes&&L.docxText(bytes).includes('PUBLIC-SHARED-CONFLICT'),'Shared conflict copy was not saved');
 const after=await rename('Shared Conflict Renamed');assert.equal(after.status(),200,await after.text());
 const aliceCopy=folder+'/Shared Conflict Renamed.docx',bobFinal=mounted+'/Shared Conflict Renamed.docx';
 assert.equal((await L.dav('bob','GET',bobCopy)).status,404);assert(L.docxText(Buffer.from(await(await L.dav('bob','GET',bobFinal)).arrayBuffer())).includes('PUBLIC-SHARED-CONFLICT'));
 assert.deepEqual(Buffer.from(await(await L.dav('alice','GET',renamed)).arrayBuffer()),fixture);
 await a.page.goto(base+'/example/elixir/nc/open?path='+encodeURIComponent(aliceCopy)+'&lang=en');const fresh=await L.editorFrame(a.page);
 assert.equal(await fresh.evaluate(()=>DE.getController('Main').document.key),key);assert((await L.docText(fresh)).includes('PUBLIC-SHARED-CONFLICT'));
 console.log('PASS real two-account distinct mount aliases: shared key, Rename, Bob conflict save, Alice retargeted Rename, current key reopen, external original preserved');
 await a.ctx.close();await b.ctx.close();
}finally{await browser.close()}
