// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),io=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'windows-replace.test.cjs'),real=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={fixture,modules,bootMain};',{require:n=>n==='node:test'?()=>{}:real(n),module:scope,__dirname,process,console,Buffer,Uint8Array,TextDecoder,URL,setTimeout,clearTimeout,setImmediate,setInterval,clearInterval});
const {fixture,modules}=scope.exports,fault=code=>Object.assign(Error('Injected fallback failure'),{code});
const config={env:{EO_WINDOWS_SAVE_RETRY_MS:'100'}};
function wrapped(handle,changes={}){
 const result={};for(const name of ['stat','read','write','truncate','sync','close'])result[name]=(...args)=>handle[name](...args);
 return Object.assign(result,changes);
}
async function backupBytes(f){
 const name=(await io.readdir(f.directory)).find(n=>n.endsWith('.bak'));assert(name,'Validated original backup required');
 return io.readFile(path.join(f.directory,name),'utf8');
}
test('exhausted transient Windows replacement refusals save through the existing file for short and long output',async()=>{
 for(const code of ['EPERM','EACCES','EBUSY'])for(const content of ['PKx','PKa longer public replacement']){
  const f=await fixture(config);try{
   Object.assign(f.state,{code,remaining:Infinity});const saved=await f.files.atomic(f.target,Buffer.from(content),f.original);
   assert.equal(f.clock.time,100);assert.equal(saved.hash,f.files.hash(Buffer.from(content)));
   assert.equal(await io.readFile(f.target,'utf8'),content);assert.equal((await io.stat(f.target)).ino,f.original.inode);
   assert.deepEqual(await io.readdir(f.directory),['public.docx']);
  }finally{await f.cleanup()}
 }
});
test('fallback writes complete short chunks before truncation and verifies the committed bytes',async()=>{
 const f=await fixture(config);try{
  f.state.remaining=Infinity;let writes=0,truncatedAt=0;const open=f.proxy.open,content=Buffer.from('PKnew short');
  f.proxy.open=async(filename,...args)=>{
   const handle=await open(filename,...args);if(filename!==f.target||args[0]!=='r+')return handle;
   return wrapped(handle,{async write(buffer,offset,length,position){writes++;return handle.write(buffer,offset,Math.min(3,length),position)},async truncate(size){truncatedAt=writes;return handle.truncate(size)}});
  };
  await f.files.atomic(f.target,content,f.original);assert(writes>=Math.ceil(content.length/3));assert.equal(truncatedAt,writes);assert.equal(await io.readFile(f.target,'utf8'),content.toString());
 }finally{await f.cleanup()}
});
test('failed fallback write, truncate, sync or readback restores the exact original and retains its backup',async()=>{
 for(const stage of ['write','truncate','sync','verify']){
  const f=await fixture(config);try{
   f.state.remaining=Infinity;const open=f.proxy.open;let injected=false,writes=0;
   f.proxy.open=async(filename,...args)=>{
    const handle=await open(filename,...args);if(filename!==f.target||args[0]!=='r+')return handle;
    return wrapped(handle,{
     async write(buffer,offset,length,position){writes++;if(stage==='write'&&!injected){if(writes===1)return handle.write(buffer,offset,Math.min(3,length),position);injected=true;throw fault('ENOSPC')}return handle.write(buffer,offset,length,position)},
     async truncate(size){if(stage==='truncate'&&!injected){injected=true;throw fault('EIO')}return handle.truncate(size)},
     async sync(){if(stage==='sync'&&!injected){injected=true;throw fault('EIO')}return handle.sync()},
     async read(buffer,offset,length,position){const result=await handle.read(buffer,offset,length,position);if(stage==='verify'&&!injected&&writes){injected=true;if(result.bytesRead)buffer[offset]^=1}return result}
    });
   };
   const error=await f.files.atomic(f.target,Buffer.from('PKnew output which must not survive'),f.original).then(()=>assert.fail('Failure required'),e=>e);
   assert(injected);assert.equal(error.rollbackVerified,true);assert.equal(error.rollbackUncertain,false);
   assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');assert.deepEqual(await io.readdir(f.directory),['public.docx']);
  }finally{await f.cleanup()}
 }
});
test('uncertain rollback preserves the verified original backup and exposes a fixed path-free recovery reason',async()=>{
 const f=await fixture(config);try{
  f.state.remaining=Infinity;const open=f.proxy.open;let writes=0;
  f.proxy.open=async(filename,...args)=>{
   const handle=await open(filename,...args);if(filename!==f.target||args[0]!=='r+')return handle;
   return wrapped(handle,{async write(buffer,offset,length,position){writes++;if(writes===1)return handle.write(buffer,offset,Math.min(3,length),position);throw fault('EIO')}});
  };
  const error=await f.files.atomic(f.target,Buffer.from('PKpartial uncommitted output'),f.original).then(()=>assert.fail('Uncertain failure required'),e=>e);
  assert.equal(error.rollbackUncertain,true);assert.equal(await backupBytes(f),'PKoriginal');
  const errors=real('../../desktop/errors.js'),message=errors.message(error);
  assert.match(message,/backup/i);assert(!message.includes(f.directory));assert(!message.includes('Injected'));
  const transported=errors.message({message:"Error invoking remote method 'eo:save': Error: "+error.message});
  assert.equal(transported,message);
 }finally{await f.cleanup()}
});
test('fallback refuses aliases, changed target identity and new destinations',async()=>{
 for(const kind of ['hardlink','changed','new']){
  const f=await fixture(config);try{
   f.state.remaining=Infinity;const open=f.proxy.open;let attempted=0;
   if(kind==='hardlink')await io.link(f.target,path.join(f.directory,'alias.docx'));
   f.proxy.open=async(filename,...args)=>{
    if(filename===f.target&&args[0]==='r+'){
     attempted++;if(kind==='changed'){await io.rename(f.target,path.join(f.directory,'retained.docx'));await io.writeFile(f.target,'PKexternal')}
    }
    return open(filename,...args);
   };
   let target=f.target,expected=f.original;
   if(kind==='new'){target=path.join(f.directory,'new.docx');expected={absent:true};f.proxy.rename=async(a,b)=>{if(b===target)throw fault('EPERM');return io.rename(a,b)}}
   await assert.rejects(f.files.atomic(target,Buffer.from('PKedited'),expected));
   if(kind==='hardlink'){assert.equal(attempted,0);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');assert.equal(await io.readFile(path.join(f.directory,'alias.docx'),'utf8'),'PKoriginal')}
   if(kind==='changed'){assert.equal(attempted,1);assert.equal(await io.readFile(f.target,'utf8'),'PKexternal');assert.equal(await backupBytes(f),'PKoriginal')}
   if(kind==='new')await assert.rejects(io.stat(target),e=>e.code==='ENOENT');
  }finally{await f.cleanup()}
 }
});
test('retry budget is configurable and invalid values retain the five-second default',async()=>{
 for(const [value,expected]of [[undefined,5000],['250',250],['0',0],['15000',15000],['-1',5000],['15001',5000],['bad',5000]]){
  const f=await fixture({env:value===undefined?{}:{EO_WINDOWS_SAVE_RETRY_MS:value}});try{
   f.state.remaining=Infinity;const open=f.proxy.open;
   f.proxy.open=async(filename,...args)=>{if(filename===f.target&&args[0]==='r+')throw fault('EBUSY');return open(filename,...args)};
   await assert.rejects(f.files.atomic(f.target,Buffer.from('PKedited'),f.original));assert.equal(f.clock.time,expected);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');
  }finally{await f.cleanup()}
 }
});
test('existing recovery files use the same verified fallback for later automatic writes',async()=>{
 const f=await fixture(config);try{
  f.state.armed=false;const recovery=new(f.load('recovery.cjs').Recovery)(f.directory),id=crypto.randomUUID(),meta={id,name:'Public.docx',format:'docx'};
  await recovery.save(meta,new Uint8Array(Buffer.from('PKfirst recovery')));
  f.proxy.rename=async(a,b)=>{if(String(b).endsWith('.recovery'))throw fault('EPERM');return io.rename(a,b)};
  await recovery.save(meta,new Uint8Array(Buffer.from('PKsecond public recovery')));
  assert.equal(Buffer.from((await recovery.read(id)).data).toString(),'PKsecond public recovery');
 }finally{await f.cleanup()}
});

test('uncertain restoration guidance survives IPC serialization in every supported desktop locale',async()=>{
 const root=path.resolve(__dirname,'../..'),locale=real('../../desktop/locale.cjs'),errors=real('../../desktop/errors.js'),messages=real('../../desktop/save-messages.cjs');
 const supported=JSON.parse(await io.readFile(path.join(root,'desktop/assets/desktop-home/locales.json'),'utf8'));
 assert.equal(Object.keys(messages).length,45);
 for(const language of supported){
  const info=await locale.load(path.join(root,'desktop/assets'),[language]);
  assert.equal(info.language,language);assert.equal(info.strings.saveRestoreUncertain,messages[language]);
  const message=errors.message({message:"Error invoking remote method 'eo:save': Error: SAVE_RESTORE_UNCERTAIN: private target path"},info.strings);
  assert.equal(message,messages[language]);assert(!message.includes('private target path'));
 }
});

test('a pathname replaced during fallback skips unsafe rollback, retains backup and leaves the foreign file untouched',async()=>{
 const f=await fixture(config);try{
  f.state.remaining=Infinity;const open=f.proxy.open,retained=path.join(f.directory,'external-retained.docx');let swapped=false;
  f.proxy.open=async(filename,...args)=>{
   const handle=await open(filename,...args);if(filename!==f.target||args[0]!=='r+')return handle;
   return wrapped(handle,{async write(buffer,offset,length,position){
    const result=await handle.write(buffer,offset,length,position);
    if(!swapped){swapped=true;await io.rename(f.target,retained);await io.writeFile(f.target,'PKforeign external file')}
    return result;
   }});
  };
  const error=await f.files.atomic(f.target,Buffer.from('PKour new output'),f.original).then(()=>assert.fail('Foreign path must not be acknowledged'),e=>e);
  assert.equal(error.rollbackUncertain,true);assert.equal(await io.readFile(f.target,'utf8'),'PKforeign external file');
  assert.equal(await io.readFile(retained,'utf8'),'PKour new output');assert.equal(await backupBytes(f),'PKoriginal');
 }finally{await f.cleanup()}
});

test('a hard link added during fallback skips rollback instead of modifying the newly shared inode',async()=>{
 const f=await fixture(config);try{
  f.state.remaining=Infinity;const open=f.proxy.open,alias=path.join(f.directory,'external-alias.docx');let writes=0;
  f.proxy.open=async(filename,...args)=>{
   const handle=await open(filename,...args);if(filename!==f.target||args[0]!=='r+')return handle;
   return wrapped(handle,{async write(buffer,offset,length,position){
    writes++;const result=await handle.write(buffer,offset,length,position);if(writes===1)await io.link(f.target,alias);return result;
   }});
  };
  const content='PKour new output',error=await f.files.atomic(f.target,Buffer.from(content),f.original).then(()=>assert.fail('Shared inode must not be acknowledged'),e=>e);
  assert.equal(error.rollbackUncertain,true);assert.equal(writes,1);assert.equal(await io.readFile(alias,'utf8'),content);assert.equal(await backupBytes(f),'PKoriginal');
 }finally{await f.cleanup()}
});

test('a path or link change during original verification is refused before the first in-place write',async()=>{
 for(const kind of ['replacement','hardlink']){
  const f=await fixture(config);try{
   f.state.remaining=Infinity;const open=f.proxy.open,alias=path.join(f.directory,'external.docx');let changed=false,writes=0;
   f.proxy.open=async(filename,...args)=>{
    const handle=await open(filename,...args);if(filename!==f.target||args[0]!=='r+')return handle;
    return wrapped(handle,{
     async read(buffer,offset,length,position){
      const result=await handle.read(buffer,offset,length,position);
      if(!changed){changed=true;if(kind==='replacement'){await io.rename(f.target,alias);await io.writeFile(f.target,'PKforeign')}else await io.link(f.target,alias)}
      return result;
     },
     async write(...args){writes++;return handle.write(...args)}
    });
   };
   await assert.rejects(f.files.atomic(f.target,Buffer.from('PKnew output'),f.original));
   assert(changed);assert.equal(writes,0);assert.equal(await io.readFile(alias,'utf8'),'PKoriginal');
   assert.equal(await io.readFile(f.target,'utf8'),kind==='replacement'?'PKforeign':'PKoriginal');
   if(kind==='replacement')assert.equal(await backupBytes(f),'PKoriginal');else assert(!(await io.readdir(f.directory)).some(name=>name.endsWith('.bak')));
  }finally{await f.cleanup()}
 }
});
