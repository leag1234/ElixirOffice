// SPDX-License-Identifier: AGPL-3.0-only
import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {selectLastDrawing} from './slide-drawing.mjs';

afterEach(()=>{delete globalThis.PE;delete globalThis.AscDFH});
function fixture({selectedType=7,selectedId='new-image',originY=164,pointError=false}={}){
 const object={Id:'new-image',getObjectType:()=>7,x:20,y:100,extX:60,extY:30};
 let selected=[],conversion,click;
 const wc={X:12,Y:originY,m_oLogicDocument:{CurPage:0,Slides:[{cSld:{spTree:[object]}}],GetCurrentController:()=>({selectedObjects:selected})},
  m_oDrawingDocument:{ConvertCoordsToCursorWR(...args){conversion=args;return {X:400,Y:300,Error:pointError}}}};
 globalThis.PE={getController:()=>({api:{WordControl:wc}})};
 globalThis.AscDFH={historyitem_type_ImageShape:7,historyitem_type_Shape:8};
 return {frame:{evaluate:async(fn,arg)=>fn(arg)},page:{mouse:{async click(x,y){click={x,y};selected=[{Id:selectedId,getObjectType:()=>selectedType}]}}},
  get click(){return click},get conversion(){return conversion}};
}
test('adds iframe and SDK origins and converts the real drawing center',async()=>{
 const f=fixture();
 assert.deepEqual(await selectLastDrawing(f.frame,f.page,{x:5,y:9},'ImageShape'),{x:417,y:473});
 assert.deepEqual(f.click,{x:417,y:473});
 assert.deepEqual(f.conversion,[50,115,0,null,true]);
});
test('rejects a different selected object type even when insertion succeeded',async()=>{
 const f=fixture({selectedType:8});
 await assert.rejects(selectLastDrawing(f.frame,f.page,{x:0,y:0},'ImageShape'),/Mouse must select/);
});
test('rejects selection of an older image',async()=>{
 const f=fixture({selectedId:'old-image'});
 await assert.rejects(selectLastDrawing(f.frame,f.page,{x:0,y:0},'ImageShape'),/Mouse must select/);
});
test('rejects nonfinite geometry before clicking',async()=>{
 const f=fixture({originY:NaN});
 await assert.rejects(selectLastDrawing(f.frame,f.page,{x:0,y:0},'ImageShape'),/finite/);
 assert.equal(f.click,undefined);
});
test('rejects failed conversion before clicking',async()=>{
 const f=fixture({pointError:true});
 await assert.rejects(selectLastDrawing(f.frame,f.page,{x:0,y:0},'ImageShape'),/conversion failed/);
 assert.equal(f.click,undefined);
});
test('rejects the wrong inserted type before clicking',async()=>{
 const f=fixture();
 await assert.rejects(selectLastDrawing(f.frame,f.page,{x:0,y:0},'Shape'),/Expected newly inserted Shape/);
 assert.equal(f.click,undefined);
});
