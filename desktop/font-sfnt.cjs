// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Bounded SFNT coverage inspection; fonts are never executed or modified.
function bounds(bytes,at,size){if(!Number.isSafeInteger(at)||at<0||!Number.isSafeInteger(size)||size<0||at+size>bytes.length)throw Error('Invalid font bounds');}
function offsets(bytes){
 bounds(bytes,0,12);
 if(bytes.toString('ascii',0,4)!=='ttcf')return [0];
 const count=bytes.readUInt32BE(8);if(!count||count>64)throw Error('Invalid font collection');
 bounds(bytes,12,count*4);return Array.from({length:count},(_,i)=>bytes.readUInt32BE(12+i*4));
}
function tables(bytes,offset){
 bounds(bytes,offset,12);
 const tag=bytes.toString('ascii',offset,offset+4),signature=bytes.readUInt32BE(offset);
 if(signature!==0x10000&&!['OTTO','true'].includes(tag))throw Error('Unsupported font');
 const count=bytes.readUInt16BE(offset+4);if(count>256)throw Error('Invalid font tables');
 bounds(bytes,offset+12,count*16);const out={};
 for(let i=0;i<count;i++){const p=offset+12+i*16,start=bytes.readUInt32BE(p+8),length=bytes.readUInt32BE(p+12);bounds(bytes,start,length);out[bytes.toString('ascii',p,p+4)]={start,length};}
 return out;
}
function compact(ranges){
 ranges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const result=[];
 for(const [start,end] of ranges){if(start>end||end>0x10ffff)throw Error('Invalid font codepoint');const last=result.at(-1);if(last&&start<=last[1]+1)last[1]=Math.max(last[1],end);else result.push([start,end]);}
 return result;
}
function inspect(bytes,offset=0){
 const ts=tables(bytes,offset),ranges=[],cmap=ts.cmap;
 if(cmap){
  const end=cmap.start+cmap.length;bounds(bytes,cmap.start,4);const count=bytes.readUInt16BE(cmap.start+2);
  if(count>256||cmap.start+4+count*8>end)throw Error('Invalid cmap');
  const seen=new Set();
  for(let i=0;i<count;i++){
   const p=cmap.start+4+i*8,platform=bytes.readUInt16BE(p),encoding=bytes.readUInt16BE(p+2);
   if(!(platform===0||platform===3&&[1,10].includes(encoding)))continue;
   const at=cmap.start+bytes.readUInt32BE(p+4);if(seen.has(at))continue;seen.add(at);
   bounds(bytes,at,4);if(at+4>end)throw Error('Invalid cmap offset');const format=bytes.readUInt16BE(at);
   if(format===4){
    const length=bytes.readUInt16BE(at+2);bounds(bytes,at,length);if(at+length>end||length<16)throw Error('Invalid cmap4');
    const n=bytes.readUInt16BE(at+6)/2;if(!Number.isInteger(n)||n>8192||16+n*8>length)throw Error('Invalid cmap4 segments');
    const starts=at+16+n*2,deltas=starts+n*2,indices=deltas+n*2;let previous=-1;
    for(let j=0;j<n;j++){
     const stop=bytes.readUInt16BE(at+14+j*2),start=bytes.readUInt16BE(starts+j*2),delta=bytes.readInt16BE(deltas+j*2),range=bytes.readUInt16BE(indices+j*2);
     if(start>stop||start<=previous)throw Error('Invalid cmap4 range');previous=stop;let first=null,last=null;
     for(let cp=start;cp<=stop&&cp<0xffff;cp++){
      let glyph=(cp+delta)&65535;
      if(range){const pos=indices+j*2+range+(cp-start)*2;if(pos+2>at+length)throw Error('Invalid cmap4 glyph');glyph=bytes.readUInt16BE(pos);if(glyph)glyph=(glyph+delta)&65535;}
      if(glyph){if(first===null)first=cp;last=cp;}else if(first!==null){ranges.push([first,last]);first=null;}
     }
     if(first!==null)ranges.push([first,last]);
    }
   }else if(format===12||format===13){
    bounds(bytes,at,16);const length=bytes.readUInt32BE(at+4),n=bytes.readUInt32BE(at+12);bounds(bytes,at,length);
    if(at+length>end||n>200000||16+n*12>length)throw Error('Invalid cmap groups');
    for(let j=0;j<n;j++){const p=at+16+j*12,start=bytes.readUInt32BE(p),stop=bytes.readUInt32BE(p+4),glyph=bytes.readUInt32BE(p+8);if(start>stop||stop>0x10ffff)throw Error('Invalid cmap group');if(glyph)ranges.push([start,stop]);else if(format===12&&start<stop)ranges.push([start+1,stop]);}
   }
  }
 }
 const os=ts['OS/2'];return {coverage:compact(ranges),embedding:os&&os.length>=10?bytes.readUInt16BE(os.start+8):0,variable:!!ts.fvar};
}
function instances(bytes,offset=0){
 const ts=tables(bytes,offset),fvar=ts.fvar,name=ts.name;if(!fvar)return [];
 if(!name||fvar.length<16||name.length<6)throw Error('Invalid variable font metadata');
 const count=bytes.readUInt16BE(name.start+2),strings=name.start+bytes.readUInt16BE(name.start+4),labels=new Map();
 if(count>4096||6+count*12>name.length)throw Error('Invalid variable font names');
 for(let i=0;i<count;i++){
  const at=name.start+6+i*12,platform=bytes.readUInt16BE(at),language=bytes.readUInt16BE(at+4),id=bytes.readUInt16BE(at+6),length=bytes.readUInt16BE(at+8),start=strings+bytes.readUInt16BE(at+10);
  if(![0,3].includes(platform)||length%2||length>2048||start<name.start||start+length>name.start+name.length)continue;
  if(!labels.has(id)||language===0x409)labels.set(id,Buffer.from(bytes.subarray(start,start+length)).swap16().toString('utf16le').replace(/\0/g,''));
 }
 const start=fvar.start,axisOffset=bytes.readUInt16BE(start+4),axisCount=bytes.readUInt16BE(start+8),axisSize=bytes.readUInt16BE(start+10),countInstances=bytes.readUInt16BE(start+12),instanceSize=bytes.readUInt16BE(start+14);
 if(axisOffset<16||axisCount>64||axisSize<20||countInstances>4096||instanceSize<4+4*axisCount||axisOffset+axisCount*axisSize+countInstances*instanceSize>fvar.length)throw Error('Invalid variable font instances');
 return Array.from({length:countInstances},(_,i)=>{
  const at=start+axisOffset+axisCount*axisSize+i*instanceSize,style=labels.get(bytes.readUInt16BE(at));
  const ps=instanceSize>=6+axisCount*4?labels.get(bytes.readUInt16BE(at+4+axisCount*4)):undefined;
  const isDefault=Array.from({length:axisCount},(_,a)=>bytes.readInt32BE(at+4+a*4)===bytes.readInt32BE(start+axisOffset+a*axisSize+8)).every(Boolean);
  return {instance:i+1,style,postscriptName:ps,isDefault};
 }).filter(x=>x.style);
}
module.exports={offsets,tables,inspect,instances};
