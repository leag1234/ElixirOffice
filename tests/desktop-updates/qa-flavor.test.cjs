// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {inventory,prepare,APP_ID,PRODUCT,NSIS_GUID}=require('../../tools/desktop-updates/qa/prepare.cjs');
const {verifyPrepared}=require('../../tools/desktop-updates/qa/guard.cjs');
const root=path.resolve(__dirname,'../..'),qaKeys=crypto.generateKeyPairSync('ed25519');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eo-update-qa-'));fs.chmodSync(temp,0o700);
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
let serial=0;
function manifest(change={}){
 const pem=qaKeys.publicKey.export({type:'spki',format:'pem'}),fingerprint=digest(crypto.createPublicKey(pem).export({type:'spki',format:'der'}));
 return {schema:1,flavor:'elixiroffice-update-qa',role:'old',platform:'linux',currentBuild:1,nextBuild:2,
  productRevision:'a'.repeat(40),documentserverRevision:'b'.repeat(40),
  endpoint:{host:'127.0.0.1',port:18765,prefix:'/eo-update-qa/'+'a'.repeat(32)+'/'},
  tag:'v0.0.0-rc.2',trust:{keyId:'eo-qa-'+'a'.repeat(32),pem,fingerprint},inputs:inventory(root),...change};
}
function compile(m=manifest()){
 const bytes=Buffer.from(JSON.stringify(m)+'\n'),output=path.join(temp,'candidate-'+(++serial));
 const result=prepare({source:root,output,manifest:bytes,seal:digest(bytes)});
 return {m,output,result};
}
test('compile-time QA old/new flavors have isolated identities, actual source seal and real-adapter composition',async()=>{
 assert.notEqual(APP_ID,'org.elixiroffice.desktop');assert.match(PRODUCT,/QA/);assert.notEqual(NSIS_GUID,'5fa5daf2-a61b-5cb4-8b40-2391c8734adc');
 for(const platform of ['linux','win32'])for(const role of ['old','new']){
  const e=compile(manifest({platform,role,currentBuild:role==='old'?1:2}));
  const selected=verifyPrepared(e.output,e.result.manifestSha256),pkg=JSON.parse(fs.readFileSync(path.join(e.output,'package.json')));
  assert.equal(selected.role,role);assert.equal(pkg.main,'qa/entry.cjs');assert.equal(pkg.build.appId,APP_ID);assert.equal(pkg.build.productName,PRODUCT);
  assert.equal(pkg.version,'0.0.0-rc.'+e.m.currentBuild);assert.equal(pkg.build.nsis.guid,NSIS_GUID);
  assert.equal(pkg.build.win.executableName,'elixiroffice');assert.equal(pkg.build.nsis.uninstallDisplayName,PRODUCT);assert.equal(pkg.build.publish,null);
  const vm=require('node:vm');
  for(const name of require('../../tools/desktop-updates/qa/guard.cjs').list(e.output).filter(n=>n.endsWith('.cjs')))
   assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(e.output,name),'utf8'),{filename:name}),name);
  const hook=require(path.join(e.output,'qa/before-pack.cjs'));
  const ctx={electronPlatformName:platform,packager:{info:{appDir:e.output},appInfo:{version:pkg.version,buildVersion:'0.0.0.'+e.m.currentBuild}}};
  await hook(ctx);
  await assert.rejects(()=>hook({...ctx,electronPlatformName:'darwin'}));
  await assert.rejects(()=>hook({...ctx,packager:{...ctx.packager,appInfo:{...ctx.packager.appInfo,buildVersion:'0.0.0.999'}}}));

  assert.equal(pkg.scripts.package,undefined);assert.equal(pkg.scripts['package:mac'],undefined);
  const main=fs.readFileSync(path.join(e.output,'main.cjs'),'utf8');
  assert.match(main,/qa\.createNotice/);assert.match(main,/const policy=qa\.policy/);assert.match(main,/transport:qa\.createTransport/);
  assert.match(main,/ElixirOffice Update QA/);assert(!main.includes('process.env.EO_DESKTOP_PROFILE'));
  const security=fs.readFileSync(path.join(e.output,'update-windows-security.cjs'),'utf8');
  assert(security.includes(NSIS_GUID));assert(security.includes('Uninstall elixiroffice.exe'));
  assert(!security.includes('5fa5daf2-a61b-5cb4-8b40-2391c8734adc'));
  assert(fs.readFileSync(path.join(e.output,'update-package.cjs'),'utf8').includes('Uninstall elixiroffice.exe'));
  for(const file of ['update-transport.cjs','update-production-qualification.cjs','update-policy.cjs','update-installers.cjs'])
   assert.equal(digest(fs.readFileSync(path.join(e.output,file))),digest(fs.readFileSync(path.join(root,'desktop',file))));
  const target={platform,packageType:platform==='linux'?'AppImage':'nsis',arch:'x64',electronVersion:'44.9.1'};
  assert.deepEqual(require(path.join(e.output,'update-policy.cjs')).production.capability(target),require('../../desktop/update-policy.cjs').production.capability(target));
 }
});
for(const platform of ['linux','win32'])for(const role of ['old','new'])
 test(platform+' '+role+' QA builder configuration has no file associations or MIME types',()=>{
  const e=compile(manifest({platform,role,currentBuild:role==='old'?1:2}));
  const pkg=JSON.parse(fs.readFileSync(path.join(e.output,'package.json')));
  assert.deepEqual(pkg.build.fileAssociations,[],'canonical builder associations must be empty');
  assert.equal(pkg.build.linux.desktop.entry.MimeType,'','desktop entry must advertise no MIME types');
  assert.equal(Object.hasOwn(pkg,'fileAssociations'),false,'no misleading top-level association field');
 });
