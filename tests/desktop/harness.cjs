// SPDX-License-Identifier: AGPL-3.0-only
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),net=require('node:net');
const os=require('node:os');
const root=path.resolve(process.env.EO_DESKTOP_ROOT||path.join(__dirname,'../..'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Shipped sample documents must never be edited by a test: work on a temporary copy.
async function fixture(name) {
 const source=path.isAbsolute(name)?name:path.join(root,'fixtures',name);
 const copy=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'eo-fixture-')),path.basename(source));
 await fs.copyFile(source,copy);return copy;
}
async function launch({file,profile='test-'+Date.now(),executable=process.env.EO_PACKAGE_EXECUTABLE,args=[],onSpawn,onPage}={}) {
 const {chromium}=require(process.env.EO_PLAYWRIGHT || '../../tools/node_modules/playwright-core');
 if(file&&path.dirname(path.resolve(file))===path.join(root,'fixtures')&&/^sample/.test(path.basename(file)))file=await fixture(file);
 const directory=path.join(root,'profiles',profile);await fs.mkdir(directory,{recursive:true});
 const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const log=await fs.open(path.join(root,'results',profile+'.log'),'w');
 const launchEpochMs=Date.now();
 // Capture mode creates its own unique profile; its strict parser rejects debug flags.
 const application=cp.spawn(executable||path.join(root,'tools/electron/electron'),[...(process.platform==='darwin'&&!args.includes('--capture-screens')?['--user-data-dir='+directory]:[]),'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,...(executable?[]:[path.join(root,'desktop/main.cjs')]),...args,...(file?[file]:[])],
 {detached:true,cwd:root,env:{...process.env,DISPLAY:process.env.EO_DESKTOP_DISPLAY||':0',XAUTHORITY:path.join(root,'desktop.Xauthority'),EO_DESKTOP_PROFILE:directory,XDG_CONFIG_HOME:path.join(directory,'config'),XDG_DATA_HOME:path.join(directory,'data'),XDG_CACHE_HOME:path.join(directory,'cache'),GSETTINGS_BACKEND:'memory',GTK_USE_PORTAL:'0',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',DBUS_SESSION_BUS_ADDRESS:'unix:path='+path.join(directory,'no-session-bus')},stdio:['ignore',log.fd,log.fd]});
 let browser;
 try {
  if(onSpawn)onSpawn(application);
  for(let i=0;i<100;i++) {
   if(application.exitCode!==null)throw Error('Desktop process exited '+application.exitCode);
   try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);break}catch(error){await sleep(100)}
  }
  assert(browser,'Desktop debugging endpoint did not become ready');
  const command=process.platform==='darwin' ? cp.execFileSync('/bin/ps',['-ww','-p',String(application.pid),'-o','command='],{encoding:'utf8'}) : (await fs.readFile('/proc/'+application.pid+'/cmdline')).toString();
  assert(!command.includes('--no-sandbox')&&!command.includes('--disable-setuid-sandbox'),'Sandbox bypass forbidden');
  let page;for(let i=0;i<100;i++){page=browser.contexts()[0]?.pages()[0];if(page)break;if(application.exitCode!==null)throw Error('Desktop process exited before its window');await sleep(100)}
  assert(page,'Desktop window did not become ready');
  const errors=[],requests=[];
  if(process.env.EO_WORKER_PROBE==='1')page.on('worker',worker=>{setTimeout(async()=>{try{console.log('WORKER PROBE',worker.url(),await worker.evaluate(()=>({factory:typeof createX2t,entries:performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration}))})))}catch(error){console.log('worker ended',error.message)}},5000)});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  page.on('request',request=>requests.push({url:request.url(),method:request.method()}));
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url())});
  if(onPage)await onPage(page);
  await page.waitForFunction(()=>window.EODesktopReady||window.EOLocalFailure,null,{timeout:120000});
  return {application,browser,page,errors,requests,root,directory,log,port,launchEpochMs};
 }catch(error) {if(application.pid&&application.exitCode===null&&application.signalCode===null){try{process.kill(-application.pid,'SIGTERM')}catch(cleanup){if(cleanup.code!=='ESRCH')throw cleanup}}await log.close();throw error}
}
async function stop(env) {
 // A native Mac sheet can block CDP Browser.close during test cleanup.
 // Kill only this harness's live, detached child group; documents are temp copies.
 if(process.platform==='darwin'&&env.application.exitCode===null&&env.application.signalCode===null){try{process.kill(-env.application.pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}}
 await env.browser.close().catch(()=>{});
 if(process.platform!=='darwin'&&env.application.exitCode===null&&env.application.signalCode===null){try{process.kill(-env.application.pid,'SIGTERM')}catch(error){if(error.code!=='ESRCH')throw error}}
 await sleep(500);await env.log.close();
}
async function editable(env) {
 try{await env.page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000})}
 catch(error){error.message+='\n'+JSON.stringify({errors:env.errors,requests:env.requests.slice(-15)});throw error}
 assert.equal(await env.page.evaluate(()=>window.EOLocalFailure||null),null,JSON.stringify(env.errors));
 return env.page.evaluate(()=>({format:EOLocalSession.format,stats:EOLocalSession.stats}));
}
module.exports={launch,stop,editable,root,sleep,fixture};
