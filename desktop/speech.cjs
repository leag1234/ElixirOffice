// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const path=require('node:path'),fs=require('node:fs'),net=require('node:net'),childProcess=require('node:child_process');
// Read Aloud uses the Web Speech API. On Linux Chromium only talks to speech-dispatcher when
// enable-speech-dispatcher is set, and it never starts the daemon itself. The stock daemon also
// quits five seconds after its last client, and Chromium asks for the voices only once, so the
// daemon has to be running before that first request. This module starts it when needed and keeps
// one idle connection open while the app runs; the daemon then stops by itself after the app.
function socketPath(env=process.env){
 const address=String(env.SPEECHD_ADDRESS||'');
 if(address.startsWith('unix_socket:'))return address.slice('unix_socket:'.length);
 if(address)return null;
 const base=env.XDG_RUNTIME_DIR||(typeof process.getuid==='function'?'/run/user/'+process.getuid():null);
 return base?path.join(base,'speech-dispatcher','speechd.sock'):null;
}
// Resolves with a connected socket, or null.
function open(file,{connect=net.connect,timeout=500}={}){
 return new Promise(resolve=>{
  let done=false,socket;
  const finish=value=>{if(done)return;done=true;if(!value){try{socket?.destroy();}catch{}}resolve(value);};
  try{socket=connect(file);}catch{return finish(null);}
  socket.once('connect',()=>finish(socket));socket.once('error',()=>finish(null));
  setTimeout(()=>finish(null),timeout).unref?.();
 });
}
// Starts the daemon when it is not running and holds one connection to it.
// Never throws; resolves true when a daemon answers.
async function ensureDaemon({platform=process.platform,env=process.env,connect,spawn=childProcess.spawn,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=20}={}){
 if(platform!=='linux')return false;
 const file=socketPath(env);
 if(!file)return false;
 let socket=await open(file,{connect});
 if(!socket){
  try{
   const child=spawn('speech-dispatcher',['--spawn'],{detached:true,stdio:'ignore',env});
   child.on?.('error',()=>{});child.unref?.();
  }catch{return false;}
  for(let i=0;i<attempts&&!socket;i++){await wait(100);socket=await open(file,{connect});}
 }
 if(!socket)return false;
 try{
  socket.on('error',()=>{});socket.on('data',()=>{});
  socket.write('SET SELF CLIENT_NAME "elixiroffice:keepalive:main"\r\n');
  socket.unref?.();
 }catch{}
 return true;
}
// Synchronous: true when a daemon is running (its socket exists) or the speech-dispatcher executable can be found.
// Without either, libspeechd tries to autospawn a daemon from inside the multithreaded browser process and the forked
// child crashes (#89), so the caller must not enable Chromium's speech-dispatcher support.
function daemonAvailable({env=process.env,exists=file=>{try{return fs.existsSync(file);}catch{return false;}},executable=file=>{try{fs.accessSync(file,fs.constants.X_OK);return fs.statSync(file).isFile();}catch{return false;}}}={}){
 const file=socketPath(env);
 if(file&&exists(file))return true;
 const dirs=String(env.PATH||'').split(path.delimiter).filter(Boolean);
 for(const dir of ['/usr/bin','/usr/local/bin'])if(!dirs.includes(dir))dirs.push(dir);
 return dirs.some(dir=>executable(path.join(dir,'speech-dispatcher')));
}
module.exports={socketPath,open,ensureDaemon,daemonAvailable};
