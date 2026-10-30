// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
assert(process.env.EO_SDKJS,'Explicit SDK source required');
const source=fs.readFileSync(path.join(process.env.EO_SDKJS,'word/Editor/CellWidowReplay.js'),'utf8');
const context=vm.createContext({window:{AscWord:{}}});vm.runInContext(source,context);
const Protocol=context.window.AscWord.CCellWidowReplayProtocol;
assert.equal(typeof Protocol,'function');
const create=(maxRequests=4,maxDepth=4,maxSteps=64)=>new Protocol({generation:1,maxRequests,maxDepth,maxSteps});
const details=(paragraph={},extra={})=>({paragraph,cutLine:1,cellPage:1,rowIndex:4,tablePage:1,signature:[1,4,18],...extra});
const error=fn=>assert.throws(fn,e=>e.name==='CellWidowQualificationError');
test('new pass snapshot is finite and immutable',()=>{
 const p=create();assert.deepEqual({...p.snapshot()},{generation:1,requestsUsed:0,workUsed:0,pending:0,failed:false});
 assert(Object.isFrozen(p.snapshot()));
});
test('requested mapped replay consumed lifecycle uses original owner identity',()=>{
 const p=create(),owner={},parent={};const token=p.open(owner);
 const r=p.request(token,details({}, {ancestors:[parent]}));
 assert.equal(p.status(r),'Requested');
 p.map(r,{from:owner,to:parent,page:0,row:4});assert.equal(p.status(r),'Mapped');
 p.startReplay(r);assert.equal(p.status(r),'Replaying');
 p.consume(r,token);assert.equal(p.status(r),'Consumed');assert.equal(p.snapshot().pending,0);
});
test('no-ancestor local request can be replayed and consumed',()=>{
 const p=create(),t=p.open({}),r=p.request(t,details());
 assert.equal(p.status(r),'Mapped');p.startReplay(r);p.consume(r,t);assert.equal(p.status(r),'Consumed');
});
test('closing the original frame permits a fresh frame for the same owner',()=>{
 const p=create(),owner={},t=p.open(owner),r=p.request(t,details());
 p.close(t);p.startReplay(r);p.consume(r,p.open(owner));assert.equal(p.status(r),'Consumed');
});
test('sibling owner cannot consume another cell request',()=>{
 const p=create(),r=p.request(p.open({}),details());p.startReplay(r);
 error(()=>p.consume(r,p.open({})));assert.equal(p.snapshot().failed,true);
});
test('forged request cannot enter the protocol',()=>{
 const p=create();error(()=>p.startReplay(Object.freeze({id:1,generation:1})));
});
test('forged frame cannot create a request',()=>error(()=>create().request({},details())));
test('closed frame cannot create a request',()=>{
 const p=create(),t=p.open({});p.close(t);error(()=>p.request(t,details()));
});
test('budget exhaustion throws and invalidates qualification, never disables widow',()=>{
 const p=create(1),a=p.request(p.open({}),details());assert.equal(p.snapshot().requestsUsed,1);
 error(()=>p.request(p.open({}),details()));assert.equal(p.snapshot().failed,true);
 assert.equal(p.status(a),'Invalid');assert.equal(p.snapshot().pending,0);
 error(()=>p.open({}));
});
test('same generation begin does not replenish the budget',()=>{
 const p=create(1),t=p.open({}),r=p.request(t,details());p.startReplay(r);p.consume(r,t);
 p.begin(1);assert.equal(p.snapshot().requestsUsed,1);error(()=>p.request(p.open({}),details()));
});
test('next generation resets budget and rejects stale frames',()=>{
 const p=create(1),t=p.open({});p.request(t,details());p.begin(2);
 assert.equal(p.snapshot().requestsUsed,0);error(()=>p.request(t,details()));
});
test('next generation rejects stale pending requests',()=>{
 const p=create(),r=p.request(p.open({}),details());p.begin(2);error(()=>p.startReplay(r));
});
test('generation cannot move backward',()=>error(()=>create().begin(0)));
test('identical rejected state cannot oscillate after consumption',()=>{
 const p=create(),owner={},paragraph={},t=p.open(owner),r=p.request(t,details(paragraph));
 p.startReplay(r);p.consume(r,t);error(()=>p.request(t,details(paragraph)));
});
test('different measured geometry has a different state but still spends budget',()=>{
 const p=create(),t=p.open({}),paragraph={},r=p.request(t,details(paragraph));p.startReplay(r);p.consume(r,t);
 const next=p.request(t,details(paragraph,{signature:[1,4,17]}));assert.equal(p.snapshot().requestsUsed,2);
 assert.equal(p.status(next),'Mapped');
});
test('one owner cannot replace an outstanding request with another paragraph',()=>{
 const p=create(),t=p.open({});p.request(t,details());error(()=>p.request(t,details()));
});
test('nested mapping follows every explicit ancestor in order',()=>{
 const p=create(),a={},b={},c={},t=p.open(a),r=p.request(t,details({}, {ancestors:[b,c]}));
 p.map(r,{from:a,to:b,page:1,row:4});assert.equal(p.status(r),'Requested');
 p.map(r,{from:b,to:c,page:0,row:0});assert.equal(p.status(r),'Mapped');
 p.startReplay(r);p.consume(r,t);
});
test('mapping cannot skip an ancestor',()=>{
 const p=create(),a={},b={},c={},r=p.request(p.open(a),details({}, {ancestors:[b,c]}));
 error(()=>p.map(r,{from:a,to:c,page:0,row:0}));
});
test('nested lineage cycle and depth exhaustion are failures',()=>{
 const p=create(4,1),a={};error(()=>p.request(p.open(a),details({}, {ancestors:[{} ,{}]})));
 const q=create();error(()=>q.request(q.open(a),details({}, {ancestors:[a]})));
});
test('negative mapped page cannot underflow into an ordinary next page',()=>{
 const p=create(),a={},b={},r=p.request(p.open(a),details({}, {ancestors:[b]}));
 error(()=>p.map(r,{from:a,to:b,page:-1,row:0}));
});
test('replay cannot begin before complete ancestor mapping',()=>{
 const p=create(),r=p.request(p.open({}),details({}, {ancestors:[{}]}));error(()=>p.startReplay(r));
});
test('request cannot be consumed before replay',()=>{
 const p=create(),t=p.open({}),r=p.request(t,details());error(()=>p.consume(r,t));
});
test('cancel is explicit, keeps budget spent and prevents later consumption',()=>{
 const p=create(),t=p.open({}),r=p.request(t,details());p.cancel(r);
 assert.equal(p.status(r),'Cancelled');assert.equal(p.snapshot().pending,0);assert.equal(p.snapshot().requestsUsed,1);
 error(()=>p.consume(r,t));
});
test('request and signature are immutable snapshots',()=>{
 const p=create(),t=p.open({}),sig=[1,4,18],r=p.request(t,details({}, {signature:sig}));
 sig[0]=9;assert(Object.isFrozen(r));assert(Object.isFrozen(r.signature));assert.equal(r.signature[0],1);
});
for(const field of ['cutLine','cellPage','rowIndex','tablePage'])
 test('invalid '+field+' is rejected',()=>{
  const p=create();error(()=>p.request(p.open({}),details({}, {[field]:-1})));
 });
