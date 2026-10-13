/* SPDX-License-Identifier: AGPL-3.0-only */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(path.join(process.env.PW_DIR||path.join(os.homedir(),'elixiroffice/pw'),'package.json'))('playwright');
const base=process.env.EO_BASE,file=process.env.EO_REVIEW_DOCX,out=process.env.EO_REVIEW_OUT;
assert(base&&!/:8080(?:\/|$)/.test(base)&&file&&out,'Own instance, generated public review fixture and output required');
assert(!fs.realpathSync(file).split(path.sep).includes('corpus-private'),'Public fixture only');
fs.mkdirSync(out,{recursive:true});
const author='Offline Reviewer',added='Offline new comment',edited='Edited imported local comment',marker=' EO_LOCAL_TRACKED';
const browser=await chromium.launch(),report=[];
async function open(source){
 const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage(),bad=[],errors=[];
 // Supply the existing launcher's editor-user configuration; conversion/model/UI remain real.
 await page.route('**/example/elixir-local/local.js',async route=>{const response=await route.fetch();let body=await response.text();const from="user:{id:'local',name:'Local user'}";assert(body.includes(from),'Launcher identity contract changed');body=body.replace(from,"user:{id:'local',name:'"+author+"'}");await route.fulfill({response,body})});
 page.on('request',r=>{const u=new URL(r.url());if(!['blob:','data:'].includes(u.protocol)&&(r.method()!=='GET'||u.origin!==new URL(base).origin))bad.push({url:r.url(),method:r.method()})});
 page.on('websocket',w=>bad.push({url:w.url(),method:'WebSocket'}));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/example/local.html?lang=en');
 if(process.env.EO_LOCAL_VIEWPORT_FIXTURE==='1')await page.addStyleTag({content:'body > iframe { width:100%; height:calc(100vh - 62px); border:0; }'});
 await page.locator('#file').setInputFiles(source);
 await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert.equal(await page.evaluate(()=>window.EOLocalFailure),null);
 const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
 return{context,page,frame,bad,errors};
}
async function comments(frame){return frame.evaluate(()=>Object.entries(Asc.editor.WordControl.m_oLogicDocument.Comments.GetAllComments()).map(([id,c])=>({id,text:c.Data.Get_Text(),author:c.Data.Get_Name()})))}
async function focus(env){await env.frame.evaluate(()=>{Asc.editor.asc_enableKeyEvents(true);document.getElementById('area_id').focus()})}
try{
 const env=await open(file);
 try{
  const {page,frame}=env;
  const mode=await frame.evaluate(()=>{const m=DE.getController('Main').appOptions;return{local:m.canLocalComments,review:m.canReview,light:m.isLightVersion,coauthor:m.canCoAuthoring,history:m.canUseHistory,chat:m.canChat,compare:m.canFeatureComparison,mailmerge:m.canUseMailMerge,reviewOnly:!!m.isReviewOnly,user:m.user.fullname}});
  assert.deepEqual(mode,{local:true,review:true,light:true,coauthor:false,history:false,chat:false,compare:false,mailmerge:false,reviewOnly:false,user:author});
  assert((await comments(frame)).some(c=>c.text==='Existing imported local comment'&&c.author==='Baseline Author'),'Imported comment lost');
  assert((await frame.evaluate(()=>innerHeight))>350,'Web local launcher viewport is collapsed; A-owned shell fix required');
  for(const tip of await frame.getByText('Got it',{exact:true}).all())if(await tip.isVisible())await tip.click();
  for(const tab of await frame.getByText('Review',{exact:true}).all())if(await tab.isVisible()){await tab.click();break}
  const showComments=frame.locator('#slot-elx-rev-showcomments button').first();await showComments.waitFor({state:'visible'});await showComments.click();
  await frame.locator('#left-panel-comments').waitFor({state:'visible'});await frame.locator('#left-panel-comments').getByText('Existing imported local comment',{exact:true}).first().waitFor({state:'visible'});
  await showComments.click();await frame.locator('#elx-markup .elx-cbal-text').filter({hasText:'Existing imported local comment'}).waitFor({state:'visible'});
  await page.screenshot({path:path.join(out,'imported-comments.png')});
  await focus(env);await page.keyboard.press('Control+Home');for(let i=0;i<8;i++)await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Control+Alt+m');
  const input=frame.locator('#id-comments-popover textarea:visible,#comment-msg-new:visible,#elx-markup .elx-cbal-input:visible').first();await input.waitFor({state:'visible'});await input.fill(added);await input.press('Control+Enter');
  await frame.waitForFunction(text=>Object.values(Asc.editor.WordControl.m_oLogicDocument.Comments.GetAllComments()).some(c=>c.Data.Get_Text()===text),added);
  const newComment=(await comments(frame)).find(c=>c.text===added);assert.equal(newComment.author,author);
  const imported=(await comments(frame)).find(c=>c.text==='Existing imported local comment');const balloon=frame.locator('#elx-markup [data-uid="'+imported.id+'"]');
  await balloon.locator('[data-act=more]').click();await frame.locator('.elx-cbal-menu [data-action=edit]').click();await balloon.locator('textarea').fill(edited);await balloon.locator('[data-act=save]').click();
  await frame.waitForFunction(text=>Object.values(Asc.editor.WordControl.m_oLogicDocument.Comments.GetAllComments()).some(c=>c.Data.Get_Text()===text),edited);
  assert.equal((await comments(frame)).find(c=>c.text===edited).author,author,'Edited comments must use the configured current editor');
  await focus(env);await page.keyboard.press('Control+Shift+e');assert.equal(await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.IsTrackRevisions()),true);
  await page.keyboard.press('Control+End');await page.keyboard.type(marker);
  assert((await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs().map(p=>p.GetText()).join('\n'))).includes(marker));
  const download=page.waitForEvent('download',{timeout:90000});await page.locator('#save').click();const saved=path.join(out,'review-edited.docx');await(await download).saveAs(saved);
  const zip=JSON.parse(execFileSync('python3',['-c','import json,sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({"document":z.read("word/document.xml").decode(),"comments":z.read("word/comments.xml").decode()}))',saved],{encoding:'utf8'}));
  assert(zip.comments.includes(added)&&zip.comments.includes(edited)&&zip.comments.includes(author),'Saved comments/name missing');
  assert(zip.document.includes('EO_LOCAL_TRACKED')&&/<(?:\w+:)?ins\b/.test(zip.document)&&zip.document.includes(author),'Tracked insertion/name missing from actual DOCX');
  report.push({phase:'save',viewportFixture:process.env.EO_LOCAL_VIEWPORT_FIXTURE==='1',mode,comments:await comments(frame),saved});assert.deepEqual(env.bad,[]);assert.deepEqual(env.errors,[]);
  await env.context.close();
  const reopened=await open(saved);
  try{
   const after=await comments(reopened.frame);assert(after.some(c=>c.text===added&&c.author===author));assert(after.some(c=>c.text===edited&&c.author===author));
   assert((await reopened.frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs().map(p=>p.GetText()).join('\n'))).includes(marker));
   const remove=after.find(c=>c.text===added);
   // Delete through the visible margin menu, then exercise real revision decisions.
   await focus(reopened);await reopened.page.keyboard.press('Control+Home');
   const deletedBalloon=reopened.frame.locator('#elx-markup [data-uid="'+remove.id+'"]');
   await deletedBalloon.locator('[data-act=more]').click();await reopened.frame.locator('.elx-cbal-menu [data-action=delete]').click();
   await reopened.frame.waitForFunction(text=>!Object.values(Asc.editor.WordControl.m_oLogicDocument.Comments.GetAllComments()).some(c=>c.Data.Get_Text()===text),added);
   await reopened.frame.evaluate(()=>Asc.editor.asc_RejectAllChanges());
   assert(!(await reopened.frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs().map(p=>p.GetText()).join('\n'))).includes(marker),'Rejected insertion remains');
   await focus(reopened);await reopened.page.keyboard.press('Control+End');
   if(!await reopened.frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.IsTrackRevisions()))await reopened.page.keyboard.press('Control+Shift+e');
   await reopened.page.keyboard.type(' EO_ACCEPTED_TRACK');
   await reopened.frame.evaluate(()=>Asc.editor.asc_AcceptAllChanges());
   assert((await reopened.frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs().map(p=>p.GetText()).join('\n'))).includes('EO_ACCEPTED_TRACK'));
   const decisionDownload=reopened.page.waitForEvent('download',{timeout:90000});await reopened.page.locator('#save').click();const decided=path.join(out,'review-decisions.docx');await(await decisionDownload).saveAs(decided);
   const decisionXml=JSON.parse(execFileSync('python3',['-c','import json,sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({"document":z.read("word/document.xml").decode(),"comments":z.read("word/comments.xml").decode()}))',decided],{encoding:'utf8'}));
   assert(!decisionXml.comments.includes(added)&&decisionXml.comments.includes(edited));
   assert(decisionXml.document.includes('EO_ACCEPTED_TRACK')&&!decisionXml.document.includes('EO_LOCAL_TRACKED'));
   assert(!/<(?:\w+:)?(?:ins|del)\b/.test(decisionXml.document),'Accepted revisions remain marked');
   await reopened.page.screenshot({path:path.join(out,'review-reopened.png')});report.push({phase:'reopen',comments:after});assert.deepEqual(reopened.bad,[]);assert.deepEqual(reopened.errors,[]);
  }finally{await reopened.context.close()}
 }finally{await env.context.close()}
 fs.writeFileSync(path.join(out,'review.json'),JSON.stringify(report,null,2));console.log('PASS local imported comments/panel/margin/add/edit/author/Track Changes/save/fresh reopen; collaboration/history remain off');
}finally{await browser.close()}
