// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),io=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),helper=path.join(__dirname,'windows-resilience.test.cjs'),real=createRequire(helper),scope={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8')+'\nmodule.exports={virtualWindows,moduleFor,fontBytes};',{require:n=>n==='node:test'?()=>{}:real(n),module:scope,__dirname,process,console,Buffer,Uint8Array,TextDecoder,URL,setTimeout,clearTimeout,setImmediate,AbortController});
const {virtualWindows,moduleFor,fontBytes}=scope.exports;
test('per-user and exact registry-installed fonts remain usable when the system folder and another registered file are denied',async()=>{
 const virtual=await virtualWindows();try{
  const system='C:\\Windows\\Fonts',user='C:\\Users\\Public\\AppData\\Local\\Microsoft\\Windows\\Fonts',custom='D:\\Registered';
  await virtual.put(system+'\\system.ttf',fontBytes('System'));await virtual.put(user+'\\user.ttf',fontBytes('Public User'));
  await virtual.put(custom+'\\registered.ttf',fontBytes('Registered'));await virtual.put(custom+'\\not-registered.ttf',fontBytes('Private Sibling'));await virtual.put(custom+'\\locked.ttf',fontBytes('Locked'));
  virtual.injections.push({name:'readdir',target:system,code:'EACCES'},{name:'readFile',target:custom+'\\locked.ttf',code:'EPERM'});
  const reports=[],{Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts({report:e=>reports.push(e.code),registry:async()=>[custom+'\\registered.ttf',custom+'\\locked.ttf']});
  const faces=await fonts.enumerate();assert(faces.some(f=>f.family==='Public User'));assert(faces.some(f=>f.family==='Registered'));assert(!faces.some(f=>f.family==='Private Sibling'));assert(!faces.some(f=>f.family==='Locked'));
  assert((await fonts.read(faces.find(f=>f.family==='Registered').id)).byteLength>0);assert(reports.includes('EACCES'));assert(reports.includes('EPERM'));
  assert(!virtual.calls.some(c=>c.name==='readdir'&&c.value===custom),'Registry approval must never expand into a parent-folder scan');
 }finally{await virtual.cleanup()}
});
test('a failed registry source cannot discard readable roots and an entirely unreadable set remains empty',async()=>{
 const virtual=await virtualWindows();try{
  const user='C:\\Users\\Public\\AppData\\Local\\Microsoft\\Windows\\Fonts';await virtual.put(user+'\\user.ttf',fontBytes('Public User'));
  const reports=[],{Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts({report:e=>reports.push(e.code),registry:async()=>{throw Object.assign(Error('Private registry detail'),{code:'EACCES'})}});
  assert.equal((await fonts.enumerate()).length,1);assert(reports.includes('EACCES'));
  virtual.injections.push({name:'readdir',target:user,code:'EPERM'});assert.equal((await fonts.enumerate()).length,0);assert.equal(fonts.files.size,0);
 }finally{await virtual.cleanup()}
});
function registryModule(response,{platform='win32',error,env={},steps}={}){
 const filename=path.join(root,'desktop/font-registry.cjs'),load=createRequire(filename),module={exports:{}},calls=[];
 const execFile=(file,args,options,callback)=>{calls.push({file,args,options});setImmediate(()=>{const step=steps?.[calls.length-1]||{error,response};callback(step.error,step.response,'')});};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:n=>n==='node:child_process'?{execFile}:load(n),process:{platform,env:{WINDIR:'C:\\Windows',LOCALAPPDATA:'C:\\Users\\Public\\AppData\\Local',...env}},Buffer,setTimeout,clearTimeout});
 return {discover:module.exports,calls};
}
test('registry discovery is a bounded static read-only query and filters each returned exact font path',async()=>{
 const reports=[],input={files:['public.ttf','D:\\Custom Fonts\\Installed.ttf','%LOCALAPPDATA%\\Microsoft\\Windows\\Fonts\\User.otf','D:\\Custom Fonts\\bad.exe','..\\escape.ttf','D:relative.ttf',String.raw`\\server\share\remote.ttf`,String.raw`\\?\C:\device.ttf`,String.raw`\\.\C:\device.ttf`,'D:\\Fonts\\public.ttf:stream.ttf',null],errors:['EACCES','arbitrary private text']};
 const {discover,calls}=registryModule(JSON.stringify(input)),files=await discover({report:e=>reports.push(e.code)});
 assert.deepEqual(Array.from(files),['C:\\Windows\\Fonts\\public.ttf','D:\\Custom Fonts\\Installed.ttf','C:\\Users\\Public\\AppData\\Local\\Microsoft\\Windows\\Fonts\\User.otf']);
 assert.equal(calls.length,1);assert.equal(calls[0].options.windowsHide,true);assert(calls[0].options.timeout<=3000);assert(calls[0].options.maxBuffer<=1024*1024);assert(!calls[0].options.shell);
 const args=calls[0].args;assert(args.includes('-NoProfile'));assert(args.includes('-NonInteractive'));
 assert(args.includes('-Command'));const script=args[args.indexOf('-Command')+1];
 assert(script.includes('LocalMachine'));assert(script.includes('CurrentUser'));assert(script.includes('OpenSubKey'));assert(!/Set-Item|Remove-Item|CreateSubKey|SetValue/.test(script));assert(!script.includes('Custom Fonts'));
 assert(reports.includes('EACCES'));assert(reports.every(code=>/^(?:E[A-Z0-9_]+|UNKNOWN)$/.test(code)));
});
test('registry command failures and malformed output are code-only failures; other platforms never run the command',async()=>{
 for(const input of [{response:'not-json'},{response:'{}'},{response:'',error:Object.assign(Error('Private path'),{code:'EPERM'})}]){
  const reports=[],{discover}=registryModule(input.response,{error:input.error});assert.equal((await discover({report:e=>reports.push(e.code)})).length,0);assert(reports.length);assert(reports.every(code=>/^(?:E[A-Z0-9_]+|UNKNOWN)$/.test(code)));
 }
 for(const platform of ['linux','darwin']){
  const {discover,calls}=registryModule('',{platform});assert.equal((await discover()).length,0);assert.equal(calls.length,0);
 }
});

