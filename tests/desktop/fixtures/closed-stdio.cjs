// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const safety=require('../../../desktop/safety-log.cjs').create(process.argv[2]);let fatal=0;
safety.install(process,console,()=>{fatal++;});
process.on('message',async()=>{
 console.error('SYNTHETIC_PRIVATE_ERROR');console.warn('SYNTHETIC_PRIVATE_WARNING');
 process.stdout.write('public pipe probe');process.stderr.write('public pipe probe');
 await new Promise(resolve=>setTimeout(resolve,100));await safety.flush();
 process.send({survived:true,fatal},()=>process.exit(0));
});
process.send({ready:true});
