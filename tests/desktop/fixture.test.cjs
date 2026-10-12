// SPDX-License-Identifier: AGPL-3.0-only
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {fixture}=require('./harness.cjs');
test('Temporary fixture copies never modify a shared sample or another run',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'eo-fixture-source-')),source=path.join(folder,'sample.docx');
 await fs.writeFile(source,'immutable public fixture');
 const a=await fixture(source),b=await fixture(source);assert.notEqual(a,b);assert.notEqual(a,source);
 await fs.writeFile(a,'test edit');assert.equal(await fs.readFile(source,'utf8'),'immutable public fixture');assert.equal(await fs.readFile(b,'utf8'),'immutable public fixture');
 for(const file of [a,b])await fs.rm(path.dirname(file),{recursive:true});await fs.rm(folder,{recursive:true});
});
