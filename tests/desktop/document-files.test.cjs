// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DocumentFiles,identity}=require('../../desktop/document-files.cjs');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'eo-tabs-files-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const a=path.join(root,'a.docx'),b=path.join(root,'b.docx');await fs.writeFile(a,'public A');await fs.writeFile(b,'public B');
 return {root,a,b,files:new DocumentFiles()};
}
test('same path, hard link and parent-directory alias focus an existing owner',async t=>{
 const {root,a,files}=await fixture(t),alias=path.join(root,'link.docx'),parent=path.join(root,'parent');
 await fs.link(a,alias);await fs.symlink(root,parent,'dir');
 let calls=0;
 assert.equal((await files.open(a,async()=>{calls++;return {documentId:'A'};})).existing,false);
 for(const target of [a,alias,path.join(parent,'a.docx')]){
  const result=await files.open(target,()=>{throw Error('Duplicate preparation');});assert.equal(result.documentId,'A');assert.equal(result.existing,true);
 }
 assert.equal(calls,1);
});
test('concurrent alias opens share preparation and failed preparation releases every key',async t=>{
 const {root,a,files}=await fixture(t),alias=path.join(root,'alias.docx');await fs.link(a,alias);
 let release,entered;const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
 const first=files.open(a,async()=>{entered();await gate;return {documentId:'A',selection:'bytes'};});
 await started;const second=files.open(alias,()=>{throw Error('Duplicate preparation');});release();
 const results=await Promise.all([first,second]);assert.equal(results[1].documentId,'A');assert.equal(results[1].existing,true);
 files.forget('A');
 await assert.rejects(files.open(a,async()=>{throw Error('Read failed');}),/Read failed/);
 assert.equal((await files.open(alias,async()=>({documentId:'B'}))).documentId,'B');
});
test('open documents and hard links reject other tabs destinations while own save remains available',async t=>{
 const {root,a,files}=await fixture(t),alias=path.join(root,'alias.docx');await fs.link(a,alias);
 files.claim('A',await identity(a));
 for(const target of [a,alias])await assert.rejects(files.reserve('B',target),{code:'DOCUMENT_DESTINATION_OPEN'});
 const lease=await files.reserve('A',a);await files.validate(lease,{pin:true});files.release(lease);
 files.forget('A');const other=await files.reserve('B',alias);files.release(other);
});
test('pending destination reservations block opens and competing Save As, including directory aliases',async t=>{
 const {root,files}=await fixture(t),parent=path.join(root,'parent');await fs.symlink(root,parent,'dir');
 const target=path.join(root,'new.docx'),lease=await files.reserve('A',target);
 await assert.rejects(files.reserve('B',path.join(parent,'new.docx')),{code:'DOCUMENT_DESTINATION_OPEN'});
 await fs.writeFile(target,'external');
 await assert.rejects(files.open(target,()=>{throw Error('Must not prepare');}),{code:'DOCUMENT_DESTINATION_OPEN'});
 files.release(lease);assert.equal((await files.open(target,async()=>({documentId:'B'}))).documentId,'B');
});
test('old cancellation cannot release a newer lease and expired selections cannot be used',async t=>{
 const {root}=await fixture(t);let now=100;const files=new DocumentFiles({now:()=>now}),target=path.join(root,'new.docx');
 const first=await files.reserve('A',target),second=await files.reserve('A',target);
 files.release(first);await files.validate(second);
 await assert.rejects(files.validate(first),{code:'DOCUMENT_DESTINATION_OPEN'});
 now+=600001;await assert.rejects(files.validate(second),{code:'DOCUMENT_DESTINATION_OPEN'});
 const next=await files.reserve('B',target);files.release(next);
});
test('successful target adoption rekeys identity and closing one document leaves other ownership intact',async t=>{
 const {a,b,files}=await fixture(t);files.claim('A',await identity(a));files.claim('B',await identity(b));
 const target=path.join(path.dirname(a),'saved.docx'),lease=await files.reserve('A',target);await files.validate(lease,{pin:true});await fs.writeFile(target,'new A');
 files.claim('A',await identity(target));files.release(lease);
 assert.equal(files.owner(await identity(a)),null);assert.equal(files.owner(await identity(target)),'A');
 files.forget('A');assert.equal(files.owner(await identity(b)),'B');assert.equal(files.owner(await identity(target)),null);
});
test('final-component links are rejected and case-distinct Linux files remain distinct',async t=>{
 const {root,a,files}=await fixture(t),alias=path.join(root,'symbolic.docx');await fs.symlink(a,alias);
 await assert.rejects(identity(alias),/regular file/);
 const upper=path.join(root,'A.docx');await fs.writeFile(upper,'case distinct');
 const one=await identity(a),two=await identity(upper);
 if(one.keys.some(k=>k.startsWith('inode:')&&two.keys.includes(k)))return;
 files.claim('lower',one);assert.equal(files.owner(two),null);
});
test('a newly created destination alias of another open document is rejected before write',async t=>{
 const {root,a,files}=await fixture(t);files.claim('A',await identity(a));
 const target=path.join(root,'new.docx'),lease=await files.reserve('B',target);await fs.link(a,target);
 await assert.rejects(files.validate(lease,{pin:true}),{code:'DOCUMENT_DESTINATION_OPEN'});files.release(lease);
 assert.equal(await fs.readFile(a,'utf8'),'public A');
});