test('registry and ordinary roots share one font entry without scanning registry parent folders',async()=>{
 const virtual=await virtualWindows();try{
  const filename='C:\\Windows\\Fonts\\public.ttf';await virtual.put(filename,fontBytes());
  const {Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts({registry:async()=>[filename,filename]});
  assert.equal((await fonts.enumerate()).length,1);assert.equal(fonts.files.size,1);
 }finally{await virtual.cleanup()}
});

test('blocked PowerShell falls back to bounded read-only reg.exe queries of both hives, including Unicode paths',async()=>{
 const user=String.raw`D:\Registered\École.ttf`,machine=String.raw`D:\登録\Font.ttf`;
 const output=value=>Buffer.from('HKEY_LOCAL_MACHINE\\Fonts\r\n    Friendly Name    REG_SZ    '+value+'\r\n','utf8');
 const wide=Buffer.concat([Buffer.from([255,254]),Buffer.from('HKEY_LOCAL_MACHINE\\Fonts\r\n    Local Name    REG_EXPAND_SZ    '+machine+'\r\n','utf16le')]);
 const reports=[],{discover,calls}=registryModule('',{steps:[{error:Object.assign(Error('Private blocked PowerShell'),{code:'EACCES'})},{response:output(user)},{response:wide}]});
 assert.deepEqual(Array.from(await discover({report:e=>reports.push(e.code)})),[user,machine]);assert.equal(calls.length,3);
 for(const call of calls.slice(1)){assert.equal(call.file,String.raw`C:\Windows\System32\reg.exe`);assert.equal(call.args[0],'query');assert(call.options.timeout<=700);assert(!call.options.shell)}
 assert.deepEqual(calls.slice(1).map(call=>call.args[1]),[String.raw`HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`,String.raw`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`]);assert(reports.includes('EACCES'));
});
test('reg.exe keeps a healthy hive when another fails and filters unsafe values without a shell',async()=>{
 const reports=[],{discover,calls}=registryModule('not-json',{steps:[{response:'not-json'},{error:Object.assign(Error('Private inaccessible hive'),{code:'EPERM'})},{response:'HKEY_LOCAL_MACHINE\\Fonts\n    Valid    REG_SZ    public.ttf\n    Unsafe    REG_SZ    \\\\server\\share\\private.ttf\n    Variable    REG_EXPAND_SZ    %LOCALAPPDATA%\\Microsoft\\Windows\\Fonts\\User.otf\n    NotFont    REG_DWORD    1\n'}]});
 assert.deepEqual(Array.from(await discover({report:e=>reports.push(e.code)})),[String.raw`C:\Windows\Fonts\public.ttf`,String.raw`C:\Users\Public\AppData\Local\Microsoft\Windows\Fonts\User.otf`]);assert.equal(calls.length,3);assert(reports.includes('EPERM'));assert(reports.every(value=>/^(?:E[A-Z0-9_]+|UNKNOWN)$/.test(value)));
});
test('invalid legacy-encoded query data is rejected rather than interpreted as a different font path',async()=>{
 const reports=[],{discover}=registryModule('',{steps:[{error:Object.assign(Error('Blocked'),{code:'EPERM'})},{response:Buffer.concat([Buffer.from([255,128,129]),Buffer.from('\n    Valid    REG_SZ    public.ttf\n')])},{response:'HKEY_LOCAL_MACHINE\\Fonts\n'}]});
 assert.deepEqual(Array.from(await discover({report:e=>reports.push(e.code)})),[String.raw`C:\Windows\Fonts\public.ttf`]);assert(reports.includes('EINVAL'));
});
