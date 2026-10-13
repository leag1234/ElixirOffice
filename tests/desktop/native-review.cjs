// SPDX-License-Identifier: AGPL-3.0-only
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {launch,stop,editable,fixture,sleep,root}=require('./harness.cjs');
(async()=>{
 assert(process.env.EO_DESKTOP_EXECUTABLE,'Own built desktop executable required');
 const file=await fixture(path.join(root,'fixtures/offline-review.docx'));let env;
 try{
  env=await launch({file,profile:'D1-native-'+Date.now(),executable:process.env.EO_DESKTOP_EXECUTABLE});await editable(env);
  const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
  const mode=await frame.evaluate(()=>{const m=DE.getController('Main').appOptions;return{local:m.canLocalComments,review:m.canReview,light:m.isLightVersion,coauthor:m.canCoAuthoring,history:m.canUseHistory,author:m.user.fullname}});
  assert.deepEqual({...mode,author:undefined},{local:true,review:true,light:true,coauthor:false,history:false,author:undefined});
  const comments=()=>frame.evaluate(()=>Object.values(Asc.editor.WordControl.m_oLogicDocument.Comments.GetAllComments()).map(c=>({text:c.Data.Get_Text(),author:c.Data.Get_Name()})));
  assert((await comments()).some(c=>c.text==='Existing imported local comment'&&c.author==='Baseline Author'));
  for(const tip of await frame.getByText('Got it',{exact:true}).all())if(await tip.isVisible())await tip.click();
  await frame.locator('#elx-markup .elx-cbal-text').filter({hasText:'Existing imported local comment'}).waitFor({state:'visible'});
  await frame.evaluate(()=>{Asc.editor.asc_enableKeyEvents(true);document.getElementById('area_id').focus()});await env.page.keyboard.press('Control+Home');await env.page.keyboard.press('Shift+ArrowRight');await env.page.keyboard.press('Control+Alt+m');
  const input=frame.locator('#id-comments-popover textarea:visible,#comment-msg-new:visible,#elx-markup .elx-cbal-input:visible').first();
  await input.waitFor({state:'visible'});await input.fill('Native offline comment');await input.press('Control+Enter');
  await frame.waitForFunction(()=>Object.values(Asc.editor.WordControl.m_oLogicDocument.Comments.GetAllComments()).some(c=>c.Data.Get_Text()==='Native offline comment'));
  assert.equal((await comments()).find(c=>c.text==='Native offline comment').author,mode.author);
  await frame.evaluate(()=>{Asc.editor.asc_enableKeyEvents(true);document.getElementById('area_id').focus()});await env.page.keyboard.press('Control+Shift+e');assert(await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.IsTrackRevisions()));await env.page.keyboard.press('Control+End');await env.page.keyboard.type(' EO_NATIVE_TRACK');
  const before=await fs.readFile(file);await env.page.keyboard.press('Control+s');
  for(let i=0;i<300;i++){await sleep(100);if(!before.equals(await fs.readFile(file))&&!await env.page.evaluate(()=>EOLocalSession.controller.isModified()))break;}
  assert(!before.equals(await fs.readFile(file)),'Native save did not write the same file');
  assert.equal(await env.page.evaluate(()=>EOLocalSession.controller.isModified()),false);
  await env.page.screenshot({path:path.join(root,'results/native-review.png')});
  const evidence={file,mode,comments:await comments(),errors:env.errors,external:env.requests.filter(r=>!r.url.startsWith('eoapp:')&&!r.url.startsWith('blob:')&&!r.url.startsWith('data:'))};
  assert.deepEqual(evidence.external,[]);assert.deepEqual(evidence.errors,[]);await stop(env);env=null;
  env=await launch({file,profile:'D1-native-reopen-'+Date.now(),executable:process.env.EO_DESKTOP_EXECUTABLE});await editable(env);
  const again=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
  assert(await again.evaluate(()=>Object.values(Asc.editor.WordControl.m_oLogicDocument.Comments.GetAllComments()).some(c=>c.Data.Get_Text()==='Native offline comment')));
  assert((await again.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs().map(p=>p.GetText()).join('\n'))).includes('EO_NATIVE_TRACK'));
  await fs.writeFile(path.join(root,'results/native-review.json'),JSON.stringify(evidence,null,2));console.log('PASS native imported/add comments, author, Track Changes, actual same-file save and fresh app reopen');
 }finally{if(env)await stop(env)}
})().catch(e=>{console.error(e);process.exitCode=1});
