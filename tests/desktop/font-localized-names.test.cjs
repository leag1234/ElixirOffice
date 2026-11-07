// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {names}=require('../../desktop/fonts.cjs'),resolver=require('../../desktop/font-resolver.js');

// Build a minimal SFNT whose name table holds family (id 1) and style (id 2)
// records for the given (platform, language, text) tuples.
function sfntWithNames(records){
 const strings=[],offsets=[];
 for(const [, , , text]of records){const bytes=Buffer.from(text,'utf16le').swap16();offsets.push(strings.reduce((a,b)=>a+b.length,0));strings.push(bytes);}
 const stringBytes=Buffer.concat(strings),nameLen=6+records.length*12+stringBytes.length;
 const total=12+16+nameLen,bytes=Buffer.alloc(total);
 bytes.writeUInt32BE(0x00010000,0);bytes.writeUInt16BE(1,4);
 bytes.write('name',12);bytes.writeUInt32BE(28,20);bytes.writeUInt32BE(nameLen,24);
 bytes.writeUInt16BE(records.length,30);bytes.writeUInt16BE(6+records.length*12,32);
 for(let i=0;i<records.length;i++){
  const [platform,lang,id]=records[i],at=34+i*12;
  bytes.writeUInt16BE(platform,at);bytes.writeUInt16BE(lang,at+4);bytes.writeUInt16BE(id,at+6);
  bytes.writeUInt16BE(strings[i].length,at+8);bytes.writeUInt16BE(offsets[i],at+10);
  strings[i].copy(bytes,28+6+records.length*12+offsets[i]);
 }
 return bytes;
}

const face=(family,aliases=[])=>({family,aliases,source:'system',styleCode:0,style:'Regular',coverage:[[32,126]]});

test('index keeps en-US primary family plus localized aliases from the name table',()=>{
 const bytes=sfntWithNames([
  [3,0x409,1,'MS Gothic'],[3,0x409,2,'Regular'],
  [3,0x411,1,'ＭＳ ゴシック'],[3,0x411,2,'レギュラー'],
  [0,0,1,'MS Gothic'],[0,0,2,'Regular'],
 ]);
 const info=names(bytes,0);
 assert.equal(info.family,'MS Gothic');
 assert.ok(info.aliases.includes('ＭＳ ゴシック'),'ja-JP family kept as alias');
 assert.equal(info.aliases.length,1);
});

test('resolver maps localized, half-width and full-width names to the same face',()=>{
 const policy=resolver.create([face('MS Gothic',['ＭＳ ゴシック'])]);
 for(const name of ['ＭＳ ゴシック','ms gothic','ＭＳ Ｇｏｔｈｉｃ','MS Gothic']){
  const found=policy.resolve({name});
  assert.ok(found,`resolves ${name}`);
  assert.equal(found.family,'MS Gothic');
 }
});

test('aliases are bounded to 16 and 128 chars',()=>{
 const many=Array.from({length:20},(_,i)=>'Alias '+i);
 const long='x'.repeat(200);
 const info=names(sfntWithNames([[3,0x409,1,'Base'],[3,0x409,2,'Regular'],...many.map((a,i)=>[3,0x411,1,a]),[3,0x411,1,long]]),0);
 assert.equal(info.family,'Base');
 assert.ok(info.aliases.length<=16);
 assert.ok(info.aliases.every(a=>a.length<=128));
});
