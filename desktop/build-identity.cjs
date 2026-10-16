// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict');
function create(base,channel,number,product,documentserver){
 assert.match(base,/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
 assert(base.split('.').every(n=>Number(n)<=65535),'Version component out of range');
 assert(['rc','final'].includes(channel),'Invalid build channel');
 assert(Number.isInteger(number)&&number>0&&number<=65535,'Invalid build number');
 for(const rev of [product,documentserver])assert.match(rev,/^[a-f0-9]{40}$/);
 const version=base+(channel==='rc'?'-rc.'+number:'');
 return {schema:1,base_version:base,channel,build_number:number,version,
  deb_version:base+(channel==='rc'?'~rc'+number:'-'+number),
  windows_version:base+'.'+number,mac_short_version:base,mac_bundle_version:String(number),
  product_revision:product,documentserver_revision:documentserver};
}
function validate(value){
 assert(value&&typeof value==='object','Missing build identity');
 const expected=create(value.base_version,value.channel,value.build_number,value.product_revision,value.documentserver_revision);
 assert.deepEqual(value,expected,'Inconsistent build identity');return value;
}
function label(identity){
 const v=validate(identity);return v.version+' (build '+v.build_number+', '+v.product_revision.slice(0,12)+')';
}
function verifyPackage(pkg,identity){
 const v=validate(identity);assert.equal(pkg.version,v.version);assert.equal(pkg.build.buildNumber,String(v.build_number));
 assert.equal(pkg.build.buildVersion,v.windows_version);assert.equal(pkg.build.mac.bundleShortVersion,v.mac_short_version);assert.equal(pkg.build.mac.bundleVersion,v.mac_bundle_version);
 return v;
}
function aboutOptions(identity){return {applicationName:'ElixirOffice',applicationVersion:label(identity),version:String(identity.build_number)}}
if(require.main===module){
 const fs=require('node:fs'),path=require('node:path'),root=path.resolve(process.argv[3]||__dirname);
 const command=process.argv[2];
 if(command==='create'){console.log(JSON.stringify(create(...JSON.parse(process.argv[3]))));}
 else{
  const identity=JSON.parse(fs.readFileSync(path.join(root,'build-info.json'),'utf8'));
  verifyPackage(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),identity);
  if(command==='deb')console.log(identity.deb_version);
  else if(command==='verify')console.log('PASS build identity '+label(identity));
  else throw Error('Unknown build identity command');
 }
}
module.exports={create,validate,label,verifyPackage,aboutOptions};
