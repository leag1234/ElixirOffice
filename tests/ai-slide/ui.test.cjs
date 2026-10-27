// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const web=process.env.EO_WEB_APPS;assert(web&&path.isAbsolute(web));
function bar({same=false}={}){
 const AI={Strings:{en:{}},langOf:()=> 'en',cellText:k=>'cell:'+k,slideText:k=>'slide:'+k};
 const window={Common:{ElixirAI:AI}};
 vm.runInNewContext(fs.readFileSync(path.join(web,'apps/common/main/lib/elixir-ai/View.js'),'utf8'),{window,Common:window.Common,define:(_d,f)=>f(),setTimeout:()=>0,AbortController});
 let undo=0,reject=0,status,actions;
 const ts={id:'slide',canRejectAfterEdit:false,undo:async()=>undo++,reject:async()=>reject++};
 const b=new AI.CommandBar({toolsetId:'slide',toolsetFactory:()=>ts,historyIndex:()=>same?1:2});
 b.historyIndex=1;b.result={ctx:{},entry:{id:1}};b.setStatus=(...v)=>status=v;b.setActions=a=>actions=a;b.journalOutcome=()=>{};b.finishReview=()=>{};
 return {AI,b,counts:()=>({undo,reject,status,actions})};
}
test('presentation stale Discard uses the presentation warning and preserves later user edits',()=>{
 const e=bar();e.b.discard();assert.equal(e.counts().undo,0);assert.equal(e.counts().reject,0);assert.equal(e.counts().status[0],'slide:staleDiscard');assert(e.counts().actions.some(a=>a.id==='accept'));
});
test('presentation same-history Discard uses exactly one public Undo',async()=>{
 const e=bar({same:true});e.b.discard();await new Promise(setImmediate);assert.equal(e.counts().undo,1);assert.equal(e.counts().reject,0);
});
test('presentation uncertain cancellation never claims reverted or unchanged',async()=>{
 const e=bar(),b=e.b;e.AI.Settings={get:()=>({}),isConfigured:()=>true};e.AI.Orchestrator={run:async()=>({ok:false,rollbackUnverified:true,error:Error('Injected callback loss'),entry:{outcome:'error'}})};
 b.input={value:'Authored task'};b.btnSend={};b.el={classList:{add(){},remove(){}},setAttribute(){}};b.reset=()=>{};b.showPanel=()=>{};b.submit();await new Promise(setImmediate);
 assert.equal(e.counts().status[0],'slide:rollbackUnverified');assert.equal(e.counts().status[1],true);
});
test('presentation controller registers one reusable setup-aware Ask action per existing edit menu',()=>{
 let extension,parents=0,asked=0,listeners;
 const AI={t:k=>k},Common={ElixirAI:AI,Controllers:{ElixirAI:{prototype:{initialize(){parents++;}},extend(p){extension=p;return p;}}},UI:{MenuItem:function(options){this.options=options;this.on=(_event,fn)=>this.click=fn;}}};
 const English={placeholder:'Ask',footer:'Context',scopeDeck:'Deck {count}'};
 vm.runInNewContext(fs.readFileSync(path.join(web,'apps/presentationeditor/main/app/elixir-ai/Controller.js'),'utf8'),{Common,define:(_d,f)=>f(null,null,English)});
 const self={addListeners:x=>listeners=x,isAvailable:()=>true,openBar:()=>asked++,installAskMenus:view=>extension.installAskMenus.call(self,view)};
 extension.initialize.call(self);assert.equal(parents,1);assert.equal(extension.toolsetId,'slide');
 const menu=()=>({items:[],addItem(item){this.items.push(item);}}),view={slideMenu:menu(),textMenu:menu(),pictureMenu:menu(),tableMenu:menu()};
 listeners.DocumentHolder.createdelayedelements(view,'edit');listeners.DocumentHolder.createdelayedelements(view,'edit');
 for(const m of Object.values(view).filter(v=>Array.isArray(v.items))){assert.equal(m.items.length,1);m.items[0].click();}
 assert.equal(asked,4);assert.equal(AI.slideText('scopeDeck',{count:3}),'Deck 3');
});
