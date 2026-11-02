// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validate,reporter}=require('../../desktop/external.cjs');
test('external URL validation allowlist table',()=>{
 const cases=[
  ['https://example.org/path?q=1','https://example.org/path?q=1'],
  ['http://example.org','http://example.org/'],
  ['mailto:person@example.org?subject=Hello','mailto:person@example.org?subject=Hello'],
  ['file:///tmp/document.docx',null],['javascript:alert(1)',null],['data:text/html,test',null],
  ['http://u:p@example.org',null],['https://u@example.org',null],
  ['mailto:',null],['mailto://host/person',null],[' https://example.org',null],
  ['https://example.org/a b',null],['https://example.org/\n',null],
  ['custom://host/path',null],['relative.docx',null],['https://',null],
  ['https://example.org/'+ 'a'.repeat(8192),null],[null,null],[123,null]
 ];
 for(const [input,expected] of cases)assert.equal(validate(input),expected,JSON.stringify(input));
});

test('only the packaged Presenter View page may open a window',()=>{
 const origin='eoapp://desktop.elixiroffice.invalid',page=origin+'/example/local-assets/web-apps/apps/presentationeditor/main/index.reporter.html';
 const ok=reporter({url:page+'?lang=fr'},origin);
 assert.equal(ok.action,'allow');assert.equal(ok.overrideBrowserWindowOptions.webPreferences.sandbox,true);
 assert.equal(ok.overrideBrowserWindowOptions.webPreferences.nodeIntegration,false);
 assert.equal(reporter({url:page},origin).action,'allow');
 for(const bad of [page.replace('desktop.elixiroffice.invalid','evil.invalid'),origin+'/index.html',page+'?lang=fr&x=1',page+'?lang=a b',page+'#x',
  'https://example.org/example/local-assets/web-apps/apps/presentationeditor/main/index.reporter.html',origin+'/example/local-assets/web-apps/apps/documenteditor/main/index.reporter.html','x','']) assert.equal(reporter({url:bad},origin),null,bad);
 assert.equal(reporter({url:page},undefined),null);
});
