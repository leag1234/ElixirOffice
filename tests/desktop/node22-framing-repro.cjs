// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Adapted protocol reproducer; see Node issue 65934 in the review plan.
const fs=require('node:fs'),v8=require('node:v8'),test=require('node:test');
test('ordinary assertion still executes',()=>require('node:assert/strict').equal(2+2,4));
const serializer=new v8.DefaultSerializer();
serializer.writeHeader();
serializer.writeValue({type:'test:diagnostic',data:{nesting:0,message:'framing reproduction',file:__filename}});
const payload=serializer.releaseBuffer(),length=Buffer.alloc(4);
length.writeUInt32BE(payload.length);
const frame=Buffer.concat([Buffer.from([255,15]),length,payload]),text=Buffer.from('\n• build fixture é 文\n');
if(process.env.LOG_STDERR==='1'){fs.writeSync(1,frame);fs.writeSync(2,text);}
else fs.writeSync(1,Buffer.concat([frame,text]));
