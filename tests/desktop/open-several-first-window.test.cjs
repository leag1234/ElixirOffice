// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Starting the application with several files (command line, or a file manager opening several documents at once):
// the first file loads in the first window, the others in their own windows. The reply of the main process for a
// file opened in another window carries no document; it must not be opened in the first window, which would destroy
// the document already shown there ("Error" in the first window).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../desktop/renderer.js'),'utf8');
const start=source.indexOf('async function drainPending('),end=source.indexOf('async function open(',start);
assert(start>0&&end>start);
function fixture(replies){
 const opened=[],scheduled=[];
 const context={pendingRequested:true,pendingRunning:false,opening:false,operationBusy:false,choosingSaveAs:false,closeCheck:false,
  eoDesktop:{initial:async()=>replies.shift()},setTimeout:fn=>scheduled.push(fn),
  run:async select=>{opened.push(await select())}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 return {context,opened,scheduled};
}
test('a file opened in another window is not opened again in this one',async()=>{
 const f=fixture([{morePending:true}]);
 await f.context.drainPending();
 assert.deepEqual(f.opened,[null]);
 assert.equal(f.context.pendingRequested,true,'the remaining files are still requested');
});
test('a selection for this window is opened and keeps morePending',async()=>{
 const selection={token:'t',name:'a.docx',format:'docx',morePending:true};
 const f=fixture([selection]);
 await f.context.drainPending();
 assert.deepEqual(f.opened,[selection]);
 assert.equal(f.context.pendingRequested,true);
});
test('an empty reply opens nothing',async()=>{
 const f=fixture([null]);
 await f.context.drainPending();
 assert.deepEqual(f.opened,[null]);
 assert.equal(f.context.pendingRequested,false);
});