test('QA manifest seal, field strictness, source hash and source anchor drift fail before output is promoted',()=>{
 const before=fs.readdirSync(temp).length,m=manifest(),bytes=Buffer.from(JSON.stringify(m)+'\n');
 assert.throws(()=>prepare({source:root,output:path.join(temp,'badseal'),manifest:bytes,seal:'0'.repeat(64)}));
 for(const change of [
  {flavor:'production'},{currentBuild:3},{platform:'darwin'},{tag:'v0.3.3'},{extra:true},
  {endpoint:{host:'localhost',port:18765,prefix:m.endpoint.prefix}},
  {inputs:{...m.inputs,'desktop/main.cjs':'0'.repeat(64)}},
  {trust:{...m.trust,fingerprint:'0'.repeat(64)}}
 ])assert.throws(()=>compile({...m,...change}));
 assert.equal(fs.readdirSync(temp).length,before);
});
test('compiled QA seal detects changed code, manifest, entry, added files and linked files',()=>{
 for(const mode of ['main','manifest','entry','extra','symlink']){
  const e=compile();
  if(mode==='main')fs.appendFileSync(path.join(e.output,'main.cjs'),'\n// mutation\n');
  if(mode==='manifest')fs.appendFileSync(path.join(e.output,'qa/manifest.json'),' ');
  if(mode==='entry')fs.appendFileSync(path.join(e.output,'qa/entry.cjs'),'\n// mutation\n');
  if(mode==='extra')fs.writeFileSync(path.join(e.output,'unexpected.cjs'),'module.exports=true;');
  if(mode==='symlink'){fs.unlinkSync(path.join(e.output,'main.cjs'));fs.symlinkSync('/nonexistent-private-location',path.join(e.output,'main.cjs'));}
  assert.throws(()=>verifyPrepared(e.output,e.result.manifestSha256));
 }
});
test('QA context sets only its own profile/cache and feeds synthetic release without production fetch',async()=>{
 const e=compile(),calls=[],app={
  getPath:name=>name==='appData'?temp:'unexpected',setPath:(name,value)=>calls.push([name,value]),
  setName:value=>calls.push(['name',value]),setAppUserModelId:value=>calls.push(['appId',value]),getVersion:()=> '0.0.0-rc.1'
 };
 const qa=require(path.join(e.output,'qa/composition.cjs')).load(e.output,e.result.manifestSha256,app);
 assert(calls.some(([k,v])=>k==='name'&&v===PRODUCT));assert(calls.some(([k,v])=>k==='appId'&&v===APP_ID));
 assert(calls.some(([k,v])=>k==='userData'&&v.startsWith(path.join(temp,PRODUCT)+path.sep)));
 const runtime={platform:'linux',packageType:'AppImage',arch:'x64',electronVersion:'44.9.1'};
 assert.equal(qa.policy.capability(runtime).enabled,true);assert.equal(qa.policy.capability({...runtime,platform:'win32',packageType:'nsis'}).enabled,false);
 let fetched=0;
 const notice=qa.createNotice({version:app.getVersion(),save:async()=>{},fetch:()=>{fetched++;throw Error('production fetch forbidden');}});
 await notice.check();assert.equal(fetched,0);assert.equal(notice.notice().version,'0.0.0-rc.2');notice.dispose();
});
test('actual pinned builder selection and metadata normalization survive ASAR under Electron44.9.1',async()=>{
 const cp=require('node:child_process');
 const deps=path.join(root,'desktop/node_modules');
 const {getMainFileMatchers}=require(path.join(deps,'app-builder-lib/out/fileMatcher.js'));
 const {createTransformer}=require(path.join(deps,'app-builder-lib/out/fileTransformer.js'));
 const asar=require(path.join(deps,'@electron/asar'));
 const e=compile(),pkg=JSON.parse(fs.readFileSync(path.join(e.output,'package.json'))),stage=path.join(temp,'asar-stage-'+(++serial));
 fs.mkdirSync(stage);
 const config=structuredClone(pkg.build),info={isPrepackedAppAsar:false,projectDir:e.output,buildResourcesDir:'build',config,debugLogger:{isEnabled:false}};
 const matchers=getMainFileMatchers(e.output,stage,x=>x,config.linux,{info},path.join(e.output,'dist'),false);
 const selected=matchers[0].createFilter(),transform=createTransformer(e.output,config);
 const files=require('../../tools/desktop-updates/qa/guard.cjs').list(e.output);
 assert.equal(selected(path.join(e.output,'.gitignore'),fs.statSync(path.join(e.output,'.gitignore'))),false);
 for(const name of files){
  const from=path.join(e.output,name);if(!selected(from,fs.statSync(from)))continue;
  const dest=path.join(stage,name);fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,await transform(from)||fs.readFileSync(from));
 }
 const packedPkg=JSON.parse(fs.readFileSync(path.join(stage,'package.json')));
 assert.equal(packedPkg.build,undefined);assert.equal(packedPkg.scripts,undefined);
 const archive=path.join(temp,'qa-'+(++serial)+'.asar');await asar.createPackage(stage,archive);
 const electron=require(path.join(deps,'electron'));
 const child=cp.spawnSync(electron,['-e',"if(process.versions.electron!==\'44.9.1\')throw Error(\'wrong Electron\');require(process.argv[1]+'/qa/guard.cjs').verifyPrepared(process.argv[1],process.argv[2]);console.log('SEALED_QA_ASAR_OK');",archive,e.result.manifestSha256],{
  encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,HOME:process.env.HOME,ELECTRON_RUN_AS_NODE:'1'}
 });
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/SEALED_QA_ASAR_OK/);
});
test('QA NSIS GUID equals the pinned builder26.15.3 UUID.v5 contract for its distinct app ID',()=>{
 const {UUID}=require('../../desktop/node_modules/builder-util-runtime');
 assert.equal(NSIS_GUID,UUID.v5(APP_ID,UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3')));
});
test('QA uninstaller basename and DisplayName follow pinned builder26.15.3 generation',()=>{
 const deps=path.join(root,'desktop/node_modules'),e=compile(),pkg=JSON.parse(fs.readFileSync(path.join(e.output,'package.json')));
 assert.equal(JSON.parse(fs.readFileSync(path.join(deps,'app-builder-lib/package.json'))).version,'26.15.3');
 const productionPackage=fs.readFileSync(path.join(root,'desktop/update-package.cjs'),'utf8');
 const productionSecurity=fs.readFileSync(path.join(root,'desktop/update-windows-security.cjs'),'utf8');
 assert(productionPackage.includes('Uninstall ElixirOffice.exe'));
 assert(productionSecurity.includes('Uninstall ElixirOffice.exe'));
 assert(productionSecurity.includes("GetValue('DisplayName') -ceq 'ElixirOffice'"));
 const appInfo=fs.readFileSync(path.join(deps,'app-builder-lib/out/appInfo.js'),'utf8');
 const nsis=fs.readFileSync(path.join(deps,'app-builder-lib/out/targets/nsis/NsisTarget.js'),'utf8');
 const common=fs.readFileSync(path.join(deps,'app-builder-lib/templates/nsis/common.nsh'),'utf8');
 const installer=fs.readFileSync(path.join(deps,'app-builder-lib/templates/nsis/include/installer.nsh'),'utf8');
 assert.match(appInfo,/productFilename = executableName != null \? .*executableName/);
 assert.match(nsis,/PRODUCT_FILENAME: appInfo\.productFilename/);
 assert.match(common,/!define UNINSTALL_FILENAME "Uninstall \$\{PRODUCT_FILENAME\}\.exe"/);
 assert.equal('Uninstall '+pkg.build.win.executableName+'.exe','Uninstall elixiroffice.exe');
 assert.match(nsis,/options\.uninstallDisplayName \|\| "\$\{productName\} \$\{version\}"/);
 assert.match(installer,/DisplayName "\$\{UNINSTALL_DISPLAY_NAME\}\$1"/);
 assert.equal(pkg.build.nsis.uninstallDisplayName,PRODUCT,'explicit QA value must bypass the versioned default');
});
test('re-sealed source anchor drift still refuses and source build metadata cannot evade the full seal',()=>{
 const source=path.join(temp,'anchor-source-'+(++serial));fs.mkdirSync(source);
 for(const name of Object.keys(inventory(root))){
  const dest=path.join(source,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,name),dest);
 }
 const main=path.join(source,'desktop/main.cjs');
 fs.writeFileSync(main,fs.readFileSync(main,'utf8').replace("const policy=require('./update-policy.cjs').production;","const policy = require('./update-policy.cjs').production;"));
 const m=manifest({inputs:inventory(source)}),bytes=Buffer.from(JSON.stringify(m)+'\n'),out=path.join(temp,'anchor-rejected');
 assert.throws(()=>prepare({source,output:out,manifest:bytes,seal:digest(bytes)}));assert(!fs.existsSync(out));
 const e=compile(),file=path.join(e.output,'package.json'),pkg=JSON.parse(fs.readFileSync(file));
 pkg.build.nsis.oneClick=true;fs.writeFileSync(file,JSON.stringify(pkg));assert.throws(()=>verifyPrepared(e.output,e.result.manifestSha256));
});
test('source inventory never opens environment, npm credentials or signing files',()=>{
 const source=path.join(temp,'public-inputs-'+(++serial));fs.mkdirSync(source);
 for(const name of Object.keys(inventory(root))){
  const dest=path.join(source,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,name),dest);
 }
 for(const name of ['.env','.npmrc','private.pem','signing.key']){
  fs.symlinkSync('/does-not-exist-never-open',path.join(source,'desktop',name));
 }
 const selected=inventory(source);
 for(const name of ['.env','.npmrc','private.pem','signing.key'])assert(!Object.hasOwn(selected,'desktop/'+name));
 assert(Object.hasOwn(selected,'desktop/main.cjs'));
});
test('host preparer CLI creates only a reviewed exclusive output and refuses overrides without leaking inputs',()=>{
 const cp=require('node:child_process'),m=manifest(),bytes=Buffer.from(JSON.stringify(m)+'\n');
 const input=path.join(temp,'cli-manifest-'+(++serial)+'.json'),output=path.join(temp,'cli-output-'+(++serial));
 fs.writeFileSync(input,bytes,{mode:0o600});
 const command=path.join(root,'tools/desktop-updates/qa/prepare.cjs');
 const args=['--source',root,'--output',output,'--manifest',input,'--seal',digest(bytes)];
 const result=cp.spawnSync(process.execPath,[command,...args],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);const receipt=JSON.parse(result.stdout);
 assert.equal(receipt.neverPublish,true);assert.equal(verifyPrepared(output,receipt.manifestSha256).role,'old');
 const again=cp.spawnSync(process.execPath,[command,...args],{encoding:'utf8',timeout:15000});assert.notEqual(again.status,0);
 assert.equal(again.stderr.trim(),'QA flavor preparation refused');
 const override=cp.spawnSync(process.execPath,[command,...args,'--private-key','MUST_NOT_PRINT_THIS'],{encoding:'utf8',timeout:15000});
 assert.notEqual(override.status,0);assert(!override.stderr.includes('MUST_NOT_PRINT_THIS'));assert(!override.stdout.includes('MUST_NOT_PRINT_THIS'));
});
test('QA next-target discovery refreshes only synthetic changed-target state; ordinary cadence stays byte-pinned',async()=>{
 const e=compile(manifest({currentBuild:2,nextBuild:3,tag:'v0.0.0-rc.3'}));
 const original=fs.readFileSync(path.join(root,'desktop/release-notice.cjs'));
 assert.equal(digest(original),'b5a3226df9af69a80b165c7dfeb0bf8c88314cd62b45bb97fd873a6a52e7f9df');
 assert.deepEqual(fs.readFileSync(path.join(e.output,'release-notice.cjs')),original);
 const app={getVersion:()=> '0.0.0-rc.2',getPath:()=>temp,setPath(){},setName(){},setAppUserModelId(){}};
 const qa=require(path.join(e.output,'qa/composition.cjs')).load(e.output,e.result.manifestSha256,app);
 const now=2000000000000,page='https://github.com/leag1234/elixiroffice/releases/tag/';
 const candidate=v=>({version:v,url:page+'v'+v});
 const state={enabled:true,lastAttempt:now-60000,candidate:candidate('0.0.0-rc.2'),
  skipped:'0.0.0-rc.1',remindVersion:'0.0.0-rc.2',remindUntil:now+3600000};
 let realFetch=0;const saved=[],before=structuredClone(state);
 const notice=qa.createNotice({version:app.getVersion(),state,now:()=>now,save:async s=>saved.push(s),fetch(){realFetch++;throw Error('Real fetch forbidden');}});
 try{
  assert.equal((await notice.check())?.version,'0.0.0-rc.3');
  assert.equal(saved.length,2);assert.equal(saved[0].lastAttempt,now);assert.equal(saved[0].candidate,null);
  for(const k of ['enabled','skipped','remindVersion','remindUntil'])assert.deepEqual(saved[0][k],state[k]);
  assert.deepEqual(state,before,'QA seam must not mutate its caller state');
  assert.equal(realFetch,0);await notice.check();assert.equal(saved.length,2,'same-instance daily throttle retained');
 }finally{notice.dispose();}
 // Production receives the identical stale state and must still wait the day.
 const ordinary=require('../../desktop/release-notice.cjs').create({version:app.getVersion(),state,now:()=>now,save:async()=>{throw Error('Unexpected save');},fetch(){realFetch++;return [];}});
 try{assert.equal(await ordinary.check(),null);assert.equal(realFetch,0);}finally{ordinary.dispose();}
});
test('QA unchanged target, checks OFF and nonsynthetic/malformed candidates keep bounded discovery behavior',async()=>{
 const e=compile(manifest({currentBuild:2,nextBuild:3,tag:'v0.0.0-rc.3'}));
 const app={getVersion:()=> '0.0.0-rc.2',getPath:()=>temp,setPath(){},setName(){},setAppUserModelId(){}};
 const qa=require(path.join(e.output,'qa/composition.cjs')).load(e.output,e.result.manifestSha256,app);
 const now=2000000000000,page='https://github.com/leag1234/elixiroffice/releases/tag/';
 for(const state of [
  {enabled:true,candidate:{version:'0.0.0-rc.3',url:page+'v0.0.0-rc.3'}},
  {enabled:false,candidate:{version:'0.0.0-rc.2',url:page+'v0.0.0-rc.2'}},
  {enabled:true,candidate:{version:'0.3.3',url:page+'v0.3.3'}},
  {enabled:true,candidate:{version:'0.0.0-rc.2',url:'https://invalid.example/'}},
  {enabled:true,candidate:null}
 ]){
  const initial={...state,lastAttempt:now-60000},before=structuredClone(initial),saved=[];
  const notice=qa.createNotice({version:app.getVersion(),state:initial,now:()=>now,save:async s=>saved.push(s)});
  try{await notice.check();assert.equal(saved.length,0);assert.equal(notice.options().enabled,state.enabled);assert.deepEqual(initial,before);}
  finally{notice.dispose();}
 }
});
test('QA trust requires its exact run ID and refuses the production root even with a QA alias',()=>{
 const m=manifest(),production=require('../../desktop/update-production-trust.cjs')[0];
 for(const trust of [
  {...m.trust,keyId:'eo-2026-1'}, {...m.trust,keyId:'eo-qa-'+'b'.repeat(32)},
  production, {...production,keyId:m.trust.keyId}, {...m.trust,fingerprint:production.fingerprint}
 ])assert.throws(()=>compile({...m,trust}),/QA/);
});
test('sealed QA root verifies its own signature but cannot verify in production, including a forged production ID',()=>{
 const e=compile(),app={getVersion:()=> '0.0.0-rc.1',getPath:()=>temp,setPath(){},setName(){},setAppUserModelId(){}};
 const qa=require(path.join(e.output,'qa/composition.cjs')).load(e.output,e.result.manifestSha256,app);
 const {fixture}=require('../desktop/fixtures/update-test-kit.cjs'),wire=require('../../desktop/update-metadata.cjs');
 const f=fixture({platform:'linux',version:'0.0.0-rc.2'});f.context.channel='prerelease';
 const sign=id=>wire.encodeEnvelope(f.context,[{keyId:id,signature:crypto.sign(null,wire.signingBytes(f.context),qaKeys.privateKey).toString('base64')}]);
 const request={runtime:f.runtime,selectedTag:e.m.tag,metadata:f.metadata,now:f.now,envelope:sign(e.m.trust.keyId)};
 assert.equal(qa.policy.verify(request).context.tag,e.m.tag);
 const {production,createPolicy}=require('../../desktop/update-policy.cjs');
 assert.throws(()=>production.verify(request));
 const productionRoot=createPolicy({qualifiedElectronVersion:'44.9.1',trustedKeys:require('../../desktop/update-production-trust.cjs')});
 assert.equal(productionRoot.capability(f.runtime).enabled,true,'test must exercise cryptographic rejection beyond closed activation');
 assert.throws(()=>productionRoot.verify(request));
 assert.throws(()=>productionRoot.verify({...request,envelope:sign('eo-2026-1')}));
 assert.throws(()=>qa.policy.verify({...request,envelope:sign('eo-2026-1')}));
});
test('production public root and signer/TTY implementations remain byte-identical',()=>{
 const pins={
  'desktop/update-production-trust.cjs':'051c549fd041b9623b4bfc373cbfbae08e959bb7603f3f5a669641399cd39949',
  'tools/desktop-updates/sign-update.cjs':'c62fce4a9167a789807273945ccae740dee668225e2df16d0be0ab76bdface68',
  'tools/desktop-updates/signing.cjs':'bdb980a9277d88b7513d121ae24ab8e2c01ed1ba4a382a14f94b55dd28a93d17',
  'tools/desktop-updates/signing-terminal.cjs':'03b0a38bda5938009e9b28c024cac56d82ab5655e4f2761d094ddb24eb0ae07d'
 };
 for(const [name,pin]of Object.entries(pins))assert.equal(digest(fs.readFileSync(path.join(root,name))),pin,name);
});
