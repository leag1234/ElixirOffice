// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
function verify(packaged,expected){
 assert.match(packaged.version,/^[0-9]+(?:\.[0-9]+){2}$/);
 assert(!['0.1.0'].includes(packaged.version),'Desktop version was already published; bump before packaging');
 assert.equal(packaged.version,expected,'Packaged desktop version differs from selected source');
 return packaged.version;
}
if(require.main===module){
 const root=path.resolve(__dirname,'../..');
 const asar=require('node:module').createRequire(path.join(root,'desktop/node_modules/app-builder-lib/package.json'))('@electron/asar');
 const archive=process.argv[2];assert(archive,'Pass the packaged app.asar');
 console.log('PASS packaged desktop version',verify(JSON.parse(asar.extractFile(archive,'package.json')),require(path.join(root,'desktop/package.json')).version));
}
module.exports={verify};