test('non-finite signature cannot poison replay-state equality',()=>{
 const p=create();error(()=>p.request(p.open({}),details({}, {signature:[NaN]})));
});
test('zero or missing operational bounds are rejected',()=>{
 error(()=>new Protocol({generation:1,maxRequests:0,maxDepth:1,maxSteps:64}));
 error(()=>new Protocol({generation:1,maxRequests:1,maxDepth:-1,maxSteps:64}));
});

test('owner entry spends the independent pass-work budget',()=>{
 const p=create(4,4,1);p.open({});assert.equal(p.snapshot().workUsed,1);
 error(()=>p.open({}));assert.equal(p.snapshot().failed,true);
});
test('same generation callbacks cannot refresh the pass-work budget',()=>{
 const p=create(4,4,1);const t=p.open({});p.close(t);p.begin(1);
 error(()=>p.open({}));
});
test('a new generation resets pass work without reviving stale frames',()=>{
 const p=create(4,4,1);const t=p.open({});p.close(t);p.begin(2);
 assert.equal(p.snapshot().workUsed,0);p.open({});assert.equal(p.snapshot().workUsed,1);
});
test('missing work budget is rejected, rather than unbounded by default',()=>{
 error(()=>new Protocol({generation:1,maxRequests:1,maxDepth:1}));
});
test('recursive content work spends budget without opening another frame',()=>{
 const p=create(4,4,2),t=p.open({});p.step(t);assert.equal(p.snapshot().workUsed,2);
 error(()=>p.step(t));
});
test('stale callback cannot spend work under a newer generation',()=>{
 const p=create(),t=p.open({});p.begin(2);error(()=>p.step(t));
});
test('controller abort invalidates pending requests and still permits frame cleanup',()=>{
 const p=create(),t=p.open({}),r=p.request(t,details());
 error(()=>p.abort('stale controller context'));
 assert.equal(p.snapshot().failed,true);assert.equal(p.status(r),'Invalid');
 assert.doesNotThrow(()=>p.close(t));
});
test('a later generation can recover from explicit qualification abort',()=>{
 const p=create();error(()=>p.abort('invalid row mapping'));p.begin(2);
 assert.equal(p.snapshot().failed,false);p.open({});
});

