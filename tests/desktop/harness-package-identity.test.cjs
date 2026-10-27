// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{fixture}=require('./harness-fixture.cjs');
test('source harness launches the package directory and reports its actual 0.3.3 runtime identity',async()=>{
 const f=fixture(),env=await f.api.launch();
 assert.deepEqual(Array.from(env.launchSpec.entry),['/synthetic/no-profile-written/desktop']);
 assert.equal(env.sourceIdentity.version,'0.3.3');assert.equal(env.sourceIdentity.expected,'0.3.3');
 assert.equal(f.detached(),1);
});
test('source harness clearly rejects a runtime 0.0 file identity instead of synthesizing a version',async()=>{
 const f=fixture({runtimeVersion:'0.0'});
 await assert.rejects(f.api.launch(),/Source package identity mismatch.*0\.0.*package directory/);
});
test('source harness refuses an incomplete package SemVer before spawning',async()=>{
 const f=fixture({packageVersion:'0.0'});
 await assert.rejects(f.api.launch(),/Invalid source package version.*0\.0/);
 assert.equal(f.spawned(),0);
});
