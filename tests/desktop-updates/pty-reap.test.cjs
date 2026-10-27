// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
for(const mode of ['eio','eof','deadline'])test('synthetic PTY '+mode+' preserves the original child deadline',()=>{
 const result=spawnSync('python3',[path.join(__dirname,'fixtures/pty-reap-check.py'),mode],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,new RegExp('PASS deterministic '+mode));
});
