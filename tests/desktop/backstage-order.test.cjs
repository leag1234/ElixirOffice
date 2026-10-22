// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
// Model the menu's DOM insertion and MenuItem visibility. The native smoke
// additionally exercises the real shared views, jQuery and SDK.
async function fixture(preview=false){
 const nodes=new Map(),order=[],commands=[];
 function element(id){
  if(nodes.has(id))return nodes.get(id);
  const node={id,visible:true,caption:'',attrs:{},events:{},children:[]};
  const el={0:node,length:1,show(){node.visible=true;return this},hide(){node.visible=false;return this},attr(k,v){node.attrs[k]=v;return this},
   find(selector){return select(selector)},off(){return this},on(name,fn){node.events[name]=fn;return this},text(value){node.caption=value;return this},
   append(...items){node.children.push(...items);return this},empty(){node.children=[];return this},
   appendTo(target){const i=order.indexOf(id);if(i>=0)order.splice(i,1);order.push(id);return this},
   insertBefore(ref){const i=order.indexOf(id);if(i>=0)order.splice(i,1);order.splice(order.indexOf(ref[0]?.id),0,id);return this},
   insertAfter(ref){const i=order.indexOf(id);if(i>=0)order.splice(i,1);order.splice(order.indexOf(ref[0]?.id)+1,0,id);return this}};
  node.append=(child)=>{const i=order.indexOf(child.id);if(i>=0)order.splice(i,1);order.push(child.id);};
  nodes.set(id,el);order.push(id);return el;
 }
 function select(selector){
  if(selector.startsWith('<')){const id=selector.match(/id="([^"]+)"/)?.[1]||'created-'+nodes.size;return element(id)}
  if(selector.startsWith('#')){const id=selector.slice(1);if(nodes.has(id))return element(id);return {length:0,hide(){return this},appendTo(){return this},insertBefore(){return this}};}
  return element(selector);
 }
 const item=(id)=>{const el=element(id);return {$el:el,show:()=>el.show(),hide:()=>el.hide(),setDisabled(){},setCaption(value){el.text(value)}}};
 const fm={items:[],$el:{find:select},hide(){commands.push('hide')},fireEvent(){commands.push('web')}};
 for(const [name,id]of Object.entries({miNew:'create',miRecent:'recent',miInfo:'info',miSave:'save',miDownload:'download',miRename:'rename',miProtect:'protect',miHistory:'history',miAccess:'rights',miSaveCopyAs:'save-copy',miSettings:'settings',miHelp:'help'}))fm[name]=item('fm-btn-'+id);
 if(preview)fm.miPrintWithPreview=item('fm-btn-print-with-preview');else{fm.miPrint=item('fm-btn-print');fm.miPrintWithPreview=item('fm-btn-print-with-preview');}
 const bs={rendered:true,fm,items:{},txtExport:'Exporter',txtRename:'Renommer',afterApplyMode(){},refreshInfoTiles(){}};
 for(const id of ['elx-home','elx-open','elx-export','elx-share','elx-close','elx-about','elx-ai'])bs.items[id]=item('fm-btn-'+id);
 const main={api:{}},chrome={backstage:bs},window={dispatchEvent(){},CustomEvent:class{}};
 const win={SSE:{getController:()=>chrome},$:select,document:{addEventListener(){},createElement:()=>({}),head:{append(){}}},
 Common:{UI:{MenuItem:class{constructor(options){this.options=options;this.$el=options.el;}on(){}hide(){this.$el.hide()}show(){this.$el.show()}}}}};
 vm.runInNewContext(fs.readFileSync(process.env.EO_BACKSTAGE_SOURCE||path.join(__dirname,'../../desktop/backstage.js'),'utf8'),{window});
 await window.EODesktopBackstage(win,main,{strings:{pdf:'PDF',home:'Accueil',save:'Enregistrer',saveAs:'Enregistrer sous',info:'Informations',tabMoveOtherWindow:'Move to another window'},language:'fr'},action=>commands.push(action));
 return {fm,bs,commands,nodes,visible:()=>order.filter(id=>id.startsWith('fm-btn-')&&nodes.get(id)[0].visible),order};
}
for(const preview of [false,true]){
 test('desktop Office rail order, no separate Rename/tab move, '+(preview?'preview':'direct')+' Print',async()=>{
  const f=await fixture(preview);const expected=['elx-home','create','elx-open','info','save','download',preview?'print-with-preview':'print','elx-export','elx-close','settings','help','elx-about','eo-quit'].map(id=>'fm-btn-'+id);
  assert.deepEqual(f.visible(),expected);
  f.bs.afterApplyMode();assert.deepEqual(f.visible(),expected,'applyMode is idempotent');
  assert.equal(f.nodes.get('fm-btn-elx-export')[0].caption,'Exporter','Export is not misleadingly named PDF');
 });
}
test('Export enters the native format chooser, preserving PDF and non-PDF choices',async()=>{
 const f=await fixture();f.fm.fireEvent('item:click',[f.fm,'elx-export']);assert.deepEqual(f.commands,['hide','save-as']);
});
test('Info keeps shared properties and exposes native Rename and tab/window move actions',async()=>{
 const f=await fixture();const target={find:selector=>f.nodes.get(selector)||{append(...items){this.items=items;f.nodes.set(selector,this);return this},find(){return this}}};
 f.bs.refreshInfoTiles({$el:target});
 const actions=f.nodes.get('.elx-info-actions');assert(actions?.items?.length,'native actions appended to shared Info');
 const text=actions.items.map(el=>el[0].caption);
 assert(text.includes('Renommer'));assert(text.includes('Move to another window'));
 for(const button of actions.items)button[0].events.click();
 assert(f.commands.includes('rename'));assert(f.commands.includes('move-menu'));
});
