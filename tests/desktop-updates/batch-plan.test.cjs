// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),plan=require('../../tools/desktop-updates/batch-plan.cjs');
function fixture(){return {schema:1,mode:'owner-release-batch-v1',tag:'v0.4.0-rc.19',build:19,product:'a'.repeat(40),documentserver:'b'.repeat(40),
 candidates:[{platform:'win32',inventory:'latest.yml.candidate.json',seal:'c'.repeat(64)},{platform:'linux',inventory:'latest-linux.yml.candidate.json',seal:'d'.repeat(64)}]};}
test('canonical batch plan binds ordered complete candidate set and is immutable after decoding',()=>{
 const p=fixture(),bytes=plan.encodeBatchPlan(p),decoded=plan.decodeBatchPlan(bytes);assert.deepEqual(decoded,p);
 assert(Object.isFrozen(decoded)&&Object.isFrozen(decoded.candidates)&&Object.isFrozen(decoded.candidates[0]));
 assert.notDeepEqual(plan.encodeBatchPlan({...p,candidates:[p.candidates[0]]}),bytes);
});
for(const [label,mutate]of [
 ['unknown root',p=>p.key='must-not-enter-plan'],
 ['unknown candidate',p=>p.candidates[0].path='/tmp/other'],
 ['path traversal',p=>p.candidates[0].inventory='../latest.yml.candidate.json'],
 ['wrong inventory platform',p=>p.candidates[0].inventory='latest-linux.yml.candidate.json'],
 ['duplicate platform',p=>p.candidates[1]=p.candidates[0]],
 ['reversed order',p=>p.candidates.reverse()],
 ['zero candidates',p=>p.candidates=[]],
 ['more than2',p=>p.candidates.push(p.candidates[1])],
 ['QA tag',p=>p.tag='v0.0.0-rc.2'],
 ['noncanonical tag',p=>p.tag='0.4.0-rc.19'],
 ['invalid source',p=>p.product='not-a-revision'],
 ['invalid seal',p=>p.candidates[0].seal='bad'],
 ['invalid build',p=>p.build=65536]
])test('batch plan rejects '+label,()=>{const p=fixture();mutate(p);assert.throws(()=>plan.encodeBatchPlan(p));});
test('canonical plan decoder rejects duplicate keys, reordered bytes, trailing data and oversized input',()=>{
 const b=plan.encodeBatchPlan(fixture()),text=b.toString();
 for(const bytes of [Buffer.from(text.replace('{"schema":1,','{"schema":1,"schema":1,')),Buffer.from(text.replace('{"schema":1,"mode":"owner-release-batch-v1",','{"mode":"owner-release-batch-v1","schema":1,')),Buffer.concat([b,Buffer.from(' ')]),Buffer.alloc(plan.MAX_BATCH+1)])
 assert.throws(()=>plan.decodeBatchPlan(bytes));
});
