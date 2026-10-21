// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DOCUMENT_URL,SHELL_URL,documentPages,shellPages,documentPage,activeDocument}=require('./document-pages.cjs');
function fixture(){
 const page=(url,result)=>({url:()=>url,isClosed:()=>false,evaluate:async()=>result});
 const a=page(DOCUMENT_URL,{documentId:'a'}),b=page(DOCUMENT_URL,{documentId:'b'});
 const shell=page(SHELL_URL,{activeId:'b'}),foreign=page(DOCUMENT_URL+'?spoof=1',{documentId:'b'});
 const list=[foreign,shell,b,a],browser={contexts:()=>[{pages:()=>list}]};
 return {a,b,shell,foreign,list,browser};
}
test('document selection uses exact URL and identity despite arbitrary CDP page order',async()=>{
 const f=fixture();assert.deepEqual(documentPages(f.browser),[f.b,f.a]);assert.deepEqual(shellPages(f.browser),[f.shell]);
 assert.equal(await documentPage(f.browser,'a'),f.a);assert.equal(await activeDocument(f.browser,f.shell),f.b);
 await assert.rejects(activeDocument(f.browser,f.foreign),/registered tab shell/);
 await assert.rejects(documentPage(f.browser,'missing'),/exactly one/);
});
test('closed or duplicate document identities fail selection rather than choosing another page',async()=>{
 const f=fixture();f.a.isClosed=()=>true;await assert.rejects(documentPage(f.browser,'a'),/exactly one/);
 f.list.push({url:()=>DOCUMENT_URL,isClosed:()=>false,evaluate:async()=>({documentId:'b'})});
 await assert.rejects(documentPage(f.browser,'b'),/exactly one/);
});
