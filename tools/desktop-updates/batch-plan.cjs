// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Public-only batch shape. No paths to keys, secrets, filesystem or signing.
const {parseVersion}=require('../../desktop/release-notice.cjs');
const MAX_BATCH=32768;
function fail(){throw Error('Invalid signing batch');}
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.slice().sort().join(','))fail();}
function encodeBatchPlan(plan){
 exact(plan,['schema','mode','tag','build','product','documentserver','candidates']);
 const version=typeof plan.tag==='string'?parseVersion(plan.tag):null;
 if(plan.schema!==1||plan.mode!=='owner-release-batch-v1'||!version||plan.tag!=='v'+version.version||/^0\.0\.0(?:-|$)/.test(version.version)||
  !Number.isSafeInteger(plan.build)||plan.build<1||plan.build>65535||![plan.product,plan.documentserver].every(v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v))||
  !Array.isArray(plan.candidates)||plan.candidates.length<1||plan.candidates.length>2)fail();
 let previous=-1;
 const candidates=plan.candidates.map(c=>{
  exact(c,['platform','inventory','seal']);const rank=['win32','linux'].indexOf(c.platform);
  if(rank<=previous||rank<0||c.inventory!==(c.platform==='win32'?'latest.yml.candidate.json':'latest-linux.yml.candidate.json')||
   typeof c.seal!=='string'||!/^[a-f0-9]{64}$/.test(c.seal))fail();
  previous=rank;return {platform:c.platform,inventory:c.inventory,seal:c.seal};
 });
 const bytes=Buffer.from(JSON.stringify({schema:1,mode:plan.mode,tag:plan.tag,build:plan.build,product:plan.product,documentserver:plan.documentserver,candidates})+'\n');
 if(bytes.length>MAX_BATCH)fail();return bytes;
}
function decodeBatchPlan(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>MAX_BATCH)fail();
 let p;try{p=JSON.parse(bytes.toString('utf8'));}catch{fail();}
 if(!encodeBatchPlan(p).equals(bytes))fail();
 for(const c of p.candidates)Object.freeze(c);Object.freeze(p.candidates);return Object.freeze(p);
}
module.exports={encodeBatchPlan,decodeBatchPlan,MAX_BATCH};
