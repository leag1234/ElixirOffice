// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),tty=require('node:tty'),crypto=require('node:crypto');
const {MAX_SECRET}=require('./signing.cjs');
function fail(){throw Error('Invalid private signing input');}
function readPrivateFD(fd){
 if(!Number.isSafeInteger(fd)||fd<3||fd>1024)fail();
 const st=fs.fstatSync(fd,{bigint:true});
 if((!st.isFile()&&!st.isFIFO())||st.uid!==BigInt(process.geteuid())||(st.mode&0o7777n)!==0o600n||(st.isFile()&&st.nlink!==1n))fail();
 const bytes=Buffer.alloc(MAX_SECRET+2);let length=0;
 try{
  for(;;){
   const n=fs.readSync(fd,bytes,length,1,null);if(!n)break;
   if(bytes[length]===10)break;
   if(++length>MAX_SECRET&&!(length===MAX_SECRET+1&&bytes[length-1]===13))fail();
  }
  if(length&&bytes[length-1]===13)length--;
  if(!length||bytes.subarray(0,length).includes(0)||bytes.subarray(0,length).includes(13))fail();
  return Buffer.from(bytes.subarray(0,length));
 }finally{bytes.fill(0);}
}
function createTerminal(){
 let fd,stream;
 function open(){
  if(stream)return;
  fd=fs.openSync('/dev/tty',fs.constants.O_RDWR|fs.constants.O_NOCTTY);
  if(!tty.isatty(fd)){fs.closeSync(fd);fd=undefined;fail();}
  stream=new tty.ReadStream(fd);
 }
 function writeTTY(text){
  const bytes=Buffer.from(text);
  for(let offset=0;offset<bytes.length;){
   const n=fs.writeSync(fd,bytes,offset,bytes.length-offset,null);
   if(n<1)fail();offset+=n;
  }
 }
 function line(prompt,max){
  open();
  return new Promise((resolve,reject)=>{
   const bytes=Buffer.alloc(max);let length=0,done=false;
   const finish=(error)=>{
    if(done)return;done=true;
    stream.pause();stream.removeListener('data',data);stream.removeListener('error',cancel);stream.removeListener('end',cancel);
    for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.removeListener(signal,cancel);
    try{stream.setRawMode(false);writeTTY('\n');}catch{error=Error('Invalid private signing input');}
    if(error){bytes.fill(0);reject(Error('Invalid private signing input'));}
    else{const result=Buffer.from(bytes.subarray(0,length));bytes.fill(0);resolve(result);}
   };
   const cancel=()=>finish(Error('Cancelled'));
   const data=chunk=>{
    try{
     for(let index=0;index<chunk.length;index++){
      const value=chunk[index];
      if(value===10||value===13){if(index!==chunk.length-1)return cancel();return finish();}
      if(value===3||value===4||value===27||value===0)return cancel();
      if(value===8||value===127){if(length){let start=length-1;while(start>0&&(bytes[start]&0xc0)===0x80)start--;bytes.fill(0,start,length);length=start;}continue;}
      if(length>=max)return cancel();bytes[length++]=value;
     }
    }finally{chunk.fill(0);}
   };
   stream.on('data',data);stream.once('error',cancel);stream.once('end',cancel);
   for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.once(signal,cancel);
   try{stream.setRawMode(true);writeTTY(prompt);stream.resume();}catch{cancel();}
  });
 }
 return {
  async readSecret(){return line('Private key passphrase (hidden): ',MAX_SECRET);},
  async approve(details){
   open();
   writeTTY(JSON.stringify(details,null,2)+'\n');
   const expected='SIGN '+crypto.createHash('sha256').update(JSON.stringify(details)).digest('hex');
   const input=await line('Approval: type '+expected+' (hidden): ',expected.length);
   try{return input.equals(Buffer.from(expected));}finally{input.fill(0);}
  },
  close(){if(stream){try{stream.setRawMode(false);}finally{stream.destroy();stream=undefined;fd=undefined;}}else if(fd!==undefined){fs.closeSync(fd);fd=undefined;}}
 };
}
module.exports={readPrivateFD,createTerminal};
