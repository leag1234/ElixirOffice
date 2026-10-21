// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'desktop/renderer.js'),'utf8'),start=source.indexOf('async function offerRecovery(){'),end=source.indexOf('\nasync function ',start+2);
assert(start>=0&&end>start);
const english={recoveryTitle:'Recover documents',recoveryUnavailable:'Unavailable recovery copy',recoveryDamaged:'This copy is damaged or unavailable and cannot be restored.'};
function fixture(entries,strings={}){
 const nodes=[],calls=[],context={info:{language:'en',strings},document:null,t:k=>k,run:async action=>action()};
 function element(tag){const e={tagName:tag.toUpperCase(),children:[],append(...children){this.children.push(...children);for(const c of children)c.parent=this},setAttribute(k,v){this[k]=v},remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this)},focus(){context.active=this},close(){this.closed=true},querySelector(q){if(q==='section')return this.children.find(e=>e.tagName==='SECTION');throw Error('Unexpected selector '+q)}};nodes.push(e);return e}
 context.document={createElement:element};context.modal=title=>{context.title=title;return context.box=element('dialog')};
 context.modalButton=(box,label,action)=>{const b=element('button');b.label=label;b.action=action;box.append(b);return b};
 context.eoDesktop={recoveryOffer:async()=>entries,recoveryRestore:async id=>calls.push(['restore',id]),recoveryRemove:async id=>calls.push(['remove',id])};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.open=offerRecovery',context);
 return{context,nodes,calls,open:()=>context.open()};
}
test('Recovery uses its own title and deliberately focuses a safe restore action',async()=>{
 const f=fixture([{id:'public-good',name:'<img src=x onerror=bad>.docx',modified:'invalid date'},{id:'public-bad',name:'opaque.recovery',damaged:true}]);
 await f.open();assert.equal(f.context.title,english.recoveryTitle);
 const first=f.nodes.find(e=>e.label==='restore');assert.equal(f.context.active,first);assert.equal(first.className,'btn btn-primary desktop-recovery-restore');
 assert.equal(f.nodes.find(e=>e.tagName==='BDI').textContent,'<img src=x onerror=bad>.docx');
 assert.equal(f.nodes.filter(e=>e.label==='restore').length,1,'Damaged data must never expose Restore');
 assert(f.nodes.some(e=>e.textContent===english.recoveryUnavailable));assert(f.nodes.some(e=>e.textContent===english.recoveryDamaged));
 assert(!f.nodes.some(e=>e.textContent==='opaque.recovery'));assert.deepEqual(f.calls,[]);
});
test('Damaged-only recovery focuses Cancel; Cancel and empty startup never discard',async()=>{
 const f=fixture([{id:'public-bad',name:'opaque.recovery',damaged:true}]);await f.open();
 assert.equal(f.context.active.label,'cancel');await f.context.active.action();assert(f.context.box.closed);assert.deepEqual(f.calls,[]);
 const empty=fixture([]);await empty.open();assert.equal(empty.context.box,undefined);assert.deepEqual(empty.calls,[]);
});
test('Restore and Discard use only their exact chosen handles',async()=>{
 const f=fixture([{id:'public-good',name:'Good.docx'},{id:'public-bad',name:'opaque.recovery',damaged:true}]);await f.open();
 const discards=f.nodes.filter(e=>e.label==='discard');await discards[1].action();
 assert.deepEqual(f.calls,[['remove','public-bad']]);assert(!f.context.box.closed);
 await f.nodes.find(e=>e.label==='restore').action();assert.deepEqual(f.calls,[['remove','public-bad'],['restore','public-good']]);assert(f.context.box.closed);
});
test('Each recovery key falls back independently for missing, empty, whitespace and wrong-type values',async()=>{
 for(const bad of [undefined,'',' ',42,{}]){
  const f=fixture([{id:'bad',name:'opaque',damaged:true}],Object.fromEntries(Object.keys(english).map(k=>[k,bad])));
  f.context.info.language='ar';await f.open();assert.equal(f.context.title,english.recoveryTitle);
  for(const value of [english.recoveryUnavailable,english.recoveryDamaged])assert(f.nodes.some(e=>e.textContent===value));
  assert.equal(f.context.info.language,'ar');
 }
 const f=fixture([{id:'bad',damaged:true}],{recoveryTitle:'Titre',recoveryUnavailable:'Indisponible',recoveryDamaged:'Explication'});await f.open();assert.equal(f.context.title,'Titre');assert(f.nodes.some(e=>e.textContent==='Explication'));
});
test('All45 canonical catalogs supply the three recovery labels and exact English fallback parity',()=>{
 const catalogs=JSON.parse(fs.readFileSync(path.join(root,'tools/desktop/i18n-extra.json'),'utf8'));assert.equal(Object.keys(catalogs).length,45);
 for(const [locale,strings] of Object.entries(catalogs))for(const key of Object.keys(english)){assert.equal(typeof strings[key],'string',locale+':'+key);assert(strings[key].trim());assert(!/\{[^}]+\}/.test(strings[key]));if(locale!=='en')assert.notEqual(strings[key],english[key],locale+':'+key)}
 for(const key of Object.keys(english))assert.equal(catalogs.en[key],english[key]);
});
