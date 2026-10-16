// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=process.env.EO_WEB_APPS;assert(web&&path.isAbsolute(web),'Explicit owned EO_WEB_APPS required');
const languages=JSON.parse(fs.readFileSync(path.join(__dirname,'../../desktop/assets/desktop-home/locales.json'),'utf8'));
test('all 45 browser UI languages provide dialog labels, format descriptions and selected-format loss warnings',()=>{
 assert.equal(languages.length,45);
 for(const language of languages)for(const [editor,prefix,formats,warnings] of [
  ['documenteditor','DE',['Docx','Odt','Rtf','Txt','Pdf'],['warnDownloadAs','warnDownloadAsRTF']],
  ['spreadsheeteditor','SSE',['Xlsx','Ods','Csv','Pdf'],['warnDownloadCsv','warnDownloadOds']],
  ['presentationeditor','PE',['Pptx','Odp','Pdf'],[]]
 ]){
  const catalog=JSON.parse(fs.readFileSync(path.join(web,'apps',editor,'main/locale',language+'.json'),'utf8'));
  const keys=['txtSaveAs','txtSaveFormat','txtSaveName','txtSaveNameInvalid',...formats.flatMap(format=>['txtFmt'+format,'txtFmt'+format+'Desc']),...(prefix==='DE'?['txtPdfCopyWarning']:[])].map(key=>prefix+'.Views.ElixirBackstage.'+key);
  keys.push(...warnings.map(key=>prefix+'.Controllers.LeftMenu.'+key));
  for(const key of keys)assert(typeof catalog[key]==='string'&&catalog[key].trim(),language+': '+key);
 }
});
