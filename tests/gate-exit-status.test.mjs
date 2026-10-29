// SPDX-License-Identifier: AGPL-3.0-only
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const runners=['shortcuts/run.mjs','shortcuts-excel/run.mjs','shortcuts/keytips.mjs','shortcuts/screentips.mjs'];
for(const runner of runners){
 const source=fs.readFileSync(new URL(runner,import.meta.url),'utf8');
 const footer=source.slice(source.lastIndexOf('fs.mkdirSync(path.dirname(outFile)'));
 assert(footer.startsWith('fs.mkdirSync('),runner+' result footer');
 for(const [name,results,expected] of [
  ['passing',[{platform:'win',scope:'editor',status:'pass'}],0],
  ['mixed failure',[{status:'pass'},{platform:'mac',scope:'editor',status:'fail'}],1],
  ['existing non-failure statuses',[{status:'skip'},{status:'n/a'},{status:'untested'}],0],
 ]){
  test(runner+' '+name,async()=>{
   let saved,closed=0;
   const process={exitCode:0};
   const context=vm.createContext({process,results,BASE:'http://127.0.0.1:8137',control:false,repeat:1,platforms:['win','mac'],outFile:'results.json',
    console:{log(){}},Date,JSON,
    fs:{mkdirSync(){},writeFileSync(_file,value){saved=JSON.parse(value)}},
    path:{dirname(){return'.'}},browser:{async close(){closed++}}});
   await vm.runInContext('(async()=>{'+footer+'})()',context);
   assert.equal(process.exitCode,expected);
   assert.deepEqual(saved.results,results,'retain the original detailed results');
   if(runner==='shortcuts/keytips.mjs')assert.equal(closed,1);
  });
 }
 if(runner==='shortcuts-excel/run.mjs')for(const status of ['error','flaky']){
  test(runner+' '+status,async()=>{
   const process={exitCode:0};
   await vm.runInNewContext('(async()=>{'+footer+'})()',{process,results:[{status}],BASE:'http://127.0.0.1:8137',control:false,repeat:1,platforms:[],outFile:'results.json',console:{log(){}},fs:{mkdirSync(){},writeFileSync(){}},path:{dirname(){return'.'}}});
   assert.equal(process.exitCode,1);
  });
 }
}
