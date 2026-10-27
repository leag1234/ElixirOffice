// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const web=process.env.EO_WEB_APPS;assert(web&&path.isAbsolute(web),'Explicit candidate EO_WEB_APPS required');
function load(){
 const window={Common:{ElixirAI:{}}};let policy,tools;
 const context={window,define:(_d,f)=>{policy=f();},setTimeout,clearTimeout,Promise,Date};
 vm.runInNewContext(fs.readFileSync(path.join(web,'apps/spreadsheeteditor/main/app/elixir-ai/CellPolicy.js'),'utf8'),context);
 context.define=(_d,f)=>{tools=f(policy);};
 vm.runInNewContext(fs.readFileSync(path.join(web,'apps/spreadsheeteditor/main/app/elixir-ai/CellTools.js'),'utf8'),context);
 return {tools,window};
}
test('tool schemas cover every requested operation with bounded descriptions and no arbitrary code interface',()=>{
 const {tools}=load();assert.deepEqual(Array.from(tools.tools,t=>t.function.name).sort(),['ask_user','cannot_do','clean_range','create_chart','create_pivot','explain_formula','filter_range','read_range','sort_range','submit_plan','summarize_range','verify_result','write_formula'].sort());
 for(const t of tools.tools){assert.equal(t.function.parameters.additionalProperties,false);assert(!Object.keys(t.function.parameters.properties).some(k=>/code|script|endpoint|sheetId/i.test(k)));}
});
test('source embeds escaped JSON and only a fixed command plus the same policy factory',()=>{
 const {tools}=load(),s=tools._source('write_formula',{range:'A1',formula:'="import"'},{sheet:'Owned',index:0,range:'A1'});
 assert(!/import/.test(s));assert(s.includes('imp\\u006frt'));assert.throws(()=>tools._source('eval',{}));assert(!/fetch\(|XMLHttpRequest|eval\(|new Function/.test(s));
});
test('init owns an early action group, cleans it on context failure, and rejects concurrent runs',async()=>{
 const {tools}=load(),calls=[];let release;
 const api={callMethod(n,a,cb){calls.push([n,...a]);cb();},callCommand(src,recalc,cb){release=()=>cb(JSON.stringify({ok:false,error:{message:'Select a bounded range'}}));},asc_isProtectedSheet:()=>false};
 const t=tools.create(api),pending=t.init();await assert.rejects(t.init(),/already/i);release();await assert.rejects(pending,/bounded/);
 assert.deepEqual(calls,[['StartAction','GroupActions'],['EndAction','GroupActions','','cancel']]);
});
test('no-op never offers Undo; spreadsheet uses its actual public Undo API and refuses stale rejection',async()=>{
 const {tools}=load();let undo=0;const t=tools.create({asc_Undo(){undo++;}});
 assert.equal(t.didMutate('clean_range',{ok:true,mutated:false}),false);assert.equal(t.didMutate('write_formula',{ok:true,mutated:true}),true);
 await t.undo();assert.equal(undo,1);await assert.rejects(t.reject({}),/changed|Undo/i);
});
test('invalid arguments and protected sheets never dispatch a mutating builder command',async()=>{
 const {tools}=load();let commands=0;const api={asc_isProtectedSheet:()=>true,callCommand(){commands++;}},t=tools.create(api),ctx={sheet:'Owned',index:0,range:'A1:C4',groupOpen:true,plan:{read_only:false},actions:0,cellsWritten:0,touched:[]};
 assert.equal((await t.execute('write_formula',{range:'A1',formula:'=A2'},ctx)).ok,false);assert.equal(commands,0);
 assert.equal(t.validate('write_formula',{range:'A1',formula:'=INDIRECT("A2")'},ctx).ok,false);
});
test('read-only planner fence is sticky and cannot be widened by a later model plan',async()=>{
 const {tools}=load();let commands=0;
 const t=tools.create({callCommand(){commands++;},asc_isProtectedSheet:()=>false});
 const c={sheet:'Owned',index:0,range:'A1:C4',groupOpen:true,actions:0,cellsWritten:0,touched:[]};
 const p=await t.execute('submit_plan',{goal:'Summarize without edits',read_only:true,steps:[{tool:'summarize_range',purpose:'Read totals'}]},c);assert.equal(p.ok,true);
 assert.equal((await t.execute('write_formula',{range:'D1',formula:'=SUM(B2:B4)'},c)).ok,false);
 assert.equal((await t.execute('submit_plan',{goal:'Now write',read_only:false,steps:[]},c)).ok,false);assert.equal(commands,0);
});
test('known provider namespace prefixes normalize only planner step names, never arguments or unknown tools',()=>{
 const {tools}=load(),t=tools.create({});
 const p=t.normalize('submit_plan',{goal:'Trim',read_only:false,steps:[{tool:'functions.clean_range',purpose:'Trim'}]});
 assert.equal(p.steps[0].tool,'clean_range');
 assert.equal(t.normalize('submit_plan',{goal:'Bad',read_only:false,steps:[{tool:'functions.evil',purpose:'x'}]}).steps[0].tool,'functions.evil');
});
test('normalization preserves prototype-named unknown fields so strict validation rejects them',()=>{
 const {tools}=load(),t=tools.create({});
 for(const text of [
  '{"goal":"Trim","read_only":false,"steps":[{"tool":"functions.clean_range","purpose":"Trim"}],"__proto__":{"extra":true}}',
  '{"goal":"Trim","read_only":false,"steps":[{"tool":"functions.clean_range","purpose":"Trim","__proto__":{"extra":true}}]}'
 ]){
  const args=t.normalize('submit_plan',JSON.parse(text));assert(t.validate('submit_plan',args,{}));
 }
 assert.equal(Object.prototype.extra,undefined);
});
