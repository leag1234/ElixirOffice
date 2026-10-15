// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const release=process.env.EO_X2T_RELEASE,fixtures=process.env.EO_PASSWORD_FIXTURES;assert(release&&fixtures,'Explicit full runtime and public generated fixtures required');
const create=require(path.join(release,'x2t.js')),password=crypto.randomBytes(16).toString('hex');
async function convert(bytes,from,to,extra={}){
 const m=await create({noInitialRun:true,print(){},printErr(){}}),F=m.FS;
 ['/w','/tmp/conversion','/fonts'].forEach(p=>F.mkdirTree(p));F.writeFile('/w/in',bytes);
 const tags={m_sFileFrom:'/w/in',m_sFileTo:'/w/out',m_nFormatFrom:from,m_nFormatTo:to,m_bIsNoBase64:'true',m_sTempDir:'/tmp/conversion',m_sFontDir:'/fonts',...extra};
 F.writeFile('/task.xml','<TaskQueueDataConvert>'+Object.entries(tags).map(([k,v])=>'<'+k+'>'+v+'</'+k+'>').join('')+'</TaskQueueDataConvert>');
 let status;try{status=m.callMain(['/task.xml'])}catch(e){status=e.status}let output;try{output=F.readFile('/w/out')}catch{}return {status,output};
}
(async()=>{
 for(const [format,code,bin]of [['docx',65,8193],['xlsx',257,8194],['pptx',129,8195]]){
  const source=fs.readFileSync(path.join(fixtures,'new.'+format)),opened=await convert(source,code,bin);assert(opened.status===0&&opened.output,'Fixture opens');
  const encrypted=await convert(opened.output,bin,code,{m_sSavePassword:password});assert(encrypted.status===0&&encrypted.output,'Fixture encrypts');
  const damaged=Buffer.from(encrypted.output),marker=Buffer.from('encryptedHmacValue="'),start=damaged.indexOf(marker);assert(start>=0,'Agile HMAC fixture locator');
  const at=start+marker.length;damaged[at]=damaged[at]===65?66:65;
  const original=await convert(encrypted.output,code,bin,{m_sPassword:password});assert(original.status===0&&original.output,'Untampered encrypted document opens');
  const tampered=await convert(damaged,code,bin,{m_sPassword:password});assert(tampered.status!==0,'HMAC-only mutation must fail, even when document ciphertext is unchanged');
  console.log('PASS',format,'encrypted integrity rejection and untampered opening');
 }
 // Emscripten sets Node exitCode for the intentionally rejected tampered jobs.
 process.exitCode=0;
})().catch(e=>{console.error('FAIL integrity gate:',e.code||e.name);process.exitCode=1});
