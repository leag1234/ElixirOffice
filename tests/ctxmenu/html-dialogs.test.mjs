// SPDX-License-Identifier: AGPL-3.0-only
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {existsSync} from 'node:fs';
import {visibleWindows} from './lib.mjs';
import {resetUi as resetWord} from '../shortcuts/lib.mjs';
import {resetUi as resetCell} from '../shortcuts-excel/lib.mjs';
const require=createRequire(path.join(process.env.PW_DIR||path.join(os.homedir(),'elixiroffice/pw'),'package.json'));
const {chromium}=require('playwright');
let browser;
before(async()=>{
 const executablePath=process.env.CHROME_BIN||(process.platform==='linux'&&existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined);
 browser=await chromium.launch({executablePath,chromiumSandbox:true});
});
after(async()=>{await browser?.close()});
async function pageFor(run){
 const page=await browser.newPage();
 try{await page.setContent('<button id="invoker">Options</button><textarea id="area_id"></textarea>');
  await page.evaluate(()=>{window.Asc={editor:{asc_enableKeyEvents(){}}}});
  await run(page);
 }finally{await page.close()}
}
async function setup(page){
 await page.evaluate(()=>{
  const invoker=document.querySelector('#invoker');invoker.focus();
  const dialog=document.createElement('dialog');dialog.id='elixir-ai-setup-dialog';dialog.className='elixir-ai-dlg';
  dialog.innerHTML='<h2>Configure Elixir</h2><input type="password"><button id="elixir-ai-setup-cancel">Cancel</button>';
  const key=dialog.querySelector('input');key.value='synthetic-unit-only';
  window.cancelClicks=0;window.cancelEvents=0;window.setupState={dialog,key};
  dialog.querySelector('button').onclick=()=>{window.cancelClicks++;key.value='';window.setupState=null;dialog.close();dialog.remove();invoker.focus()};
  dialog.addEventListener('cancel',event=>{window.cancelEvents++;event.preventDefault()});
  document.body.append(dialog);dialog.showModal();
 });
}
test('visibleWindows includes open HTML dialogs with headings and retains legacy windows',()=>pageFor(async page=>{
 await page.evaluate(()=>{
  document.body.insertAdjacentHTML('beforeend','<div class="asc-window"><div class="title">Legacy</div></div><dialog open><h2>HTML title</h2></dialog><dialog style="display:block"><h2>Closed</h2></dialog><dialog open style="display:none"><h2>Hidden</h2></dialog>');
 });
 const windows=await visibleWindows(page);
 assert.deepEqual(windows.map(window=>window.title).sort(),['HTML title','Legacy']);
 assert(windows.find(window=>window.title==='HTML title').cls.includes('dialog'));
}));
for(const [editor,reset]of [['Word',resetWord],['Cell',resetCell]])test(editor+' reset uses the actual AI Cancel button and clears controller-owned state',()=>pageFor(async page=>{
 await setup(page);await reset(page,page);
 assert.deepEqual(await page.evaluate(()=>({open:!!document.querySelector('dialog[open]'),clicks:cancelClicks,cancelEvents,state:setupState,keyCleared:!document.querySelector('input[type=password]')})),{open:false,clicks:1,cancelEvents:0,state:null,keyCleared:true});
}));
test('generic dialog reset dispatches cancel and then close instead of hiding the DOM',()=>pageFor(async page=>{
 await page.evaluate(()=>{
  const dialog=document.createElement('dialog');dialog.id='generic';window.cancelCalls=0;window.closeCalls=0;
  dialog.addEventListener('cancel',()=>window.cancelCalls++);dialog.addEventListener('close',()=>window.closeCalls++);
  document.body.append(dialog);dialog.showModal();
 });
 await resetWord(page,page);await page.waitForTimeout(30);
 assert.deepEqual(await page.evaluate(()=>({open:document.querySelector('#generic').open,cancel:cancelCalls,close:closeCalls})),{open:false,cancel:1,close:1});
}));
test('generic dialog cancellation veto is respected',()=>pageFor(async page=>{
 await page.evaluate(()=>{
  const dialog=document.createElement('dialog');dialog.id='guarded';window.cancelCalls=0;
  dialog.addEventListener('cancel',event=>{window.cancelCalls++;event.preventDefault()});document.body.append(dialog);dialog.showModal();
 });
 await resetWord(page,page);
 assert.deepEqual(await page.evaluate(()=>({open:document.querySelector('#guarded').open,cancel:cancelCalls})),{open:true,cancel:1});
}));
