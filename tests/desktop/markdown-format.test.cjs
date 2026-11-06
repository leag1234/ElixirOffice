'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const formats=require('../../desktop/formats.cjs'),saveAs=require('../../desktop/save-as.cjs');
test('Markdown maps to x2t code 92, canonical DOCX and word Save As',()=>{
 assert.equal(formats.codes.md,92);assert.equal(formats.codes.markdown,92);
 assert.equal(formats.canonical.md,'docx');assert.equal(formats.canonical.markdown,'docx');
 assert.equal(formats.kind('md'),'word');assert.equal(formats.kind('markdown'),'word');
 assert.deepEqual(formats.exports.word,['docx','odt','rtf','txt','md','pdf']);
 assert.equal(saveAs.labels.md,'saveFormatMd');assert.equal(saveAs.warning({format:'docx'},'md'),'saveLossMd');
});
test('renderer accepts Markdown drops and package associations register both extensions',async()=>{
 const renderer=await fs.readFile(path.join(__dirname,'../../desktop/renderer.js'),'utf8');
 assert.match(renderer,/\\\.\(docx\|doc\|odt\|rtf\|txt\|md\|markdown\|/);
 const pkg=JSON.parse(await fs.readFile(path.join(__dirname,'../../desktop/package.json'),'utf8'));
 const association=pkg.build.fileAssociations.find(item=>item.ext.includes('md'));
 assert.deepEqual(association,{ext:['md','markdown'],name:'Markdown document',role:'Editor'});
 assert(pkg.build.linux.desktop.entry.MimeType.includes('text/markdown'));
});