test('committed path-only ownership refreshes exact hard-link identity before another open',async t=>{
 const {root,a,files}=await fixture(t),alias=path.join(root,'new-alias.docx');
 const file=await identity(a);files.claimPending('A',{target:a,keys:file.keys.filter(key=>key.startsWith('path:'))});
 await fs.link(a,alias);
 const result=await files.open(alias,()=>{throw Error('Must refresh and focus A');});assert.equal(result.documentId,'A');
});
test('unavailable committed metadata fails closed until identity refresh succeeds',async t=>{
 const {root,a,files}=await fixture(t),missing=path.join(root,'committed.docx');
 files.claimPending('A',{target:missing,keys:['path:'+missing]});
 await assert.rejects(files.reserve('B',a),{code:'ENOENT'});
 await fs.writeFile(missing,'committed bytes');
 const lease=await files.reserve('B',a);files.release(lease);
});

for(const platform of ['win32','darwin'])test(platform+' new SaveAs names reserve a casefolded canonical basename across tabs',async t=>{
 const {root}=await fixture(t),files=new DocumentFiles({platform}),upper=path.join(root,'Draft.DOCX'),lower=path.join(root,'draft.docx');
 const lease=await files.reserve('A',upper);
 await files.validate(lease,{pin:true});
 await assert.rejects(files.reserve('B',lower),{code:'DOCUMENT_DESTINATION_OPEN'});
 files.release(lease);
 const next=await files.reserve('B',lower);await files.validate(next);files.release(next);
 await fs.writeFile(upper,'public original');files.claim('A',await identity(upper,{platform}));
 await assert.rejects(files.reserve('B',lower),{code:'DOCUMENT_DESTINATION_OPEN'});
 assert.equal(await fs.readFile(upper,'utf8'),'public original');
});
test('Linux case-distinct new basenames retain independent destination leases',async t=>{
 const {root}=await fixture(t),files=new DocumentFiles({platform:'linux'});
 const a=await files.reserve('A',path.join(root,'Draft.docx')),b=await files.reserve('B',path.join(root,'draft.docx'));
 await files.validate(a);await files.validate(b);files.release(a);files.release(b);
});

for(const platform of ['win32','darwin'])test(platform+' Unicode case aliases and concurrent absent destinations share the lease',async t=>{
 const {root}=await fixture(t),files=new DocumentFiles({platform});
 for(const [a,b] of [['Σ.docx','ς.DOCX'],['Straße.docx','STRAẞE.DOCX'],['é.docx','E\u0301.DOCX']]){
  const lease=await files.reserve('A',path.join(root,a));
  await assert.rejects(files.reserve('B',path.join(root,b)),{code:'DOCUMENT_DESTINATION_OPEN'});
  files.release(lease);
 }
 const results=await Promise.allSettled([files.reserve('A',path.join(root,'Concurrent.docx')),files.reserve('B',path.join(root,'CONCURRENT.DOCX'))]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.find(result=>result.status==='rejected').reason.code,'DOCUMENT_DESTINATION_OPEN');
 files.release(results.find(result=>result.status==='fulfilled').value);
});
