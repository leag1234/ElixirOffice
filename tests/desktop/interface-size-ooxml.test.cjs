// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
test('only the reviewed derived noncustom default height may differ; custom heights, rows and parts stay exact',()=>{
 const result=cp.spawnSync('python3',['-c',String.raw`
import importlib.util,io,zipfile
spec=importlib.util.spec_from_file_location('equivalence',__import__('sys').argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def book(height='14',custom='',row='20',value='hello',extra=b'<core/>'):
 s=('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetFormatPr defaultRowHeight="'+height+'"'+custom+'/>'+
 '<sheetData><row r="1" ht="'+row+'"><c><v>'+value+'</v></c></row></sheetData></worksheet>').encode()
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:
  z.writestr('xl/worksheets/sheet1.xml',s);z.writestr('docProps/core.xml',extra)
 return out.getvalue()
m.compare(book(),book(height='13.91'))
m.compare(book(custom=' customHeight="0"'),book(height='13.91',custom=' customHeight="0"'))
m.compare(book(custom=' customHeight="1"'),book(custom=' customHeight="1"'))
for changed in [book(height='13.91',custom=' customHeight="1"'),book(height='13.91',custom=' customHeight="true"'),book(row='21'),book(value='edited'),book(extra=b'<core>changed</core>')]:
 try:m.compare(book(),changed)
 except AssertionError:pass
 else:raise AssertionError('Unrelated/custom change accepted')
try:m.compare(book(custom=' customHeight="1"'),book(height='15',custom=' customHeight="1"'))
except AssertionError:pass
else:raise AssertionError('Explicit custom height changed')
print('9 bounded OOXML equivalence cases PASS')
`,path.join(__dirname,'interface-size-ooxml.py')],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/9 bounded/);
});

test('only a valid W3CDTF serialization timestamp may differ; author, revision, type and malformed values fail',()=>{
 const result=cp.spawnSync('python3',['-c',String.raw`
import importlib.util,io,zipfile
spec=importlib.util.spec_from_file_location('eq',__import__('sys').argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def book(stamp='2026-10-27T17:35:48Z',author='ElixirOffice',revision='1',kind='dcterms:W3CDTF',extra=''):
 data=('<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><cp:lastModifiedBy>'+author+'</cp:lastModifiedBy><cp:revision>'+revision+'</cp:revision><dcterms:modified xsi:type="'+kind+'">'+stamp+'</dcterms:modified>'+extra+'</cp:coreProperties>').encode()
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:z.writestr('docProps/core.xml',data)
 return out.getvalue()
m.compare(book(),book(stamp='2026-10-27T17:35:50Z'))
for changed in [book(author='Other'),book(revision='2'),book(kind='other'),book(stamp='2026-02-30T17:35:50Z'),book(stamp='invalid'),book(extra='<dcterms:created>new</dcterms:created>'),book(extra='<dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-27T17:35:50Z</dcterms:modified>')]:
 try:m.compare(book(),changed)
 except (AssertionError,ValueError):pass
 else:raise AssertionError('Unexpected core-properties change accepted')
print('8 bounded timestamp cases PASS')
`,path.join(__dirname,'interface-size-ooxml.py')],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/8 bounded/);
});
