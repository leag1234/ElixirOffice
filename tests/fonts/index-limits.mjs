// SPDX-License-Identifier: AGPL-3.0-only
// Real variable-font budget proof: named nondefault aliases stay usable by name
// without consuming the eligible registration budget.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const product=path.resolve(new URL('../..',import.meta.url).pathname),require=createRequire(import.meta.url);
const worker=path.join(product,'desktop/font-index-worker.cjs'),local=createRequire(worker),limits=local('./font-limits.cjs'),resolver=local('./font-resolver.js');
const work=process.env.EO_FONT_WORK,variable=process.env.EO_VARIABLE_FONT;assert(work&&variable);
assert.equal(limits.indexFaces,5000);assert.equal(limits.indexReadBytes,2*1024*1024*1024);
await fs.mkdir(work,{recursive:false});
const source=await fs.readFile(worker,'utf8'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function build(cap=limits.indexFaces){
 const module={exports:{}},require=id=>id==='node:worker_threads'?{parentPort:null}:id==='./font-limits.cjs'?{...limits,indexFaces:cap}:local(id);
 vm.runInNewContext('(function(require,module){'+source+'})(require,module)',{require,module,Buffer,AbortController,Uint8Array,Date});
 return module.exports.build;
}
const only=path.join(work,'variable-only'),mixed=path.join(work,'mixed');await fs.mkdir(only);await fs.mkdir(mixed);
const variableBytes=await fs.readFile(variable);await fs.writeFile(path.join(only,'a-variable.ttf'),variableBytes);await fs.writeFile(path.join(mixed,'a-variable.ttf'),variableBytes);
const meta=await fs.readFile(path.join(product,'desktop/assets/sdkjs/common/AllFonts.js'),'utf8');
const array=name=>JSON.parse(meta.match(new RegExp('window\\["'+name+'"\\]\\s*=\\s*(\\[[\\s\\S]*?\\]);'))[1]);
const info=array('__fonts_infos').find(row=>row[0]==='Carlito'),file=array('__fonts_files')[info[1]],encoded=await fs.readFile(path.join(product,'desktop/assets/fonts',file)),raw=Buffer.from(encoded),wire=[160,102,214,32,20,150,71,250,149,105,184,80,176,65,73,72];
for(let i=0;i<32;i++)raw[i]^=wire[i%16];await fs.writeFile(path.join(mixed,'b-static.ttf'),raw);
const full=await build()({roots:[only],bundleIdentity:'variable-proof'});
const eligible=full.system.filter(face=>resolver.eligible({...face,source:'system'})),aliases=full.system.filter(face=>!resolver.eligible({...face,source:'system'}));
assert(eligible.length>0&&aliases.length>0);assert.equal(full.stats.eligibleFaces,eligible.length);
const options={roots:[mixed],cacheDir:path.join(work,'cache'),bundleIdentity:'mixed-proof'};
const partial=await build(eligible.length)(options);
assert.equal(partial.stats.reason,'faces');assert.equal(partial.stats.eligibleFaces,eligible.length);
assert(partial.system.length>eligible.length,'Nondefault name aliases must be retained without consuming the budget');
for(const alias of aliases){
 const chosen=resolver.create(partial.system).resolve({name:alias.fullName,style:0});
 assert(chosen,alias.fullName);assert.equal(chosen.faceIndex>>>16,0);
}
const saved=JSON.parse(await fs.readFile(path.join(options.cacheDir,'index-v3.json'),'utf8'));assert.equal(saved.complete,false);
const resumed=await build()(options);assert.equal(resumed.stats.eligibleFaces,eligible.length+1);assert(resumed.stats.cacheHits>=1);
const result={status:'PASS',worker_sha256:sha(Buffer.from(source)),variable_sha256:sha(variableBytes),static_sha256:sha(raw),variable_raw_faces:full.system.length,eligible_faces:eligible.length,retained_safe_aliases:aliases.length,partial_eligible_faces:partial.stats.eligibleFaces,partial_reason:partial.stats.reason,resumed_eligible_faces:resumed.stats.eligibleFaces,resumed_cache_hits:resumed.stats.cacheHits};
await fs.writeFile(path.join(work,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
