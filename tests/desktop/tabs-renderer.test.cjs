// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.hidden=false;}
  setAttribute(key,value){this.attributes[key]=value;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
  contains(){return false;}querySelector(){return null;}querySelectorAll(){return [];}scrollIntoView(){}focus(){}
 }
 const elements={'#tab-bar':new Node(),'#move-tab':new Node(),'#tabs':new Node(),'#new-tab':new Node(),'#tab-error':new Node(),'#tab-error-text':new Node(),'#tab-error-dismiss':new Node()};
 let listener,limitListener,resolve;
 const initial=new Promise(done=>{resolve=done;});
 const window={eoTabs:{onLimit:callback=>{limitListener=callback},onState:callback=>{listener=callback;},initial:()=>initial}};
 const document={documentElement:{},dir:'ltr',activeElement:null,querySelector:key=>elements[key],createElement:tag=>new Node(tag),createElementNS:(_namespace,tag)=>new Node(tag)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../desktop/tabs.js'),'utf8'),{window,document,Promise});
 const state=(revision,id)=>({windowId:'owner',revision,activeId:id,documents:[{id,name:id,dirty:false,closing:false,status:'ready'}]});
 const initialize=state=>resolve({strings:{tabsLabel:'Documents',tabNew:'New document',tabClose:'Close {name}',tabCloseHint:'Delete',tabUntitled:'Untitled',tabModified:'Unsaved changes'},language:'en',direction:'ltr',state});
 elements['#tab-error'].hidden=true;
 return {window,elements,state,initialize,emit:value=>listener(value),limit:()=>limitListener(),label:()=>elements['#tabs'].children[0].children[0].children.find(n=>n.className==='document-name').textContent};
}
test('tab changes arriving before initialization are queued and newer state wins',async()=>{
 const f=fixture();assert.doesNotThrow(()=>f.emit(f.state(2,'newer')));
 f.initialize(f.state(1,'older'));await new Promise(setImmediate);
 assert.equal(f.window.EOTabShellReady,true);assert.equal(f.label(),'newer');
});
test('late stale tab snapshots cannot restore removed or older documents',async()=>{
 const f=fixture();f.initialize(f.state(4,'current'));await new Promise(setImmediate);
 f.emit(f.state(3,'old'));assert.equal(f.label(),'current');
});

test('tab filenames use display-only isolation in visible and accessible labels',async()=>{
 const f=fixture(),state=f.state(1,'stable-id');state.documents[0].name='عربي\u2069 English.docx';
 f.initialize(state);await new Promise(setImmediate);
 const group=f.elements['#tabs'].children[0],tab=group.children[0],close=group.children[1];
 assert.equal(f.label(),'عربي English.docx');assert.equal(tab.attributes['aria-label'],'\u2068عربي English.docx\u2069');
 assert.equal(close.attributes['aria-label'],'Close \u2068عربي English.docx\u2069');
 assert.equal(tab.dataset.document,'stable-id');assert.equal(state.documents[0].name,'عربي\u2069 English.docx');
});

test('a failed tab action shows a dismissible alert without exposing raw IPC errors',async()=>{
 const f=fixture();f.window.eoTabs.activate=()=>Promise.reject(Error('private/path'));
 f.initialize(f.state(1,'one'));await new Promise(setImmediate);
 f.elements['#tabs'].children[0].children[0].onclick();await new Promise(setImmediate);
 assert.equal(f.elements['#tab-error'].hidden,false);assert.equal(f.elements['#tab-error-text'].textContent,'Could not finish the document action. Try again.');
 f.elements['#tab-error-dismiss'].onclick();assert.equal(f.elements['#tab-error'].hidden,true);
});

test('OS-open capacity refusal remains visible in the shell even before document selection initializes',async()=>{
 const f=fixture();f.limit();assert.equal(f.elements['#tab-error'].hidden,false);
 f.initialize(f.state(1,'one'));await new Promise(setImmediate);
 assert.match(f.elements['#tab-error-text'].textContent,/16 documents/);
 assert.equal(f.label(),'one');
 f.elements['#tab-error-dismiss'].onclick();assert.equal(f.elements['#tab-error'].hidden,true);
});

for(const [name,symbol] of [['Public.docx','word'],['Public.ODT','word'],['Public.xlsx','cell'],['Public.csv','cell'],['Public.pptx','slide'],['Public.ppsx','slide'],['Public.pdf','pdf']])test('tab '+name+' reuses the shared Fluent '+symbol+' icon with a separate modified dot',async()=>{
 const f=fixture(),state=f.state(1,'stable');state.documents[0].name=name;state.documents[0].dirty=true;f.initialize(state);await new Promise(setImmediate);
 const tab=f.elements['#tabs'].children[0].children[0],icon=tab.children.find(n=>n.tagName==='svg'),dot=tab.children.find(n=>n.className==='document-dirty');
 assert(icon);assert.equal(icon.attributes['aria-hidden'],'true');assert.equal(icon.children[0].attributes.href,'/example/local-assets/desktop-home/icons.svg#i-'+symbol);
 assert.equal(dot.textContent,'●');assert.equal(dot.attributes['aria-hidden'],'true');assert.equal(tab.attributes['aria-label'],'⁨'+name+'⁩, Unsaved changes');assert.equal(f.label(),name);
});
