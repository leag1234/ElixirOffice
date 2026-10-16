// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const product=path.resolve(__dirname,'../..'),load=createRequire(path.join(__dirname,'close-recovery.test.cjs')),helper={exports:{}};
let bootstrap=fs.readFileSync(path.join(__dirname,'close-recovery.test.cjs'),'utf8');
// Frozen0.2.1's unchanged close helper predates the optional preference fixture.
if(!bootstrap.includes('fontSettings')){
 bootstrap=bootstrap.replace('onShow,onPrint}={})','onShow,onPrint,fontSettings}={})').replace(' let window,started=false'," if(fontSettings)await fs.writeFile(path.join(directory,'desktop-settings.json'),JSON.stringify({recents:[],...fontSettings}));\n let window,started=false");
}
vm.runInNewContext(bootstrap+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:helper,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
const {boot}=helper.exports,Errors=require('../../desktop/errors.js'),catalogs=require('../../tools/desktop/i18n-extra.json');
const codes=['EPERM','EACCES','EBUSY','ENOENT','ELOOP','EIO','ENODATA','UNKNOWN'];
const synthetic='/synthetic-private-root/Private.docx';
function fault(code){return Object.assign(Error(code+': denied '+synthetic),{code});}
test('unreadable recent metadata does not block Home or opening an unrelated document',async()=>{
 const stat=fsp.stat;
 for(const code of codes){
  const env=await boot({fontSettings:{recents:[{id:'unreadable',name:'Public fixture.docx',target:synthetic}]}});
  try{
   fsp.stat=async(target,...args)=>{if(target===synthetic)throw fault(code);return stat(target,...args)};
   const home=await env.invoke('home');assert.equal(home.recents.length,1);assert.equal(home.recents[0].modified,null);
   const target=path.join(env.directory,'other.xlsx');await fsp.writeFile(target,'PKpublic-other');
   assert.equal((await env.invoke('drop',target)).sourceFormat,'xlsx');
   await env.flushSafety();const log=await fsp.readFile(path.join(env.directory,'desktop-safety.log'),'utf8');
   assert(log.includes(code),code);assert(!log.includes('Private')&&!log.includes('synthetic-private'));
  }finally{fsp.stat=stat;await env.cleanup()}
 }
});
test('malformed recent entries cannot block Home, recents, or remembering a new document',async()=>{
 const env=await boot({fontSettings:{recents:[null,{}, {id:3,name:'bad',target:synthetic},{id:'bad',name:'bad',target:null},{id:'valid',name:'Public fixture.docx',target:synthetic}]}});
 try{
  assert.equal((await env.invoke('home')).recents.length,1);
  assert.equal((await env.invoke('recents')).length,1);
  const target=path.join(env.directory,'other.docx');await fsp.writeFile(target,'PKpublic-other');
  assert.equal((await env.invoke('drop',target)).sourceFormat,'docx');
 }finally{await env.cleanup()}
});
function reader(platform,stage,code,{transient=false,replaced=false}={}){
 const counts={lstat:0,open:0,read:0,close:0,delays:[],flags:[]};let failed=false;
 const stat=(bigint,ino=1)=>({ino:bigint?BigInt(ino):ino,dev:bigint?1n:1,size:8,mode:0o600,isFile:()=>true,isSymbolicLink:()=>false});
 function inject(at){if(stage===at&&(!transient||!failed)){failed=true;throw fault(code)}}
 const promises={lstat:async()=>{counts.lstat++;inject('lstat');return stat(true,replaced&&failed?2:1)},open:async(_target,flags)=>{counts.open++;counts.flags.push(flags);inject('open');return {stat:async options=>stat(!!options?.bigint,replaced&&failed?2:1),readFile:async()=>{counts.read++;inject('read');return Buffer.from('PKpublic')},close:async()=>{counts.close++}}}};
 const scope={exports:{}},real=createRequire(path.join(product,'desktop/files.cjs'));
 vm.runInNewContext(fs.readFileSync(path.join(product,'desktop/files.cjs'),'utf8'),{module:scope,Buffer,TextDecoder,process:{platform},setTimeout:(fn,ms)=>{counts.delays.push(ms);return setImmediate(fn)},require:name=>name==='node:fs/promises'?promises:real(name)});
 return {read:scope.exports.read,counts};
}
test('all three platform values retry EBUSY once and close read handles; other errors are immediate',async()=>{
 for(const platform of ['win32','darwin','linux'])for(const stage of ['lstat','open','read'])for(const code of codes){
  const {read,counts}=reader(platform,stage,code);await assert.rejects(read(synthetic),error=>error.code===code);
  assert.equal(counts.delays.length,code==='EBUSY'?1:0,platform+'/'+stage+'/'+code);
  assert(counts.delays.every(ms=>ms>0&&ms<=250));assert.equal(counts.close,stage==='read'?(code==='EBUSY'?2:1):0);
  if(platform==='win32')assert(counts.flags.every(flags=>flags===fs.constants.O_RDONLY));
  else assert(counts.flags.every(flags=>(flags&(fs.constants.O_NOFOLLOW||0))===(fs.constants.O_NOFOLLOW||0)));
 }
});
test('transient sharing failures recover; retry does not accept a replacement selected during the delay',async()=>{
 for(const stage of ['lstat','open','read']){
  const {read,counts}=reader('win32',stage,'EBUSY',{transient:true});
  assert.equal((await read(synthetic)).bytes.toString(),'PKpublic');assert.equal(counts.delays.length,1);assert.equal(counts.close,stage==='read'?2:1);
 }
 const probe=reader('win32','open','EBUSY',{transient:true,replaced:true});
 await assert.rejects(probe.read(synthetic),/changed during open/);assert.equal(probe.counts.close,1);
});
test('OPEN messages are localized before Electron serialization and leave SAVE mappings unchanged',()=>{
 for(const platform of ['win32','darwin','linux'])for(const code of codes){
  const strings=catalogs.fr,reason=Errors.openMessage(fault(code),strings,platform);
  assert(reason&&!reason.includes('Private')&&!reason.includes('synthetic-private'));
  assert(!reason.includes('Save As')&&!reason.includes('Enregistrer sous'));
  assert.equal(Errors.message(Error("Error invoking remote method 'eo:drop': Error: "+reason),strings),reason);
 }
 assert.equal(Errors.openMessage(fault('EBUSY'),catalogs.en,'win32'),catalogs.en.openBusy);
 assert.equal(Errors.openMessage(fault('EPERM'),catalogs.en,'darwin'),catalogs.en.openPermissionMac);
 assert.equal(Errors.openMessage(fault('EPERM'),catalogs.en,'win32'),catalogs.en.openUnavailable);
 assert.equal(Errors.openMessage(fault('ENODATA'),catalogs.en,'win32'),catalogs.en.openUnavailable);
 assert.equal(Errors.message(fault('EPERM'),catalogs.fr),catalogs.fr.saveBusy);
 assert.equal(Errors.message(fault('EACCES'),catalogs.fr),catalogs.fr.savePermission);
});
test('all45 catalogs provide translated OPEN guidance and preserve the prior SAVE strings',()=>{
 const keys=['openPermission','openPermissionMac','openBusy','openMissing','openUnavailable','openInvalid','openPath'];
 assert.equal(Object.keys(catalogs).length,45);
 for(const [language,strings]of Object.entries(catalogs))for(const key of keys){
  assert.equal(typeof strings[key],'string',language+'/'+key);assert(strings[key].trim());
  if(language!=='en')assert.notEqual(strings[key],catalogs.en[key],language+'/'+key);
  assert(!/[<>]|\{(?:name|path)\}/.test(strings[key]));
 }
});
test('all user-file entry points sanitize the shared read failure while keeping a later open usable',async()=>{
 const open=fsp.open;
 for(const platform of ['win32','darwin','linux']){
  const env=await boot({platform,fontSettings:{recents:[{id:'private',name:'Public fixture.docx',target:synthetic}]}});
  try{
   const selected=path.join(env.directory,'selected.docx');await fsp.writeFile(selected,'PKpublic-selected');
   await env.invoke('drop',selected);const id=(await env.invoke('recents'))[0].id;
   fsp.open=async(target,...args)=>{if(target===selected)throw fault('EPERM');return open(target,...args)};
   for(const route of [['drop',selected],['recent',id]]){
    const failure=await env.invoke(...route).then(()=>assert.fail('Open must fail'),e=>e);
    assert.equal(failure.message,Errors.openMessage(fault('EPERM'),catalogs.en,platform));
   }
   const target=path.join(env.directory,'other.docx');await fsp.writeFile(target,'PKpublic-other');assert((await env.invoke('drop',target)).token);
   await env.flushSafety();const log=await fsp.readFile(path.join(env.directory,'desktop-safety.log'),'utf8');
   assert(log.includes('EPERM'));assert(!log.includes('Private')&&!log.includes('synthetic-private'));
  }finally{fsp.open=open;await env.cleanup()}
 }
 const main=fs.readFileSync(path.join(product,'desktop/main.cjs'),'utf8');
 for(const name of ['initial','open','drop','saved-open','recent']){
  const a=main.indexOf("handle('"+name+"',"),b=main.indexOf("\n  handle(",a+1);
  assert(main.slice(a,b<0?undefined:b).includes('select('),name+' must share select');
 }
});
test('existing safety log records bounded allowlisted filesystem codes, never arbitrary error text',async()=>{
 const os=require('node:os'),dir=await fsp.mkdtemp(path.join(os.tmpdir(),'eo-open-log-')),logger=require('../../desktop/safety-log.cjs').create(dir);
 try{
  for(const code of codes)await logger.log(code);
  await logger.log('EPERM '+synthetic);await logger.flush();
  const log=await fsp.readFile(path.join(dir,'desktop-safety.log'),'utf8');
  for(const code of codes)assert(log.includes(' '+code+'\n'),code);
  assert(!log.includes('Private')&&!log.includes('synthetic-private'));
 }finally{await fsp.rm(dir,{recursive:true,force:true})}
});
