'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {documentPaths,createLaunchQueue}=require(path.join(__dirname,'..','..','desktop','launch-paths.cjs'));

test('documentPaths preserves order, ignores non-documents, and removes duplicates',()=>{
 const documentPath=value=>/\.(docx|xlsx|pptx)$/.test(value)?value:null;
 const paths=documentPaths(['--flag','one.docx','two.xlsx','one.docx','not-a-document','three.pptx'],documentPath);
 assert.deepEqual(paths,['one.docx','two.xlsx','three.pptx']);
});

test('launch queue reports queued, duplicate, and limit results',()=>{
 const queue=createLaunchQueue({max:2});
 assert.equal(queue.push('one.docx'),'queued');
 assert.equal(queue.push('one.docx'),'duplicate');
 assert.equal(queue.push('two.xlsx'),'queued');
 assert.equal(queue.push('three.pptx'),'limit');
 assert.equal(queue.size,2);
 assert.equal(queue.has('one.docx'),true);
});

test('launch queue drain empties queued paths and allows them again',()=>{
 const queue=createLaunchQueue({max:2});
 queue.push('one.docx');
 queue.push('two.xlsx');
 assert.deepEqual(queue.drain(),['one.docx','two.xlsx']);
 assert.equal(queue.size,0);
 assert.equal(queue.has('one.docx'),false);
 assert.equal(queue.push('one.docx'),'queued');
 assert.deepEqual(queue.drain(),['one.docx']);
});

test('main integrates the launch path module and drains after handlers are ready',async()=>{
 const source=await fs.readFile(path.join(__dirname,'..','..','desktop','main.cjs'),'utf8');
 assert.match(source,/require\('\.\/launch-paths\.cjs'\)/);
 assert.match(source,/app\.on\('second-instance',\(_event,argv\)=>\{if\(captureOptions\)return;for\(const file of documentPaths\(argv\.slice\(1\),documentPath\)\)enqueueFile\(file\)/);
 const readyIndex=source.indexOf('documentHandlersReady=true;');
 assert.notEqual(readyIndex,-1);
 const afterReady=source.slice(readyIndex);
 assert.match(afterReady,/initialDocument\.state\.pending\.push\(\.\.\.pendingPaths\.drain\(\)\)/);
});
