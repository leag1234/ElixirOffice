// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {using,hash}=require('./fixtures/batch-signing-kit.cjs');
const cli=path.resolve(__dirname,'../../tools/desktop-updates/sign-batch.cjs'),harness=path.join(__dirname,'fixtures/signing-pty.py');
function argv(f){return [cli,...Object.entries(f.opts).flatMap(([k,v])=>['--'+(k==='keyId'?'key-id':k),String(v)])];}
function pty(f,change={}){
 const config=path.join(f.root,'private-batch-pty.json');
 fs.writeFileSync(config,JSON.stringify({node:process.execPath,argv:argv(f),secret:f.pass,...change}),{mode:0o600});
 const child=spawnSync('python3',[harness,config],{encoding:'utf8',timeout:20000});assert.equal(child.status,0,child.stderr);
 const result=JSON.parse(child.stdout),text=Buffer.from(result.transcriptBase64,'base64').toString('utf8').replace(/\r/g,'');
 assert(!text.includes(f.pass),'secret must never be echoed');assert(!text.includes(f.opts.key),'private key path must not be displayed');
 assert(result.echoRestored);return {...result,text};
}
test('batch CLI uses one real hidden prompt and whole-set token; both envelopes appear together',()=>using(f=>{
 const r=pty(f);assert.equal(r.status,0);assert(r.secretPrompt&&r.approvalPrompt);
 assert.equal((r.text.match(/Private key passphrase \(hidden\): /g)||[]).length,1);assert.equal((r.text.match(/Approval: type SIGN /g)||[]).length,1);
 const begin=r.text.indexOf('{\n'),end=r.text.indexOf('\nApproval: type ',begin);assert(begin>=0&&end>begin);
 const details=JSON.parse(r.text.slice(begin,end)),token=/Approval: type SIGN ([a-f0-9]{64})/.exec(r.text)[1];
 assert.equal(hash(Buffer.from(JSON.stringify(details))),token);assert.deepEqual(details.candidates.map(c=>c.platform),['win32','linux']);
 const receipt=JSON.parse(fs.readFileSync(path.join(f.opts.output,'BATCH-RECEIPT.json'),'utf8'));assert.equal(receipt.approvalSha256,token);assert.equal(receipt.files.length,2);
}));
test('batch hidden whole-set display stays on TTY when stdout is redirected',()=>using(f=>{
 const output=path.join(f.root,'stdout.txt'),r=pty(f,{stdout_file:output});assert.equal(r.status,0);assert(r.text.includes('"candidates"'));
 const text=fs.readFileSync(output,'utf8');assert(text.includes('Signed batch'));assert(!text.includes(f.pass));assert(!text.includes('"artifact"'));
}));
test('private inherited pipe supplies the single secret but whole-set approval still needs owned TTY',()=>using(f=>{
 const r=pty(f,{secret_pipe:true,argv:[...argv(f),'--passphrase-fd','3']});assert.equal(r.status,0);assert.equal(r.secretPrompt,false);assert.equal(r.approvalPrompt,true);
}));
for(const [name,change]of [['denial',{deny:true}],['secret cancellation',{cancel_secret:true}],['signal cancellation',{cancel_signal:true}]])
 test('batch CLI '+name+' restores TTY and publishes no signatures',()=>using(f=>{
  const r=pty(f,change);assert.notEqual(r.status,0);assert.equal(fs.existsSync(f.opts.output),false);assert.deepEqual(fs.readdirSync(f.parent),[]);
 }));
test('batch CLI refuses missing TTY and every argv/environment approval or secret bypass',()=>using(f=>{
 const env={PATH:process.env.PATH,EO_SIGNING_PASSPHRASE:f.pass,EO_SIGNING_APPROVAL:'yes'};
 for(const extra of [[],['--yes','true'],['--passphrase',f.pass],['--passphrase-env','EO_SIGNING_PASSPHRASE'],['--approval','yes']]){
  const r=spawnSync(process.execPath,[...argv(f),...extra],{encoding:'utf8',timeout:15000,detached:true,env});
  assert.notEqual(r.status,0);assert.equal(r.stderr.trim(),'Batch signing refused.');assert(!r.stdout.includes(f.pass));assert(!r.stderr.includes(f.pass));
  assert.equal(fs.existsSync(f.opts.output),false);
 }
}));
test('batch argument parser refuses prototype names, duplicate flags and invalid private descriptors',()=>using(f=>{
 const {parseArgs}=require('../../tools/desktop-updates/sign-batch.cjs'),args=argv(f).slice(1);
 assert.deepEqual(parseArgs(args),f.opts);
 for(const flag of ['--constructor','--toString','--__proto__','--batch'])assert.throws(()=>parseArgs([...args,flag,'bad']));
 for(const fd of ['0','1','2','-1','NaN','1025','3.5','03'])assert.throws(()=>parseArgs([...args,'--passphrase-fd',fd]));
}));
