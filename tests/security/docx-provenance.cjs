// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.env.EO_SECURITY_FIXTURES,release=process.env.EO_X2T_RELEASE,pinPath=process.env.EO_X2T_PIN;
assert(root&&release&&pinPath,'Explicit owned fixtures, released runtime and pin required');
const pin=JSON.parse(fs.readFileSync(pinPath)),manifest=fs.readFileSync(path.join(release,'manifest.json'));
assert.equal(crypto.createHash('sha256').update(manifest).digest('hex'),pin.manifest_sha256);
assert.equal(JSON.parse(manifest).artifact_version,pin.artifact_version);
const create=require(path.join(release,'x2t.js'));
async function convert(bytes,from,to){
 const m=await create({noInitialRun:true,print(){},printErr(){}}),F=m.FS;
 ['/work','/tmp/conversion','/fonts'].forEach(p=>F.mkdirTree(p));F.writeFile('/work/in',bytes);
 const tags={m_sFileFrom:'/work/in',m_sFileTo:'/work/out',m_nFormatFrom:from,m_nFormatTo:to,m_bIsNoBase64:'true',m_sTempDir:'/tmp/conversion',m_sFontDir:'/fonts'};
 F.writeFile('/task.xml','<TaskQueueDataConvert>'+Object.entries(tags).map(([k,v])=>'<'+k+'>'+v+'</'+k+'>').join('')+'</TaskQueueDataConvert>');
 let status;try{status=m.callMain(['/task.xml'])}catch(e){status=e.status}
 assert.equal(status,0);const output=F.readFile('/work/out');assert(output.length>0);return output;
}
(async()=>{
 const source=fs.readFileSync(path.join(root,'hostile.docx')),bin=await convert(source,65,8193),roundtrip=await convert(bin,8193,65);
 fs.writeFileSync(path.join(root,'roundtrip.docx'),roundtrip);
 fs.writeFileSync(path.join(root,'conversion.json'),JSON.stringify({runtime:pin.artifact_version,input_bytes:source.length,editor_bytes:bin.length,roundtrip_bytes:roundtrip.length,scope:'Actual pinned wasm DOCX->editor->DOCX; no editor GUI or external URL requests'},null,2)+'\n');
 console.log('HOSTILE_DOCX_WASM_ROUNDTRIP_PASS');process.exitCode=0;
})().catch(e=>{console.error('Hostile DOCX conversion failed',e.name);process.exitCode=1});
