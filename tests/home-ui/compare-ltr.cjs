// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const [baselinePath,candidatePath,output]=process.argv.slice(2);assert(baselinePath&&candidatePath&&output,'Usage: node compare-ltr.cjs baseline/results.json candidate/results.json output.json');
const baseline=JSON.parse(fs.readFileSync(baselinePath)),candidate=JSON.parse(fs.readFileSync(candidatePath)),rows=[];
const text=value=>value.replace(/[\u2066-\u2069]/g,'');
assert.equal(baseline.runtime.driverSHA256,candidate.runtime.driverSHA256,'same executed capture driver');
assert.equal(baseline.runtime.node,candidate.runtime.node);assert.equal(baseline.runtime.browser,candidate.runtime.browser);
for(const language of ['en','fr']){
 assert.equal(baseline.provenance['public/elixir/i18n/'+language+'.json'],candidate.provenance['public/elixir/i18n/'+language+'.json'],'existing catalog unchanged');
 for(const scheme of ['light','dark']){
  const before=baseline.rows.find(r=>r.requested===language&&r.scheme===scheme),after=candidate.rows.find(r=>r.requested===language&&r.scheme===scheme);
  assert(before&&after);assert.equal(before.status,'PASS');assert.equal(after.status,'PASS');
  assert.deepEqual(before.captures.map(r=>r.state),after.captures.map(r=>r.state));
  for(let i=0;i<before.captures.length;i++){
   const a=before.captures[i],b=after.captures[i];
   for(const key of ['language','direction','background','rail','main','account','overflow','unwantedMarkup'])assert.deepEqual(a[key],b[key],language+':'+a.state+':'+key);
   assert.deepEqual(a.links.map(v=>v.text),b.links.map(v=>v.text),'filename text unchanged');
   assert.deepEqual(a.surfaces.map(v=>v.id),b.surfaces.map(v=>v.id));
   for(let j=0;j<a.surfaces.length;j++){
    const x=a.surfaces[j],y=b.surfaces[j];
    for(const key of ['direction','background','color','rect','overflow'])assert.deepEqual(x[key],y[key],a.state+':'+x.id+':'+key);
    assert.equal(text(x.text),text(y.text),'display text unchanged apart from isolation');
   }
   assert.deepEqual(a.fields.map(f=>[f.id,f.value]),b.fields.map(f=>[f.id,f.value]),'actual form values unchanged');
   rows.push({language,scheme,state:a.state,geometryColorsAndTextEqual:true});
  }
 }
}
fs.writeFileSync(output,JSON.stringify({scope:'Exact en/fr locale, matched geometry/colors/overflow, filenames, form values and visible surface text after removing only intentional isolate characters; not full DOM/pixel identity',rows},null,2)+'\n');
console.log('PASS paired LTR Home',rows.length,'states');
