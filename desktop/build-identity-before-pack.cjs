// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
module.exports=async context=>{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const root=context.packager.info.appDir;
 const identity=JSON.parse(fs.readFileSync(path.join(root,'build-info.json'),'utf8'));
 require(path.join(root,'build-identity.cjs')).verifyPackage(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),identity);
 assert.equal(context.packager.appInfo.version,identity.version);
 assert.equal(context.packager.appInfo.buildVersion,context.electronPlatformName==='darwin'?identity.mac_bundle_version:identity.windows_version);
};
