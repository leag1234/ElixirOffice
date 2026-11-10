// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Export feedback is an Office-style status-bar message; "Open the PDF after export" opens the file instead.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Feedback=require('../../desktop/feedback.js'),catalogs=require('../../tools/desktop/i18n-extra.json');
const desktop=path.join(__dirname,'../../desktop'),renderer=fs.readFileSync(path.join(desktop,'renderer.js'),'utf8'),css=fs.readFileSync(path.join(desktop,'feedback.css'),'utf8');

function dom(){
 const timers=new Map();let seq=0,clock=0;
 class El{constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.attrs={};this.hidden=false;this.textContent='';this.classes=new Set();this.focused=false;this.isConnected=true;this.classList={add:n=>this.classes.add(n),contains:n=>this.classes.has(n),toggle:(n,on)=>{on?this.classes.add(n):this.classes.delete(n)}};}
  set className(v){this.classes=new Set(String(v).split(' ').filter(Boolean))}get className(){return [...this.classes].join(' ')}
  append(...n){for(const x of n){x.parent=this;this.children.push(x)}}replaceChildren(...n){this.children=[];this.append(...n)}
  setAttribute(k,v){this.attrs[k]=v}removeAttribute(k){delete this.attrs[k]}addEventListener(n,f){(this.listeners[n]||=[]).push(f)}
  contains(o){return o===this||this.children.some(c=>c.contains(o))}remove(){}
  querySelector(sel){const found=[];const walk=n=>{for(const c of n.children){if(c.tag===sel)found.push(c);walk(c)}};walk(this);return found[0]||null}
  focus(){if(doc.activeElement)doc.activeElement.focused=false;doc.activeElement=this;this.focused=true;for(let n=this;n;n=n.parent)(n.listeners.focusin||[]).forEach(f=>f());}
  fire(n,e={}){(this.listeners[n]||[]).forEach(f=>f({preventDefault(){},...e}))}click(){this.fire('click')}}
 const doc={activeElement:null,createElement:t=>new El(t),defaultView:{setTimeout:(f,ms)=>{timers.set(++seq,{f,at:clock+ms});return seq},clearTimeout:n=>timers.delete(n),Date:{now:()=>clock}}};
 doc.body=new El('body');
 return {doc,El,advance(ms){clock+=ms;for(const [n,t] of [...timers])if(t.at<=clock){timers.delete(n);t.f()}}};
}
function setup(){
 const d=dom(),calls=[],view=Feedback.mount(d.doc,d.doc.body,{opOpen:'Open file',opShow:'Show in folder',opDismiss:'Close',opExported:'Exported: {name}'},{open:id=>calls.push(['open',id]),show:id=>calls.push(['show',id])});
 view.reset('s');return {...d,view,calls,notice:view.element};
}
const kinds=['export','pdf-export'];
for(const kind of kinds)test(kind+' result is a discreet status message with the same actions, not a card',()=>{
 const e=setup();e.view.update({scope:'s',id:'1',phase:'preparing',kind});
 assert(!e.notice.classList.contains('eo-operation-status'),'progress keeps the normal feedback');
 e.view.update({scope:'s',id:'1',phase:'ready',kind,name:'a.pdf',artifactId:'art'});
 assert(e.notice.classList.contains('eo-operation-status'));assert.equal(e.notice.hidden,false);
 assert.equal(e.notice.children[0].textContent,'Exported: ⁨a.pdf⁩');
 const labels=e.notice.children[2].children.map(b=>b.textContent);assert.deepEqual(labels,['Open file','Show in folder','Close']);
 e.notice.children[2].children[0].click();e.notice.children[2].children[1].click();return Promise.resolve().then(()=>assert.deepEqual(e.calls,[['open','art'],['show','art']]));
});
test('the message hides itself after about 8 seconds, even with file actions',()=>{
 const e=setup();e.view.update({scope:'s',id:'1',phase:'preparing',kind:'export'});e.view.update({scope:'s',id:'1',phase:'ready',kind:'export',name:'a.odt',artifactId:'art'});
 e.advance(7000);assert.equal(e.notice.hidden,false);e.advance(1500);assert.equal(e.notice.hidden,true);
});
test('keyboard: F6 focus reaches the actions and pauses the timer; Escape dismisses and returns focus',()=>{
 const e=setup(),editor=e.doc.createElement('iframe');editor.focus();
 e.view.update({scope:'s',id:'1',phase:'preparing',kind:'pdf-export'});e.view.update({scope:'s',id:'1',phase:'ready',kind:'pdf-export',name:'a.pdf',artifactId:'art'});
 assert.equal(e.view.focus(),true);const first=e.notice.children[2].children[0];assert.equal(e.doc.activeElement,first);
 e.advance(20000);assert.equal(e.notice.hidden,false,'focused message stays');
 e.notice.fire('keydown',{key:'Escape'});assert.equal(e.notice.hidden,true);assert.equal(e.doc.activeElement,editor);
 const none=setup();assert.equal(none.view.focus(),false,'no message, no focus steal');
});
test('errors and in-progress states keep the card; only finished non-error states are status messages',()=>{
 const e=setup();e.view.update({scope:'s',id:'1',phase:'preparing',kind:'export'});e.view.update({scope:'s',id:'1',phase:'converting',kind:'export'});assert(!e.notice.classList.contains('eo-operation-status'));
 e.view.update({scope:'s',id:'1',phase:'error',kind:'export',reason:'x'});assert(!e.notice.classList.contains('eo-operation-status'));
});
test('stylesheet places the status message at the bottom edge, flat, and honours hidden',()=>{
 assert.match(css,/\.eo-operation\.eo-operation-status[^{]*\{[^}]*bottom:var\(--desktop-release-height,0px\)[^}]*border-radius:0[^}]*box-shadow:none/);
 assert.match(css,/\.eo-operation\[hidden\]\{display:none!important\}/);
});
test('the status message is one compact line: ellipsised text, inline links that never wrap, max 520px',()=>{
 assert.match(css,/eo-operation-status[^{]*\{[^}]*max-width:min\(520px,100vw\)[^}]*white-space:nowrap/);
 assert.match(css,/\.eo-operation-status \.eo-operation-text\{min-width:0/);assert.match(css,/\.eo-operation-status button\{flex:none;white-space:nowrap/);
 assert.match(css,/\.eo-operation-status \.eo-operation-text\{margin:0;flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
});
test('exported wording exists in every desktop language',()=>{
 for(const [language,strings] of Object.entries(catalogs))for(const key of ['opExported','miniToolbarContext'])assert.equal(typeof strings[key],'string',language+' '+key);
 assert.equal(catalogs.en.opExported,'Exported: {name}');assert.equal(catalogs.fr.opExported,'Exporté : {name}');
 assert.equal(catalogs.en.miniToolbarContext,'Show the Mini Toolbar on right-click');assert.match(catalogs.fr.miniToolbarContext,/mini barre d’outils au clic droit/);
});

// ---- open after export --------------------------------------------------------------------------------------------
function openAfterRun(print,printOptions,setting){
 const log={opened:[],dismissed:0};const timers=[];
 const operation={id:'op1',progress(){},phase(){},finish(){},fail(){}};
 const context=vm.createContext({AbortController,Error,Object,Promise,window:{},operationBusy:false,abort:null,main:{api:{}},setTimeout:f=>timers.push(f),
  controller:{beginOperation:()=>operation,snapshot:async()=>{},confirmUnprotectedExport:async()=>true},EOOperationFeedback:{paint:async()=>{}},status(){},t:key=>key,script:async()=>{},buttons(){},fail(){},
  feedback:{dismiss:()=>log.dismissed++},run:async f=>{await f()},file:{format:'docx',token:'tok'},
  frame:{Common:{localStorage:{getBool:(k,d)=>{assert.equal(k,'eo-pdf-open-after');return setting}}},EODesktopPdf:async()=>({bytes:new Uint8Array([1]),stats:{backend:'wasm'}})},
  eoDesktop:{pdf:async()=>({printed:false,name:'x.pdf',artifactId:'art-1'}),savedOpen:async id=>{log.opened.push(id)},cancelWrite:async()=>{}}});
 const slice=(a,b)=>{const i=renderer.indexOf(a),j=renderer.indexOf(b,i);return renderer.slice(i,j)};
 vm.runInContext(slice('function outputOutcome','async function exportOutput')+slice('async function pdf(','async function recoveryCopy')+'\nthis.pdf=pdf;',context);
 return context.pdf(print,undefined,printOptions).then(async()=>{for(const f of timers)await f();await Promise.resolve();return log});
}
test('Save as PDF with "Open the PDF after export" opens the file through the open-file action and drops the message',async()=>{
 const log=await openAfterRun(false,{advancedOptions:{}},true);assert.deepEqual(JSON.parse(JSON.stringify(log.opened)),['art-1']);assert.equal(log.dismissed,1);
});
test('the setting is off by default behaviour: no open, and never for Print, direct export or without the panel',async()=>{
 for(const [print,options,setting] of [[false,{advancedOptions:{}},false],[true,{advancedOptions:{}},true],[false,undefined,true]]){
  const log=await openAfterRun(print,options,setting);assert.equal(log.opened.length,0);assert.equal(log.dismissed,0);
 }
});
test('the editors print panel stores the checkbox per user, default off, in the local desktop only',()=>{
 const root=path.resolve(__dirname,'../../../web-apps/apps');
 for(const editor of ['documenteditor','presentationeditor','spreadsheeteditor']){
  const file=path.join(root,editor,'main/app/view/FileMenuPanels.js');if(!fs.existsSync(file))return;
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/Common\.localStorage\.getBool\('eo-pdf-open-after', false\)/);assert.match(source,/setBool\('eo-pdf-open-after'/);assert.match(source,/if \(this\.mode\.isElixirLocal\)/);
 }
});

// ---- options and F6 wiring ----------------------------------------------------------------------------------------
test('Options offers the Mini Toolbar setting and F6 reaches the status message',()=>{
 assert.match(renderer,/editorStorage\.getBool\('eo-minitoolbar-context',true\)/);assert.match(renderer,/setBool\('eo-minitoolbar-context',mini\.checked\)/);
 assert.match(renderer,/event\.key==='F6'[^\n]*feedback\?\.focus\(\)/);
});
