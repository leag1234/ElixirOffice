// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
const source=fs.readFileSync(path.join(upstream,'sdkjs/pdf/src/thumbnails.js'),'utf8');
function setup({local=true,allowed=true,restricted=true,locked=false,count=5}={}){
 const editor={eoLocalMode:local,eoLocalPdfCanReorder:()=>allowed,isRestrictionView:()=>restricted},AscCommon={check_MouseMoveEvent(){},global_mouseEvent:{X:10,Y:10,IsLocked:true},Cursors:{Grabbing:'grab'},stopEvent(){}};
 const context={Asc:{editor},AscCommon,AscDFH:{historydescription_Pdf_MovePage:91},window:{},document:{}};
 vm.runInNewContext(source,context);
 const thumbnail=Object.create(AscCommon.ThumbnailsControl.prototype),order=Array.from({length:count},(_,i)=>i),calls=[],navigated=[];
 const doc={GetPagesCount:()=>count,Viewer:{scrollMaxX:80,navigateToPage:p=>navigated.push(p)},
 DoAction(fn,kind,_scope,locks){calls.push({kind,locks:Array.from(locks)});if(!locked)fn();},
 MovePages(indices,to){assert.equal(indices.length,1);const from=indices[0];assert(from>=0&&from<count&&to>=0&&to<count);order.splice(to,0,order.splice(from,1)[0]);}};
 thumbnail.viewer={doc};
 return {thumbnail,editor,doc,order,calls,navigated,common:AscCommon};
}
test('local thumbnail reordering preserves selection order and before-boundary/end placement in one history action',()=>{
 for(const [selected,target,expected] of [
  [[0],5,[1,2,3,4,0]],[[4],0,[4,0,1,2,3]],[[1,3],5,[0,2,4,1,3]],
  [[1,3],0,[1,3,0,2,4]],[[1,3],3,[0,2,1,3,4]],[[3,1,1],5,[0,2,4,1,3]]
 ]){
  const e=setup();e.thumbnail.reorderPagesMultiple(selected,target);assert.deepEqual(e.order,expected);
  assert.equal(e.calls.length,1);assert.equal(e.calls[0].kind,91);
  const changed=expected.flatMap((value,index)=>value===index?[]:[index]);
  assert.deepEqual(e.calls[0].locks,Array.from({length:changed.at(-1)-changed[0]+1},(_,i)=>i+changed[0]));
 }
});
test('local denied/missing/throwing capability and SDK locks never mutate page order',()=>{
 for(const state of ['denied','missing','throw','locked']){
  const e=setup({allowed:state!=='denied',locked:state==='locked'});
  if(state==='missing')delete e.editor.eoLocalPdfCanReorder;
  if(state==='throw')e.editor.eoLocalPdfCanReorder=()=>{throw Error('Disposed');};
  e.thumbnail.reorderPagesMultiple([0],5);assert.deepEqual(e.order,[0,1,2,3,4]);assert.deepEqual(e.navigated,[]);
  assert.equal(e.calls.length,state==='locked'?1:0);
 }
});
test('invalid local indices and no-op selections do not add a history action',()=>{
 for(const [selected,target] of [[[],0],[null,1],[[-1],0],[[5],0],[[1.5],0],[[NaN],0],[[0],-1],[[0],6],[[0],1.2],[[0],NaN],[[0],0],[[1],2],[[0,1,2,3,4],5]]){
  const e=setup();e.thumbnail.reorderPagesMultiple(selected,target);assert.deepEqual(e.order,[0,1,2,3,4]);assert.equal(e.calls.length,0);
 }
});
test('hosted reorder retains existing API semantics and lock range without consulting a local capability',()=>{
 const e=setup({local:false,restricted:false});e.editor.eoLocalPdfCanReorder=()=>{throw Error('Hosted must not consult local capability');};
 const calls=[];e.doc.MovePages=(indices,target)=>calls.push({indices:Array.from(indices),target});
 e.thumbnail.reorderPagesMultiple([1,3],4);assert.deepEqual(calls,[{indices:[1,3],target:4}]);assert.deepEqual(e.calls,[{kind:91,locks:[1,2,3,4]}]);
});

test('thumbnail drag start respects explicit local capability and hosted view restrictions',()=>{
 for(const [local,allowed,restricted,expected] of [[true,true,true,true],[true,false,false,false],[false,true,true,false],[false,false,false,true]]){
  const e=setup({local,allowed,restricted}),t=e.thumbnail;
  Object.assign(t,{pendingDrag:true,isDragging:false,canvas:{style:{}},getDrawingPage:()=>null,moveDragGhost(){},getPageByCoords:()=>null,repaint(){}});
  t.onMouseMove({preventDefault(){}});assert.equal(t.isDragging,expected);
 }
});

test('local drop boundaries use thumbnail halves and consistent retina/scroll coordinates',()=>{
 for(const [ratio,y,expected] of [[1,250,2],[1,270,3],[2,180,2],[2,181,3]]){
  const e=setup(),t=e.thumbnail;e.common.AscBrowser={convertToRetinaValue:value=>Math.round(value*ratio)};e.common.global_mouseEvent.Y=y;
  Object.assign(t,{pendingDrag:true,isDragging:false,canvas:{style:{}},getDrawingPage:()=>null,moveDragGhost(){},coordsOffset:{y:100},scrollY:40,getPageByCoords:()=>({num:2,pageRect:{y:100,h:200}}),repaint(){}});
  t.onMouseMove({preventDefault(){}});assert.equal(t.dropInsertPosition,expected);
 }
});

test('local append drop indicator stays visible below the final page; hosted boundary is unchanged',()=>{
 for(const local of [true,false]){
  const e=setup({local}),lines=[];
  e.thumbnail.dropInsertPosition=5;e.thumbnail.scrollY=30;e.thumbnail.betweenH=20;
  e.thumbnail.getDrawingPage=index=>index===4?{num:4,pageRect:{x:40,y:200,w:100,h:150}}:null;
  e.thumbnail.drawDropPosition({save(){},beginPath(){},set strokeStyle(_v){},set lineWidth(_v){},moveTo(x,y){lines.push([x,y]);},lineTo(x,y){lines.push([x,y]);},stroke(){},restore(){}});
  assert.deepEqual(lines,local?[[30,330],[150,330]]:[]);
 }
});
