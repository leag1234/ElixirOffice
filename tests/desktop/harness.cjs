// SPDX-License-Identifier: AGPL-3.0-only
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),net=require('node:net');
const os=require('node:os'),crypto=require('node:crypto');
const {parseVersion}=require('../../desktop/release-notice.cjs');
const documents=require('./document-pages.cjs'),{observeBrowser}=require('./observe-browser.cjs');
const root=path.resolve(process.env.EO_DESKTOP_ROOT||path.join(__dirname,'../..'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const busPath=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()).replace(/%2F/g,'/');
// Shipped sample documents must never be edited by a test: work on a temporary copy.
async function fixture(name) {
 const source=path.isAbsolute(name)?name:path.join(root,'fixtures',name);
 const copy=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'eo-fixture-')),path.basename(source));
 await fs.copyFile(source,copy);return copy;
}
function sourcePackageIdentity(expected,userAgent){
 const match=typeof userAgent==='string'&&/(?:^|\s)ElixirOffice[^\s/]*\/([^\s]+)/.exec(userAgent),actual=match?match[1]:'unavailable';
 if(!parseVersion(expected)||!parseVersion(actual)||actual!==expected)throw Error('Source package identity mismatch: expected '+expected+', runtime '+actual+'. Launch the desktop package directory; a direct main.cjs file can report 0.0.');
 return Object.freeze({expected,version:actual});
}
async function launch({file,sourceExecutable=process.env.EO_SOURCE_ELECTRON,profile='test-'+Date.now(),executable=process.env.EO_PACKAGE_EXECUTABLE,args=[],onSpawn,onPage}={}) {
 const {chromium}=require(process.env.EO_PLAYWRIGHT || '../../tools/node_modules/playwright-core');
 const sourceVersion=executable?null:JSON.parse(await fs.readFile(path.join(root,'desktop/package.json'),'utf8')).version;
 if(!executable&&!parseVersion(sourceVersion))throw Error('Invalid source package version '+sourceVersion+'; complete SemVer required');
 if(file&&path.dirname(path.resolve(file))===path.join(root,'fixtures')&&/^sample/.test(path.basename(file)))file=await fixture(file);
 const directory=path.join(root,'profiles',profile);await fs.mkdir(directory,{recursive:true});
 const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 await fs.mkdir(path.join(root,'results'),{recursive:true});
 // Capture mode creates its own unique profile; its strict parser rejects debug flags.
 const applicationEnvironment={...process.env,DISPLAY:process.env.EO_DESKTOP_DISPLAY||':0',XAUTHORITY:path.join(root,'desktop.Xauthority'),EO_DESKTOP_PROFILE:directory,XDG_CONFIG_HOME:path.join(directory,'config'),XDG_DATA_HOME:path.join(directory,'data'),XDG_CACHE_HOME:path.join(directory,'cache'),GSETTINGS_BACKEND:'memory',GTK_USE_PORTAL:'0',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',DBUS_SESSION_BUS_ADDRESS:'unix:path='+busPath(path.join(directory,'no-session-bus')),AT_SPI_BUS_ADDRESS:process.env.EO_NATIVE_A11Y?process.env.AT_SPI_BUS_ADDRESS:'unix:path='+busPath(path.join(directory,'no-a11y-bus'))};
 if(process.env.EO_NATIVE_A11Y){
  assert.equal(process.platform,'linux','Owned native accessibility tests require Linux');
  cp.execFileSync('/usr/bin/python3',[path.join(__dirname,'native-dialog.py'),'--validate-bus'],{env:applicationEnvironment,timeout:5000,stdio:['ignore','pipe','pipe']});
 }
 const launchSpec={executable:executable||sourceExecutable||path.join(root,'tools/electron/electron'),entry:executable?[]:[path.join(root,'desktop')],environment:applicationEnvironment};
 const log=await fs.open(path.join(root,'results',profile+'.log'),'w');
 const launchEpochMs=Date.now();
 const application=cp.spawn(launchSpec.executable,[...(process.platform==='darwin'&&!args.includes('--capture-screens')?['--user-data-dir='+directory]:[]),'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,...(executable?[]:[path.join(root,'desktop')]),...args,...(file?[file]:[])],{detached:true,cwd:root,env:applicationEnvironment,stdio:['ignore',log.fd,log.fd]});
 let browser,monitor;const errors=[],requests=[];
 try {
  if(onSpawn)onSpawn(application);
  for(let i=0;i<100;i++) {
   if(application.exitCode!==null)throw Error('Desktop process exited '+application.exitCode);
   try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);break}catch(error){await sleep(100)}
  }
  assert(browser,'Desktop debugging endpoint did not become ready');
  const command=process.platform==='darwin' ? cp.execFileSync('/bin/ps',['-ww','-p',String(application.pid),'-o','command='],{encoding:'utf8'}) : (await fs.readFile('/proc/'+application.pid+'/cmdline')).toString();
  assert(!command.includes('--no-sandbox')&&!command.includes('--disable-setuid-sandbox'),'Sandbox bypass forbidden');
  let sourceIdentity=null;
  if(!executable){
   const identitySession=await browser.newBrowserCDPSession();
   try{sourceIdentity=sourcePackageIdentity(sourceVersion,(await identitySession.send('Browser.getVersion')).userAgent);}
   finally{await identitySession.detach();}
  }
  monitor=observeBrowser(browser,{errors,requests,onPage:page=>{
   if(process.env.EO_WORKER_PROBE!=='1')return;
   const listener=worker=>{setTimeout(async()=>{try{console.log('WORKER PROBE',worker.url(),await worker.evaluate(()=>({factory:typeof createX2t,entries:performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration}))})))}catch(error){console.log('worker ended',error.message)}},5000)};
   page.on('worker',listener);return()=>page.off('worker',listener);
  }});
  let page;
  for(let i=0;i<100;i++){
   monitor.refresh();
   const initialDocuments=documents.documentPages(browser);
   if(initialDocuments.length===1){page=initialDocuments[0];break;}
   const shells=documents.shellPages(browser);assert(shells.length<=1,'Expected one initial tab shell');
   if(shells.length===1&&await shells[0].evaluate(()=>window.EOTabShellReady===true)){
    const snapshot=await shells[0].evaluate(async()=> (await window.eoTabs.initial()).state);
    if(snapshot.activeId){page=await documents.documentPage(browser,snapshot.activeId);break;}
   }
   if(application.exitCode!==null)throw Error('Desktop process exited before its window');await sleep(100);
  }
  assert(page,'Desktop window did not become ready');
  if(onPage)await onPage(page);
  await page.waitForFunction(()=>window.EODesktopReady||window.EOLocalFailure,null,{timeout:120000});
  const shells=documents.shellPages(browser);assert.equal(shells.length,1,'Expected one initial tab shell');
  const nativeStat=process.platform==='linux'?await fs.readFile('/proc/'+application.pid+'/stat','utf8'):null;
  const nativeIdentity=process.platform==='linux'?{pid:application.pid,executable:await fs.realpath('/proc/'+application.pid+'/exe'),startTime:nativeStat.slice(nativeStat.lastIndexOf(')')+1).trim().split(/\s+/)[19],commandSha256:crypto.createHash('sha256').update(await fs.readFile('/proc/'+application.pid+'/cmdline')).digest('hex'),profile:directory}:null;
  const env={application,browser,page,shell:shells[0],errors,requests,root,directory,log,port,launchEpochMs,nativeIdentity,launchSpec,sourceIdentity,
   disposeObservers:()=>monitor.dispose(),
   documentPages:()=>{monitor.refresh();return documents.documentPages(browser)},
   documentPage:id=>{monitor.refresh();return documents.documentPage(browser,id)},
   async selectDocument(id){monitor.refresh();const selected=await documents.documentPage(browser,id);const identity=await selected.evaluate(()=>window.eoDesktop.identity());let owner;
    for(const shell of documents.shellPages(browser)){const state=await shell.evaluate(async()=> (await window.eoTabs.initial()).state);if(state.windowId===identity.windowId)owner=shell;}
    assert(owner,'Document shell not found');await owner.evaluate(id=>window.eoTabs.activate(id),id);env.page=selected;env.shell=owner;return selected;},
   activeDocument:()=>{monitor.refresh();return documents.activeDocument(browser,env.shell)}};
  return env;
 }catch(error) {monitor?.dispose();await terminate(application);await log.close();throw error}
}
async function exited(application,timeout=3000) {
 const deadline=Date.now()+timeout;
 while(application.exitCode===null&&application.signalCode===null&&Date.now()<deadline)await sleep(50);
 return application.exitCode!==null||application.signalCode!==null;
}
async function terminate(application) {
 if(!application?.pid||application.exitCode!==null||application.signalCode!==null)return;
 if(process.platform==='darwin'){
  try{process.kill(-application.pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}
  await exited(application,1000);return;
 }
 try{process.kill(application.pid,'SIGTERM')}catch(error){if(error.code!=='ESRCH')throw error}
 if(!await exited(application)){
  try{process.kill(-application.pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}
  await exited(application,1000);
 }
}
async function stop(env) {
 // Disconnect CDP before terminating the owned app. On Linux, let Electron's main
 // process reap its children; signalling the whole live group can race GPU teardown.
 if(process.platform==='darwin')await terminate(env.application);
 await env.browser.close().catch(()=>{});
 if(process.platform!=='darwin')await terminate(env.application);
 env.disposeObservers?.();await env.log.close();
}
async function editable(env) {
 try{await env.page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000})}
 catch(error){error.message+='\n'+JSON.stringify({errors:env.errors,requests:env.requests.slice(-15)});throw error}
 assert.equal(await env.page.evaluate(()=>window.EOLocalFailure||null),null,JSON.stringify(env.errors));
 return env.page.evaluate(()=>({format:EOLocalSession.format,stats:EOLocalSession.stats}));
}
module.exports={launch,stop,editable,root,sleep,fixture};
