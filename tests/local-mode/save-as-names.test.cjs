// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const web=process.env.EO_WEB_APPS||(process.env.EO_UPSTREAM&&path.join(process.env.EO_UPSTREAM,'web-apps'));
assert(web&&path.isAbsolute(web),'Explicit owned EO_WEB_APPS or EO_UPSTREAM required');
const names=require(path.join(web,'apps/common/main/lib/elixir-local/FileNames.js'));
test('downloaded-copy names normalize Unicode and agree with the selected format',()=>{
 for(const format of ['docx','odt','rtf','txt','xlsx','ods','csv','pptx','odp','pdf']){
  assert.equal(names.resolve('Report',format),'Report.'+format);
  assert.equal(names.resolve('Cafe\u0301.docx',format),'Café.'+format);
 }
 assert.equal(names.resolve('Report.final.docx','pdf'),'Report.final.pdf');
 assert.equal(names.resolve('Report.DOCX','docx'),'Report.docx');
 assert.equal(names.resolve('  Report','odt'),'Report.odt');
});
test('copy naming rejects portable device/path/bidi/control and length hazards',()=>{
 for(const name of ['',' ','.','..','.docx','CON','con.txt','PRN','AUX','NUL','com1','COM9.docx','lpt1','LPT9.pdf','CON .txt','../name','bad/name','bad\\name','bad:name','bad*name','bad?name','bad"name','bad<name','bad>name','bad|name','bad\u202ename','bad\u2066name','bad\nname','bad\u007fname','trailing.','trailing ','x'.repeat(201),'界'.repeat(86)]){
  assert.equal(names.resolve(name,'docx'),null,JSON.stringify(name));
 }
 assert.equal(names.resolve('Report','exe'),null);
 assert.equal(names.resolve(null,'docx'),null);
 assert.equal(names.resolve('COM10','docx'),'COM10.docx');
 assert.equal(names.resolve('界'.repeat(83),'docx'),'界'.repeat(83)+'.docx');
});
