// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict');
function verify(records,identity,installer=false){
 require('../../desktop/build-identity.cjs').validate(identity);
 assert(records.length,'PE has no version resources');
 const parts=identity.windows_version.split('.').map(Number),ms=parts[0]*65536+parts[1],ls=parts[2]*65536+parts[3];
 for(const record of records){
  for(const prefix of ['file','product']){assert.equal(record.fixedInfo[prefix+'VersionMS']>>>0,ms>>>0);assert.equal(record.fixedInfo[prefix+'VersionLS']>>>0,ls>>>0);}
  const languages=record.getAllLanguagesForStringValues();assert(languages.length,'PE version strings missing');
  for(const language of languages){
   const text=record.getStringValues(language);
   assert.equal(text.FileVersion,identity.windows_version);
   assert.equal(text.ProductVersion,installer?identity.version:identity.windows_version);
  }
 }
}
if(require.main===module){
 const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'../..'),load=require('node:module').createRequire(path.join(root,'desktop/node_modules/app-builder-lib/package.json'));
 const pe=load('pe-library'),res=load('resedit'),file=process.argv[2];assert(file);
 const executable=pe.NtExecutable.from(fs.readFileSync(file),{ignoreCert:true});
 verify(res.Resource.VersionInfo.fromEntries(pe.NtExecutableResource.from(executable).entries),require(path.join(root,'desktop/build-info.json')),process.argv[3]==='installer');
 console.log('PASS Windows fixed and string version resources');
}
module.exports={verify};
