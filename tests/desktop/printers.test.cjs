// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{list}=require('../../desktop/printers.cjs');
test('printers: lists the system printers with the default marked',async()=>{
 const result=await list({getPrintersAsync:async()=>[{name:'A',displayName:'Printer A',isDefault:true},{name:'B',isDefault:false},{name:''},null,{displayName:'x'}]});
 assert.deepEqual(result,{status:'ok',printers:[{name:'A',displayName:'Printer A',isDefault:true},{name:'B',displayName:'B',isDefault:false}]});
});
test('printers: no printer is an empty list, not a wait',async()=>{
 assert.deepEqual(await list({getPrintersAsync:async()=>[]}),{status:'ok',printers:[]});
 assert.deepEqual(await list({getPrintersAsync:async()=>undefined}),{status:'ok',printers:[]});
});
test('printers: a failing print system (CUPS absent) settles with an empty list',async()=>{
 assert.deepEqual(await list({getPrintersAsync:async()=>{throw Error('cups')}}),{status:'error',printers:[]});
 assert.deepEqual(await list({getPrintersAsync(){throw Error('sync')}}),{status:'error',printers:[]});
});
test('printers: a print system that never answers settles after the timeout',async()=>{
 const started=Date.now();
 assert.deepEqual(await list({getPrintersAsync:()=>new Promise(()=>{})},{timeout:30}),{status:'timeout',printers:[]});
 assert(Date.now()-started<2000);
});
