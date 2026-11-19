// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {names,hasSymbolCmap,unusableSymbolFace}=require('../../desktop/fonts.cjs');

// Minimal SFNT with a name table (family, style) and a cmap table listing the given (platform, encoding) subtables.
function sfnt(family,encodings){
 const strings=[family,'Regular'].map(t=>Buffer.from(t,'utf16le').swap16());
 const nameLen=6+2*12+strings[0].length+strings[1].length,cmapLen=4+encodings.length*8;
 const nameAt=12+2*16,cmapAt=nameAt+nameLen,bytes=Buffer.alloc(cmapAt+cmapLen);
 bytes.writeUInt32BE(0x00010000,0);bytes.writeUInt16BE(2,4);
 bytes.write('cmap',12);bytes.writeUInt32BE(cmapAt,20);bytes.writeUInt32BE(cmapLen,24);
 bytes.write('name',28);bytes.writeUInt32BE(nameAt,36);bytes.writeUInt32BE(nameLen,40);
 bytes.writeUInt16BE(2,nameAt+2);bytes.writeUInt16BE(6+2*12,nameAt+4);
 let offset=0;
 for(let i=0;i<2;i++){
  const at=nameAt+6+i*12;
  bytes.writeUInt16BE(3,at);bytes.writeUInt16BE(1,at+2);bytes.writeUInt16BE(0x409,at+4);bytes.writeUInt16BE(i+1,at+6);
  bytes.writeUInt16BE(strings[i].length,at+8);bytes.writeUInt16BE(offset,at+10);
  strings[i].copy(bytes,nameAt+6+2*12+offset);offset+=strings[i].length;
 }
 bytes.writeUInt16BE(encodings.length,cmapAt+2);
 encodings.forEach(([platform,encoding],i)=>{bytes.writeUInt16BE(platform,cmapAt+4+i*8);bytes.writeUInt16BE(encoding,cmapAt+6+i*8);});
 return bytes;
}

test('a Symbol font without a (3,0) symbol cmap is not registered (macOS Symbol)',()=>{
 const bytes=sfnt('Symbol',[[0,3],[1,0]]);
 assert.equal(names(bytes,0).family,'Symbol');
 assert.equal(hasSymbolCmap(bytes,0),false);
 assert.equal(unusableSymbolFace(names(bytes,0),bytes,0),true);
});

test('a Word symbol font with a (3,0) cmap stays registered (Windows Symbol, Wingdings, Webdings)',()=>{
 for(const family of ['Symbol','Wingdings','Webdings']){
  const bytes=sfnt(family,[[3,0],[1,0]]);
  assert.equal(hasSymbolCmap(bytes,0),true,family);
  assert.equal(unusableSymbolFace(names(bytes,0),bytes,0),false,family);
 }
});

test('ordinary text fonts are never affected',()=>{
 const bytes=sfnt('Arial',[[3,1],[1,0]]);
 assert.equal(unusableSymbolFace(names(bytes,0),bytes,0),false);
});

test('a font without a cmap table is not treated as a symbol font',()=>{
 const bytes=sfnt('Symbol',[]);
 assert.equal(hasSymbolCmap(bytes,0),false);
});

test('the macOS system Symbol.ttf is skipped when present',{skip:!fs.existsSync('/System/Library/Fonts/Symbol.ttf')},()=>{
 const bytes=fs.readFileSync('/System/Library/Fonts/Symbol.ttf');
 assert.equal(unusableSymbolFace(names(bytes,0),bytes,0),true);
});
