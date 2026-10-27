// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const network=require('./fixtures/deny-update-network.cjs')(),{fixture}=require('./fixtures/update-test-kit.cjs');
const {createCandidate}=require('../../desktop/update-candidate.cjs'),{createAdapter}=require('../../desktop/update-handoff.cjs'),{createPolicy}=require('../../desktop/update-policy.cjs');
const {createRuntimeSession}=require('../../desktop/update-runtime.cjs');
const roots=[],notice={version:'0.4.0',url:'https://github.com/leag1234/elixiroffice/releases/tag/v0.4.0'};
async function environment(options={}){
 const f=fixture({platform:options.platform||'win32'}),dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'eo-update-runtime-')));roots.push(dir);await fs.chmod(dir,0o700);
 const calls={get:[],download:0,dispose:0,adapter:0,launch:0,authority:[]};let allowed=true,clock=f.now;
 const selected=createCandidate(f),transport={
  async getCandidate(tag,context){calls.get.push(tag);return options.get?options.get(context):options.candidate?.(f)||selected;},
  async download(c,sink){calls.download++;await sink.write(f.payload);await sink.finish();},dispose(){calls.dispose++;}};
 const root=path.join(dir,'cache'),session=await createRuntimeSession({...f,version:'0.3.2',now:()=>clock,cacheRoot:root,transport,
  app:{getVersion:()=> '0.3.2',getName:()=> 'ElixirOffice',whenReady:async()=>{},isPackaged:true},
  eligibility:{check:async()=>allowed,details:()=>({packageType:f.runtime.packageType,startup:{testOnly:true}})},
  makeAdapter(context){calls.adapter++;calls.authority.push({silent:context.silent,relaunch:context.relaunch});return createAdapter({launch(callbacks){if(context.authorize()!==true)return false;calls.launch++;callbacks.success();return true;}});}});
 return {f,dir,root,calls,session,set allowed(v){allowed=v;},set clock(v){clock=v;}};
}
test.after(async()=>{assert.equal(network.calls,0);for(const p of roots)await fs.rm(p,{recursive:true,force:true});});
test('closed policy or failed package eligibility refuses before dependency load and profile access',async()=>{
 const f=fixture(),load=Module._load;let imports=0,profile=0,eligibility=0;
 Module._load=function(name,...args){if(name==='electron-updater'){imports++;throw Error('must stay cold');}return load.call(this,name,...args);};
 try{
  const app={getPath(){profile++;throw Error('profile touched');}};
  await assert.rejects(()=>createRuntimeSession({...f,policy:createPolicy(),app,eligibility:{async check(){eligibility++;return true;}}}),/runtime/i);
  assert.equal(eligibility,0);
  await assert.rejects(()=>createRuntimeSession({...f,app,eligibility:{async check(){eligibility++;return false;}}}),/runtime/i);
  assert.equal(imports,0);assert.equal(profile,0);assert.equal(eligibility,1);
 }finally{Module._load=load;}
});
for(const platform of ['win32','linux'])test(platform+' actual pinned protected bookkeeping and independently authorized install compose without stock I/O',async()=>{
 const e=await environment({platform}),receipt=await e.session.prepare(notice);
 assert.deepEqual(e.calls.get,['v0.4.0']);assert.equal(e.calls.download,1);assert.equal(e.calls.launch,0);
 const prepared=await e.session.install(receipt,{automatic:true});assert.equal(await prepared.revalidate(),true);
 assert.equal(prepared.adapter.install(),true);await prepared.adapter.acknowledgement;assert.equal(e.calls.launch,1);
 assert.deepEqual(e.calls.authority,[{silent:true,relaunch:false}]);await prepared.release();e.session.dispose();
});
test('a valid signed candidate for another displayed release fails before cache writes or downloads',async()=>{
 const e=await environment({candidate:f=>createCandidate({...fixture({now:f.now,version:'0.4.1'}),policy:f.policy})});
 await assert.rejects(()=>e.session.prepare(notice),/runtime/i);assert.equal(e.calls.download,0);
 assert.equal(await fs.stat(e.root).catch(()=>null),null);e.session.dispose();
});
test('copied candidate cannot cross provenance into runtime composition',async()=>{
 const e=await environment({candidate:f=>({...createCandidate(f)})});
 await assert.rejects(()=>e.session.prepare(notice),/runtime/i);assert.equal(e.calls.download,0);assert.equal(await fs.stat(e.root).catch(()=>null),null);e.session.dispose();
});
test('eligibility revoked after preparation prevents platform handoff',async()=>{
 const e=await environment(),receipt=await e.session.prepare(notice);e.allowed=false;
 await assert.rejects(()=>e.session.install(receipt),/runtime/i);assert.equal(e.calls.adapter,0);e.session.dispose();
});
test('cache mutation or expired metadata prevents adapter construction',async()=>{
 for(const kind of ['mutation','expired']){
  const e=await environment(),receipt=await e.session.prepare(notice);
  if(kind==='mutation'){const name=(await fs.readdir(e.root)).find(n=>n.startsWith('payload-'));await fs.writeFile(path.join(e.root,name),Buffer.alloc(e.f.payload.length,1));}
  else e.clock=e.f.now+7200000;
  await assert.rejects(()=>e.session.install(receipt));assert.equal(e.calls.adapter,0);e.session.dispose();
 }
});
test('wrong receipts and arbitrary installer flags are rejected before native preparation',async()=>{
 const e=await environment(),receipt=await e.session.prepare(notice);
 await assert.rejects(()=>e.session.install({...receipt}),/runtime/i);
 await assert.rejects(()=>e.session.install(receipt,{automatic:true,args:['/D=unsafe']}),/runtime/i);
 assert.equal(e.calls.adapter,0);e.session.dispose();
});
test('disposal aborts pending metadata and prohibits late download/install',async()=>{
 let context;const e=await environment({get:value=>{context=value;return new Promise((_,reject)=>value.signal.addEventListener('abort',()=>reject(Error('synthetic aborted')),{once:true}));}});
 const pending=e.session.prepare(notice);for(let n=0;n<20&&!context;n++)await new Promise(setImmediate);assert(context);e.session.dispose();
 await assert.rejects(()=>pending,/runtime/i);assert.equal(context.signal.aborted,true);assert.equal(e.calls.download,0);assert.equal(e.calls.adapter,0);
});
