// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {STRIP_HEIGHT}=require('./tabs-host.cjs');
const failure=()=>Error('Capture ownership, geometry or pixel scale changed');
const layouts=new WeakMap();
function alphaOffset(factory){
 if(layouts.has(factory))return layouts.get(factory);
 // Native bitmap byte order is platform-specific. Locate alpha using a trusted
 // one-pixel RGBA(30,60,90,128) PNG; do not guess a channel or blend incorrectly.
 const probe=factory.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQs4lqAAACZQE1eq4TfgAAAABJRU5ErkJggg==','base64')).toBitmap();
 const matches=[0,1,2,3].filter(index=>probe[index]===128);
 if(probe.length!==4||matches.length!==1)throw Error('Capture native bitmap layout is unsupported');
 layouts.set(factory,matches[0]);return matches[0];
}
function opaque(raster,alpha){
 for(let index=alpha;index<raster.bytes.length;index+=4)if(raster.bytes[index]!==255)throw Error('Capture requires opaque shell and document surfaces');
}
function raster(image){
 if(image.isEmpty())throw failure();
 const png=image.toPNG();
 if(png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.subarray(12,16).toString()!=='IHDR')throw failure();
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 if(!width||!height||width*height>32*1024*1024)throw failure();
 const bytes=image.toBitmap();
 if(bytes.length!==width*height*4)throw failure();
 return{width,height,bytes};
}
async function compose(window,view,{validate,nativeImage}={}){
 if(typeof validate!=='function'||!window||!view)throw failure();
 const shell=window.webContents,contents=view.webContents;
 function state(){
  const version=validate();
  if(typeof version!=='string'||!version||window.isDestroyed()||shell.isDestroyed()||contents.isDestroyed()||
    window.webContents!==shell||view.webContents!==contents||!window.contentView.children.includes(view)||!view.getVisible())throw failure();
  const [width,height]=window.getContentSize(),bounds=view.getBounds();
  if(![width,height,bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isSafeInteger)||
    width<=0||height<=STRIP_HEIGHT||bounds.x!==0||bounds.y!==STRIP_HEIGHT||bounds.width!==width||bounds.height!==height-STRIP_HEIGHT)throw failure();
  return{version,width,height,bounds};
 }
 const before=state(),key=JSON.stringify(before),check=()=>{if(JSON.stringify(state())!==key)throw failure()};
 const root=await shell.capturePage();check();
 const document=await contents.capturePage();check();
 const base=raster(root),child=raster(document),scale=base.width/before.width;
 const same=value=>Number.isFinite(value)&&Math.abs(value-scale)<1e-8;
 if(!same(base.height/before.height)||!same(child.width/before.bounds.width)||!same(child.height/before.bounds.height))throw failure();
 const x=before.bounds.x*scale,y=before.bounds.y*scale;
 if(![x,y].every(Number.isSafeInteger)||x+child.width>base.width||y+child.height!==base.height)throw failure();
 const factory=nativeImage||require('electron').nativeImage,alpha=alphaOffset(factory);opaque(base,alpha);opaque(child,alpha);
 for(let row=0;row<child.height;row++)child.bytes.copy(base.bytes,((y+row)*base.width+x)*4,row*child.width*4,(row+1)*child.width*4);
 check();
 const image=factory.createFromBitmap(base.bytes,{width:base.width,height:base.height,scaleFactor:1});
 if(image.isEmpty())throw failure();
 return{image,capture:{kind:'shell-and-document-composite',opacity:'opaque-native-surfaces',stripHeight:STRIP_HEIGHT,logicalSize:{width:before.width,height:before.height},pixelSize:{width:base.width,height:base.height},scale,nativeFrame:false}};
}
module.exports={compose};
