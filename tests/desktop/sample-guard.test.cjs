// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Execute the real guard against public package fixtures, then test both a
// modified admitted model and an otherwise valid document outside the whitelist.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
test('sample guard admits only exact approved overlay models and rejects source/payload tampering or extra documents',async()=>{
 const root=path.resolve(__dirname,'../..'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'eo-sample-guard-')),mini=path.join(temp,'product'),assets=path.join(temp,'assets');
 try{
  for(const name of ['tests/desktop/check-samples.py','tests/desktop/approved-overlay-templates.json','tools/desktop/blank_templates.py']){
   const target=path.join(mini,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,name),target);
  }
  for(const name of ['branding/example/nodejs/public/elixir/brand/templates','branding/desktop-templates'])await fs.cp(path.join(root,name),path.join(mini,name),{recursive:true});
  await fs.mkdir(assets);const source=path.join(root,'desktop/assets'),manifest=JSON.parse(await fs.readFile(path.join(source,'desktop-manifest.json'),'utf8'));
  await fs.copyFile(path.join(source,'desktop-manifest.json'),path.join(assets,'desktop-manifest.json'));
  for(const name of Object.keys(manifest.files).filter(name=>/\.(docx|xlsx|pptx|odt|ods|odp|pdf|doc|xls|ppt)$/i.test(name))){
   const target=path.join(assets,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(source,name),target);
  }
  const run=()=>cp.spawnSync(process.env.EO_PYTHON||'python3',[path.join(mini,'tests/desktop/check-samples.py'),assets],{encoding:'utf8'});
  let result=run();assert.equal(result.status,0,result.stderr);
  const payload=path.join(assets,'desktop-home/templates/ja/letterhead.docx'),original=await fs.readFile(payload);
  await fs.appendFile(payload,'tampered');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/Desktop overlay template hash mismatch/);await fs.writeFile(payload,original);
  const approvedSource=path.join(mini,'branding/desktop-templates/ja/letterhead.docx');await fs.appendFile(approvedSource,'tampered');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/Desktop overlay source hash mismatch/);await fs.writeFile(approvedSource,original);
  const extra=path.join(assets,'desktop-home/templates/ja/unapproved.docx');await fs.writeFile(extra,original);result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/Samples\/test artifacts must not be packaged/);
 }finally{await fs.rm(temp,{recursive:true,force:true})}
});
