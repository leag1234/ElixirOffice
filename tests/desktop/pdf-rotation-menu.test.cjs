// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
const source=fs.readFileSync(path.join(upstream,'web-apps/apps/pdfeditor/main/app/view/DocumentHolderExt.js'),'utf8');
function setup(local=true){
 class Item{constructor(options){this.options=options;this.visible=true;this.disabled=false;this.listeners={};}on(name,fn){this.listeners[name]=fn;return this;}setVisible(v){this.visible=v;}setDisabled(v){this.disabled=v;}}
 class Menu{constructor(options){this.options=options;this.items=options.items;}on(){return this;}addItem(item){this.items.push(item);}}
 function Holder(){}const context={window:{PDFE:{Views:{DocumentHolder:Holder}}},Common:{UI:{MenuItem:Item,Menu}},define:(_deps,factory)=>factory()};
 vm.runInNewContext(source,context);
 const calls=[],holder=new Holder();let writable=true,canRotate=true;
 Object.assign(holder,{mode:{isElixirLocal:local},api:{eoLocalMode:local,eoLocalPdfCanRotate:()=>writable,asc_CanRotatePages:()=>canRotate,asc_RotatePage:angle=>calls.push(angle)},options:{},fireEvent(){},txtRotateRight:'Localized right',txtRotateLeft:'Localized left'});
 holder.createDelayedElementsPDFViewer();return {holder,calls,policy:v=>{writable=v},lock:v=>{canRotate=!v}};
}
test('hosted viewer keeps its single Copy item and exposes no local rotation',()=>{
 const e=setup(false);assert.equal(e.holder.viewPageMenu.items.length,1);assert.equal(e.holder.menuLocalRotatePages,undefined);
});
test('local menu uses translated captions and rechecks policy/locks on every click',()=>{
 const e=setup(),h=e.holder;h.viewPageMenu.options.initMenu({isPageSelect:true});const [right,left]=h.menuLocalRotatePages;
 assert.deepEqual([right.options.caption,left.options.caption],['Localized right','Localized left']);
 const init=value=>h.viewPageMenu.options.initMenu(value);
 init({isPageSelect:true});assert.equal(right.visible,true);assert.equal(right.disabled,false);
 right.listeners.click();left.listeners.click();assert.deepEqual(e.calls,[90,-90]);
 e.lock(true);init({isPageSelect:true});assert(right.disabled);right.listeners.click();assert.equal(e.calls.length,2);
 e.lock(false);init({isPageSelect:false});assert(right.disabled);
 e.policy(false);init({isPageSelect:true});assert.equal(right.visible,false);assert(right.disabled);left.listeners.click();assert.equal(e.calls.length,2);
 e.policy(true);init({isPageSelect:true});assert.equal(left.visible,true);assert.equal(left.disabled,false);
});

test('rotation menu initializes after the explicit local transport attaches and never duplicates items',()=>{
 const e=setup(false),h=e.holder;h.mode.isElixirLocal=true;h.api.eoLocalMode=true;
 h.viewPageMenu.options.initMenu({isPageSelect:true});h.viewPageMenu.options.initMenu({isPageSelect:true});
 assert.equal(h.viewPageMenu.items.length,3);assert.equal(h.menuLocalRotatePages.length,2);
 delete h.api.eoLocalPdfCanRotate;h.viewPageMenu.options.initMenu({isPageSelect:true});
 assert(h.menuLocalRotatePages.every(item=>!item.visible&&item.disabled));h.menuLocalRotatePages[0].listeners.click();assert.equal(e.calls.length,0);
});
