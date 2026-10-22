// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
async function fixture(){
 const state={visible:true,modal:false,sdkEnabled:true},nodes=[];
 const document={activeElement:null,head:{append(){}},createElement:()=>({}),addEventListener(type,fn,capture){if(type==='keydown'){assert.equal(capture,true);this.keydown=fn}}};
 function node({item=false,parent=null,control=false,hidden=false,disabled=false,ariaDisabled=false}={}){
  const element={disabled,clicks:0,attrs:{'aria-disabled':String(ariaDisabled)},classList:{contains:()=>false},
   closest(selector){if(selector==='.fm-btn')return item?this:parent;return this.disabledAncestor?this:null},
   contains(other){return other===this||other?.parent===this},parent,
   getClientRects:()=>hidden?[]:[{}],getAttribute(key){return this.attrs[key]??null},
   setAttribute(key,value){this.attrs[key]=value},matches(selector){return selector==='a.menu-item,[role="menuitem"]'?control:item?this.attrs.tabindex!==undefined:true},
   focus(){document.activeElement=state.sdkEnabled?{id:'sdk-input'}:this},click(){this.clicks++}};
  nodes.push(element);return element;
 }
 const first=node({item:true}),hidden=node({item:true,hidden:true}),disabled=node({item:true,disabled:true}),move=node({item:true});
 const field=node({parent:first}),button=node();nodes.splice(nodes.indexOf(field),1);
 const root={querySelectorAll:()=>nodes,contains:el=>nodes.includes(el)};
 const element={0:root,attr(){return this},find(){return this},off(){return this},on(){return this},insertAfter(){return this},is:()=>state.visible};
 const fm={items:[],$el:element,hide(){},fireEvent(){}};
 const bs={rendered:true,fm,items:{},afterApplyMode(){}};
 const win={document,SSE:{getController:()=>({backstage:bs})},getComputedStyle:()=>({visibility:'visible'}),Common:{UI:{MenuItem:class{on(){}hide(){}}}},$:target=>target===document?{find:()=>({length:Number(state.modal)})}:element};
 const window={CustomEvent:class{},dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../desktop/backstage.js'),'utf8'),{window});
 await window.EODesktopBackstage(win,{api:{asc_enableKeyEvents(value){state.sdkEnabled=value}}},{strings:{},language:'en'},()=>{});
 function key(key,options={}){
  const event={key,prevented:false,stopped:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...options};
  document.keydown(event);return event;
 }
 return {state,document,first,hidden,disabled,move,field,button,key};
}
test('File Tab cycles visible enabled commands and panel controls in both directions',async()=>{
 const f=await fixture();f.document.activeElement={};assert(f.key('Tab').prevented);assert.equal(f.document.activeElement,f.first);
 assert(f.key('Tab').stopped);assert.equal(f.document.activeElement,f.move);
 f.key('Tab');assert.equal(f.document.activeElement,f.button);f.key('Tab');assert.equal(f.document.activeElement,f.first);
 f.key('Tab',{shiftKey:true});assert.equal(f.document.activeElement,f.button);
});
test('File focus handler yields when hidden, modal, composing or modified',async()=>{
 for(const option of ['hidden','modal','isComposing','keyCode','ctrlKey','altKey','metaKey']){
  const f=await fixture();f.document.activeElement=f.first;
  if(option==='hidden')f.state.visible=false;if(option==='modal')f.state.modal=true;
  const options=option==='keyCode'?{keyCode:229}:['hidden','modal'].includes(option)?{}:{[option]:true};
  for(const key of ['Tab','Enter',' ']){const event=f.key(key,options);assert.equal(event.prevented,false,option+'/'+key);assert.equal(event.stopped,false);assert.equal(f.document.activeElement,f.first);assert.equal(f.first.clicks,0);assert.equal(f.state.sdkEnabled,true)}
 }
});
test('File Enter and Space activate only the focused menu control, not its text field',async()=>{
 const f=await fixture();
 f.document.activeElement=f.field;for(const key of ['Enter',' '])assert.equal(f.key(key).prevented,false);
 assert.equal(f.first.clicks,0);
 f.document.activeElement=f.move;assert(f.key('Enter').prevented);assert.equal(f.move.clicks,1);
 assert(f.key(' ').prevented);assert.equal(f.move.clicks,2);
 f.move.attrs['aria-disabled']='true';assert.equal(f.key('Enter').prevented,false);assert.equal(f.move.clicks,2);
});
