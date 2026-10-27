// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const wire=require('./update-metadata.cjs'),records=new WeakMap();
function refused(){throw Error('Update candidate refused');}
function createCandidate({policy,runtime,selectedTag,envelope,metadata,now=Date.now()}){
 if(!policy||!Buffer.isBuffer(envelope)||!Buffer.isBuffer(metadata)||envelope.length<1||envelope.length>wire.MAX_ENVELOPE||metadata.length<1||metadata.length>wire.MAX_METADATA)refused();
 const target=Object.freeze({...runtime}),signature=Buffer.from(envelope),yaml=Buffer.from(metadata);
 const verified=policy.verify({runtime:target,selectedTag,envelope:signature,metadata:yaml,now});
 const description=wire.describeUpdate(verified),c=verified.context;
 const candidate=Object.freeze({version:c.version,tag:c.tag,sequence:c.sequence,expiresAt:c.expiresAt,identity:verified.identity,artifact:Object.freeze({...description.artifact})});
 records.set(candidate,{policy,runtime:target,selectedTag,envelope:signature,metadata:yaml,identity:verified.identity});
 return candidate;
}
function readCandidate(candidate,policy,{now=Date.now(),runtime}={}){
 const record=records.get(candidate);
 if(!record||record.policy!==policy)refused();
 if(runtime){const target=Object.freeze({...runtime});if(!policy.capability(target).enabled||['platform','arch','packageType'].some(k=>target[k]!==record.runtime[k]))refused();}
 const verified=policy.verify({...record,envelope:record.envelope,metadata:record.metadata,now});
 if(verified.identity!==record.identity)refused();
 return Object.freeze({verified,description:wire.describeUpdate(verified),runtime:record.runtime,
  envelope:Buffer.from(record.envelope),metadata:Buffer.from(record.metadata)});
}
function describeCandidate(candidate){if(!records.has(candidate))refused();return candidate;}
module.exports={createCandidate,readCandidate,describeCandidate};
