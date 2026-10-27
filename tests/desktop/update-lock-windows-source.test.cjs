// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const lock=fs.readFileSync(path.join(__dirname,'../../desktop/update-lock.cjs'),'utf8');
const store=fs.readFileSync(path.join(__dirname,'../../desktop/update-store.cjs'),'utf8');
test('Windows exclusive flag is bound to the pinned Node and libuv runtime',()=>{
 assert.match(lock,/WINDOWS_EXCLUSIVE_OPEN\s*=\s*0x10000000/);
 assert.match(lock,/node\s*!==\s*'24\.22\.0'/);assert.match(lock,/uv\s*!==\s*'1\.52\.1'/);
 assert.match(lock,/function windowsExclusiveFlag/);
});
test('the qualified flag is selected before the sole guard-v2 open and has no fallback',()=>{
 const flag=store.indexOf('windowsExclusiveFlag(process.versions)'),open=store.indexOf("open('guard-v2'");
 assert(flag>=0&&open>flag);assert.equal((store.match(/open\('guard-v2'/g)||[]).length,1);
 const body=store.slice(store.indexOf("async function lock()"),store.indexOf("async function promote"));
 assert.equal((body.match(/windowsExclusiveFlag/g)||[]).length,1);assert.doesNotMatch(store,/runtimeVersions/);
 assert.match(body,/platform===\x27win32\x27\?lockModule\.windowsExclusiveFlag\(process\.versions\):0/);
});
