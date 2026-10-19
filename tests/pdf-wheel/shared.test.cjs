// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const upstream=path.resolve(process.env.UPSTREAM||path.join(__dirname,'../../../DocumentServer'));
const sdk=path.join(upstream,'sdkjs'),source=fs.readFileSync(path.join(sdk,'pdf/src/viewer.js'),'utf8');
const acorn=require(path.join(sdk,'build/node_modules/acorn'));
const ast=acorn.parse(source,{ecmaVersion:'latest'}),body=ast.body[0].expression.callee.body.body;
const declaration=body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='bindMouseWheel');
assert(declaration,'Private helper must exist in the actual viewer source');
let now=1000;
const bind=vm.runInNewContext('('+source.slice(declaration.start,declaration.end)+')',{Date:{now:()=>now},Math});
const desktopContext={module:{exports:{}},Date:{now:()=>now},Math};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../desktop/pdf-compat.js'),'utf8'),desktopContext);
const desktop=desktopContext.module.exports;
function fixture(offline=false,modern=true){
 const listeners={},effects=[],legacy=()=>{},parent={clientHeight:850,onmousewheel:legacy,
  addEventListener(name,fn,options){(listeners[name]??=[]).push({fn,options})},
  removeEventListener(name,fn){listeners[name]=(listeners[name]||[]).filter(x=>x.fn!==fn)}};
 if(modern)parent.onwheel=null;
 const viewer={parent,height:900,isVisibleHorScroll:true,onMouseWhell(e){
  effects.push(['scroll',...['deltaX','deltaY','wheelDelta','wheelDeltaX','wheelDeltaY','ctrlKey','metaKey','altKey','shiftKey','pageX','pageY','clientX','clientY','target','srcElement'].map(k=>e[k])]);
  e.preventDefault();e.stopPropagation();
 }};
 const api=viewer.Api={DocInfo:{get_OfflineApp:()=>offline},DocumentRenderer:viewer,zoomIn:()=>effects.push(['in']),zoomOut:()=>effects.push(['out']),getPDFDoc:()=>({})};
 return{viewer,parent,api,listeners,effects,legacy};
}
function local(f){
 return desktop({Common:{NotificationCenter:{trigger(){}}},PDFE:{getController:()=>null},document:{addEventListener(){},removeEventListener(){}}},
  {api:f.api,appOptions:{}},{},()=>{});
}
function event(values={}){
 return{deltaX:0,deltaY:12,deltaMode:0,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,pageX:11,pageY:22,clientX:33,clientY:44,target:'public-field',
  preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.immediate=true;this.stopped=true},...values};
}
function dispatch(f,values){
 const e=event(values);for(const {fn}of f.listeners.wheel||[]){fn(e);if(e.immediate)break}return e;
}
test('ready path contains one binder call and hosted modern path does not register legacy events',()=>{
 assert.equal((source.match(/bindMouseWheel\(_t\)/g)||[]).length,1);
 assert(source.includes('if (!_t.isStarted)'));
 const f=fixture();bind(f.viewer);assert.equal(f.listeners.wheel.length,1);
 assert.equal(f.listeners.DOMMouseScroll,undefined);assert.equal(f.parent.onmousewheel,f.legacy);
 assert.deepEqual(JSON.parse(JSON.stringify(f.listeners.wheel[0].options)),{passive:false,capture:true});
});
test('pixel, line, page, Shift and form-pointer delegation match the unchanged desktop adapter',()=>{
 const shared=fixture(),reference=fixture(true);bind(shared.viewer);local(reference);
 for(const values of [
  {},{deltaMode:1},{deltaMode:2},{deltaX:-15,deltaY:50},{shiftKey:true,deltaY:25},
  {shiftKey:true,deltaX:13,deltaY:25},{altKey:true,deltaY:-20}
 ]){
  const a=dispatch(shared,values),b=dispatch(reference,values);
  assert(a.prevented&&a.stopped);assert.equal(a.prevented,b.prevented);assert.deepEqual(shared.effects,reference.effects);
 }
 shared.viewer.isVisibleHorScroll=reference.viewer.isVisibleHorScroll=false;
 dispatch(shared,{shiftKey:true,deltaY:20});dispatch(reference,{shiftKey:true,deltaY:20});assert.deepEqual(shared.effects,reference.effects);
 shared.viewer.height=reference.viewer.height=0;dispatch(shared,{deltaMode:2});dispatch(reference,{deltaMode:2});assert.deepEqual(shared.effects,reference.effects);
});
test('100px, 250ms reset, reversal, normal-wheel reset and clamp match desktop exactly',()=>{
 const shared=fixture(),reference=fixture(true);bind(shared.viewer);local(reference);
 const steps=[
  ...Array.from({length:8},()=>[10,{ctrlKey:true,deltaY:-10}]),
  [10,{ctrlKey:true,deltaY:-20}],[300,{metaKey:true,deltaY:-90}],[251,{metaKey:true,deltaY:-10}],
  [300,{ctrlKey:true,deltaY:-90}],[1,{ctrlKey:true,deltaY:10}],[1,{ctrlKey:true,deltaY:90}],
  [300,{ctrlKey:true,deltaY:100000}],[300,{metaKey:true,deltaY:-100000}],
  [300,{ctrlKey:true,deltaY:-90}],[1,{deltaY:10}],[1,{ctrlKey:true,deltaY:-10}],
  [300,{ctrlKey:true,deltaMode:1,deltaY:-3}],[300,{metaKey:true,deltaMode:2,deltaY:1}],
  [300,{ctrlKey:true,deltaY:0}]
 ];
 for(const [gap,values]of steps){
  now+=gap;const a=dispatch(shared,values),b=dispatch(reference,values);
  assert.deepEqual(shared.effects,reference.effects);for(const k of ['prevented','stopped','immediate'])assert.equal(a[k],b[k]);
 }
});
test('sub-threshold Ctrl/Meta stop holder and document zoom before any API call',()=>{
 for(const modifier of ['ctrlKey','metaKey']){
  const f=fixture();bind(f.viewer);now+=300;
  for(let n=0;n<8;n++){const e=dispatch(f,{[modifier]:true,deltaY:-10});assert(e.prevented&&e.stopped&&e.immediate);assert.equal(f.effects.length,0)}
  dispatch(f,{[modifier]:true,deltaY:-20});assert.deepEqual(f.effects,[['in']]);
 }
});
test('offline legacy branch composes with unchanged desktop adapter and disposes without duplicate listeners',()=>{
 const f=fixture(true);bind(f.viewer);assert.equal(f.parent.onmousewheel,f.viewer.onMouseWhell);assert.equal(f.listeners.wheel,undefined);
 assert.equal(f.listeners.DOMMouseScroll[0].fn,f.viewer.onMouseWhell);
 const adapter=local(f);assert.equal(f.parent.onmousewheel,null);assert.equal(f.listeners.DOMMouseScroll.length,0);assert.equal(f.listeners.wheel.length,1);
 dispatch(f,{ctrlKey:true,deltaY:-100});assert.deepEqual(f.effects,[['in']]);
 adapter.dispose();assert.equal(f.listeners.wheel.length,0);assert.equal(f.parent.onmousewheel,f.viewer.onMouseWhell);assert.equal(f.listeners.DOMMouseScroll.length,1);
});
test('unsupported modern wheel and absent DocInfo preserve exact legacy binding',()=>{
 for(const missing of ['wheel','DocInfo']){
  const f=fixture(false,missing!=='wheel');if(missing==='DocInfo')delete f.api.DocInfo;
  bind(f.viewer);assert.equal(f.listeners.wheel,undefined);assert.equal(f.parent.onmousewheel,f.viewer.onMouseWhell);
  assert.equal(f.listeners.DOMMouseScroll[0].options,false);
 }
});

