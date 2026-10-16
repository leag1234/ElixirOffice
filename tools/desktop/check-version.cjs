// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
function verify(packaged,expected){
 assert.match(packaged.version,/^[0-9]+(?:\.[0-9]+){2}(?:-rc\.[1-9][0-9]*)?$/);
 assert.equal(packaged.version,expected,'Packaged desktop version differs from selected source');return packaged.version;
}
if(require.main===module){
 const root=path.resolve(__dirname,'../..');
 const asar=require('node:module').createRequire(path.join(root,'desktop/node_modules/app-builder-lib/package.json'))('@electron/asar');
 const archive=process.argv[2];assert(archive,'Pass the packaged app.asar');
 const packaged=JSON.parse(asar.extractFile(archive,'package.json'));
 const identity=JSON.parse(asar.extractFile(archive,'build-info.json'));
 const expected=require(path.join(root,'desktop/build-info.json'));
 assert.deepEqual(identity,expected,'Packaged build identity differs');
 require(path.join(root,'desktop/build-identity.cjs')).validate(identity);
 console.log('PASS packaged desktop version',verify(packaged,expected.version));
}
module.exports={verify};
