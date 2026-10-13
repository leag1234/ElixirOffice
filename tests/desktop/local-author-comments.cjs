// SPDX-License-Identifier: AGPL-3.0-only
// Combination acceptance: A author settings with D single-user review capability.
'use strict';
const {launch,editable,stop,root,fixture}=require('./harness.cjs'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
(async()=>{
 const input=await fixture('sample.docx'),before=await fs.readFile(input),env=await launch({file:input,profile:'author-comments-'+Date.now()});
 try{
  await editable(env);const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
  await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-settings').click();
  await env.page.locator('#author-name').fill('Public A456 Author');await env.page.locator('.desktop-options button').filter({hasText:await env.page.evaluate(()=>EODesktopStrings.save)}).click();await env.page.locator('.desktop-options').waitFor({state:'detached'});
  await frame.evaluate(()=>{
   const main=DE.getController('Main'),api=main.api;
   if(!main.appOptions.canLocalComments||!main.appOptions.canLocalReview)throw Error('D review dependency unavailable');
   api.WordControl.m_oLogicDocument.MoveCursorToStartPos();api.asc_SetTrackRevisions(true);api.asc_enterText(Array.from('A456 AUTHOR TRACK ',c=>c.codePointAt(0)));api.asc_SetTrackRevisions(false);
   DE.getController('Common.Controllers.Comments').onCreateComment(null,'A456 AUTHOR COMMENT',false,false,false);
  });
  const bytes=await env.page.evaluate(async()=>{const {controller,win}=EOLocalSession,snap=await controller.snapshot();return Array.from(await win.EOWasmConvert.convert(snap.bytes,snap.format,'docx',{resources:snap.resources}))});
  const output=path.join(root,'tmp/author-comments.docx');await fs.writeFile(output,Buffer.from(bytes));
  const result=JSON.parse(cp.execFileSync('python3',['-c',"import zipfile,sys,json,xml.etree.ElementTree as E;z=zipfile.ZipFile(sys.argv[1]);w='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}';c=E.fromstring(z.read('word/comments.xml'));d=E.fromstring(z.read('word/document.xml'));print(json.dumps({'comments':[n.get(w+'author') for n in c if 'A456 AUTHOR COMMENT' in ''.join(n.itertext())],'revisions':[n.get(w+'author') for n in d.iter(w+'ins') if 'A456 AUTHOR TRACK' in ''.join(n.itertext())]}))",output],{encoding:'utf8'}));
  assert.deepEqual(result.comments,['Public A456 Author']);assert(result.revisions.includes('Public A456 Author'));assert.deepEqual(await fs.readFile(input),before);
  console.log('PASS real Options live author used by shared comment UI and tracked-change OOXML; original intact');
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
