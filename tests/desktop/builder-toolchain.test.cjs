// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const builder=require('./builder-toolchain.cjs');
function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-builder-deps-'));
 try{fs.writeFileSync(path.join(root,'package.json'),'{}');return run(root);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('developer test explicitly skips when packaging dependencies are absent',()=>fixture(root=>{
 const reasons=[];assert.equal(builder({skip:reason=>reasons.push(reason)},root,false),null);
 assert.equal(reasons.length,1);assert.match(reasons[0],/npm ci/);
}));
test('release mode fails instead of skipping absent builder dependencies',()=>fixture(root=>{
 const reasons=[];assert.throws(()=>builder({skip:reason=>reasons.push(reason)},root,true),{code:'MODULE_NOT_FOUND'});
 assert.deepEqual(reasons,[]);
}));
test('installed but broken builder packages fail rather than skip',()=>fixture(root=>{
 const dependency=path.join(root,'node_modules/app-builder-lib');fs.mkdirSync(dependency,{recursive:true});
 fs.writeFileSync(path.join(dependency,'package.json'),'{"name":"app-builder-lib","main":"index.js"}');
 fs.writeFileSync(path.join(dependency,'index.js'),'require("missing-public-fixture-dependency");');
 const reasons=[],load=builder({skip:reason=>reasons.push(reason)},root,false);
 assert.throws(()=>load('app-builder-lib'),{code:'MODULE_NOT_FOUND'});assert.deepEqual(reasons,[]);
}));

test('release environment requires the real builder without an explicit helper override',()=>fixture(root=>{
 const {spawnSync}=require('node:child_process');
 const script='require('+JSON.stringify(require.resolve('./builder-toolchain.cjs'))+')({skip:()=>{throw Error("UNEXPECTED_SKIP")}},'+JSON.stringify(root)+');';
 const result=spawnSync(process.execPath,['-e',script],{encoding:'utf8',env:{...process.env,EO_RELEASE_REQUIRE_BUILDER:'1',NODE_PATH:''}});
 assert.equal(result.status,1);assert.match(result.stderr,/MODULE_NOT_FOUND/);assert.doesNotMatch(result.stderr,/UNEXPECTED_SKIP/);
}));
