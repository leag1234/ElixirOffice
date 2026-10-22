// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {restore,capture}=require('../../desktop/window-state.cjs');
const primary={workArea:{x:0,y:0,width:1920,height:1080}},left={workArea:{x:-1280,y:0,width:1280,height:1024}};
test('fresh windows center the default outer bounds within the primary work area',()=>{
 assert.deepEqual(restore(undefined,[primary]),{bounds:{x:280,y:60,width:1360,height:960},maximized:false});
});
test('normal bounds and maximization restore independently and additional windows cascade',()=>{
 const value={bounds:{x:100,y:90,width:1100,height:800},maximized:true};
 assert.deepEqual(restore(value,[primary]),value);
 assert.deepEqual(restore({...value,maximized:false},[primary],1).bounds,{x:128,y:118,width:1100,height:800});
});
test('negative monitor positions remain valid; unplugged-monitor bounds move fully into the primary work area',()=>{
 const value={bounds:{x:-1200,y:60,width:1000,height:800},maximized:false};
 assert.deepEqual(restore(value,[primary,left]),value);
 assert.deepEqual(restore(value,[primary]).bounds,{x:0,y:60,width:1000,height:800});
});
test('work area, resized displays and small displays bound the entire restored frame',()=>{
 const area={workArea:{x:40,y:24,width:1000,height:700}};
 assert.deepEqual(restore({bounds:{x:900,y:600,width:1600,height:900}},[area]).bounds,{x:40,y:24,width:1000,height:700});
 const tiny={workArea:{x:0,y:0,width:640,height:480}};
 assert.deepEqual(restore(undefined,[tiny]).bounds,{x:0,y:0,width:640,height:480});
});
for(const invalid of [null,{},'bad',{bounds:{x:NaN,y:0,width:900,height:600}},{bounds:{x:0,y:Infinity,width:900,height:600}},{bounds:{x:0,y:0,width:-1,height:600}},{bounds:{x:0,y:0,width:'900',height:600}},{bounds:{x:0,y:0,width:900.5,height:600}},{bounds:{x:1e20,y:0,width:900,height:600}}])test('invalid persisted geometry defaults safely: '+JSON.stringify(invalid),()=>{
 const result=restore(invalid,[primary]);assert.deepEqual(result.bounds,{x:280,y:60,width:1360,height:960});assert.equal(result.maximized,false);
});
test('malformed display data is ignored and a safe default exists without Electron screen data',()=>{
 assert.deepEqual(restore(undefined,[null,{workArea:{x:0,y:0,width:0,height:1}}]).bounds,{x:0,y:0,width:1360,height:960});
});
test('capture uses normal bounds for maximized windows and never persists transient minimized/fullscreen state',()=>{
 const normal={x:100,y:70,width:1000,height:700};
 const w={getNormalBounds:()=>normal,isMaximized:()=>true,isMinimized:()=>false,isFullScreen:()=>false};
 assert.deepEqual(capture(w),{bounds:normal,maximized:true});
 assert.equal(capture({...w,isMinimized:()=>true}),null);assert.equal(capture({...w,isFullScreen:()=>true}),null);
 assert.equal(capture({}),null);assert.equal(capture({...w,getNormalBounds:()=>({x:0,y:0,width:0,height:0})}),null);
});
test('valid small user windows retain their actual size on a larger display',()=>{
 const value={bounds:{x:20,y:30,width:640,height:480},maximized:false};
 assert.deepEqual(restore(value,[primary]),value);
});
