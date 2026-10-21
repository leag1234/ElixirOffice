// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DocumentDialogs}=require('../../desktop/document-dialogs.cjs');
test('native dialogs serialize within an owner window and other windows progress independently',async()=>{
 const queue=new DocumentDialogs(),calls=[];let release,entered;const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
 const first=queue.run('one',()=>{},async()=>{calls.push('A');entered();await gate;return 'saved-A';});
 await started;assert.equal(queue.has('one'),true);assert.equal(queue.has('two'),false);
 const second=queue.run('one',()=>{},()=>{calls.push('B');return 'saved-B';});
 const other=queue.run('two',()=>{},()=>{calls.push('C');return 'saved-C';});
 assert.equal(await other,'saved-C');assert.deepEqual(calls,['A','C']);
 release();assert.deepEqual(await Promise.all([first,second]),['saved-A','saved-B']);assert.deepEqual(calls,['A','C','B']);assert.equal(queue.has('one'),false);
});
test('a closed queued document cannot show a late dialog and does not poison the next request',async()=>{
 const queue=new DocumentDialogs();let release,entered,live=true,shown=false;const started=new Promise(resolve=>{entered=resolve;});
 const first=queue.run('one',()=>{},()=>new Promise(resolve=>{release=resolve;entered();}));
 await started;
 const stale=queue.run('one',()=>{if(!live)throw Error('Document closed');},()=>{shown=true;});
 const observed=assert.rejects(stale,/Document closed/);live=false;release();await first;await observed;
 assert.equal(shown,false);assert.equal(await queue.run('one',()=>{},()=>42),42);
});
test('a rejected native dialog releases its place without weakening owner validation',async()=>{
 const queue=new DocumentDialogs();let validated=0;
 await assert.rejects(queue.run('one',()=>validated++,()=>{throw Error('Native refused');}),/Native refused/);
 assert.equal(await queue.run('one',()=>validated++,()=>true),true);assert.equal(validated,2);
});
