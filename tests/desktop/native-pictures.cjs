// SPDX-License-Identifier: AGPL-3.0-only
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process');
const {launch,stop,editable,fixture,sleep,root}=require('./harness.cjs');
(async()=>{
 assert(process.env.EO_DESKTOP_EXECUTABLE,'Own built desktop executable required');
 const file=await fixture(path.join(root,'fixtures/offline-review.docx'));let env,clipboard;
 try{
  env=await launch({file,profile:'D2-native-'+Date.now(),executable:process.env.EO_DESKTOP_EXECUTABLE});await editable(env);
  const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
  const drawings=()=>frame.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length);
  const baseline=await drawings();
  const image=path.join(root,'fixtures/image.png');
  // A native X11 clipboard owner supplies only this public fixture.
  clipboard=cp.spawn('/usr/bin/python3',[path.join(__dirname,'clipboard-fixture.py'),image],{cwd:root,env:{...process.env,DISPLAY:':0',XAUTHORITY:path.join(root,'desktop.Xauthority'),XDG_CONFIG_HOME:path.join(root,'profiles/clipboard/config'),XDG_CACHE_HOME:path.join(root,'profiles/clipboard/cache'),XDG_DATA_HOME:path.join(root,'profiles/clipboard/data'),DBUS_SESSION_BUS_ADDRESS:'unix:path='+path.join(root,'profiles/clipboard/no-session-bus'),GSETTINGS_BACKEND:'memory',GTK_USE_PORTAL:'0'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Clipboard fixture did not start')),10000);clipboard.stdout.on('data',b=>{if(b.toString().includes('READY')){clearTimeout(timer);resolve()}});clipboard.on('exit',code=>{clearTimeout(timer);reject(Error('Clipboard fixture exited '+code))})});
  for(const tip of await frame.getByText('Got it',{exact:true}).all())if(await tip.isVisible())await tip.click();
  await frame.evaluate(()=>{Asc.editor.asc_enableKeyEvents(true);document.getElementById('area_id').focus()});await env.page.keyboard.press('Control+End');await env.page.keyboard.press('Control+v');
  await frame.waitForFunction(n=>Asc.editor.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length>n,baseline,{timeout:30000});
  const afterPaste=await drawings();assert.equal(afterPaste,baseline+1);
  // Browser DOM drop traverses the real SDK drop handler and desktop close guard.
  const bytes=(await fs.readFile(image)).toString('base64');
  const data=await frame.evaluateHandle(encoded=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],'drop.png',{type:'image/png'}));return dt;},bytes);
  const selector=await frame.evaluate(()=> '#'+Asc.editor.HtmlElement.id);
  await frame.locator(selector).dispatchEvent('drop',{dataTransfer:data,clientX:400,clientY:350});
  await frame.waitForFunction(n=>Asc.editor.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length>n,afterPaste,{timeout:30000});await data.dispose();
  await env.page.waitForFunction(()=>!EOLocalSession.controller.hasPendingImages(),null,{timeout:30000});assert.equal(await frame.evaluate(()=>Asc.editor.isLongAction()),false);
  const before=await fs.readFile(file);await frame.evaluate(()=>{Asc.editor.asc_enableKeyEvents(true);document.getElementById('area_id').focus()});await env.page.keyboard.press('Control+s');
  for(let i=0;i<300;i++){await sleep(100);if(!before.equals(await fs.readFile(file))&&!await env.page.evaluate(()=>EOLocalSession.controller.isModified()))break;}
  assert(!before.equals(await fs.readFile(file)));
  await env.page.screenshot({path:path.join(root,'results/native-pictures.png')});
  const evidence={file,baseline,afterPaste,afterDrop:await drawings(),external:env.requests.filter(r=>!r.url.startsWith('eoapp:')&&!r.url.startsWith('blob:')&&!r.url.startsWith('data:')),errors:env.errors};
  assert.equal(evidence.afterDrop,baseline+2);assert.deepEqual(evidence.external,[]);assert.deepEqual(evidence.errors,[]);await stop(env);env=null;
  env=await launch({file,profile:'D2-native-reopen-'+Date.now(),executable:process.env.EO_DESKTOP_EXECUTABLE});await editable(env);
  const again=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert.equal(await again.evaluate(()=>Asc.editor.WordControl.m_oLogicDocument.DrawingObjects.drawingObjects.length),baseline+2);
  await fs.writeFile(path.join(root,'results/native-pictures.json'),JSON.stringify(evidence,null,2));console.log('PASS native OS clipboard Ctrl+V and DOM drop through SDK; same-file save and fresh app reopen retain both pictures');
 }finally{if(clipboard&&clipboard.exitCode===null)clipboard.kill('SIGTERM');if(env)await stop(env)}
})().catch(e=>{console.error(e);process.exitCode=1});
