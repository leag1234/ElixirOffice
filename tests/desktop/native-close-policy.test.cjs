// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
function fixture(){return[{pid:123,window:'0x123',mapped:true,normal:true,dialog:false,transient:false,delete_protocol:true}]}
function run(rows){
 const code='import ast,sys,json\np=ast.parse(open(sys.argv[1]).read());f=next((n for n in p.body if isinstance(n,ast.FunctionDef) and n.name=="close_window_policy"),None);assert f is not None,"missing close policy"\nscope={};exec(compile(ast.Module(body=[f],type_ignores=[]),sys.argv[1],"exec"),scope);print(json.dumps(scope["close_window_policy"](json.load(sys.stdin),123)))';
 return cp.spawnSync('python3',['-c',code,path.join(__dirname,'native-input.py')],{input:JSON.stringify(rows),encoding:'utf8',timeout:5000});
}
test('native close selects only the mapped owned normal protocol window',()=>{const r=run(fixture());assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout),'0x123')});
for(const [label,mutate] of [
 ['foreign PID',r=>r[0].pid++],
 ['hidden window',r=>r[0].mapped=false],
 ['non-normal window',r=>r[0].normal=false],
 ['missing deletion protocol',r=>r[0].delete_protocol=false],
 ['transient child',r=>r[0].transient=true],
 ['ambiguous own windows',r=>r.push({...r[0],window:'0x456'})],
 ['mapped own modal',r=>r.push({...r[0],window:'0x456',normal:false,dialog:true})],
 ['dialog instead of normal window',r=>r[0].dialog=true],
 ['missing window',r=>r.pop()],
 ['excessive window list',r=>{while(r.length<=500)r.push({...r[0],pid:999})}]
])test('native close rejects '+label,()=>{const rows=fixture();mutate(rows);const r=run(rows);assert.notEqual(r.status,0,'Unexpected native close target '+r.stdout);assert.match(r.stderr,/AssertionError/)});
test('native close ignores foreign and unmapped windows without selecting them',()=>{const rows=fixture();rows.push({...rows[0],pid:999,window:'0x456',dialog:true});rows.push({...rows[0],window:'0x789',mapped:false});const r=run(rows);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout),'0x123')});
