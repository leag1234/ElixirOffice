// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Recovery}=require('../../desktop/recovery.cjs'),{validate,handler}=require('../../desktop/external.cjs');
test('recovery serializes durable copies, detects damage and never writes the original',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'eo-recovery-'));
 try{
  const original=path.join(root,'original.docx');await fs.writeFile(original,'original');
  const store=new Recovery(root),id=crypto.randomUUID(),meta={id,name:'original.docx',format:'docx',target:original};
  await Promise.all([store.save(meta,Buffer.from('PKcopy-one')),store.save(meta,Buffer.from('PKcopy-two'))]);
  const recovered=await new Recovery(root).read(id);assert.equal(Buffer.from(recovered.data).toString(),'PKcopy-two');assert.equal(recovered.target,undefined);assert.equal(await fs.readFile(original,'utf8'),'original');
  const list=await store.list();assert.equal(list.length,1);assert.equal(list[0].name,'original.docx');assert.equal(list[0].data,undefined);
  assert.equal((await fs.stat(path.join(root,'recovery',id+'.recovery'))).mode&0o777,0o600);
  const filename=path.join(root,'recovery',id+'.recovery');await fs.appendFile(filename,'changed');
  await assert.rejects(store.read(id),/Damaged/);assert.equal((await store.list())[0].damaged,true);
  await store.remove(id);assert.deepEqual(await store.list(),[]);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('recovery rejects invalid handles, formats, symlinks and outputs',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'eo-recovery-safe-'));
 try{
  const store=new Recovery(root),id=crypto.randomUUID();
  await assert.rejects(store.read('../outside'),/handle/);
  await assert.rejects(store.save({id,name:'x',format:'exe'},Buffer.from('PKtest')),/Invalid/);
  await assert.rejects(store.save({id,name:'x',format:'docx'},Buffer.from('bad!')),/Invalid/);
  await store.directory();await fs.symlink('/etc/passwd',path.join(root,'recovery',id+'.recovery'));
  await assert.rejects(store.read(id),/Invalid/);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('external links accept only web or mail URLs and always deny embedded windows',async()=>{
 for(const url of ['https://example.org/path?a=1','http://localhost:8123/','mailto:person@example.org?subject=Hello'])assert(validate(url));
 for(const url of ['file:///etc/passwd','javascript:alert(1)','data:text/html,x','https://user:pass@example.org','mailto://host/person','https://example.org/\n','eoapp://desktop.elixiroffice.invalid/','relative.docx'])assert.equal(validate(url),null,url);
 const calls=[],errors=[],open=handler(url=>{calls.push(url);return Promise.resolve()},error=>errors.push(error));
 assert.deepEqual(open({url:'https://example.org'}),{action:'deny'});assert.deepEqual(open({url:'file:///etc/passwd'}),{action:'deny'});
 await new Promise(setImmediate);assert.deepEqual(calls,['https://example.org/']);assert.deepEqual(errors,[]);
 const failed=handler(()=>Promise.reject(Error('OS declined')),error=>errors.push(error.message));failed({url:'mailto:a@b.test'});await new Promise(setImmediate);assert.deepEqual(errors,['OS declined']);
});

test('recovery tightens permissions on an existing directory', {skip:process.platform==='win32'},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'eo-recovery-mode-'));
 try{
  const store=new Recovery(root);await fs.mkdir(store.root);await fs.chmod(store.root,0o755);
  await store.directory();assert.equal((await fs.stat(store.root)).mode&0o777,0o700);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
