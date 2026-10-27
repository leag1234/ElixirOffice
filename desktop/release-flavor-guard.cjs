// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Build-time defense: ordinary release packaging never consumes a QA source.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PRODUCTION_TRUST_SHA256='051c549fd041b9623b4bfc373cbfbae08e959bb7603f3f5a669641399cd39949';
function assertNoQATrust(value){
 if(typeof value==='string'&&value.startsWith('eo-qa-'))throw Error('QA trust cannot enter an ordinary release');
 if(value&&typeof value==='object')for(const child of Object.values(value))assertNoQATrust(child);
 return true;
}
function assertProductionTrust(bytes){
 // Never execute candidate trust code; the approved production root is fixed.
 if(!Buffer.isBuffer(bytes)||bytes.length>16384||crypto.createHash('sha256').update(bytes).digest('hex')!==PRODUCTION_TRUST_SHA256)
  throw Error('QA or unreviewed production trust refused');
 return true;
}
function productionTrust(root){
 const file=path.join(root,'update-production-trust.cjs'),C=fs.constants,fd=fs.openSync(file,C.O_RDONLY|C.O_NOFOLLOW|C.O_NONBLOCK);
 try{
  const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size<1||s.size>16384)throw Error('Unsafe production trust source');
  const bytes=fs.readFileSync(fd),after=fs.fstatSync(fd),actual=fs.lstatSync(file);
  if(actual.isSymbolicLink()||bytes.length!==s.size||[after,actual].some(v=>['dev','ino','size','mtimeMs','ctimeMs'].some(k=>v[k]!==s[k])))
   throw Error('Production trust source changed');
  return assertProductionTrust(bytes);
 }finally{fs.closeSync(fd);}
}
function assertOrdinary(root){
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assertNoQATrust(pkg);
 if(pkg.name==='elixiroffice-update-qa'||pkg.main?.startsWith('qa/')||pkg.build?.appId==='org.elixiroffice.desktop.updateqa'||
  pkg.build?.productName==='ElixirOffice Update QA'||Object.hasOwn(pkg,'qaIdentity')||/^0\.0\.0(?:-|$)/.test(pkg.version)||Object.hasOwn(pkg,'qaManifestSha256')||
  fs.existsSync(path.join(root,'qa'))||fs.existsSync(path.join(root,'QA-DO-NOT-PUBLISH.json')))throw Error('QA flavor cannot be packaged as an ordinary release');
 productionTrust(root);return true;
}
module.exports={assertOrdinary,assertNoQATrust,assertProductionTrust};
