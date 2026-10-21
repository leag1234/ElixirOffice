// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
const files=require('../../desktop/files.cjs'),{Recovery}=require('../../desktop/recovery.cjs');
test('canceling one queued recovery scope prevents its bytes while another document still commits',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'eo-recovery-scope-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));files.resumeWrites();
 const store=new Recovery(root),a=randomUUID(),b=randomUUID();
 let release;store.tail=new Promise(resolve=>{release=resolve;});
 const first=files.scoped({scope:a,id:'recovery-A'},context=>store.save({id:a,name:'A.docx',format:'docx'},Buffer.from('PKpublic-A'),context));
 const second=files.scoped({scope:b,id:'recovery-B'},context=>store.save({id:b,name:'B.docx',format:'docx'},Buffer.from('PKpublic-B'),context));
 const observed=Promise.allSettled([first,second]);
 const canceled=files.cancelPending({scope:a,deadline:Date.now()+3000});release();
 const results=await observed;assert.equal(await canceled,1);
 assert.equal(results[0].status,'rejected','Canceled recovery must not acknowledge committed bytes');
 assert.equal(results[1].status,'fulfilled');
 await assert.rejects(fs.access(path.join(root,'recovery',a+'.recovery')),{code:'ENOENT'});
 assert.equal(Buffer.from((await store.read(b)).data).toString(),'PKpublic-B');
 assert.deepEqual((await store.list()).map(record=>record.id),[b]);
});
