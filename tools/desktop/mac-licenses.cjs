// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const path=require('node:path'),fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const config=require(path.join(root,'desktop/package.json'));
 const archive=await require('node:module').createRequire(path.join(root,'desktop/node_modules/app-builder-lib/package.json'))('@electron/get').downloadArtifact({version:config.build.electronVersion,artifactName:'electron',platform:'darwin',arch:'arm64',cacheRoot:process.argv[2]});
 const checks=require(path.join(root,'desktop/node_modules/electron/checksums.json'));
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),checks[path.basename(archive)],'Electron archive checksum');
 const output=path.join(root,'desktop/mac-licenses');fs.mkdirSync(output,{recursive:true});
 cp.execFileSync('python3',['-c',"import sys,zipfile,pathlib;z=zipfile.ZipFile(sys.argv[1]);p=pathlib.Path(sys.argv[2]);[(p/n).write_bytes(z.read(n)) for n in ['LICENSE','LICENSES.chromium.html']]",archive,output]);
 for(const name of ['LICENSE','LICENSES.chromium.html'])assert(fs.statSync(path.join(output,name)).size>0);
 console.log('PASS exact Electron and Chromium notices from verified arm64 archive');
})().catch(error=>{console.error(error);process.exitCode=1});
