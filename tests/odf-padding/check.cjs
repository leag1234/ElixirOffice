'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const directory=process.argv[2],baseline=process.argv[3];
const cases=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
const results=[];
for(const item of cases) {
 const row={id:item.id,pass:false,residue:item.compressed_size%16,cbc:item.cbc};
 try {
  const plain=fs.readFileSync(path.join(directory,item.id+'.plain'));
  const expected=fs.readFileSync(path.join(directory,item.id+'.deflate'));
  const ciphertext=fs.readFileSync(path.join(directory,item.id+'.cipher'));
  const start=crypto.createHash(item.start_hash).update('synthetic-padding','utf8').digest();
  const key=crypto.pbkdf2Sync(start,Buffer.from(item.salt,'hex'),item.spin,item.key_size,'sha1');
  const decipher=crypto.createDecipheriv('aes-'+item.key_size*8+'-'+(item.cbc?'cbc':'ecb'),key,item.cbc?Buffer.from(item.iv,'hex'):null);
  decipher.setAutoPadding(false);
  const decrypted=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  const expectedPadding=item.cbc?16-expected.length%16:0;
  assert.equal(ciphertext.length,expected.length+expectedPadding,'ciphertext must contain every W3C padding block');
  const padding=item.cbc?decrypted.at(-1):0;
  if(item.cbc) {
   assert(padding>=1&&padding<=16,'W3C final padding length must be 1..16');
   assert.equal(padding,expectedPadding,'mandatory full block on aligned plaintext');
  }
  const raw=decrypted.subarray(0,decrypted.length-padding);
  assert.deepEqual(raw,expected,'decrypted compressed bytes changed');
  assert.deepEqual(zlib.inflateRawSync(raw),plain,'independent raw-DEFLATE roundtrip');
  assert.equal(crypto.createHash(item.checksum_hash).update(raw.subarray(0,1024)).digest('hex'),item.checksum,'checksum over first compressed bytes');
  assert.equal(plain.length,item.plain_size,'declared plaintext size');
  if(baseline&&item.cbc&&item.compressed_size%16===0) {
   const old=fs.readFileSync(path.join(baseline,item.id+'.cipher'));
   assert.equal(ciphertext.length,old.length+16);assert.deepEqual(ciphertext.subarray(0,old.length),old,'aligned ciphertext prefix must be unchanged');
   row.aligned_prefix_preserved=true;
  }
  row.padding=padding;row.pass=true;
 }catch(error){row.error=error.message;}
 results.push(row);
}
for(const hash of ['sha1','sha256']) {
 const residues=cases.filter(x=>x.id.startsWith(hash+'-')).map(x=>x.compressed_size%16).sort((a,b)=>a-b);
 assert.deepEqual(residues,Array.from({length:16},(_,i)=>i));
}
assert.equal(cases.length,61,'complete synthetic matrix');
for(const format of ['odt','ods','odp'])assert.equal(cases.filter(item=>item.id.startsWith(format+'-')).length,8,'eight-part control');
assert(cases.filter(item=>item.id.startsWith('large-')).every(item=>item.compressed_size>1024),'large checksum-prefix controls');
if(baseline)assert.equal(results.filter(item=>item.aligned_prefix_preserved).length,6,'all aligned ciphertext prefixes');
const summary={synthetic_only:true,cases:results.length,passed:results.filter(x=>x.pass).length,
 formats:Object.fromEntries(['odt','ods','odp'].map(format=>[format,{passed:results.filter(x=>x.id.startsWith(format+'-')&&x.pass).length,total:8}])),results};
fs.writeFileSync(path.join(directory,'independent-results.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));process.exitCode=summary.passed===summary.cases?0:1;
