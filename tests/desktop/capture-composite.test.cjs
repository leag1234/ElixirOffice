// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{compose}=require('../../desktop/capture-composite.cjs');
function fixture(scale=1,alpha=3,top=44){
 let version='stable',hidden=false,destroyed=false,attached=true,rootCalls=0,childCalls=0;
 const bounds={x:0,y:top,width:4,height:48-top},size=[4,48];
 function image(width,height,fill){
  const data=Buffer.alloc(width*height*4,fill),header=Buffer.alloc(24);for(let i=alpha;i<data.length;i+=4)data[i]=255;
  Buffer.from('89504e470d0a1a0a','hex').copy(header);header.write('IHDR',12);header.writeUInt32BE(width,16);header.writeUInt32BE(height,20);
  return{isEmpty:()=>false,toPNG:()=>header,toBitmap:()=>Buffer.from(data),data,getSize:()=>({width,height})};
 }
 const root=image(4*scale,48*scale,17),child=image(4*scale,(48-top)*scale,34);
 const contents={isDestroyed:()=>destroyed,capturePage:async()=>{childCalls++;return child}};
 const view={webContents:contents,getBounds:()=>({...bounds}),getVisible:()=>!hidden};
 const shell={isDestroyed:()=>destroyed,capturePage:async()=>{rootCalls++;return root}};
 const window={webContents:shell,isDestroyed:()=>destroyed,getContentSize:()=>size.slice(),contentView:{get children(){return attached?[view]:[]}}};
 const nativeImage={createFromBuffer:()=>({toBitmap:()=>{const channels=[15,30,45];channels.splice(alpha,0,128);return Buffer.from(channels)}}),createFromBitmap:(data,options)=>({isEmpty:()=>false,data:Buffer.from(data),options})};
 return{window,view,root,child,bounds,size,nativeImage,validate:()=>version,change:()=>{version='changed'},hide:()=>{hidden=true},destroy:()=>{destroyed=true},detach:()=>{attached=false},calls:()=>({root:rootCalls,child:childCalls})};
}
for(const scale of [1,1.25,1.5,2])test('compose preserves the real strip and exact view bytes at scale '+scale,async()=>{
 const f=fixture(scale),result=await compose(f.window,f.view,f),width=4*scale,stripBytes=44*scale*width*4;
 assert.deepEqual(result.image.data.subarray(0,stripBytes),f.root.data.subarray(0,stripBytes));
 assert.deepEqual(result.image.data.subarray(stripBytes),f.child.data);
 assert.deepEqual(result.capture.pixelSize,{width:4*scale,height:48*scale});assert.equal(result.capture.scale,scale);assert.equal(result.capture.nativeFrame,false);
 assert.deepEqual(f.calls(),{root:1,child:1});
});
for(const kind of ['hidden','detached','destroyed','wrong-bounds'])test('reject '+kind+' before reading either target',async()=>{
 const f=fixture();if(kind==='hidden')f.hide();if(kind==='detached')f.detach();if(kind==='destroyed')f.destroy();if(kind==='wrong-bounds')f.bounds.y=43;
 await assert.rejects(compose(f.window,f.view,f),/Capture/);assert.deepEqual(f.calls(),{root:0,child:0});
});
test('a changing owner revision after shell capture refuses a mixed composite before reading the document',async()=>{
 const f=fixture();f.window.webContents.capturePage=async()=>{f.change();return f.root};
 await assert.rejects(compose(f.window,f.view,f),/Capture/);assert.equal(f.calls().child,0);
});
test('a resize or hidden/moved view after document capture refuses the output',async()=>{
 for(const mutate of [f=>{f.size[1]=49},f=>f.hide(),f=>f.detach()]){
  const f=fixture();f.view.webContents.capturePage=async()=>{mutate(f);return f.child};
  await assert.rejects(compose(f.window,f.view,f),/Capture/);
 }
});
test('mismatched bitmap lengths and capture scales never produce an image',async()=>{
 for(const mutate of [f=>{f.child.toBitmap=()=>Buffer.alloc(1)},f=>{f.child.toPNG=()=>f.root.toPNG()}]){
  const f=fixture();mutate(f);await assert.rejects(compose(f.window,f.view,f),/Capture/);
 }
});

for(const alpha of [0,1,2,3])test('native alpha layout is measured rather than assumed: index '+alpha,async()=>{
 const f=fixture(1,alpha),result=await compose(f.window,f.view,f);assert.equal(result.capture.opacity,'opaque-native-surfaces');
});
test('unexpected transparency and an unknown native format fail instead of writing a false composite',async()=>{
 for(const target of ['root','child']){
  const f=fixture();f[target].data[3]=128;await assert.rejects(compose(f.window,f.view,f),/opaque/);
 }
 const f=fixture();f.nativeImage.createFromBuffer=()=>({toBitmap:()=>Buffer.from([255,255,255,255])});
 await assert.rejects(compose(f.window,f.view,f),/layout/);
});

for(const scale of [1,1.25,1.5,2])test('no-strip owner captures the complete real view at scale '+scale,async()=>{
 const f=fixture(scale,3,0),result=await compose(f.window,f.view,{...f,getStripHeight:()=>0});
 assert.deepEqual(result.image.data,f.child.data);assert.equal(result.capture.stripHeight,0);
 assert.equal(result.capture.kind,'document-full-client');assert.deepEqual(f.calls(),{root:0,child:1});
});
test('trusted strip height must match view geometry and remain one supported layout',async()=>{
 for(const [top,expected]of [[0,44],[44,0],[0,43],[0,NaN],[0,null]]){
  const f=fixture(1,3,top);await assert.rejects(compose(f.window,f.view,{...f,getStripHeight:()=>expected}),/Capture/);
  assert.deepEqual(f.calls(),{root:0,child:0});
 }
});
test('a changed trusted chrome height after shell capture refuses a mixed image',async()=>{
 const f=fixture(),layout={top:44};
 f.window.webContents.capturePage=async()=>{layout.top=0;return f.root};
 await assert.rejects(compose(f.window,f.view,{...f,getStripHeight:()=>layout.top}),/Capture/);
 assert.equal(f.calls().child,0);
});

test('a fully covered no-strip shell is never captured; ownership and child opacity remain mandatory',async()=>{
 const f=fixture(1,3,0);
 f.window.webContents.capturePage=async()=>{throw Error('UnknownVizError')};
 const result=await compose(f.window,f.view,{...f,getStripHeight:()=>0});
 assert.deepEqual(result.image.data,f.child.data);
 f.child.data[3]=128;await assert.rejects(compose(f.window,f.view,{...f,getStripHeight:()=>0}),/opaque/);
 f.hide();await assert.rejects(compose(f.window,f.view,{...f,getStripHeight:()=>0}),/Capture/);
});

for(const scale of [1,1.25,1.5,2])test('compact36 capture preserves real shell/document bytes at scale '+scale,async()=>{
 const f=fixture(scale,3,36);f.getStripHeight=()=>36;
 const result=await compose(f.window,f.view,f),length=36*scale*4*scale*4;
 assert.equal(result.capture.stripHeight,36);
 assert.deepEqual(result.image.data.subarray(0,length),f.root.data.subarray(0,length));
 assert.deepEqual(result.image.data.subarray(length),f.child.data);
});
for(const top of [1,35,37,40,43,45])test('unknown band height '+top+' remains rejected',async()=>{
 const f=fixture(1,3,top);f.getStripHeight=()=>top;
 await assert.rejects(compose(f.window,f.view,f),/Capture/);assert.deepEqual(f.calls(),{root:0,child:0});
});