function findNode(node,predicate){
 if(!node||typeof node!=='object')return;
 if(predicate(node))return node;
 for(const value of Object.values(node)){if(Array.isArray(value)){for(const child of value){const found=findNode(child,predicate);if(found)return found}}else if(value&&typeof value==='object'){const found=findNode(value,predicate);if(found)return found}}
}
function useActualHandler(f,field){
 const assignment=findNode(ast,n=>n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.type==='ThisExpression'&&n.left.property.name==='onMouseWhell');
 assert(assignment,'Actual PDF wheel handler');
 const work=fs.readFileSync(path.join(sdk,'common/Drawings/WorkEvents.js'),'utf8'),workAst=acorn.parse(work,{ecmaVersion:'latest'});
 const checker=findNode(workAst,n=>n.type==='FunctionDeclaration'&&n.id.name==='checkMouseWhell');
 const check=vm.runInNewContext('('+work.slice(checker.start,checker.end)+')');
 const calls=[];Object.assign(f.viewer,{file:{isValid:()=>true},getPageFieldByMouse:()=>field,isLandscapePage:()=>field?.landscape,
  m_oScrollHorApi:{scrollBy:(...a)=>calls.push(['x',...a])},m_oScrollVerApi:{scrollBy:(...a)=>calls.push(['y',...a])},
  onMouseMove:e=>calls.push(['move',e.pageX,e.pageY,e.srcElement])});
 f.viewer.onMouseWhell=vm.runInNewContext('('+source.slice(assignment.right.start,assignment.right.end)+')',{
  oThis:f.viewer,AscCommon:{stopEvent:e=>{e.preventDefault();e.stopPropagation()},checkMouseWhell:check,global_mouseEvent:{X:5,Y:7,Sender:'pointer-source'}},
  AscPDF:{FIELD_TYPES:{listbox:1,text:2}}});
 return calls;
}
test('actual shared checker and PDF handler preserve page axes and pointer update',()=>{
 const f=fixture(),calls=useActualHandler(f);bind(f.viewer);
 dispatch(f,{deltaY:240});assert.deepEqual(calls,[['y',0,240,false],['move',5,7,'pointer-source']]);
 calls.length=0;dispatch(f,{shiftKey:true,deltaY:180});assert.deepEqual(calls,[['x',180,0,false],['move',5,7,'pointer-source']]);
});
test('actual PDF handler preserves scrollable text/listbox field routing and hidden-field fallback',()=>{
 for(const type of [1,2])for(const landscape of [false,true]){
  const fieldCalls=[],info={docElem:{style:{display:'block'}},scroll:{settings:{hscrollStep:17,vscrollStep:23},scrollByX:n=>fieldCalls.push(['x',n]),scrollByY:n=>fieldCalls.push(['y',n])}};
  const field={landscape,GetType:()=>type,GetScrollInfo:()=>info,GetPage:()=>0},f=fixture(),calls=useActualHandler(f,field);bind(f.viewer);
  dispatch(f,{deltaX:-12,deltaY:-20});assert.deepEqual(fieldCalls,[[landscape?'x':'y',landscape?-17:-23]]);
  assert.deepEqual(calls,[['move',5,7,'pointer-source']]);
  info.docElem.style.display='none';calls.length=0;dispatch(f,{deltaY:30});assert.deepEqual(calls,[['y',0,30,false],['move',5,7,'pointer-source']]);
 }
});

test('actual repeated ready callbacks install the modern listener only once',()=>{
 const assignment=findNode(ast,n=>n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.type==='ThisExpression'&&n.left.property.name==='checkReady');
 const callbacks=[],f=fixture();let starts=0;
 Object.assign(f.viewer,{getPDFDoc:()=>({fontLoader:{isWorking:()=>false}}),canvasForms:{},isStarted:false,pageDetector:{},IsOpenFormsInProgress:false,initPaintDone:true,file:{pages:[{}]},id_main:{style:{}},sendEvent(){},
  startTimer(){starts++;this.isStarted=true}});
 const ready=vm.runInNewContext('('+source.slice(assignment.right.start,assignment.right.end)+')',{
  setTimeout:fn=>callbacks.push(fn),AscCommon:{addMouseEvent(){}},document:{getElementById:()=>null},global_mouseEvent:{},bindMouseWheel:bind});
 ready.call(f.viewer);ready.call(f.viewer);assert.equal(callbacks.length,2);
 callbacks.shift()();callbacks.shift()();assert.equal(starts,1);assert.equal(f.listeners.wheel.length,1);
});
