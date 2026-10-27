// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const wire=require('../../tools/desktop-updates/signed-metadata.cjs');
const modulePath=path.resolve(__dirname,'../../tools/desktop-updates/signing.cjs');
const signer=fs.existsSync(modulePath)?require(modulePath):{};
const hash=(bytes,type='sha256')=>crypto.createHash(type).update(bytes).digest(type==='sha512'?'base64':'hex');
async function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo-sign-test-'));
 try{
  const artifacts=path.join(root,'artifacts'),keys=path.join(root,'keys'),output=path.join(root,'output');
  for(const dir of [artifacts,keys,output])fs.mkdirSync(dir,{mode:0o700});
  const pair=crypto.generateKeyPairSync('ed25519'),pass=crypto.randomBytes(24).toString('base64');
  const keyFile=path.join(keys,'synthetic-encrypted.pem');
  fs.writeFileSync(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase:pass}),{mode:0o600});
  const payload=Buffer.from('synthetic final installer\n'),now=Date.now();
  const c={schema:1,repository:wire.REPOSITORY,tag:'v0.4.0',version:'0.4.0',build:19,sequence:1,channel:'stable',platform:'win32',arch:'x64',packageType:'nsis',issuedAt:now-1000,expiresAt:now+wire.DAY,metadataName:'latest.yml',metadataSha512:'',artifact:{name:'ElixirOffice-0.4.0-win-x64.exe',size:payload.length,sha512:hash(payload,'sha512')}};
  const metadata=Buffer.from('version: '+c.version+'\nfiles:\n  - url: '+c.artifact.name+'\n    sha512: '+c.artifact.sha512+'\n    size: '+c.artifact.size+'\n');
  c.metadataSha512=hash(metadata,'sha512');
  fs.writeFileSync(path.join(artifacts,c.artifact.name),payload);
  fs.writeFileSync(path.join(artifacts,c.metadataName),metadata);
  const inventory={schema:1,product_revision:'a'.repeat(40),documentserver_revision:'b'.repeat(40),context:c};
  const inventoryPath=path.join(root,'candidate.json');
  const bytes=Buffer.from(JSON.stringify(inventory)+'\n');fs.writeFileSync(inventoryPath,bytes,{mode:0o600});
  const fingerprint=hash(pair.publicKey.export({type:'spki',format:'der'}));
  const opts={inventory:inventoryPath,seal:hash(bytes),artifacts,key:keyFile,keyId:'synthetic-test',fingerprint,tag:c.tag,build:c.build,platform:c.platform,product:inventory.product_revision,documentserver:inventory.documentserver_revision,output};
  await run({root,artifacts,keys,output,pair,pass,now,c,metadata,payload,inventory,opts,
   rewrite(){const b=Buffer.from(JSON.stringify(inventory)+'\n');fs.writeFileSync(inventoryPath,b);opts.seal=hash(b);}
  });
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
const approve=async()=>true;
function options(f,extra={}){return {readSecret:async()=>Buffer.from(f.pass),approve,now:()=>f.now,...extra};}
test('sign only final validated bytes, returning an envelope accepted by verifier and YAML boundary',()=>fixture(async f=>{
 const result=await signer.signCandidate(f.opts,options(f));
 assert.equal(result.name,'latest.yml.sig.json');
 const envelope=fs.readFileSync(path.join(f.output,result.name));
 const v=wire.verifyMetadata(envelope,f.metadata,{trustedKeys:{'synthetic-test':f.pair.publicKey},expected:{tag:f.c.tag,platform:'win32',arch:'x64',packageType:'nsis'},now:f.now});
 assert.deepEqual(wire.describeUpdate(v).artifact,f.c.artifact);
 assert.equal(fs.statSync(path.join(f.output,result.name)).mode&0o777,0o600);
 assert.deepEqual(fs.readdirSync(f.output),[result.name]);
}));
test('unsigned semantic preflight cannot become a verified record',()=>fixture(f=>{
 const prepared=wire.validateSigningMetadata(f.c,f.metadata);
 assert(Object.isFrozen(prepared)&&Object.isFrozen(prepared.context)&&Object.isFrozen(prepared.context.artifact));
 assert.equal(prepared.description.version,f.c.version);
 assert.throws(()=>wire.describeUpdate(prepared),/Invalid signed update/);
 assert.throws(()=>wire.assessCandidate(prepared,{runningVersion:'0.3.2',state:null}),/Invalid signed update/);
}));
for(const [name,mutate] of [
 ['seal',f=>f.opts.seal='0'.repeat(64)],
 ['tag',f=>f.opts.tag='v0.5.0'],
 ['build',f=>f.opts.build++],
 ['platform',f=>f.opts.platform='linux'],
 ['product source',f=>f.opts.product='c'.repeat(40)],
 ['documentserver source',f=>f.opts.documentserver='c'.repeat(40)],
 ['expired context',f=>{f.inventory.context.expiresAt=f.now;f.rewrite();}],
 ['future context',f=>{f.inventory.context.issuedAt=f.now+1;f.rewrite();}],
 ['wrong artifact bytes',f=>fs.writeFileSync(path.join(f.artifacts,f.c.artifact.name),Buffer.alloc(f.payload.length,1))],
 ['truncated artifact',f=>fs.truncateSync(path.join(f.artifacts,f.c.artifact.name),1)],
 ['metadata bytes',f=>fs.appendFileSync(path.join(f.artifacts,f.c.metadataName),'#')],
 ['authenticated invalid YAML',f=>{const b=Buffer.from('version: 0.4.0\nfiles: *alias\n');fs.writeFileSync(path.join(f.artifacts,f.c.metadataName),b);f.c.metadataSha512=hash(b,'sha512');f.rewrite();}],
 ['unknown inventory field',f=>{f.inventory.script='DO_NOT_EXECUTE';f.rewrite();}],
 ['noncanonical inventory',f=>{const b=Buffer.from(JSON.stringify(f.inventory,null,2)+'\n');fs.writeFileSync(f.opts.inventory,b);f.opts.seal=hash(b);}],
 ['duplicate inventory key',f=>{const b=Buffer.from(JSON.stringify(f.inventory).replace('{"schema":1,','{"schema":2,"schema":1,')+'\n');fs.writeFileSync(f.opts.inventory,b);f.opts.seal=hash(b);}],
 ['unknown signed field',f=>{f.c.extra='bad';f.rewrite();}],
 ['symlink artifact',f=>{const p=path.join(f.artifacts,f.c.artifact.name);fs.renameSync(p,p+'.real');fs.symlinkSync(p+'.real',p);}],
 ['hardlink artifact',f=>fs.linkSync(path.join(f.artifacts,f.c.artifact.name),path.join(f.root,'other-link'))],
 ['symlink inventory',f=>{fs.renameSync(f.opts.inventory,f.opts.inventory+'.real');fs.symlinkSync(f.opts.inventory+'.real',f.opts.inventory);}],
])test('reject '+name+' before reading a secret or requesting approval',()=>fixture(async f=>{
 mutate(f);let reads=0,approvals=0;
 await assert.rejects(()=>signer.signCandidate(f.opts,options(f,{readSecret:async()=>{reads++;return Buffer.from(f.pass);},approve:async()=>{approvals++;return true;}})));
 assert.equal(reads,0);assert.equal(approvals,0);assert.deepEqual(fs.readdirSync(f.output),[]);
}));
test('public approval contains source/tag/build/platform/seal/key fingerprint, never key path or passphrase',()=>fixture(async f=>{
 let viewed;
 await signer.signCandidate(f.opts,options(f,{approve:async details=>{viewed=details;return true;}}));
 const text=JSON.stringify(viewed);
 for(const value of [f.opts.product,f.opts.documentserver,f.opts.tag,f.opts.seal,f.opts.fingerprint])assert(text.includes(value));
 assert.equal(viewed.build,19);assert.equal(viewed.platform,'win32');
 assert.equal(text.includes(f.pass),false);assert.equal(text.includes(f.opts.key),false);
 assert(Object.isFrozen(viewed));
}));
test('approval denial keeps output empty and clears the secret buffer',()=>fixture(async f=>{
 const secret=Buffer.from(f.pass);
 await assert.rejects(()=>signer.signCandidate(f.opts,options(f,{readSecret:async()=>secret,approve:async()=>false})));
 assert(secret.every(byte=>byte===0));assert.deepEqual(fs.readdirSync(f.output),[]);
}));
for(const kind of ['artifact','metadata','inventory'])test('rehash '+kind+' after approval and fail on a changed final candidate',()=>fixture(async f=>{
 await assert.rejects(()=>signer.signCandidate(f.opts,options(f,{approve:async()=>{
  const file=kind==='artifact'?path.join(f.artifacts,f.c.artifact.name):kind==='metadata'?path.join(f.artifacts,f.c.metadataName):f.opts.inventory;
  fs.appendFileSync(file,'changed');return true;
 }})));
 assert.deepEqual(fs.readdirSync(f.output),[]);
}));
for(const [name,change] of [
 ['unencrypted key',f=>fs.writeFileSync(f.opts.key,f.pair.privateKey.export({type:'pkcs8',format:'pem'}))],
 ['wrong fingerprint',f=>f.opts.fingerprint='0'.repeat(64)],
 ['unsafe key mode',f=>fs.chmodSync(f.opts.key,0o644)],
 ['unsafe key directory',f=>fs.chmodSync(f.keys,0o755)],
 ['symlink key',f=>{fs.renameSync(f.opts.key,f.opts.key+'.real');fs.symlinkSync(f.opts.key+'.real',f.opts.key);}],
 ['wrong key type',f=>{const p=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});fs.writeFileSync(f.opts.key,p.privateKey.export({type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase:f.pass}));f.opts.fingerprint=hash(p.publicKey.export({type:'spki',format:'der'}));}],
 ['unsafe output',f=>fs.chmodSync(f.output,0o755)],
])test('refuse '+name+' without any signed output',()=>fixture(async f=>{
 change(f);await assert.rejects(()=>signer.signCandidate(f.opts,options(f)));assert.deepEqual(fs.readdirSync(f.output),[]);
}));
test('wrong passphrase is refused and its buffer cleared',()=>fixture(async f=>{
 const secret=Buffer.from('wrong synthetic passphrase');
 await assert.rejects(()=>signer.signCandidate(f.opts,options(f,{readSecret:async()=>secret})));
 assert(secret.every(byte=>byte===0));assert.deepEqual(fs.readdirSync(f.output),[]);
}));
test('never overwrite an existing envelope or follow an output symlink',()=>fixture(async f=>{
 const target=path.join(f.output,'latest.yml.sig.json'),outside=path.join(f.root,'untouched');
 fs.writeFileSync(outside,'unchanged');fs.symlinkSync(outside,target);
 await assert.rejects(()=>signer.signCandidate(f.opts,options(f)));
 assert.equal(fs.readFileSync(outside,'utf8'),'unchanged');assert(fs.lstatSync(target).isSymbolicLink());
 assert.deepEqual(fs.readdirSync(f.output),['latest.yml.sig.json']);
}));
test('signing never executes a package hook from the candidate directory',()=>fixture(async f=>{
 const marker=path.join(f.root,'hook-ran');
 fs.writeFileSync(path.join(f.artifacts,'package.json'),JSON.stringify({scripts:{prepublish:'touch '+marker,prepare:'touch '+marker}}));
 await signer.signCandidate(f.opts,options(f));assert.equal(fs.existsSync(marker),false);
}));
test('private-FD input rejects public descriptors and caps secret bytes',()=>fixture(f=>{
 const terminalPath=path.resolve(__dirname,'../../tools/desktop-updates/signing-terminal.cjs');
 const terminal=fs.existsSync(terminalPath)?require(terminalPath):{};
 for(const fd of [0,1,2,-1,NaN,99999])assert.throws(()=>terminal.readPrivateFD(fd));
 const p=path.join(f.root,'synthetic-secret');
 fs.writeFileSync(p,f.pass+'\n',{mode:0o600});let fd=fs.openSync(p,'r');
 try{const secret=terminal.readPrivateFD(fd);assert.equal(secret.equals(Buffer.from(f.pass)),true);secret.fill(0);}finally{fs.closeSync(fd);}
 fs.writeFileSync(p,'x'.repeat(4097));fd=fs.openSync(p,'r');try{assert.throws(()=>terminal.readPrivateFD(fd));}finally{fs.closeSync(fd);}
 fs.chmodSync(p,0o644);fd=fs.openSync(p,'r');try{assert.throws(()=>terminal.readPrivateFD(fd));}finally{fs.closeSync(fd);}
}));
function argv(f){
 return [path.resolve(__dirname,'../../tools/desktop-updates/sign-update.cjs'),...Object.entries(f.opts).flatMap(([key,value])=>['--'+(key==='keyId'?'key-id':key),String(value)])];
}
function ptyRun(f,changes={}){
 const config={node:process.execPath,argv:argv(f),secret:f.pass,...changes};
 const file=path.join(f.root,'private-pty-config.json');fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});
 const {spawnSync}=require('node:child_process');
 const child=spawnSync('python3',[path.join(__dirname,'fixtures/signing-pty.py'),file],{encoding:'utf8',timeout:15000});
 assert.equal(child.status,0,'Synthetic PTY driver failed: '+child.stderr);
 const result=JSON.parse(child.stdout),text=Buffer.from(result.transcriptBase64,'base64').toString('utf8');
 assert.equal(text.includes(f.pass),false,'Secret must never be echoed or logged');
 assert.equal(text.includes('BEGIN ENCRYPTED PRIVATE KEY'),false);assert.equal(text.includes(f.opts.key),false);
 assert(result.echoRestored,'TTY echo must be restored');
 return {...result,text};
}
test('real controlling TTY signs only after hidden secret and exact displayed approval',()=>fixture(f=>{
 const result=ptyRun(f);assert.equal(result.status,0);assert(result.secretPrompt&&result.approvalPrompt);
 assert(result.text.includes(f.opts.seal)&&result.text.includes(f.opts.fingerprint));assert(result.text.includes('Signed latest.yml.sig.json'));
}));
test('real TTY cancellation restores echo and creates no envelope',()=>fixture(f=>{
 const result=ptyRun(f,{cancel_secret:true});assert.notEqual(result.status,0);
 assert(result.secretPrompt&&!result.approvalPrompt);assert.deepEqual(fs.readdirSync(f.output),[]);
}));
test('real TTY denied approval creates no envelope',()=>fixture(f=>{
 const result=ptyRun(f,{deny:true});assert.notEqual(result.status,0);assert(result.approvalPrompt);
 assert.deepEqual(fs.readdirSync(f.output),[]);
}));
test('real TTY approval cannot sign an artifact changed while the owner reviews it',()=>fixture(f=>{
 const result=ptyRun(f,{mutate:path.join(f.artifacts,f.c.artifact.name)});assert.notEqual(result.status,0);
 assert(result.approvalPrompt);assert.deepEqual(fs.readdirSync(f.output),[]);
}));
test('real CLI accepts an inherited private FD, never stdin, for the secret',()=>fixture(f=>{
 const passfile=path.join(f.root,'private-fd-secret');fs.writeFileSync(passfile,f.pass+'\n',{mode:0o600});
 const result=ptyRun(f,{argv:[...argv(f),'--passphrase-fd','3'],secret_fd:passfile});
 assert.equal(result.status,0);assert(!result.secretPrompt&&result.approvalPrompt);
}));
test('real CLI rejects argv/env secret paths and non-TTY approval without exposing input',()=>fixture(f=>{
 const {spawnSync}=require('node:child_process');
 for(const extra of [['--passphrase',f.pass],['--yes'],['--passphrase-fd','0'],[]]){
  const child=spawnSync(process.execPath,[...argv(f),...extra],{encoding:'utf8',input:f.pass+'\n',env:{PATH:'/usr/bin:/bin',EO_SIGN_PASSPHRASE:f.pass}});
  assert.notEqual(child.status,0);const text=child.stdout+child.stderr;assert.match(text,/Signing refused/);
  assert.equal(text.includes(f.pass),false);assert.equal(text.includes(f.opts.key),false);
  assert.deepEqual(fs.readdirSync(f.output),[]);
 }
}));
test('atomic writer cleans owned temporary/signature files on ENOSPC and directory fsync failure',()=>fixture(async f=>{
 for(const phase of ['write','directory-fsync']){
  let syncs=0;
  const writeIO={...fs,writeSync(...args){if(phase==='write')throw Object.assign(Error('Synthetic full disk'),{code:'ENOSPC'});return fs.writeSync(...args);},fsyncSync(fd){if(phase==='directory-fsync'&&++syncs===2)throw Object.assign(Error('Synthetic fsync failure'),{code:'ENOSPC'});return fs.fsyncSync(fd);}};
  await assert.rejects(()=>signer.signCandidate(f.opts,options(f,{writeIO})));
  assert.deepEqual(fs.readdirSync(f.output),[]);
 }
}));
test('atomic writer handles genuine short writes without truncating the envelope',()=>fixture(async f=>{
 const writeIO={...fs,writeSync(fd,b,offset,length,position){return fs.writeSync(fd,b,offset,Math.min(7,length),position);}};
 const result=await signer.signCandidate(f.opts,options(f,{writeIO}));
 const envelope=fs.readFileSync(path.join(f.output,result.name));assert.equal(envelope.length,result.bytes);
 assert.equal(hash(envelope),result.sha256);
}));
test('expiry during owner approval aborts signing',()=>fixture(async f=>{
 let now=f.now;
 await assert.rejects(()=>signer.signCandidate(f.opts,options(f,{now:()=>now,approve:async()=>{now=f.c.expiresAt;return true;}})));
 assert.deepEqual(fs.readdirSync(f.output),[]);
}));
test('the generated-key Linux AppImage inventory signs its own platform-specific metadata',()=>fixture(async f=>{
 const old=f.c.artifact.name;
 Object.assign(f.c,{platform:'linux',packageType:'AppImage',metadataName:'latest-linux.yml'});
 f.c.artifact.name='ElixirOffice-0.4.0-x86_64.AppImage';
 fs.renameSync(path.join(f.artifacts,old),path.join(f.artifacts,f.c.artifact.name));
 f.metadata=Buffer.from('version: 0.4.0\nfiles:\n  - url: '+f.c.artifact.name+'\n    sha512: '+f.c.artifact.sha512+'\n    size: '+f.c.artifact.size+'\n');
 fs.writeFileSync(path.join(f.artifacts,f.c.metadataName),f.metadata);f.c.metadataSha512=hash(f.metadata,'sha512');f.opts.platform='linux';f.rewrite();
 const result=await signer.signCandidate(f.opts,options(f));assert.equal(result.name,'latest-linux.yml.sig.json');
 const v=wire.verifyMetadata(fs.readFileSync(path.join(f.output,result.name)),f.metadata,{trustedKeys:{'synthetic-test':f.pair.publicKey},expected:{tag:f.c.tag,platform:'linux',arch:'x64',packageType:'AppImage'},now:f.now});
 assert.equal(wire.describeUpdate(v).artifact.name,f.c.artifact.name);
}));
test('secret buffer is already erased while the owner reviews public details',()=>fixture(async f=>{
 const secret=Buffer.from(f.pass);let cleared=false;
 await signer.signCandidate(f.opts,options(f,{readSecret:async()=>secret,approve:async()=>{cleared=secret.every(byte=>byte===0);return true;}}));
 assert(cleared,'Clear the passphrase immediately after key import, before approval can pause');
}));
test('signature permissions stay exactly0600 under a restrictive caller umask',()=>fixture(async f=>{
 const old=process.umask(0o777);
 try{const result=await signer.signCandidate(f.opts,options(f));assert.equal(fs.statSync(path.join(f.output,result.name)).mode&0o777,0o600);}
 finally{process.umask(old);}
}));
test('real inherited anonymous pipe is a private passphrase source',()=>fixture(f=>{
 const result=ptyRun(f,{argv:[...argv(f),'--passphrase-fd','3'],secret_pipe:true});
 assert.equal(result.status,0);assert(!result.secretPrompt&&result.approvalPrompt);
}));
test('real TTY SIGTERM cancellation restores echo without signing',()=>fixture(f=>{
 const result=ptyRun(f,{cancel_signal:true});assert.notEqual(result.status,0);assert(result.secretPrompt);
 assert.deepEqual(fs.readdirSync(f.output),[]);
}));
test('hidden Unicode input and backspace do not corrupt the following passphrase',()=>fixture(f=>{
 const result=ptyRun(f,{secret:'é\x7f'+f.pass});assert.equal(result.status,0);
}));
test('private descriptor accepts exactly the bounded secret with LF or CRLF',()=>fixture(f=>{
 const terminal=require('../../tools/desktop-updates/signing-terminal.cjs'),file=path.join(f.root,'bounded-pass');
 for(const ending of ['\n','\r\n']){
  fs.writeFileSync(file,'x'.repeat(4096)+ending,{mode:0o600});const fd=fs.openSync(file,'r');
  try{const secret=terminal.readPrivateFD(fd);assert.equal(secret.length,4096);secret.fill(0);}finally{fs.closeSync(fd);}
 }
}));
test('option mutation during approval cannot redirect the already approved source or output',()=>fixture(async f=>{
 const original=f.opts.output;
 const result=await signer.signCandidate(f.opts,options(f,{approve:async()=>{f.opts.output=path.join(f.root,'not-approved');f.opts.tag='v9.0.0';return true;}}));
 assert(fs.existsSync(path.join(original,result.name)));assert.equal(fs.existsSync(f.opts.output),false);
}));
test('approval display order and values match the actually signed envelope and signing key',()=>fixture(async f=>{
 let displayed;
 const result=await signer.signCandidate(f.opts,options(f,{approve:async details=>{
  displayed=details;
  assert.deepEqual(Object.keys(details).slice(0,6),['artifact','tag','build','sequence','expiresAt','fingerprint']);
  assert.deepEqual(Object.keys(details.artifact),['name','size','sha512']);
  assert.equal(details.expiryUTC,new Date(f.c.expiresAt).toISOString());
  assert.throws(()=>{details.artifact.size=999;},TypeError);
  assert.throws(()=>{details.build=999;},TypeError);
  return true;
 }}));
 const envelope=fs.readFileSync(path.join(f.output,result.name));
 const verified=wire.verifyMetadata(envelope,f.metadata,{trustedKeys:{'synthetic-test':f.pair.publicKey},expected:{tag:f.c.tag,platform:'win32',arch:'x64',packageType:'nsis'},now:f.now});
 const signed=verified.context;
 assert.deepEqual(displayed.artifact,signed.artifact);
 for(const name of ['tag','build','sequence','expiresAt'])assert.equal(displayed[name],signed[name]);
 assert.equal(displayed.fingerprint,hash(f.pair.publicKey.export({type:'spki',format:'der'})));
 assert(crypto.verify(null,wire.signingBytes(signed),f.pair.publicKey,Buffer.from(JSON.parse(envelope).signatures[0].signature,'base64')));
}));
test('encrypted key files cannot contain trailing second keys or arbitrary data',()=>fixture(async f=>{
 const original=fs.readFileSync(f.opts.key);
 for(const suffix of ['extra',f.pair.privateKey.export({type:'pkcs8',format:'pem'})]){
  fs.writeFileSync(f.opts.key,Buffer.concat([original,Buffer.from(suffix)]));
  await assert.rejects(()=>signer.signCandidate(f.opts,options(f)));
  assert.deepEqual(fs.readdirSync(f.output),[]);
 }
}));
test('unsigned preflight validates its owned snapshot even if a caller getter changes during copying',()=>fixture(f=>{
 let reads=0;
 Object.defineProperty(f.c,'build',{enumerable:true,get(){return ++reads===1?19:0;}});
 assert.throws(()=>wire.validateSigningMetadata(f.c,f.metadata),/Invalid signed update/);
}));
test('redirected stdout cannot separate the TTY approval display from the actual signed values',()=>fixture(f=>{
 const stdoutFile=path.join(f.root,'redirected-public-stdout');
 const result=ptyRun(f,{stdout_file:stdoutFile});assert.equal(result.status,0);
 const match=/(\{\r?\n[\s\S]*?\r?\n\})\r?\nApproval: type /.exec(result.text);
 assert(match,'All public details must be visible on the controlling TTY immediately before its approval prompt');
 const displayed=JSON.parse(match[1]);
 assert.deepEqual(Object.keys(displayed).slice(0,6),['artifact','tag','build','sequence','expiresAt','fingerprint']);
 assert.deepEqual(Object.keys(displayed.artifact),['name','size','sha512']);
 const envelope=fs.readFileSync(path.join(f.output,'latest.yml.sig.json'));
 const verified=wire.verifyMetadata(envelope,f.metadata,{trustedKeys:{'synthetic-test':f.pair.publicKey},expected:{tag:f.c.tag,platform:'win32',arch:'x64',packageType:'nsis'},now:f.now});
 assert.deepEqual(displayed.artifact,verified.context.artifact);
 for(const key of ['tag','build','sequence','expiresAt'])assert.equal(displayed[key],verified.context[key]);
 assert.equal(displayed.fingerprint,hash(f.pair.publicKey.export({type:'spki',format:'der'})));
 assert.match(fs.readFileSync(stdoutFile,'utf8'),/^Signed latest\.yml\.sig\.json SHA256 [0-9a-f]{64}\n$/);
}));
test('authorized QA ephemeral key signs through the same owned TTY without owner production material',()=>fixture(f=>{
 const old=f.c.artifact.name;f.c.version='0.0.0-rc.2';f.c.tag='v'+f.c.version;f.c.build=2;f.c.channel='prerelease';
 f.c.artifact.name='ElixirOffice-'+f.c.version+'-win-x64.exe';fs.renameSync(path.join(f.artifacts,old),path.join(f.artifacts,f.c.artifact.name));
 const metadata=Buffer.from('version: '+f.c.version+'\nfiles:\n  - url: '+f.c.artifact.name+'\n    sha512: '+f.c.artifact.sha512+'\n    size: '+f.c.artifact.size+'\n');
 f.c.metadataSha512=hash(metadata,'sha512');fs.writeFileSync(path.join(f.artifacts,f.c.metadataName),metadata);
 f.opts.tag=f.c.tag;f.opts.build=2;f.opts.keyId='eo-qa-'+'a'.repeat(32);f.rewrite();
 const result=ptyRun(f);assert.equal(result.status,0);assert(result.secretPrompt&&result.approvalPrompt&&result.echoRestored);
 assert(result.text.includes(f.opts.keyId)&&result.text.includes(f.opts.fingerprint));
 const envelope=fs.readFileSync(path.join(f.output,'latest.yml.sig.json'));
 const verified=wire.verifyMetadata(envelope,metadata,{trustedKeys:{[f.opts.keyId]:f.pair.publicKey},expected:{tag:f.c.tag,platform:'win32',arch:'x64',packageType:'nsis'},now:Date.now()});
 assert.equal(verified.context.version,'0.0.0-rc.2');
}));
