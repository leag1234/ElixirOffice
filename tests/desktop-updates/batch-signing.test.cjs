// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {using,hash}=require('./fixtures/batch-signing-kit.cjs'),wire=require('../../tools/desktop-updates/signed-metadata.cjs');
const source=path.resolve(__dirname,'../../tools/desktop-updates/batch-signing.cjs'),api=fs.existsSync(source)?require(source):{};
function context(f,extra={}){
 const calls={secrets:0,approvals:0,details:null,secret:null};
 const options={now:()=>f.now,async readSecret(){calls.secrets++;calls.secret=Buffer.from(f.pass);return calls.secret;},
  async approve(details){calls.approvals++;calls.details=details;return true;},...extra};
 return {calls,options};
}
function noFinal(f){assert.equal(fs.existsSync(f.opts.output),false);assert.deepEqual(fs.readdirSync(f.parent),[]);}
test('complete two-platform batch uses one secret and one whole-set approval, erases master and self-verifies both envelopes',()=>using(async f=>{
 const e=context(f),result=await api.signBatch(f.opts,e.options);
 assert.equal(e.calls.secrets,1);assert.equal(e.calls.approvals,1);assert(e.calls.secret.every(b=>b===0));
 assert.deepEqual(e.calls.details.candidates.map(c=>c.platform),['win32','linux']);
 assert.equal(Object.keys(e.calls.details).at(-1),'fingerprint');assert.equal(e.calls.details.fingerprint,f.opts.fingerprint);
 assert.equal(result.approvalSha256,hash(Buffer.from(JSON.stringify(e.calls.details))));
 assert.deepEqual(fs.readdirSync(f.opts.output).sort(),['BATCH-RECEIPT.json','latest-linux.yml.sig.json','latest.yml.sig.json']);
 for(const r of f.records){
  const envelope=fs.readFileSync(path.join(f.opts.output,r.context.metadataName+'.sig.json'));
  const v=wire.verifyMetadata(envelope,r.metadata,{trustedKeys:{[f.opts.keyId]:f.pair.publicKey},expected:{tag:r.context.tag,platform:r.context.platform,arch:'x64',packageType:r.context.packageType},now:f.now});
  assert.deepEqual(wire.describeUpdate(v).artifact,r.context.artifact);
 }
 const receipt=fs.readFileSync(path.join(f.opts.output,'BATCH-RECEIPT.json'),'utf8');assert(!receipt.includes(f.pass));assert(!receipt.includes(f.opts.key));
 assert.equal(fs.statSync(f.opts.output).mode&0o777,0o700);for(const n of fs.readdirSync(f.opts.output))assert.equal(fs.statSync(path.join(f.opts.output,n)).mode&0o777,0o600);
}));
for(const [label,change]of [
 ['bad second artifact',f=>fs.appendFileSync(path.join(f.artifacts,f.records[1].context.artifact.name),'changed')],
 ['duplicate platform',f=>{f.plan.candidates[1]={...f.plan.candidates[0]};f.rewrite();}],
 ['reordered platform',f=>{f.plan.candidates.reverse();f.rewrite();}],
 ['changed plan seal',f=>f.opts.seal='0'.repeat(64)],
 ['unknown plan field',f=>{f.plan.extra=true;f.rewrite();}],
 ['missing inventory',f=>fs.unlinkSync(path.join(f.artifacts,f.records[1].entry.inventory))],
 ['mixed sequence',f=>{f.records[1].context.sequence++;f.rewriteInventory(1);}],
 ['mixed expiry',f=>{f.records[1].context.expiresAt--;f.rewriteInventory(1);}],
 ['mixed source',f=>{f.records[1].inventory.product_revision='c'.repeat(40);f.rewriteInventory(1);}],
 ['QA namespace',f=>f.opts.keyId='eo-qa-'+'a'.repeat(32)]
])test('batch refuses '+label+' before any secret or approval',()=>using(async f=>{
 change(f);const e=context(f);await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.equal(e.calls.secrets,0);assert.equal(e.calls.approvals,0);noFinal(f);
}));
test('all required public details and independent candidate seals are in the one immutable approval',()=>using(async f=>{
 const e=context(f,{async approve(details){
  assert(Object.isFrozen(details));assert(Object.isFrozen(details.candidates));
  for(let i=0;i<2;i++){const d=details.candidates[i],r=f.records[i];
   assert.equal(d.platform,r.context.platform);assert.deepEqual(d.artifact,r.context.artifact);assert.equal(d.tag,r.context.tag);
   assert.equal(d.build,19);assert.equal(d.sequence,42);assert.equal(d.expiresAt,r.context.expiresAt);assert.equal(d.inventorySha256,r.entry.seal);
  }
  return false;
 }});
 await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.equal(e.calls.secrets,1);assert(e.calls.secret.every(b=>b===0));noFinal(f);
}));
for(const kind of ['artifact','plan','same-bytes-replacement'])test('mutation during approval '+kind+' aborts entire batch and clears master',()=>using(async f=>{
 const e=context(f,{async approve(){
  const file=kind==='plan'?f.opts.batch:path.join(f.artifacts,f.records[1].context.artifact.name);
  if(kind==='same-bytes-replacement'){const b=fs.readFileSync(file);fs.renameSync(file,file+'.old');fs.writeFileSync(file,b,{mode:0o600});}
  else fs.appendFileSync(file,'changed');return true;
 }});
 await assert.rejects(()=>api.signBatch(f.opts,e.options));assert(e.calls.secret.every(b=>b===0));noFinal(f);
}));
test('failure after first signature never publishes a partial final directory',()=>using(async f=>{
 const e=context(f,{async fault(stage,details){if(stage==='after-sign'&&details.index===0)throw Error('synthetic failure');}});
 await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.equal(e.calls.secrets,1);assert.equal(e.calls.approvals,1);assert(e.calls.secret.every(b=>b===0));noFinal(f);
}));
test('late second-candidate mutation is rehashed and refuses the complete batch',()=>using(async f=>{
 const e=context(f,{async fault(stage,d){if(stage==='after-sign'&&d.index===0)fs.appendFileSync(path.join(f.artifacts,f.records[1].context.artifact.name),'changed');}});
 await assert.rejects(()=>api.signBatch(f.opts,e.options));noFinal(f);assert(e.calls.secret.every(b=>b===0));
}));
for(const kind of ['directory','file','symlink'])test('existing '+kind+' output is never clobbered and asks no secret',()=>using(async f=>{
 const keep=path.join(f.root,'keep');fs.writeFileSync(keep,'untouched');
 if(kind==='directory'){fs.mkdirSync(f.opts.output);fs.writeFileSync(path.join(f.opts.output,'keep'),'untouched');}
 if(kind==='file')fs.writeFileSync(f.opts.output,'untouched');
 if(kind==='symlink')fs.symlinkSync(keep,f.opts.output);
 const e=context(f);await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.equal(e.calls.secrets,0);assert.equal(fs.readFileSync(keep,'utf8'),'untouched');
 if(kind==='directory')assert.equal(fs.readFileSync(path.join(f.opts.output,'keep'),'utf8'),'untouched');
 if(kind==='file')assert.equal(fs.readFileSync(f.opts.output,'utf8'),'untouched');
 if(kind==='symlink')assert(fs.lstatSync(f.opts.output).isSymbolicLink());
}));
test('replaced reservation is preserved, never merged or published into',()=>using(async f=>{
 let foreign;
 const e=context(f,{async fault(stage){if(stage==='before-publish'){fs.rmdirSync(f.opts.output);fs.mkdirSync(f.opts.output,{mode:0o700});foreign=fs.statSync(f.opts.output).ino;}}});
 await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.equal(fs.statSync(f.opts.output).ino,foreign);assert.deepEqual(fs.readdirSync(f.opts.output),[]);
}));
test('postcommit parent-sync error reports complete-but-uncertain and retains whole verified set',()=>using(async f=>{
 const io={...fs,fsyncSync(fd){
  if(fs.existsSync(f.opts.output)&&fs.readdirSync(f.opts.output).length===3){const e=Error('injected sync');e.code='EIO';throw e;}
  return fs.fsyncSync(fd);
 }};
 const e=context(f,{io});
 await assert.rejects(()=>api.signBatch(f.opts,e.options),{code:'ERR_BATCH_COMMIT_UNCERTAIN'});
 assert.deepEqual(fs.readdirSync(f.opts.output).sort(),['BATCH-RECEIPT.json','latest-linux.yml.sig.json','latest.yml.sig.json']);assert(e.calls.secret.every(b=>b===0));
}));
test('master secret is erased before final verification and publication after its last signing use',()=>using(async f=>{
 let e,checked=false;e=context(f,{async fault(stage){if(stage==='before-publish'){assert(e.calls.secret.every(b=>b===0));checked=true;}}});
 await api.signBatch(f.opts,e.options);assert.equal(checked,true);
}));
test('an injected pre-existing expected filename in private staging is never deleted or overwritten',()=>using(async f=>{
 let foreign;
 const e=context(f,{async fault(stage,d){if(stage==='before-sign'&&d.index===0){
  const folder=fs.readdirSync(f.parent).find(n=>n.startsWith('.sign-batch-'));foreign=path.join(f.parent,folder,'latest.yml.sig.json');fs.writeFileSync(foreign,'untouched',{mode:0o600});
 }}});
 await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.equal(fs.readFileSync(foreign,'utf8'),'untouched');assert.equal(fs.existsSync(f.opts.output),false);
}));
for(const selected of [0,1])test('an explicitly sealed single-platform batch '+selected+' uses the same protections',()=>using(async f=>{
 const other=f.records[1-selected];
 for(const n of [other.entry.inventory,other.context.metadataName,other.context.artifact.name])fs.unlinkSync(path.join(f.artifacts,n));
 f.plan.candidates=[f.plan.candidates[selected]];f.rewrite();const e=context(f),result=await api.signBatch(f.opts,e.options);
 assert.equal(e.calls.secrets,1);assert.equal(e.calls.approvals,1);assert.equal(e.calls.details.candidates.length,1);assert.equal(result.files.length,1);assert.equal(fs.readdirSync(f.opts.output).length,2);
}));
test('omitting a member without changing the independently expected batch seal refuses before secret',()=>using(async f=>{
 f.plan.candidates.pop();fs.writeFileSync(f.opts.batch,JSON.stringify(f.plan)+'\n');const e=context(f);
 await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.equal(e.calls.secrets,0);noFinal(f);
}));
test('late expiry after first signature aborts complete publication and erases master',()=>using(async f=>{
 const e=context(f,{async fault(stage,d){if(stage==='after-sign'&&d.index===0)f.now+=2*86400000;}});
 await assert.rejects(()=>api.signBatch(f.opts,e.options));assert(e.calls.secret.every(b=>b===0));noFinal(f);
}));
test('wrong expected key fingerprint never requests approval and erases the entered secret',()=>using(async f=>{
 f.opts.fingerprint='0'.repeat(64);const e=context(f);
 await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.equal(e.calls.approvals,0);assert(e.calls.secret.every(b=>b===0));noFinal(f);
}));
test('atomic rename fault leaves no final signatures and closes every IO-created descriptor',()=>using(async f=>{
 const opened=new Set(),io={...fs,openSync(...a){const fd=fs.openSync(...a);opened.add(fd);return fd;},closeSync(fd){const r=fs.closeSync(fd);opened.delete(fd);return r;},
 renameSync(){throw Object.assign(Error('injected rename'),{code:'EIO'});}};
 const e=context(f,{io});await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.equal(opened.size,0);noFinal(f);
}));
test('receipt write failure cleans owned partial staging files and publishes nothing',()=>using(async f=>{
 let receiptFD;const io={...fs,openSync(file,...a){const fd=fs.openSync(file,...a);if(String(file).endsWith('BATCH-RECEIPT.json'))receiptFD=fd;return fd;},
 writeSync(fd,...a){if(fd===receiptFD)throw Object.assign(Error('injected receipt'),{code:'ENOSPC'});return fs.writeSync(fd,...a);}};
 await assert.rejects(()=>api.signBatch(f.opts,context(f,{io}).options));noFinal(f);
}));
test('changed output parent cannot redirect publication and its replacement stays untouched',()=>using(async f=>{
 const moved=f.parent+'.moved';const e=context(f,{async fault(stage){if(stage==='before-publish'){fs.renameSync(f.parent,moved);fs.mkdirSync(f.parent,{mode:0o700});}}});
 await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.deepEqual(fs.readdirSync(f.parent),[]);assert.deepEqual(fs.readdirSync(moved),[]);
}));
test('tampered staged envelope is not published or blindly deleted as an owned file',()=>using(async f=>{
 let file;const e=context(f,{async fault(stage){if(stage==='before-publish'){const folder=fs.readdirSync(f.parent).find(n=>n.startsWith('.sign-batch-'));file=path.join(f.parent,folder,'latest.yml.sig.json');fs.writeFileSync(file,'tampered');}}});
 await assert.rejects(()=>api.signBatch(f.opts,e.options));assert.equal(fs.existsSync(f.opts.output),false);assert.equal(fs.readFileSync(file,'utf8'),'tampered');
}));
