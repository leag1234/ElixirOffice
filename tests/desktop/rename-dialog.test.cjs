// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../desktop/renderer.js'),'utf8');
const start=source.indexOf('async function rename(){'),end=source.indexOf('\nasync function ',start+2);
assert(start>=0&&end>start);
function fixture(rename){
 const nodes=[],calls=[],context={controller:{},operationBusy:false,file:{token:'public-token',name:'Public.docx'},window:{},backstage:{renameLabel:'Rename'},t:x=>x};
 function element(tag){const e={tagName:tag.toUpperCase(),children:[],listeners:{},append(...items){this.children.push(...items)},setAttribute(k,v){this[k]=v},addEventListener(k,fn){this.listeners[k]=fn},focus(){context.active=this},select(){this.selected=true},close(){this.closed=true}};nodes.push(e);return e}
 context.document={createElement:element};
 context.modal=()=>context.box=element('dialog');
 context.modalButton=(box,label,action)=>{const b=element('button');b.textContent=label;b.type='button';b.action=action;box.append(b);return b};
 context.buttons=v=>context.operationBusy=v;
 context.eoDesktop={rename:async(token,value)=>{calls.push({token,value});return rename?rename(token,value):{name:value+'.docx'}}};
 context.setDocumentName=name=>context.title=name;context.recoveryCopy=async()=>{context.copied=true};
 context.fail=e=>{throw e};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.open=rename',context);
 const open=async()=>{await context.open();const form=nodes.find(e=>e.tagName==='FORM');assert(form,'Rename must use an explicit submit form');return form};
 const submit=form=>form.listeners.submit({preventDefault(){context.prevented=true}});
 return{context,nodes,calls,open,submit};
}
test('Rename labels and selects the existing stem and exposes a single primary submit',async()=>{
 const f=fixture(),form=await f.open(),input=f.nodes.find(e=>e.tagName==='INPUT'),label=f.nodes.find(e=>e.tagName==='LABEL'),save=f.nodes.find(e=>e.type==='submit');
 assert.equal(input.value,'Public');assert.equal(f.context.active,input);assert(input.selected);
 assert.equal(label.htmlFor,input.id);assert.equal(label.textContent,'Rename');
 assert.equal(save.className,'btn btn-primary');assert.equal(form.children.at(-1).className,'desktop-dialog-actions');
 await f.submit(form);assert(f.context.prevented);assert.equal(f.calls.length,1);assert.equal(f.context.title,'Public.docx');assert(f.context.box.closed);assert(f.context.copied);
});
test('A repeated submit while rename is pending cannot rename twice',async()=>{
 let release;const f=fixture(()=>new Promise(r=>release=r)),form=await f.open(),save=f.nodes.find(e=>e.type==='submit');
 const first=f.submit(form);await f.submit(form);assert.equal(f.calls.length,1);assert(save.disabled);
 release({name:'Renamed.docx'});await first;assert.equal(f.context.operationBusy,false);assert.equal(save.disabled,false);
});
test('An invalid name or collision keeps the dialog open and exposes the validation status',async()=>{
 for(const message of ['Choose a valid file name','A file with that name already exists']){
  const f=fixture(async()=>{throw Error(message)}),form=await f.open();await f.submit(form);
  assert(!f.context.box.closed);assert.equal(f.nodes.find(e=>e.role==='status').textContent,message);
  assert.equal(f.context.window.EOLocalFailure,message);assert.equal(f.context.operationBusy,false);
 }
});
test('Cancel does not submit or rename',async()=>{
 const f=fixture();await f.open();const cancel=f.nodes.find(e=>e.textContent==='cancel');assert.equal(cancel.type,'button');cancel.action();
 assert(f.context.box.closed);assert.deepEqual(f.calls,[]);
});
