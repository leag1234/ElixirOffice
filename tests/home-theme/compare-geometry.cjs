// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Theme intentionally changes colors, while language, geometry and data contracts must match.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const [beforePath,afterPath,output]=process.argv.slice(2);assert(beforePath&&afterPath&&output);
const before=JSON.parse(fs.readFileSync(beforePath)),after=JSON.parse(fs.readFileSync(afterPath)),rows=[];
for(const key of ['driverSHA256','inspectorSHA256','inspectorFunctionSHA256','node','browser'])assert.equal(before.runtime[key],after.runtime[key],key);
assert.equal(before.rows.length,after.rows.length);
for(const a of before.rows){
 const b=after.rows.find(r=>r.requested===a.requested&&r.scheme===a.scheme);assert(b);assert.equal(a.status,'PASS');assert.equal(b.status,'PASS');
 assert.equal(before.provenance['public/elixir/i18n/'+a.requested+'.json'],after.provenance['public/elixir/i18n/'+a.requested+'.json'],'catalog unchanged');
 assert.deepEqual(a.captures.map(r=>r.state),b.captures.map(r=>r.state));
 assert.deepEqual(a.api,b.api,'exact API paths/methods/bodies');
 for(let i=0;i<a.captures.length;i++){
  const x=a.captures[i],y=b.captures[i];
  for(const key of ['language','direction','rail','main','account','overflow','unwantedMarkup','links','fields','sizes','focus','menuAnchor'])assert.deepEqual(x[key],y[key],a.requested+':'+x.state+':'+key);
  assert.deepEqual(x.surfaces.map(s=>s.id),y.surfaces.map(s=>s.id));
  for(let j=0;j<x.surfaces.length;j++)for(const key of ['id','text','role','direction','rect','overflow'])assert.deepEqual(x.surfaces[j][key],y.surfaces[j][key],x.state+':'+key);
  rows.push({language:a.requested,scheme:a.scheme,state:x.state,geometryTextValuesKeyboardAndAPIMatch:true});
 }
}
const h=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.writeFileSync(output,JSON.stringify({scope:'Same-driver/runtime paired Home geometry, text, data values, direction, keyboard and exact fixture API requests; colors intentionally differ and pixel identity is not asserted',inputs:{before:{path:beforePath,sha256:h(beforePath)},after:{path:afterPath,sha256:h(afterPath)},driverSHA256:h(__filename)},rows},null,2)+'\n');
console.log('PASS paired Home theme geometry',rows.length,'states');
