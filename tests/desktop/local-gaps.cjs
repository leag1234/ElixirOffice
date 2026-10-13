// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,stop,editable,root}=require('./harness.cjs'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const file=path.join(root,'fixtures/sample.docx'),original=await fs.readFile(file),profile='local-gaps-'+Date.now();
 const executable=process.env.EO_PACKAGE_EXECUTABLE;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
 const first=await launch({executable,file,profile});
 try{
  await editable(first);const activeTarget=JSON.parse(await fs.readFile(path.join(first.directory,'desktop-settings.json'),'utf8')).recents[0].target;const activeOriginal=await fs.readFile(activeTarget);
  assert.equal(await first.page.evaluate(()=>EOLocalSession.api.asc_Save(true)),false,'Automatic save must be rejected');
  const frame=first.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
  const range=await frame.evaluate(async()=>{const r=await fetch('/example/local-assets/dictionaries/en_US/en_US_thes.dat',{headers:{Range:'bytes=0-15'}});return {status:r.status,length:(await r.arrayBuffer()).byteLength,range:r.headers.get('content-range')}});
  assert.equal(range.status,206);assert.equal(range.length,16);assert(range.range.startsWith('bytes 0-15/'));
  for(const [lang,words] of [[1033,['hello','zzzzbadwordzzzz']],[1036,['bonjour','zzzzmauvaiszzzz']]]){
   const spell=await frame.evaluate(({lang,words})=>new Promise((resolve,reject)=>{
    const worker=Asc.editor.SpellCheckApi.worker,original=worker.oncommand;let timer=setTimeout(()=>{worker.oncommand=original;reject(Error('Spell result timed out'))},20000);
    worker.oncommand=function(data){if(data.ParagraphId==='local-gaps-probe'){clearTimeout(timer);worker.oncommand=original;resolve(data.usrCorrect)}else original.call(this,data)};
    worker.command({type:'spell',ParagraphId:'local-gaps-probe',usrWords:words,usrLang:words.map(()=>lang)});
   }),{lang,words});assert.deepEqual(spell,[true,false]);
   const synonyms=await frame.evaluate(async lang=>{const panes=DE.getController('WordPanes'),thes=await panes.loadThesaurus(lang);if(!thes)return null;const word=[...thes.index.keys()].find(word=>/^[a-zéèàêîôûç]{4,}$/i.test(word));return {word,results:await panes.lookup(thes,word)}},lang);
   assert(synonyms?.results?.some(row=>row.words.length),'Thesaurus returned no synonyms '+lang);
   const hyph=await frame.evaluate(lang=>new Promise((resolve,reject)=>{
    const h=AscHyphenation,timer=setTimeout(()=>reject(Error('Hyphenation timed out')),20000),run=()=>{h.clear();for(const char of (lang===1036?'internationalisation':'internationalization'))h.addCodePoint(char.codePointAt(0));clearTimeout(timer);resolve(h.hyphenate())};
    if(h.setLang(lang,run))run();
   }),lang);assert(hyph.length,'Hyphenation returned no breakpoints '+lang);
  }
  await frame.evaluate(()=>{Asc.editor.WordControl.m_oLogicDocument.MoveCursorToStartPos();Asc.editor.asc_enterText(Array.from('zzzzmisspelllzzzz ',c=>c.codePointAt(0)))});
  const spellingUntil=Date.now()+20000;let errors=0;
  while(Date.now()<spellingUntil){errors=await frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs().reduce((n,p)=>n+(p.SpellChecker?.GetErrorsCount()||0),0));if(errors>0)break;await first.page.waitForTimeout(250)}
  assert(errors>0,'Edited document did not report a real misspelled word');
  console.log('PASS actual document misspelling, en/fr spellworker, thesaurus Range206 synonyms, hyphenation breakpoints');
  await frame.locator('#toolbar a[data-tab=file]').click();await frame.locator('#fm-btn-settings').click();
  await first.page.locator('#recovery-interval').selectOption('15');
  await first.page.locator('.desktop-options button').filter({hasText:await first.page.evaluate(()=>EODesktopStrings.save)}).click();
  assert.equal((await first.page.evaluate(()=>eoDesktop.recoveryOptions())).seconds,15);
  await frame.evaluate(()=>new Promise(resolve=>Asc.editor.callCommand("var p=Api.CreateParagraph();p.AddText('LOCAL RECOVERY CHECK');Api.GetDocument().Push(p);",true,resolve)));

  await first.page.evaluate(async bytes=>{await EOLocalSession.controller.addImage(new File([new Uint8Array(bytes)],'public-pixel.png',{type:'image/png'}))},Array.from(png));
  const until=Date.now()+120000;let copies=[];
  while(Date.now()<until){copies=await first.page.evaluate(()=>eoDesktop.recoveryList());if(copies.length===1)break;await first.page.waitForTimeout(500)}
  assert.equal(copies.length,1,'No periodic recovery copy was written');
  console.log('AFTER WAIT',await first.page.evaluate(()=>eoDesktop.recoveryList()),await fs.readdir(path.join(first.directory,'recovery')));
  assert.equal(await first.page.evaluate(()=>EOLocalSession.controller.isModified()),true,'Recovery marked document saved');
  assert.equal(await first.page.evaluate(()=>EODesktopState(false).dirty),true);
  // Verify renderer input is still unlocked after recovery's state query.
  await frame.locator('#toolbar a[data-tab=home]').click();
  assert.deepEqual(await fs.readFile(file),original,'Periodic recovery modified fixture');
  assert.deepEqual(await fs.readFile(activeTarget),activeOriginal,'Periodic recovery overwrote active user file');
  console.log('PASS actual periodic recovery copy, media snapshot, dirty state, original intact and UI unlocked');
  console.log('SAVE DIAGNOSTIC',await first.page.evaluate(()=>({lastSave:window.EOLastSave,modified:EOLocalSession?.controller.isModified(),autoGap:EOLocalSession?.api.autoSaveGap})));
  console.log('BEFORE CRASH',await fs.readdir(path.join(first.directory,'recovery')),await first.page.evaluate(()=>eoDesktop.recoveryList()));
  process.kill(-first.application.pid,'SIGKILL');await new Promise(resolve=>first.application.once('exit',resolve));
  console.log('AFTER CRASH',await fs.readdir(path.join(first.directory,'recovery')));
 }finally{await stop(first)}
 const second=await launch({executable,profile});
 try{
  console.log('SECOND START',await fs.readdir(path.join(second.directory,'recovery')),await second.page.evaluate(()=>({failure:window.EOLocalFailure,dialog:document.querySelector('dialog')?.outerHTML,ready:window.EODesktopReady})),await second.page.evaluate(()=>eoDesktop.recoveryList()));
  await second.page.locator('.desktop-options').waitFor();const label=await second.page.evaluate(()=>EODesktopStrings.restore);
  await second.page.locator('.desktop-options button').filter({hasText:label}).click();
  await editable(second);
  const text=await second.page.evaluate(()=>EOLocalSession.api.WordControl.m_oLogicDocument.GetAllParagraphs().map(p=>p.GetText()).join('\n'));
  assert(text.includes('LOCAL RECOVERY CHECK'));
  const media=await second.page.evaluate(async()=>{const snap=await EOLocalSession.controller.snapshot();return snap.resources.map(r=>({path:r.path,bytes:r.bytes.length}))});
  assert(media.some(r=>r.bytes===png.length),'Added picture lost in recovery');
  assert.equal(await second.page.evaluate(()=>EOLocalSession.controller.isModified()),true,'Restored copy must be unsaved');
  assert.deepEqual(await fs.readFile(file),original);
  console.log('PASS next-start restore prompt and actual document/media recovery after SIGKILL; original intact');
  assert(!second.requests.some(r=>/^https?:/.test(r.url)),'Recovery attempted remote network');
 }finally{await stop(second)}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
