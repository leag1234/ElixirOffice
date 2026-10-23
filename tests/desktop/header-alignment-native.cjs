// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{_electron}=require(process.env.EO_PLAYWRIGHT);
const root=process.env.EO_PRODUCT_ROOT,out=process.env.EO_NATIVE_WORK,theme=process.env.EO_COMPACT_THEME||'light',rows=[],errors=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let app;
 try{
  const launch=path.join(out,'launch-app');await fs.mkdir(launch);const pkg=JSON.parse(await fs.readFile(path.join(root,'desktop/package.json'),'utf8'));
  await fs.writeFile(path.join(launch,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,main:'entry.cjs'}));
  await fs.writeFile(path.join(launch,'entry.cjs'),'require('+JSON.stringify(path.join(root,'tests/desktop/compact-native-entry.cjs'))+');');
  app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.EO_ELECTRON,args:[launch,'--ozone-platform=x11'],env:process.env,timeout:30000});
  const context=app.context(),observe=p=>p.on('pageerror',e=>errors.push(e.message));context.pages().forEach(observe);context.on('page',observe);
  async function findPage(predicate){for(let n=0;n<1200;n++){for(const p of context.pages().filter(p=>p.url().endsWith('/index.html'))){if(await p.evaluate(predicate).catch(()=>false))return p;}await pause(100);}throw Error('Editor readiness timed out');}
  let home=await findPage(()=>window.EODesktopReady);
  await home.evaluate(theme=>localStorage.setItem('ui-theme-id',theme==='dark'?'theme-dark':'theme-white'),theme);
  for(const [format,appName] of [['docx','DE'],['xlsx','SSE'],['pptx','PE'],['pdf','PDFE']]){
   const file=path.join(out,'public-alignment.'+format);
   if(format==='pdf')await fs.writeFile(file,require('./public-print-fixture.cjs')(1));
   else await fs.copyFile(path.join(root,'desktop/assets/templates/new.'+format),file);
   await app.evaluate(({app},file)=>app.emit('open-file',{preventDefault(){}},file),file);
   const page=await findPage(new Function('return window.EOLocalSession?.format==='+JSON.stringify(format)+'&&!window.EOLocalFailure'));
   await page.waitForFunction(name=>{const w=EOLocalSession.win;return w[name]?.getController('Viewport')?.header?.btnSave},appName);
   for(const compact of [false,true]){
    await page.evaluate(compact=>eoDesktop.windowSettings({customTitleBar:compact}),compact);
    await app.evaluate(async({},{id,compact})=>{
     const {registry,host}=global.__EOCompactFixture,doc=registry.document(id),target=host.createWindow();await target.ready;
     host.moveDocument(doc,target);target.window.show();global.__alignmentOwner=target;
    },{id:await page.evaluate(()=>EODocumentId),compact});
    await page.waitForFunction(compact=>EOLocalSession.win.document.body.classList.contains('eo-compact-editor')===compact,compact);
    await pause(250);
    let value;
    if(!compact)value=await page.evaluate(name=>{
     const w=EOLocalSession.win,d=w.document,h=w[name].getController('Viewport').header;
     const box=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=w.getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,center:r.y+r.height/2,display:s.display,margin:s.margin,padding:s.padding,lineHeight:s.lineHeight}};
     const node=b=>b?.cmpEl?.[0]||b?.$el?.[0]||b?.el;
     return {icon:box(d.querySelector('#header-logo i')),logo:box(d.querySelector('#header-logo')),save:box(node(h.btnSave)),undo:box(node(h.btnUndo)),redo:box(node(h.btnRedo)),title:box(d.querySelector('.elx-docname')||d.querySelector('#title-doc-name')),bodyClass:d.body.className};
    },appName);
    else{
     let shell;const id=await page.evaluate(()=>EODocumentId);
     for(const p of context.pages().filter(p=>p.url().endsWith('/tabs.html'))){if(await p.evaluate(async id=>(await eoTabs.initial()).state.documents.some(d=>d.id===id),id)){shell=p;break;}}
     assert(shell);await shell.screenshot({path:path.join(out,format+'-compact-bar-'+theme+'.png')});await shell.locator('#quick-access:not([hidden])').waitFor();
     value=await shell.evaluate(()=>{const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,center:r.y+r.height/2}};return {icon:box(document.querySelector('#single-title .document-icon')),save:box(document.querySelector('[data-quick=save]')),undo:box(document.querySelector('[data-quick=undo]')),redo:box(document.querySelector('[data-quick=redo]')),title:box(document.querySelector('#single-name'))}});
    }
    if(!compact)assert.equal(value.bodyClass.includes('theme-type-dark'),theme==='dark');
    const controls=['save','undo','redo','title'].filter(k=>value[k]?.height>0),deltas=Object.fromEntries(controls.map(k=>[k,Math.abs(value[k].center-value.icon.center)]));
    rows.push({format,mode:compact?'compact':'native',theme,geometry:value,deltas,pass:controls.length===4&&value.icon.height>0&&Object.values(deltas).every(v=>v<=1)});
    await page.screenshot({path:path.join(out,format+'-'+(compact?'compact':'native')+'-'+theme+'.png')});
   }
  }
  await fs.writeFile(path.join(out,'alignment-results.json'),JSON.stringify({rows,errors,scope:'actual sandboxed Linux Electron source editors; Mac/Windows unverified'},null,2)+'\n');
  assert.deepEqual(errors,[]);assert.equal(rows.length,8);assert(rows.every(r=>r.pass),JSON.stringify(rows.filter(r=>!r.pass),null,2));
  console.log('PASS 8 actual header alignment cases '+theme);
  const closed=app.waitForEvent('close');await app.evaluate(({app})=>app.quit());await closed;app=null;
 }finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
