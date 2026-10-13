/* SPDX-License-Identifier: AGPL-3.0-only */
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const{chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const base=process.env.EO_BASE,fixtures=process.env.EO_COMMENT_FIXTURES,out=process.env.EO_COMMENT_OUT;assert(base&&!/:8080(?:\/|$)/.test(base)&&fixtures&&out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch(),report=[];
try{
 for(const[name,kind,namespace]of[['new.xlsx','spreadsheeteditor','SSE'],['new.pptx','presentationeditor','PE']]){
  const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/example/local.html?lang=en');await page.locator('#file').setInputFiles(path.join(fixtures,name));
  await page.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>EOLocalFailure),null);
  const frame=page.frames().find(f=>f.url().includes('/'+kind+'/main/'));
  const mode=await frame.evaluate(ns=>{const m=window[ns].getController('Main').appOptions;return{local:m.canLocalComments,light:m.isLightVersion,coauthor:m.canCoAuthoring,history:m.canUseHistory,chat:m.canChat}},namespace);
  assert.equal(mode.local,true);assert.equal(mode.light,true);assert.equal(mode.coauthor,false);assert.equal(mode.history,false);assert.equal(mode.chat,false);
  for(const tip of await frame.getByText('Got it',{exact:true}).all())if(await tip.isVisible())await tip.click();
  await frame.evaluate(ns=>{const api=window[ns].getController('Main').api;api.asc_enableKeyEvents(true);const area=document.getElementById('area_id');if(area)area.focus()},namespace);
  for(const tab of await frame.getByText('Insert',{exact:true}).all())if(await tab.isVisible()){await tab.click();break}
  await frame.locator('.slot-comment button:visible').first().click();
  const input=frame.locator('#id-comments-popover textarea:visible,#comment-msg-new:visible,#elx-markup .elx-cbal-input:visible').first();
  await input.waitFor({state:'visible'});const text='Local '+namespace+' comment';await input.fill(text);await input.press('Control+Enter');
  await frame.waitForFunction(({ns,text})=>window[ns].getController('Common.Controllers.Comments').collection.models.some(m=>m.get('comment')===text),{ns:namespace,text});
  await page.screenshot({path:path.join(out,namespace+'-comment.png')});
  const download=page.waitForEvent('download',{timeout:90000});await page.locator('#save').click();const saved=path.join(out,name);await(await download).saveAs(saved);
  execFileSync('python3',['-c',"import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert any(sys.argv[2] in z.read(n).decode(errors='ignore') for n in z.namelist() if n.endswith('.xml') and 'comment' in n.lower()),'No persisted comment XML'",saved,text]);
  assert.deepEqual(errors,[]);await context.close();
  const reopened=await browser.newContext(),again=await reopened.newPage();await again.goto(base+'/example/local.html?lang=en');await again.locator('#file').setInputFiles(saved);await again.waitForFunction(()=>EOLocalSession||EOLocalFailure,null,{timeout:120000});assert.equal(await again.evaluate(()=>EOLocalFailure),null);
  const f=again.frames().find(f=>f.url().includes('/'+kind+'/main/'));
  assert(await f.evaluate(({ns,text})=>window[ns].getController('Common.Controllers.Comments').collection.models.some(m=>m.get('comment')===text),{ns:namespace,text}));
  report.push({namespace,mode,text,saved});await reopened.close();
 }
 fs.writeFileSync(path.join(out,'comments.json'),JSON.stringify(report,null,2));console.log('PASS Cell/Slide actual Insert comment, author model, save XML and fresh reopen');
}finally{await browser.close()}
