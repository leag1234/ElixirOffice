// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),io=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'windows-replace.test.cjs'),real=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={fixture,bootMain};',{require:n=>n==='node:test'?()=>{}:real(n),module:scope,__dirname,process,console,Buffer,Uint8Array,TextDecoder,URL,setTimeout,clearTimeout,setImmediate,setInterval,clearInterval});
const {fixture}=scope.exports,fault=code=>Object.assign(Error('Injected scanner refusal; PRIVATE sentinel'),{code});
for(const stage of ['initial-stat','initial-fingerprint','second-fingerprint','copy','backup-open','backup-sync','backup-stat','target-stamp','output-fingerprint','cleanup']){
 test('scanner transient at '+stage+' does not fail a valid save',async()=>{
  for(const code of ['EPERM','EBUSY','EACCES']){
   const f=await fixture();let hits=0,committed=false,reads=0;
   try{
    const lstat=f.proxy.lstat.bind(f.proxy),open=f.proxy.open,copy=f.proxy.copyFile.bind(f.proxy),rename=f.proxy.rename,unlink=f.proxy.unlink.bind(f.proxy);
    const fail=()=>{if(hits++===0)throw fault(code)};
    f.proxy.lstat=async(filename,...args)=>{
     if(filename===f.target&&stage==='initial-stat'&&reads===0)fail();
     if(String(filename).endsWith('.bak')&&stage==='backup-stat')fail();
     if(filename===f.target&&stage==='target-stamp'&&reads>=3&&!committed)fail();
     return lstat(filename,...args);
    };
    f.proxy.open=async(filename,...args)=>{
     if(filename===f.target&&args[0]!=='r+'){
      reads++;if(stage==='initial-fingerprint'&&reads===1||stage==='second-fingerprint'&&reads===2||stage==='output-fingerprint'&&committed)fail();
     }
     if(String(filename).endsWith('.bak')&&stage==='backup-open')fail();
     const h=await open(filename,...args);
     if(String(filename).endsWith('.bak')&&stage==='backup-sync')return new Proxy(h,{get(target,key){
      if(key==='sync')return async()=>{fail();return h.sync()};
      const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;
     }});
     return h;
    };
    f.proxy.copyFile=async(...args)=>{if(stage==='copy')fail();return copy(...args)};
    f.proxy.rename=async(...args)=>{const result=await rename(...args);committed=true;return result};
    f.proxy.unlink=async(filename)=>{if(String(filename).endsWith('.bak')&&stage==='cleanup')fail();return unlink(filename)};
    const saved=await f.files.atomic(f.target,Buffer.from('PKchanged'),f.original);
    assert(hits>0,'Injection reached');assert.equal(saved.hash,f.files.hash(Buffer.from('PKchanged')));
    assert.equal(await io.readFile(f.target,'utf8'),'PKchanged');assert.deepEqual(await io.readdir(f.directory),['public.docx']);
   }finally{await f.cleanup()}
  }
 });
}
test('persistent cleanup failure is success, and next save removes only the retained original backup',async()=>{
 const f=await fixture();try{
  const unlink=f.proxy.unlink.bind(f.proxy);let blocked=true;
  f.proxy.unlink=async filename=>{if(blocked&&String(filename).endsWith('.bak'))throw fault('EBUSY');return unlink(filename)};
  const saved=await f.files.atomic(f.target,Buffer.from('PKsaved'),f.original);
  assert.equal(saved.hash,f.files.hash(Buffer.from('PKsaved')));assert.equal(await io.readFile(f.target,'utf8'),'PKsaved');
  const name=(await io.readdir(f.directory)).find(n=>n.endsWith('.bak'));assert(name);assert.equal(await io.readFile(path.join(f.directory,name),'utf8'),'PKoriginal');
  blocked=false;await f.files.atomic(f.target,Buffer.from('PKagain'),await f.files.read(f.target));
  assert.deepEqual(await io.readdir(f.directory),['public.docx']);
 }finally{await f.cleanup()}
});
test('deferred cleanup never removes a substituted backup',async()=>{
 const f=await fixture();try{
  const unlink=f.proxy.unlink.bind(f.proxy);f.proxy.unlink=async filename=>{if(String(filename).endsWith('.bak'))throw fault('EBUSY');return unlink(filename)};
  await f.files.atomic(f.target,Buffer.from('PKsaved'),f.original);
  const name=(await io.readdir(f.directory)).find(n=>n.endsWith('.bak')),backup=path.join(f.directory,name);
  await io.unlink(backup);await io.writeFile(backup,'PKforeign');f.proxy.unlink=unlink;
  await f.files.atomic(f.target,Buffer.from('PKagain'),await f.files.read(f.target));
  assert.equal(await io.readFile(backup,'utf8'),'PKforeign');
 }finally{await f.cleanup()}
});
test('rename and fallback blocked past the shared budget leave edits available for Save As',async()=>{
 const f=await fixture({env:{EO_WINDOWS_SAVE_RETRY_MS:'100'}});try{
  const open=f.proxy.open;f.state.remaining=Infinity;f.state.code='EBUSY';
  f.proxy.open=async(filename,...args)=>{if(filename===f.target&&args[0]==='r+')throw fault('EBUSY');return open(filename,...args)};
  const error=await f.files.atomic(f.target,Buffer.from('PKedits'),f.original).then(()=>assert.fail('Blocked save must fail'),e=>e);
  assert.equal(f.clock.time,100);assert.equal(error.code,'EBUSY');
  assert.match(real('../../desktop/errors.js').message(error),/edits remain open.*Save As with a new name/);
  assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');
 }finally{await f.cleanup()}
});
test('all scanner stages share the original retry deadline and diagnostics expose phases only',async()=>{
 const f=await fixture({env:{EO_WINDOWS_SAVE_RETRY_MS:'100'}});try{
  const events=[];f.files.setDiagnostics(event=>events.push(event));const open=f.proxy.open,copy=f.proxy.copyFile.bind(f.proxy);let reads=0,copies=0;
  f.proxy.open=async(filename,...args)=>{if(filename===f.target&&args[0]!=='r+'&&++reads<=2)throw fault('EBUSY');return open(filename,...args)};
  f.proxy.copyFile=async(...args)=>{copies++;throw fault('EPERM')};
  await assert.rejects(f.files.atomic(f.target,Buffer.from('PKedits'),f.original),e=>e.code==='EPERM');
  assert.equal(f.clock.time,100);assert(events.some(e=>e.step==='target-fingerprint'));assert(events.some(e=>e.step==='backup-copy'));
  assert(!JSON.stringify(events).includes('PRIVATE'));assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');assert(copies>0);
 }finally{await f.cleanup()}
});
test('actual main copies only app-generated diagnostics and rejects iframe or foreign senders',async()=>{
 const f=await fixture();let env;try{
  env=await scope.exports.bootMain(f);
  // Exercise the actual authorized handler; renderer text is ignored.
  await env.invoke('copy-save-diagnostics','PRIVATE renderer text');
  const header=JSON.parse(env.app.copiedDiagnostics.trim().split('\n')[0]);
  assert.equal(header.app,'ElixirOffice');assert(!env.app.copiedDiagnostics.includes('PRIVATE'));assert(header.windowsBuild);
  const handler=env.handlers.get('eo:copy-save-diagnostics');
  assert.throws(()=>handler({sender:{},senderFrame:env.window.webContents.mainFrame}),/desktop start window/);
  assert.throws(()=>handler({sender:env.window.webContents,senderFrame:{url:env.window.webContents.mainFrame.url}}),/desktop start window/);
 }finally{if(env)await env.cleanup();await f.cleanup()}
});
test('successful replacement never deletes a backup substituted before immediate cleanup',async()=>{
 const f=await fixture();try{
  const rename=f.proxy.rename;let foreign;
  f.proxy.rename=async(a,b)=>{await rename(a,b);if(b===f.target){
   const name=(await io.readdir(f.directory)).find(n=>n.endsWith('.bak'));foreign=path.join(f.directory,name);
   await io.unlink(foreign);await io.writeFile(foreign,'PKforeign backup');
  }};
  const saved=await f.files.atomic(f.target,Buffer.from('PKsaved'),f.original);
  assert.equal(saved.hash,f.files.hash(Buffer.from('PKsaved')));assert.equal(await io.readFile(foreign,'utf8'),'PKforeign backup');
 }finally{await f.cleanup()}
});
test('explicit app-close cleanup retries only this process verified retained copy',async()=>{
 const f=await fixture();try{
  const unlink=f.proxy.unlink.bind(f.proxy);f.proxy.unlink=async filename=>{if(String(filename).endsWith('.bak'))throw fault('EBUSY');return unlink(filename)};
  await f.files.atomic(f.target,Buffer.from('PKsaved'),f.original);
  f.proxy.unlink=unlink;await f.files.cleanupBackups();assert.deepEqual(await io.readdir(f.directory),['public.docx']);
 }finally{await f.cleanup()}
});
test('an old scanner-held backup never spends the next save retry budget',async()=>{
 const f=await fixture({env:{EO_WINDOWS_SAVE_RETRY_MS:'100'}});try{
  const unlink=f.proxy.unlink.bind(f.proxy);
  f.proxy.unlink=async name=>{if(String(name).endsWith('.bak'))throw fault('EBUSY');return unlink(name)};
  await f.files.atomic(f.target,Buffer.from('PKfirst'),f.original);
  const old=path.join(f.directory,(await io.readdir(f.directory)).find(n=>n.endsWith('.bak')));
  f.proxy.unlink=async name=>{if(name===old)throw fault('EBUSY');return unlink(name)};
  f.calls.rename=0;f.state.remaining=2;const start=f.clock.time;
  await f.files.atomic(f.target,Buffer.from('PKsecond'),await f.files.read(f.target));
  assert.equal(f.calls.rename,3,'New save still gets both retries');assert.equal(f.clock.time-start,75,'Old cleanup gets no backoff from the new save');
  assert.equal(await io.readFile(f.target,'utf8'),'PKsecond');assert.equal(await io.readFile(old,'utf8'),'PKoriginal');
 }finally{await f.cleanup()}
});
test('backup copy EPERM independently exhausts the budget without mutating the original',async()=>{
 const f=await fixture({env:{EO_WINDOWS_SAVE_RETRY_MS:'100'}});try{
  let calls=0;f.proxy.copyFile=async()=>{calls++;throw fault('EPERM')};
  await assert.rejects(f.files.atomic(f.target,Buffer.from('PKedited'),f.original),e=>e.code==='EPERM'&&e.retryExpired===true&&e.saveStep==='backup-copy');
  assert.equal(f.clock.time,100);assert(calls>1&&calls<8);assert.equal(await io.readFile(f.target,'utf8'),'PKoriginal');assert.deepEqual(await io.readdir(f.directory),['public.docx']);
 }finally{await f.cleanup()}
});
test('new-file target absence is expected and never logged as a save failure',async()=>{
 const f=await fixture();try{
  const events=[];f.files.setDiagnostics(event=>events.push(event));
  await f.files.atomic(path.join(f.directory,'new.docx'),Buffer.from('PKnew'),{absent:true});
  assert(!events.some(e=>e.step==='target-stat'&&e.code==='ENOENT'));
 }finally{await f.cleanup()}
});
