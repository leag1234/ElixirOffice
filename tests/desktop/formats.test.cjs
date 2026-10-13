// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const formats=require('../../desktop/formats.cjs'),files=require('../../desktop/files.cjs'),{documentPath}=require('../../desktop/document-path.cjs');
test('added desktop formats open as converted copies with scoped export lists',()=>{
 for(const [input,to] of [['rtf','docx'],['txt','docx'],['csv','xlsx'],['dotx','docx'],['docm','docx'],['xltx','xlsx'],['xlsm','xlsx'],['potx','pptx'],['ppsx','pptx']]){
  assert(files.formats.includes(input));assert.equal(documentPath('public.'+input),'public.'+input);assert.equal(formats.canonical[input],to);assert(Number.isInteger(formats.codes[input]));
 }
 assert.deepEqual(formats.exports.word,['docx','odt','rtf','txt','pdf']);assert.deepEqual(formats.exports.cell,['xlsx','ods','csv']);assert.deepEqual(formats.exports.slide,['pptx','odp','pdf']);
});
test('export output validation accepts real signatures and refuses wrong or unsafe representations',()=>{
 for(const [data,format] of [['PKtest','docx'],['{\\rtf1 test}','rtf'],['é','txt'],['a,b\n1,2','csv'],['%PDF-1.7','pdf']])assert(formats.output(Buffer.from(data),format));
 for(const [data,format] of [['bad','docx'],['bad','rtf'],['PKtest','exe'],['bad','pdf'],['a\u0000b','txt']])assert.throws(()=>formats.output(Buffer.from(data),format));
 assert.throws(()=>formats.output(new Uint8Array([255]),'csv'),/UTF-8/);
});
test('short UTF-8 exports retain atomic write safety',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eo-text-export-'));
 try{const target=path.join(directory,'copy.txt');await files.atomic(target,formats.output(new Uint8Array(),'txt'));assert.equal((await fs.stat(target)).size,0);await files.atomic(target,Buffer.from('x'));assert.equal(await fs.readFile(target,'utf8'),'x');await fs.symlink(target,path.join(directory,'link.txt'));await assert.rejects(files.atomic(path.join(directory,'link.txt'),Buffer.from('y')),/regular/);assert.equal(await fs.readFile(target,'utf8'),'x');}
 finally{await fs.rm(directory,{recursive:true,force:true})}
});

test('text imports reject invalid UTF-8 rather than silently changing characters',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eo-text-input-'));
 try{const target=path.join(directory,'public.csv');await fs.writeFile(target,Buffer.from([0xe9]));await assert.rejects(files.read(target),/UTF-8/);assert.deepEqual(await fs.readFile(target),Buffer.from([0xe9]));await fs.writeFile(target,Buffer.from('é,中文,😀'));assert.equal((await files.read(target)).bytes.toString(),'é,中文,😀');}
 finally{await fs.rm(directory,{recursive:true,force:true})}
});
