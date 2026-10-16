// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),load=createRequire(path.join(root,'desktop/main.cjs'));
const fault=code=>Object.assign(Error(code+': synthetic filesystem failure'),{code});
const windows=value=>typeof value==='string'&&/^(?:[a-z]:[\\/]|\\\\)/i.test(value);
const hybrid=Object.assign({},path);
for(const name of ['resolve','join','dirname','basename','extname','parse','relative','isAbsolute','normalize'])hybrid[name]=(...args)=>(args.some(windows)?path.win32:path)[name](...args);
function uncNormal(value){return path.win32.resolve(value).replace(/^\\\\\?\\UNC\\/i,'\\\\').replace(/^\\\\\?\\/,'').toLowerCase();}
async function virtualWindows(){
 const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'eo-win-paths-')),calls=[],injections=[];
 function translate(value){
  if(!windows(value))return value;
  const normalized=uncNormal(value),parts=normalized.replace(/^\\\\/,'unc\\').replace(/^([a-z]):/,'drive-$1').split(/[\\/]+/).filter(Boolean);
  assert(parts.every(part=>part!=='.'&&part!=='..'));return path.join(directory,...parts);
 }
 const io=Object.create(fsp);
 for(const name of ['lstat','stat','readFile','readdir','mkdir','unlink','chmod','access'])io[name]=async(value,...args)=>{
  if(windows(value)){
   calls.push({name,value});const injection=injections.find(item=>item.name===name&&(!item.target||uncNormal(item.target)===uncNormal(value)));
   if(injection)throw fault(injection.code);
  }
  return fsp[name](translate(value),...args);
 };
 for(const name of ['rename','copyFile','link'])io[name]=async(from,to,...args)=>fsp[name](translate(from),translate(to),...args);
 io.open=async(value,...args)=>{
  if(windows(value)){calls.push({name:'open',value,flags:args[0]});const injection=injections.find(item=>item.name==='open'&&(!item.target||uncNormal(item.target)===uncNormal(value)));if(injection)throw fault(injection.code)}
  return fsp.open(translate(value),...args);
 };
 io.realpath=async value=>{
  if(!windows(value))return fsp.realpath(value);
  calls.push({name:'realpath',value});const injection=injections.find(item=>item.name==='realpath'&&(!item.target||uncNormal(item.target)===uncNormal(value)));if(injection)throw fault(injection.code);
  await fsp.realpath(translate(value));return state.canonicalCase?path.win32.resolve(value).toUpperCase():path.win32.resolve(value);
 };
 const state={io,calls,injections,directory,translate,canonicalCase:false,async put(value,bytes){await fsp.mkdir(path.dirname(translate(value)),{recursive:true});await fsp.writeFile(translate(value),bytes)},async cleanup(){await fsp.rm(directory,{recursive:true,force:true})}};
 return state;
}
function moduleFor(name,io,pathApi=hybrid,overrides={}){
 const filename=path.join(root,'desktop',name),real=createRequire(filename),scope={exports:{}};
 const input=n=>n==='node:fs/promises'?io:n==='node:path'?pathApi:n==='node:fs'?{...fs,constants:{...fs.constants,O_NOFOLLOW:undefined}}:Object.hasOwn(overrides,n)?overrides[n]:real(n);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:scope,require:input,process:{platform:'win32',env:{WINDIR:'C:\\Windows',LOCALAPPDATA:'C:\\Users\\Public\\AppData\\Local'},getuid:process.getuid},Buffer,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,console});
 return scope.exports;
}
async function bootWin(virtual,options={}){
 const realFiles=load('./files.cjs'),winFiles=moduleFor('files.cjs',virtual.io,path.win32),proxy={...realFiles};
 for(const name of ['read','fingerprint','atomic','rename'])proxy[name]=(...args)=>(windows(typeof args[0]==='string'?args[0]:args[0]?.target)?winFiles:realFiles)[name](...args);
 proxy.extension=value=>(windows(value)?winFiles:realFiles).extension(value);
 const modules={
  './files.cjs':proxy,
  './recent-files.cjs':moduleFor('recent-files.cjs',virtual.io),
  './save-as.cjs':moduleFor('save-as.cjs',virtual.io,hybrid,{'./files.cjs':proxy}),
  './artifacts.cjs':moduleFor('artifacts.cjs',virtual.io,hybrid,{'./files.cjs':proxy})
 };
 const helper=path.join(__dirname,'close-recovery.test.cjs'),scope={exports:{}};
 let source=fs.readFileSync(helper,'utf8');
 source=source.replace("setPath(){},getPath:()=>directory","setPath(name,value){this.paths=this.paths||{};this.paths[name]=value},getPath:name=>app.paths?.[name]||(app.nativeName?'"+'RENAMED_PROFILE'+"':directory)");
 source=source.replace("getVersion:()=>","setName(value){this.nativeName=value},getName(){return this.nativeName||'elixiroffice-desktop'},getVersion:()=>");
 source=source.replace("return {directory,window,","return {evaluate:expression=>vm.runInNewContext(expression,context),directory,window,");
 source=source.replace(":load(name),module:",":override(name,load),module:");
 const override=(name,real)=>name==='node:fs/promises'?virtual.io:name==='node:path'?hybrid:Object.hasOwn(modules,name)?modules[name]:real(name);
 vm.runInNewContext(source+'\nmodule.exports={boot};',{require:n=>n==='node:test'?()=>{}:load(n),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate,override});
 return scope.exports.boot({platform:'win32',...options});
}
test('a rejected preference write remains visible to its caller but cannot poison the queue drain',async()=>{
 const folder=await fsp.mkdtemp(path.join(os.tmpdir(),'eo-win-preferences-')),files=load('./files.cjs'),atomic=files.atomic;
 try{
  const preferences=load('./settings-store.cjs')(folder);
  for(const code of ['EPERM','EBUSY','EACCES','UNKNOWN','ENOTSUP']){
   files.atomic=async()=>{throw fault(code)};await assert.rejects(preferences.save({recents:[]}),e=>e.code===code);
   await assert.doesNotReject(preferences.flush());
  }
  files.atomic=atomic;await preferences.save({recents:[],revision:2});await preferences.flush();
  assert.equal(JSON.parse(await fsp.readFile(path.join(folder,'desktop-settings.json'))).revision,2);
 }finally{files.atomic=atomic;await fsp.rm(folder,{recursive:true,force:true})}
});
test('Windows UNC metadata errors cannot poison Home, later opens, return Home, or save-time recents',async()=>{
 const virtual=await virtualWindows();let env;const rename=fsp.rename;
 try{
  const source='\\\\server\\share\\Documents\\public.xlsx';await virtual.put(source,'PKpublic-workbook');env=await bootWin(virtual);
  const selected=await env.invoke('drop',source);assert.equal(selected.name,'public.xlsx');
  for(const code of ['EPERM','EBUSY','EACCES','UNKNOWN','ENOTSUP']){
   virtual.injections.push({name:'stat',target:source,code});
   const home=await env.invoke('home');assert.equal(home.recents.find(item=>item.name==='public.xlsx').modified,null);virtual.injections.length=0;
   fsp.rename=async(a,b)=>{if(String(b).endsWith('desktop-settings.json'))throw fault(code);return rename(a,b)};
   // A failed optional preference write is observed by its own caller.
   await assert.rejects(env.invoke('font-dismiss'),e=>e.code===code);
   await assert.doesNotReject(env.invoke('return-home'));
   assert.equal((await env.invoke('drop',source)).name,'public.xlsx');
   const current=await env.invoke('new','xlsx'),destination=code==='EPERM'?'C:\\Public\\local.xlsx':'\\\\server\\share\\Saved\\'+code+'.xlsx';
   await fsp.mkdir(path.dirname(virtual.translate(destination)),{recursive:true});
   env.saveResponses.push({canceled:false,filePath:destination});
   const ticket=await env.invoke('save-as-choose',current.token,'xlsx');
   const saved=await env.invoke('save',current.token,new Uint8Array(Buffer.from('PKpublic-saved')),false,{protected:false,remove:false},undefined,ticket.ticket);
   assert.equal(saved.preferencesSaved,false);assert(saved.artifactId);assert.equal(await fsp.readFile(virtual.translate(destination),'utf8'),'PKpublic-saved');
   await assert.doesNotReject(env.invoke('home'));await assert.doesNotReject(env.invoke('return-home'));
   fsp.rename=rename;
  }
  assert.equal(await fsp.readFile(virtual.translate(source),'utf8'),'PKpublic-workbook');
 }finally{fsp.rename=rename;if(env)await env.cleanup();await virtual.cleanup()}
});
test('UNC, extended UNC and mapped-drive reads/saves preserve identity and Windows no-follow policy',async()=>{
 const virtual=await virtualWindows(),files=moduleFor('files.cjs',virtual.io,path.win32);
 try{
  for(const target of ['\\\\server\\share\\Documents\\public.docx','\\\\?\\UNC\\server\\share\\Documents\\extended.xlsx','Z:\\Documents\\mapped.pptx','\\\\?\\Z:\\Documents\\extended.docx']){
   await virtual.put(target,'PKpublic-original');const opened=await files.read(target);assert.equal(opened.bytes.toString(),'PKpublic-original');
   virtual.canonicalCase=true;const saved=await files.atomic(target,Buffer.from('PKpublic-saved'),opened);assert.equal(saved.bytes,14);
   const canonical=await files.read(target),alias=await files.read(target+'\\');
   assert.equal(canonical.bytes.toString(),'PKpublic-saved');
   for(const key of ['target','hash','inode','device'])assert.equal(alias[key],canonical[key],key);
   assert.deepEqual(alias.bytes,canonical.bytes);virtual.canonicalCase=false;
  }
  assert(virtual.calls.filter(c=>c.name==='open').every(c=>c.flags!==undefined));
  assert(virtual.calls.filter(c=>c.name==='open'&&typeof c.flags==='number').every(c=>(c.flags&(fs.constants.O_NOFOLLOW||0))===0));
 }finally{await virtual.cleanup()}
});
test('UNC read denials stay OPEN errors; real destination denials stay failed writes with originals intact',async()=>{
 const virtual=await virtualWindows(),files=moduleFor('files.cjs',virtual.io,path.win32),errors=load('./errors.js');
 try{
  const target='\\\\server\\share\\Documents\\public.docx';await virtual.put(target,'PKpublic-original');
  for(const code of ['EPERM','EBUSY','EACCES','UNKNOWN','ENOTSUP']){
   for(const name of ['lstat','open']){
    virtual.injections.push({name,target,code});const failure=await files.read(target).then(()=>assert.fail('Read denial must fail'),e=>e);
    assert.equal(failure.code,code);assert.notEqual(errors.openMessage(failure,{},'win32'),errors.fallback.saveBusy);virtual.injections.length=0;
   }
   virtual.injections.push({name:'realpath',code});await assert.rejects(files.atomic(target,Buffer.from('PKchanged')),e=>e.code===code);virtual.injections.length=0;
   assert.equal(await fsp.readFile(virtual.translate(target),'utf8'),'PKpublic-original');
  }
 }finally{await virtual.cleanup()}
});
function fontBytes(family='Public Sans',offset=0){
 const familyBytes=Buffer.from(family,'utf16le').swap16(),style=Buffer.from('Regular','utf16le').swap16(),bytes=Buffer.alloc(offset+58+familyBytes.length+style.length);
 bytes.writeUInt16BE(1,offset+4);bytes.write('name',offset+12);bytes.writeUInt32BE(offset+28,offset+20);
 bytes.writeUInt16BE(2,offset+30);bytes.writeUInt16BE(30,offset+32);
 for(const [i,id,value,start]of [[0,1,familyBytes,0],[1,2,style,familyBytes.length]]){
  const at=offset+34+12*i;bytes.writeUInt16BE(3,at);bytes.writeUInt16BE(0x409,at+4);bytes.writeUInt16BE(id,at+6);bytes.writeUInt16BE(value.length,at+8);bytes.writeUInt16BE(start,at+10);value.copy(bytes,offset+58+start);
 }
 return bytes;
}
test('Windows fonts tolerate unreadable roots/files and bad TTC faces, with per-user fonts still usable',async()=>{
 const virtual=await virtualWindows();
 try{
  const system='C:\\Windows\\Fonts',user='C:\\Users\\Public\\AppData\\Local\\Microsoft\\Windows\\Fonts';
  await virtual.put(system+'\\good.ttf',fontBytes());await virtual.put(system+'\\locked.otf',fontBytes('Locked'));
  await virtual.put(system+'\\ignored.fon',Buffer.from('unsupported bitmap'));
  await virtual.put(system+'\\protected\\inside.ttf',fontBytes('Hidden'));await virtual.put(user+'\\user.ttf',fontBytes('Public User Sans'));
  const collection=fontBytes('Collection Sans',64);collection.write('ttcf');collection.writeUInt32BE(2,8);collection.writeUInt32BE(4096,12);collection.writeUInt32BE(64,16);
  await virtual.put(user+'\\partial.ttc',collection);
  virtual.injections.push({name:'readFile',target:system+'\\locked.otf',code:'EPERM'},{name:'readdir',target:system+'\\protected',code:'EBUSY'});
  const {Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts(),faces=await fonts.enumerate();
  assert(faces.some(face=>face.family==='Public Sans'));assert(faces.some(face=>face.family==='Public User Sans'));assert(faces.some(face=>face.family==='Collection Sans'));assert(!faces.some(face=>face.family==='Locked'));
  assert(!virtual.calls.some(call=>call.name==='readFile'&&call.value.endsWith('.fon')));
  const good=faces.find(face=>face.family==='Public User Sans');assert((await fonts.read(good.id)).byteLength>0);
  virtual.injections.push({name:'readdir',target:system,code:'EPERM'});assert((await fonts.enumerate()).some(face=>face.family==='Public User Sans'));
 }finally{await virtual.cleanup()}
});
test('Windows font containment treats case and extended prefixes as aliases without allowing sibling escapes',async()=>{
 const virtual=await virtualWindows();
 try{
  await virtual.put('C:\\Windows\\Fonts\\public.ttf',fontBytes());virtual.canonicalCase=true;
  const {Fonts}=moduleFor('fonts.cjs',virtual.io,path.win32),fonts=new Fonts(),faces=await fonts.enumerate();
  assert.equal(faces.length,1);assert((await fonts.read(faces[0].id)).byteLength>0);
  virtual.canonicalCase=false;assert((await fonts.read(faces[0].id)).byteLength>0);
  fonts.allowed=['\\\\?\\C:\\Windows\\Fonts'];const extended=await fonts.enumerate();assert.equal(extended.length,1);assert((await fonts.read(extended[0].id)).byteLength>0);
  fonts.files.set('outside',{real:'C:\\Windows\\Fonts-other\\private.ttf',offset:0});await virtual.put('C:\\Windows\\Fonts-other\\private.ttf',fontBytes('Outside'));
  await assert.rejects(fonts.read('outside'),/outside approved/);
 }finally{await virtual.cleanup()}
});
test('native app/consent identity is ElixirOffice while the existing default profile is retained',async()=>{
 const virtual=await virtualWindows();let env;
 try{
  env=await bootWin(virtual);assert.equal(env.app.getName(),'ElixirOffice');assert.equal(env.app.getPath('userData'),env.directory);
  env.responses.push(0);assert.equal(await env.invoke('font-consent'),false);assert.equal(env.dialogs.at(-1).title,'ElixirOffice');
 }finally{if(env)await env.cleanup();await virtual.cleanup()}
});
