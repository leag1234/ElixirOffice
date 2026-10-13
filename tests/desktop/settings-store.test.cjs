// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),store=require('../../desktop/settings-store.cjs');
test('overlapping preference updates are serialized and flush waits for durable last choice',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-preferences-'));
 try{
  const preferences=store(dir),writes=[];
  for(let n=0;n<20;n++)writes.push(preferences.save({fontChoice:n===19?'declined':'unset',revision:n,recents:['public-review.docx']}));
  await preferences.flush();
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'desktop-settings.json'),'utf8')),{fontChoice:'declined',revision:19,recents:['public-review.docx']});
  await Promise.all(writes);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
