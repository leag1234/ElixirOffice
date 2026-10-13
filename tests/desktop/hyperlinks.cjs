// SPDX-License-Identifier: AGPL-3.0-only
// Capture native dispatch, without launching the owner's browser/mail client.
'use strict';
const {_electron}=require(process.env.EO_PLAYWRIGHT||'../../tools/node_modules/playwright-core'),path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root=process.env.EO_DESKTOP_ROOT;
(async()=>{
 const profile=path.join(root,'profiles','links-'+Date.now());await fs.mkdir(profile,{recursive:true});
 const app=await _electron.launch({executablePath:process.env.EO_PACKAGE_EXECUTABLE,args:[],env:{...process.env,DISPLAY:':0',XAUTHORITY:path.join(root,'desktop.Xauthority'),EO_DESKTOP_PROFILE:profile},timeout:120000}),child=app.process();
 try{
  await app.evaluate(({shell})=>{globalThis.EOOpened=[];shell.openExternal=async url=>{globalThis.EOOpened.push(url)}});
  const page=await app.firstWindow();await page.waitForFunction(()=>window.EODesktopReady);
  await page.locator('[data-new=docx]').click();await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>window.EOLocalFailure||null),null);
  const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));
  await frame.evaluate(()=>{window.EOLinkClicks=[];Asc.editor.asc_registerCallback('asc_onHyperlinkClick',url=>window.EOLinkClicks.push(url))});
  for(const url of ['https://example.org/local-gap-test','http://example.org/local-gap-test','mailto:person@example.org']){
   await frame.evaluate(url=>new Promise(resolve=>Asc.editor.callCommand("var d=Api.GetDocument();d.RemoveAllElements();var p=d.GetElement(0);p.AddText('Public hyperlink');p.AddHyperlink("+JSON.stringify(url)+");",true,resolve)),url);
   await frame.waitForTimeout(300);
   await frame.evaluate(()=>{const d=Asc.editor.WordControl.m_oLogicDocument,p=d.Content[0];p.MoveCursorToStartPos();for(let i=0;i<4;i++)p.MoveCursorRight(false,false);d.Document_UpdateSelectionState()});
   const fb=await(await frame.frameElement()).boundingBox();
   const pos=await frame.evaluate(({x,y})=>{const d=Asc.editor.WordControl.m_oLogicDocument,t=d.TargetPos,c=d.DrawingDocument.ConvertCoordsToCursorWR(t.X,t.Y,t.PageNum),sdk=document.getElementById('editor_sdk').getBoundingClientRect();return {x:x+sdk.left+c.X+1,y:y+sdk.top+c.Y+3}},fb);
   await page.bringToFront();await frame.evaluate(()=>{Asc.editor.asc_enableKeyEvents(true);document.getElementById('area_id')?.focus()});await page.mouse.move(pos.x+30,pos.y+30);await page.mouse.move(pos.x,pos.y);
   await page.keyboard.down('Control');await page.mouse.click(pos.x,pos.y);await page.keyboard.up('Control');
   for(let i=0;i<50;i++){if((await app.evaluate(()=>globalThis.EOOpened)).includes(url))break;await page.waitForTimeout(100)}
   console.log('CLICK DIAGNOSTIC',url,pos,await frame.evaluate(()=>({clicked:window.EOLinkClicks,paragraphs:Asc.editor.WordControl.m_oLogicDocument.GetAllParagraphs().map(p=>p.GetText())})),await app.evaluate(()=>globalThis.EOOpened));
   assert((await app.evaluate(()=>globalThis.EOOpened)).includes(url),'Ctrl+click did not dispatch '+url);
  }
  const count=(await app.evaluate(()=>globalThis.EOOpened)).length;
  for(const url of ['file:///tmp/not-opened','javascript:alert(1)','data:text/html,blocked'])await frame.evaluate(url=>window.open(url),url);
  await page.waitForTimeout(300);assert.equal((await app.evaluate(()=>globalThis.EOOpened)).length,count);
  assert.equal(app.windows().length,1);
  console.log('PASS actual Ctrl+click http/https/mailto dispatch, invalid schemes blocked, no embedded windows');
  console.log('Native openExternal intercepted for dispatch evidence; no owner browser/mail client launched. Functional inspector test, not sandbox acceptance.');
 }finally{if(child.exitCode===null)child.kill('SIGKILL');await app.close().catch(()=>{})}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
