// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
// Reuse the unchanged real-main unit bootstrap without registering its tests twice.
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),moduleScope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8').replace('console,Buffer,setTimeout','console,Buffer,Uint8Array,setTimeout')+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:moduleScope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=moduleScope.exports;
test('native password lock removes active recovery and rejects late snapshots even after rename',async()=>{
 const env=await boot({document:true});
 try{
  env.state.dirty=true;const bytes=new Uint8Array(Buffer.from('PKsynthetic-recovery'));
  await env.invoke('recovery-save',env.selected.token,0,bytes);assert.equal((await env.invoke('recovery-list')).length,1);
  const lock=await env.invoke('password-lock',env.selected.token);assert.equal((await env.invoke('recovery-list')).length,0);
  assert.equal(await env.invoke('recovery-save',env.selected.token,lock.recoveryVersion,bytes),false);
  const renamed=await env.invoke('rename',env.selected.token,'renamed');
  assert.equal(await env.invoke('recovery-save',env.selected.token,renamed.recoveryVersion,bytes),false);
  assert.equal((await env.invoke('recovery-list')).length,0);
 }finally{await env.cleanup()}
});
test('native protection cannot accept plaintext bytes or bypass cleanup failure',async()=>{
 const env=await boot({document:true,failRemove:true});
 try{
  await assert.rejects(env.invoke('password-lock',env.selected.token),/cleanup failure/);
  env.state.dirty=true;assert.equal(await env.invoke('recovery-save',env.selected.token,1,new Uint8Array(Buffer.from('PKlate'))),false);
  await assert.rejects(env.invoke('save',env.selected.token,new Uint8Array(Buffer.from('PKplaintext')),false,{protected:true,remove:false}),/requested password/);
  assert.equal(await fsp.readFile(path.join(env.directory,'test.docx'),'utf8'),'PKtest-public-document');
 }finally{await env.cleanup()}
});
test('queued actual recovery write is drained then removed before protection acknowledgement',async()=>{
 const {Recovery}=require('../../desktop/recovery.cjs'),policy=require('../../desktop/password.cjs'),files=require('../../desktop/files.cjs'),os=require('node:os'),crypto=require('node:crypto');
 const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'eo-password-race-')),recovery=new Recovery(directory),current={token:crypto.randomUUID()};
 const original=files.atomic;let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 files.atomic=async(...args)=>{entered();await gate;return original(...args)};
 try{
  const saving=recovery.save({id:current.token,name:'public.docx',format:'docx'},new Uint8Array(Buffer.from('PKsynthetic-plaintext')));await started;
  const locked=policy.lock(current,recovery);assert(current.recoveryLocked);assert.equal(current.recoveryVersion,1);
  release();await saving;await locked;assert.equal((await recovery.list()).length,0);
 }finally{files.atomic=original;release();await fsp.rm(directory,{recursive:true,force:true})}
});
test('encrypted Office validation rejects malformed or cyclic compound directories',()=>{
 const policy=require('../../desktop/password.cjs');assert.throws(()=>policy.compound(Buffer.from([208,207,17,224,161,177,26,225])),/Invalid/);
 const header=Buffer.alloc(512);Buffer.from([208,207,17,224,161,177,26,225]).copy(header);header.writeUInt16LE(3,26);header.writeUInt16LE(0xfffe,28);header.writeUInt16LE(9,30);header.writeUInt16LE(6,32);assert.throws(()=>policy.compound(header),/Invalid/);
});

function odfZip(files){
 const parts=[],directory=[];let offset=0;
 for(const [name,value]of Object.entries(files)){
  const n=Buffer.from(name),data=Buffer.from(value),local=Buffer.alloc(30),central=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(n.length,26);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(n.length,28);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt32LE(offset,42);parts.push(local,n,data);directory.push(central,n);offset+=local.length+n.length+data.length;
 }
 const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,central,end]);
}
test('ODF protection is a namespaced manifest entry, never a comment or partial document',()=>{
 const policy=require('../../desktop/password.cjs'),prefix='<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">',end='</manifest:manifest>',entry='<manifest:file-entry manifest:full-path="content.xml">';
 const plain=odfZip({'META-INF/manifest.xml':prefix+'<!-- <manifest:encryption-data/> -->'+entry+'</manifest:file-entry>'+end,'content.xml':'<plain/>'});assert.equal(policy.encrypted(plain,'odt'),false);assert.throws(()=>policy.validate(plain,'odt',{protected:true,remove:false},{recoveryLocked:true}),/requested password/);
 const partial=odfZip({'META-INF/manifest.xml':prefix+entry+'</manifest:file-entry><manifest:file-entry manifest:full-path="styles.xml"><manifest:encryption-data/></manifest:file-entry>'+end,'content.xml':'<plain/>','styles.xml':Buffer.alloc(16)});assert.throws(()=>policy.encrypted(partial,'ods'),/Partially encrypted/);
 const malformed=odfZip({'META-INF/manifest.xml':prefix+entry+end,'content.xml':'<plain/>'});assert.throws(()=>policy.encrypted(malformed,'odp'),/Invalid/);
});
test('a durable native save succeeds even if remembering its recent path fails',async()=>{
 const env=await boot({document:true}),original=fsp.rename;
 try{
  fsp.rename=async(from,to)=>{if(String(to).endsWith('desktop-settings.json'))throw Error('Injected recent preferences failure');return original(from,to)};
  const result=await env.invoke('save',env.selected.token,new Uint8Array(Buffer.from('PKsaved-public-document')),false,{protected:false,remove:false});
  assert.equal(result.preferencesSaved,false);assert.equal(await fsp.readFile(path.join(env.directory,'test.docx'),'utf8'),'PKsaved-public-document');
 }finally{fsp.rename=original;await env.cleanup();}
});

test('verified post-replacement disk error acknowledges the new bytes with a durability warning',async()=>{
 const env=await boot({document:true}),original=fsp.open;
 try{
  fsp.open=async(filename,...args)=>{const handle=await original(filename,...args);if(filename===env.directory)handle.sync=async()=>{throw Error('Injected directory durability failure')};return handle;};
  const result=await env.invoke('save',env.selected.token,new Uint8Array(Buffer.from('PKreplacement-public-document')),false,{protected:false,remove:false});
  assert.equal(result.durabilityUnconfirmed,true);assert.match(result.backupName,/^test\.docx\.eo-[a-f0-9-]+\.bak$/);assert(!result.backupName.includes(path.sep));assert.equal(await fsp.readFile(path.join(env.directory,'test.docx'),'utf8'),'PKreplacement-public-document');
 }finally{fsp.open=original;await env.cleanup();}
});
