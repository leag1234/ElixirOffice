// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.EO_PLAYWRIGHT||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});assert.equal(fs.readdirSync(out).length,0);
 const source=fs.readFileSync(path.join(root,'desktop/compact-editor.js'),'utf8');
 const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.EO_CHROMIUM?{executablePath:process.env.EO_CHROMIUM}:{})}),rows=[],errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
  await page.setContent('<!doctype html><body><section id="app-title"><div id="box-document-title"><button id="save">Save</button><button id="undo" disabled>Undo</button><button id="redo">Repeat</button><div id="search"><input placeholder="Search (Alt+Q)"></div></div></section><main>Real document surface<textarea id="sdk-focus"></textarea></main></body>');
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{
   window.calls=[];window.states=[];const title=document.querySelector('#app-title'),search=document.querySelector('#search'),input=search.firstElementChild;
   const wrap=element=>({0:element});
   const button=id=>({el:document.getElementById(id),isDisabled(){return this.el.disabled},hint:document.getElementById(id).textContent});
   window.header={btnSave:button('save'),btnUndo:button('undo'),btnRedo:button('redo'),fireEvent(name){calls.push(name==='redo'?'repeat':name)}};
   window.bar={$search:wrap(search),$input:wrap(input),focusSearch(){input.focus()},closeSearch(){calls.push('search-close')}};
   window.titleItem={height:40};window.height=40;window.layouts=0;
   window.main={getApplication:()=>({getController:name=>name==='ElixirChrome'?{titleBar:bar}:name==='Viewport'?{header,viewport:{vlayout:{getItem:()=>titleItem,doLayout(){layouts++}}}}:null})};
   window.Common={Utils:{InternalSettings:{get:()=>height,set:(_name,value)=>{height=value}}},NotificationCenter:{trigger(){}}};
   window.adapter=EOCompactChrome.create({win:window,main,bridge:{chromeState:async state=>states.push(state)},isBusy:()=>window.busy===true});
   window.originalSearch=search;window.originalParent=search.parentNode;window.originalFocus=bar.focusSearch;
   adapter.configure(true);
  });
  assert.equal(await page.locator('#app-title').isVisible(),false);assert.equal(await page.evaluate(()=>height),0);rows.push('duplicate title row removed through existing layout');
  await page.waitForFunction(()=>states.length>0);assert.equal(await page.evaluate(()=>states.at(-1).undo.enabled),false);assert.equal(await page.evaluate(()=>states.at(-1).save.visible),true);rows.push('real disabled state and own visibility survive hidden ancestor');
  assert.equal(await page.evaluate(()=>adapter.perform('undo')),false);assert.equal(await page.evaluate(()=>adapter.perform('redo')),true);
  assert.deepEqual(await page.evaluate(()=>calls),['repeat']);rows.push('existing Redo event preserves Repeat semantics; disabled Undo refused');
  await page.evaluate(()=>{adapter.perform('search');queueMicrotask(()=>document.querySelector('#sdk-focus').focus())});
  await page.waitForFunction(()=>document.activeElement===bar.$input[0],null,{timeout:1000});rows.push('shell search waits for native/editor focus handoff');
  await page.evaluate(()=>{busy=true});assert.equal(await page.evaluate(()=>adapter.perform('save')),false);await page.evaluate(()=>{busy=false;header.btnSave.el.style.display='none'});
  await page.waitForFunction(()=>states.at(-1).save.visible===false);assert.equal(await page.evaluate(()=>adapter.perform('save')),false);rows.push('busy and user-hidden quick controls remain blocked');
  await page.evaluate(()=>bar.focusSearch());assert.equal(await page.evaluate(()=>document.activeElement===bar.$input[0]&&originalSearch.parentNode===document.body),true);rows.push('existing search widget and dynamic Alt+Q target retained');
  await page.evaluate(()=>bar.closeSearch());assert.equal(await page.locator('#search').isVisible(),false);
  await page.evaluate(()=>adapter.configure(false));assert.equal(await page.locator('#app-title').isVisible(),true);
  assert.equal(await page.evaluate(()=>height===40&&titleItem.height===40&&originalSearch.parentNode===originalParent&&bar.focusSearch===originalFocus),true);rows.push('native owner restores actual header/search/layout without replacing editor');
  await page.evaluate(()=>{
   adapter.dispose();delete bar.$search;delete bar.$input;
   adapter=EOCompactChrome.create({win:window,main,bridge:{chromeState:async state=>states.push(state)}});adapter.configure(true);
   bar.$search={0:originalSearch};bar.$input={0:originalSearch.firstElementChild};originalParent.append(originalSearch);
  });
  await page.waitForFunction(()=>originalSearch.parentNode===document.body,null,{timeout:1000});rows.push('deferred upstream titlebar setup rehomes its actual late search widget');
  await page.evaluate(()=>{adapter.configure(true);adapter.dispose()});assert.equal(await page.locator('#app-title').isVisible(),true);rows.push('dispose restores editor and detaches observers');
  await page.evaluate(()=>{
   const slot=document.createElement('div'),button=document.createElement('button');button.disabled=true;button.textContent='Find';slot.append(button);originalParent.append(slot);
   button.onclick=()=>calls.push('original-find-toggle');
   header.btnSearch={el:slot,cmpEl:{0:button},isDisabled:()=>button.disabled,hint:'Find'};
   const originalApp=main.getApplication();const plain={getApplication:()=>({getController:name=>name==='ElixirChrome'?undefined:originalApp.getController(name)})};
   adapter=EOCompactChrome.create({win:window,main:plain,bridge:{chromeState:async state=>states.push(state)}});adapter.configure(true);window.findButton=button;
  });
  assert.equal(await page.evaluate(()=>adapter.perform('search')),false);
  await page.evaluate(()=>{findButton.disabled=false;adapter.perform('search')});
  await page.waitForFunction(()=>calls.includes('original-find-toggle'),null,{timeout:1000});await page.evaluate(()=>adapter.dispose());rows.push('editors without command search retain original Find toggle and disabled state');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({pass:rows.length,rows,errors},null,2)+'\n');console.log('PASS '+rows.length+' compact editor cases');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
