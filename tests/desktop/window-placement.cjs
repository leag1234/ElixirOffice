// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Run on an owned Linux display with EO_SOURCE_ELECTRON and EO_DESKTOP_ROOT.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {launch,stop,sleep,root}=require('./harness.cjs');
(async()=>{
 assert.equal(process.platform,'linux','This native placement check requires an owned Linux display');
 assert(process.env.EO_DESKTOP_DISPLAY,'Explicit owned display required');
 const profile='window-placement-'+Date.now(),directory=path.join(root,'profiles',profile);
 await fs.mkdir(directory,{recursive:true});
 await fs.writeFile(path.join(directory,'desktop-settings.json'),JSON.stringify({recents:[],fontChoice:'declined',fontConsent:false,releaseNotice:{enabled:false}}),{flag:'wx',mode:0o600});
 let env,inspector;
 const read=()=>fs.readFile(path.join(directory,'desktop-settings.json'),'utf8').then(JSON.parse);
 async function start(){
  const listener=require('node:net').createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  env=await launch({profile,args:['--ozone-platform=x11','--inspect=127.0.0.1:'+port]});
  const endpoints=await fetch('http://127.0.0.1:'+port+'/json/list').then(response=>response.json());
  assert.equal(endpoints.length,1);
  inspector=new WebSocket(endpoints[0].webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{inspector.addEventListener('open',resolve,{once:true});inspector.addEventListener('error',reject,{once:true})});
  const actual=await geometry();
  console.log(JSON.stringify({bounds:actual,displays:await geometry(undefined,'process.mainModule.require("electron").screen.getAllDisplays().map(d=>({workArea:d.workArea,scaleFactor:d.scaleFactor}))')}));
  return actual;
 }
 async function geometry(bounds,custom){
  const expression=custom||'process.mainModule.require("electron").BrowserWindow.getAllWindows().find(w=>!w.isDestroyed())'+(bounds?'.setBounds('+JSON.stringify(bounds)+')':'.getBounds()');
  const result=await new Promise((resolve,reject)=>{
   inspector.addEventListener('message',function listener(event){
    const value=JSON.parse(event.data);if(value.id!==1)return;
    inspector.removeEventListener('message',listener);value.error?reject(Error(JSON.stringify(value.error))):resolve(value.result);
   });inspector.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));
  });
  assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;
 }
 async function quit(){
  inspector.close();
  await env.page.evaluate(()=>{void eoDesktop.quit()});
  for(let i=0;i<100&&env.application.exitCode===null&&env.application.signalCode===null;i++)await sleep(50);
  assert.equal(env.application.exitCode,0,'Graceful app quit must flush placement');
  assert.equal(env.application.signalCode,null);
  await stop(env);env=null;
 }
 async function preference(enabled){
  await env.page.locator('[data-action="settings"]').click();
  const option=env.page.locator('#remember-window-placement');await option.waitFor();
  assert.equal(await option.isChecked(),!enabled);
  await option.setChecked(enabled);
  await env.page.locator('dialog[open]').getByRole('button',{name:'Save',exact:true}).click();
  await env.page.locator('dialog[open]').waitFor({state:'hidden'});
  assert.equal((await env.page.evaluate(()=>eoDesktop.windowOptions())).rememberWindowPlacement,enabled);
 }
 try{
  let window=await start();
  assert.equal((await env.page.evaluate(()=>eoDesktop.windowOptions())).rememberWindowPlacement,true);
  const expected={x:75,y:65,width:1060,height:760};
  await geometry(expected);
  await sleep(300);await quit();
  assert.deepEqual((await read()).windowState.bounds,{x:75,y:65,width:1060,height:760});
  window=await start();
  for(const [key,value]of Object.entries(expected))assert.equal(window[key],value,'reopened '+key);
  await preference(false);
  await geometry({x:120,y:110,width:980,height:720});
  await sleep(300);await quit();
  assert.equal((await read()).windowState,undefined);
  window=await start();
  assert.notEqual(window.width,980,'Disabled placement must use default dimensions');
  assert.equal((await env.page.evaluate(()=>eoDesktop.windowOptions())).rememberWindowPlacement,false);
  await geometry({x:85,y:80,width:1000,height:750});
  await preference(true);await quit();
  window=await start();
  for(const [key,value]of Object.entries({x:85,y:80,width:1000,height:750}))assert.equal(window[key],value,'reenabled '+key);
  assert.deepEqual(env.errors,[]);await quit();
  console.log('PASS actual Linux settings checkbox, native resize/move, graceful quit, disabled and enabled restarts');
 }finally{inspector?.close();if(env)await stop(env);}
})().catch(error=>{console.error(error);process.exitCode=1});
