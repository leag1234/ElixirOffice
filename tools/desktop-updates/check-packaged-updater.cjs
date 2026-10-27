// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Host-only inventory checker; no artifact code, installer or runtime executes.
const crypto=require('node:crypto');
const {assertNoQATrust,assertProductionTrust}=require('../../desktop/release-flavor-guard.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fail(){throw Error('Packaged updater dependency refused');}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
function inspectPackage({files,read,source,inventory}){
 if(!Array.isArray(files)||!Array.isArray(inventory)||typeof read!=='function')fail();
 const names=new Set();
 for(const n of files){
  if(typeof n!=='string'||!n||n.startsWith('/')||n.includes('\\')||n.split('/').some(p=>!p||p==='.'||p==='..')||names.has(n)||/^tools\/desktop-updates\//.test(n))fail();
  names.add(n);
 }
 function bytes(n){
  if(!names.has(n))fail();const b=read(n);
  if(!Buffer.isBuffer(b)||b.length<1||b.length>128*1024)fail();return b;
 }
 function json(n){try{return JSON.parse(bytes(n).toString('utf8'));}catch{fail();}}
 assertProductionTrust(bytes('update-production-trust.cjs'));
 if(!source||source.package?.name!=='@elixiroffice/lazy-val-shim'||source.package.license!=='AGPL-3.0-only'||!Buffer.isBuffer(source.code)||!Buffer.isBuffer(source.license))fail();
 const expected=new Map(inventory.filter(p=>p.name!=='lazy-val').map(p=>[p.name,p]));
 const seen=new Set(),manifests=[],byDir=new Map();let shimInstances=0;
 for(const n of [...names].sort()){
  if(n!=='package.json'&&!n.endsWith('/package.json'))continue;
  const p=json(n),dir=n.slice(0,-'package.json'.length);assertNoQATrust(p);
  if(!p||typeof p!=='object'||typeof p.name!=='string'||typeof p.version!=='string')fail();
  manifests.push({path:n,name:p.name,version:p.version,license:p.license});
  byDir.set(dir.replace(/\/$/,''),p);
  if(n==='package.json')continue;
  if(['lazy-val','electron-builder','app-builder-lib'].includes(p.name))fail();
  if(p.name===source.package.name){
   if(JSON.stringify(canonical(p))!==JSON.stringify(canonical(source.package))||
      !bytes(dir+'index.cjs').equals(source.code)||!bytes(dir+'LICENSE').equals(source.license))fail();
   shimInstances++;continue;
  }
  const pin=expected.get(p.name);
  if(!pin||p.version!==pin.version||p.license!==pin.license||!pin.notice_files?.length)fail();
  for(const notice of pin.notice_files){
   if(typeof notice.member!=='string'||!notice.member.startsWith('package/')||!/^[a-f0-9]{64}$/.test(notice.sha256))fail();
   const suffix=notice.member.slice('package/'.length);
   if(sha(bytes(dir+suffix))!==notice.sha256)fail();
  }
  seen.add(p.name);
 }
 if(seen.size!==expected.size||!shimInstances||byDir.get('node_modules/electron-updater')?.version!=='6.8.9')fail();
 const lazyDirectory=['node_modules/electron-updater/out/node_modules/lazy-val','node_modules/electron-updater/node_modules/lazy-val','node_modules/lazy-val'].find(n=>byDir.has(n));
 if(!lazyDirectory||byDir.get(lazyDirectory).name!==source.package.name)fail();
 return Object.freeze({updaterVersion:'6.8.9',lazyDirectory,shimSha256:sha(source.code),shimLicenseSha256:sha(source.license),shimInstances,manifests:Object.freeze(manifests)});
}
function checkPackaged({desktop,asarFile,toolchain=desktop}){
 const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
 const load=createRequire(path.resolve(toolchain,'package.json')),asar=load('@electron/asar');
 const sourceDir=path.resolve(desktop,'vendor/lazy-val-shim');
 const source={package:JSON.parse(fs.readFileSync(path.join(sourceDir,'package.json'),'utf8')),
  code:fs.readFileSync(path.join(sourceDir,'index.cjs')),license:fs.readFileSync(path.join(sourceDir,'LICENSE'))};
 const inventory=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/reviews/electron-updater-6.8.9.json'),'utf8')).packages;
 const files=asar.listPackage(asarFile).map(n=>n.replace(/^\//,'')).filter(Boolean);
 const result=inspectPackage({files,source,inventory,read(n){
  const stat=asar.statFile(asarFile,n);
  if(!Number.isSafeInteger(stat.size)||stat.size<1||stat.size>128*1024||stat.unpacked||stat.link)fail();
  return asar.extractFile(asarFile,n);
 }});
 const resources=path.dirname(path.resolve(asarFile));
 if(fs.readdirSync(resources).includes('app-update.yml'))fail();
 return result;
}
if(require.main===module){
 try{
  const args=process.argv.slice(2),options={};
  if(args.length%2)fail();
  for(let i=0;i<args.length;i+=2){
   if(!['--desktop','--asar','--toolchain'].includes(args[i])||Object.hasOwn(options,args[i]))fail();
   options[args[i]]=args[i+1];
  }
  if(!options['--desktop']||!options['--asar'])fail();
  console.log(JSON.stringify(checkPackaged({desktop:options['--desktop'],asarFile:options['--asar'],toolchain:options['--toolchain']}),null,2));
 }catch{process.stderr.write('Packaged updater dependency refused.\n');process.exitCode=1;}
}
module.exports={inspectPackage,checkPackaged};
