'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const folder=process.argv[2],rows=JSON.parse(fs.readFileSync(path.join(folder,'metadata.json'))),checks=[];
assert.equal(rows.length,8);let aligned=0;
for(const row of rows){
 const cipher=fs.readFileSync(path.join(folder,row.path+'.cipher')),plain=fs.readFileSync(path.join(folder,row.path+'.plain'));
 const start=crypto.createHash('sha256').update('synthetic-padding','utf8').digest();
 const key=crypto.pbkdf2Sync(start,Buffer.from(row.salt,'hex'),row.spin,32,'sha1');
 const decipher=crypto.createDecipheriv('aes-256-cbc',key,Buffer.from(row.iv,'hex'));decipher.setAutoPadding(false);
 const padded=Buffer.concat([decipher.update(cipher),decipher.final()]),pad=padded.at(-1);
 assert(pad>=1&&pad<=16);const compressed=padded.subarray(0,-pad),decoded=zlib.inflateRawSync(compressed);
 assert.equal(compressed.length,row.compressed_size);assert.equal(cipher.length,(Math.floor(compressed.length/16)+1)*16);
 assert.equal(decoded.length,row.plain_size);assert(decoded.equals(plain));
 assert.equal(crypto.createHash('sha256').update(compressed.subarray(0,1024)).digest('hex'),row.checksum);
 if(compressed.length%16===0){aligned++;assert.equal(pad,16)}
 checks.push({part:row.path,pass:true,plainBytes:plain.length,compressedBytes:compressed.length,paddingBytes:pad});
}
assert(aligned>=1);const result={result:'PASS',parts:checks,alignedParts:aligned,qualification:'Independent Node AES-CBC/noAutoPadding, W3C terminal1..16, rawDEFLATE, exact plaintext/size and SHA256-first1024 checks on synthetic owner fixtures; not matched runtime export.'};
fs.writeFileSync(path.join(folder,'independent-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({result:result.result,parts:checks.length,alignedParts:aligned}));