// release review reference 459 B2: admit verified productive first visits, retain bounded retries.
test('productive first visits to forward cell pages do not consume retry work',()=>{
 const p=create(4,4,2),owner={},root={},child={};
 for(let page=0;page<40;page++){
  const t=p.open(owner,{page,retry:false});p.step(t,root);p.step(t,child);p.close(t);
 }
 assert.equal(p.snapshot().workUsed,0);assert.equal(p.snapshot().failed,false);
});
test('repeated same-page work remains bounded across ordinary callbacks',()=>{
 const p=create(4,4,2),owner={},content={};
 let t=p.open(owner,{page:0,retry:false});p.step(t,content);p.close(t);
 t=p.open(owner,{page:0,retry:false});p.step(t,content);p.close(t);
 assert.equal(p.snapshot().workUsed,2);
 error(()=>p.open(owner,{page:0,retry:false}));assert.equal(p.snapshot().workUsed,2);
});
test('same generation cannot forget an admitted page or refresh its retry ledger',()=>{
 const p=create(4,4,2),owner={};let t=p.open(owner,{page:0,retry:false});p.close(t);
 p.begin(1);t=p.open(owner,{page:0,retry:false});p.close(t);
 assert.equal(p.snapshot().workUsed,1);
});
test('new generation admits its first page again but rejects the stale frame',()=>{
 const p=create(4,4,2),owner={},t=p.open(owner,{page:0,retry:false});
 p.begin(2);const fresh=p.open(owner,{page:0,retry:false});p.step(fresh,{});
 assert.equal(p.snapshot().workUsed,0);error(()=>p.step(t,{}));
});
test('repeated content visits inside a productive frame consume the finite ledger',()=>{
 const p=create(4,4,2),owner={},content={},t=p.open(owner,{page:0,retry:false});
 p.step(t,content);assert.equal(p.snapshot().workUsed,0);
 p.step(t,content);p.step(t,content);assert.equal(p.snapshot().workUsed,2);
 error(()=>p.step(t,content));
});
test('a request turns the rest of its active frame into bounded replay work',()=>{
 const p=create(4,4,2),owner={},t=p.open(owner,{page:0,retry:false});
 p.step(t,{});const r=p.request(t,details());p.startReplay(r);
 p.step(t,{});p.step(t,{});assert.equal(p.snapshot().workUsed,2);
 error(()=>p.step(t,{}));assert.equal(p.status(r),'Invalid');
});
test('pending owner cannot declare a forward page productive to avoid the ledger',()=>{
 const p=create(4,4,2),owner={},t=p.open(owner,{page:0,retry:false});
 const r=p.request(t,details());p.startReplay(r);p.close(t);
 const replay=p.open(owner,{page:8,retry:false});p.step(replay,{});
 assert.equal(p.snapshot().workUsed,2);error(()=>p.step(replay,{}));
});
test('explicit cached replay charges even an unseen page and stays sticky',()=>{
 const p=create(4,4,2),t=p.open({}, {page:0,retry:true});
 p.step(t,{});assert.equal(p.snapshot().workUsed,2);error(()=>p.step(t,{}));
});
test('forward progress never refunds already spent retry work',()=>{
 const p=create(4,4,2),owner={};let t=p.open(owner,{page:0,retry:false});p.close(t);
 t=p.open(owner,{page:0,retry:false});p.step(t,{});p.close(t);
 t=p.open(owner,{page:1,retry:false});p.step(t,{});p.close(t);
 assert.equal(p.snapshot().workUsed,2);error(()=>p.open(owner,{page:0,retry:false}));
});
for(const page of [-1,NaN,Infinity,0.5])
 test('invalid productive page '+page+' is refused',()=>error(()=>create().open({}, {page,retry:false})));
test('invalid retry admission is refused',()=>error(()=>create().open({}, {page:0,retry:'no'})));
