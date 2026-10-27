// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const web=process.env.EO_WEB_APPS;assert(web&&path.isAbsolute(web),'Explicit owned EO_WEB_APPS required');
const folder=path.join(web,'apps/common/main/lib/elixir-ai');
function fixture({result=true}={}){
 const nodes=[],saves=[],changes=[],doc={activeElement:null};
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.style={};this.value='';this.textContent='';this.parentNode=null;this.open=false;nodes.push(this);}
  append(...items){for(const n of items){this.children.push(n);n.parentNode=this;}}
  appendChild(n){this.append(n);return n;}
  setAttribute(k,v){assert(!/^on/i.test(k));this.attributes[k]=String(v);}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  dispatch(k,event={}){return Promise.all((this.listeners[k]||[]).map(fn=>fn({key:'',preventDefault(){},stopPropagation(){},...event})));}
  focus(){doc.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
  get isConnected(){return this===doc.body||!!this.parentNode?.isConnected;}
  set innerHTML(_){assert.fail('No HTML interpretation in setup');}
 }
 doc.createElement=tag=>new Element(tag);doc.body=new Element('body');doc.getElementById=id=>nodes.find(n=>n.id===id&&n.isConnected)||null;
 const invoker=new Element('button');doc.body.append(invoker);invoker.focus();
 const ai={Settings:{isConfigured:()=>false,endpointAllowed:value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}},
 save:async value=>{saves.push({...value});return result;}}};
 const window={Common:{ElixirAI:ai},eoDesktopAI:{}},context={window,document:doc,URL,Object,Promise,define:(_deps,f)=>f(ai,ai,english),fetch(){assert.fail('No network in setup');}};
 let english;vm.runInNewContext(fs.readFileSync(path.join(folder,'SetupStrings.js'),'utf8'),{define:(_deps,f)=>english=f()});
 vm.runInNewContext(fs.readFileSync(path.join(folder,'Setup.js'),'utf8'),context);
 const instance=new ai.SetupAssistant({onSettingsChanged:()=>changes.push(true)});
 return {ai,instance,nodes,saves,changes,doc,invoker,english,get:id=>doc.getElementById(id),open(){instance.open(invoker);}};
}
test('setup starts generic and empty; opening/reopening has no settings write, source read or request',()=>{
 const f=fixture();f.open();f.open();
 assert.equal(f.nodes.filter(n=>n.tagName==='DIALOG'&&n.isConnected).length,1);
 for(const id of ['elixir-ai-setup-endpoint','elixir-ai-setup-model','elixir-ai-setup-key'])assert.equal(f.get(id).value,'');
 assert.equal(f.get('elixir-ai-setup-provider').value,'custom');assert.equal(f.saves.length,0);
 assert.equal(f.get('elixir-ai-setup-key').attributes.type,'password');assert.equal(f.get('elixir-ai-setup-key').attributes.autocomplete,'off');
 assert(!f.nodes.some(n=>n.type==='checkbox'&&n.checked));assert(!f.nodes.some(n=>/test connection|ollama/i.test(n.textContent)));
});
test('provider choices are bounded, HTTPS-only, explicit and copied; configuring never picks a default',()=>{
 const f=fixture(),catalog=[{label:'Synthetic service',endpoint:'https://ai.example.invalid/v1',model:'synthetic-model'}];
 f.ai.SetupCatalog.configure(catalog);catalog[0].endpoint='https://changed.example.invalid/v1';f.open();
 assert.equal(f.get('elixir-ai-setup-endpoint').value,'');assert.equal(f.get('elixir-ai-setup-provider').value,'custom');
 assert.equal(f.ai.SetupCatalog.get()[0].endpoint,'https://ai.example.invalid/v1');assert(Object.isFrozen(f.ai.SetupCatalog.get()));
 for(const value of [null,{},new Array(33).fill({}),[{label:'Bad',endpoint:'http://example.invalid/v1'}],[{label:'x'.repeat(81),endpoint:'https://example.invalid/v1'}]])assert.throws(()=>f.ai.SetupCatalog.configure(value));
});
test('invalid or empty settings cannot reach consent bridge; endpoint requires HTTPS',async()=>{
 const f=fixture();f.open();await f.get('elixir-ai-setup-continue').dispatch('click');assert.equal(f.saves.length,0);
 f.get('elixir-ai-setup-endpoint').value='http://localhost:11434/v1';f.get('elixir-ai-setup-model').value='synthetic-model';
 await f.get('elixir-ai-setup-continue').dispatch('click');assert.equal(f.saves.length,0);assert(f.get('elixir-ai-setup-error').textContent);
});
test('Continue delegates exactly to existing consent storage; refused consent keeps AI off and clears key',async()=>{
 const f=fixture({result:false});f.open();
 f.get('elixir-ai-setup-endpoint').value='https://ai.example.invalid/v1';f.get('elixir-ai-setup-model').value='synthetic-model';f.get('elixir-ai-setup-key').value='synthetic-test-key';
 await f.get('elixir-ai-setup-continue').dispatch('click');
 assert.equal(f.saves.length,1);assert.equal(f.saves[0].apiKey,'synthetic-test-key');assert.equal(f.changes.length,0);assert(f.get('elixir-ai-setup-dialog').open);assert.equal(f.get('elixir-ai-setup-key').value,'');
});
test('accepted setup notifies settings once, clears secret and restores focus; no instruction replay',async()=>{
 const f=fixture();f.open();const field=f.get('elixir-ai-setup-key');
 f.get('elixir-ai-setup-endpoint').value='https://ai.example.invalid/v1';f.get('elixir-ai-setup-model').value='synthetic-model';field.value='synthetic-test-key';
 await f.get('elixir-ai-setup-continue').dispatch('click');
 assert.equal(f.saves.length,1);assert.equal(f.changes.length,1);assert.equal(field.value,'');assert.equal(f.get('elixir-ai-setup-dialog'),null);assert.equal(f.doc.activeElement,f.invoker);
});
test('Escape/cancel/dispose clear key and never configure; a disposed editor cannot reopen setup',async()=>{
 for(const mode of ['escape','cancel','dispose']){
  const f=fixture();f.open();const field=f.get('elixir-ai-setup-key');field.value='synthetic-test-key';
  if(mode==='escape')await f.get('elixir-ai-setup-dialog').dispatch('keydown',{key:'Escape'});
  else if(mode==='cancel')await f.get('elixir-ai-setup-cancel').dispatch('click');else f.instance.dispose();
  assert.equal(field.value,'');assert.equal(f.saves.length,0);assert.equal(f.get('elixir-ai-setup-dialog'),null);
  if(mode==='dispose'){f.instance.open(f.invoker);assert.equal(f.get('elixir-ai-setup-dialog'),null);}
 }
});

test('one pending native consent is shared and a late result cannot reopen or update a disposed editor',async()=>{
 let finish;const pending=new Promise(resolve=>finish=resolve),f=fixture({result:pending});f.open();
 f.get('elixir-ai-setup-endpoint').value='https://ai.example.invalid/v1';f.get('elixir-ai-setup-model').value='synthetic-model';f.get('elixir-ai-setup-key').value='synthetic-test-key';
 const button=f.get('elixir-ai-setup-continue'),first=button.dispatch('click');await button.dispatch('click');
 assert.equal(f.saves.length,1);assert.equal(f.get('elixir-ai-setup-key').value,'');f.instance.dispose();finish(true);await first;
 assert.equal(f.changes.length,0);assert.equal(f.get('elixir-ai-setup-dialog'),null);
});
