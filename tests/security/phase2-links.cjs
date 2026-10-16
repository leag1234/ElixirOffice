// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const DS=path.resolve(process.env.DS_ROOT||'../DocumentServer');
const sdk=fs.readFileSync(path.join(DS,'sdkjs/common/editorscommon.js'),'utf8');
const marker='function isSafeHyperlink(';
const safe=sdk.includes(marker)?vm.runInNewContext(sdk.slice(sdk.indexOf(marker),sdk.indexOf('\n\tfunction getUrlType(',sdk.indexOf(marker)))+'\n({isSafeHyperlink,getSafeHyperlink:typeof getSafeHyperlink===\"function\"?getSafeHyperlink:undefined})'):undefined;
const localeCache=new Map();
const encode=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function handler(editor,mobile){
 const embed=mobile==='embed',forms=mobile==='forms'||mobile==='visio-main';
 const file='web-apps/apps/'+editor+(embed?'/embed/js/ApplicationController.js':forms?(mobile==='visio-main'?'/main/app/controller/DocumentHolder.js':'/forms/app/controller/ApplicationController.js'):mobile?'/mobile/src/controller/ContextMenu.jsx':'/main/app/controller/DocumentHolderExt.js');
 const source=fs.readFileSync(path.join(DS,file),'utf8'),name=editor==='spreadsheeteditor'?'onApiHyperlinkClick':'onHyperlinkClick';
 let code;
 if(embed){const start=source.indexOf('    function onHyperlinkClick(url)');assert(start>=0);code='('+source.slice(start,source.indexOf('\n    }',start)+6).trim()+')';}
 else if(forms){const start=source.indexOf('onHyperlinkClick: function(url)');assert(start>=0);code='('+source.slice(source.indexOf('function(url)',start),source.indexOf('\n        },',start)+10)+')';}
 else if(mobile){const start=source.indexOf('    openLink(url) {');assert(start>=0);code='(class { '+source.slice(start,source.indexOf('\n    onDocumentReady(',start))+' }).prototype.openLink';}
 else{const start=source.indexOf('dh.'+name+' = function(url)');assert(start>=0);code='('+source.slice(source.indexOf('function(url)',start),source.indexOf('\n        };',start)+10)+')';}
 const opens=[],warnings=[],internal=[],alerts=[],api={asc_GoToInternalHyperlink:u=>internal.push(u),asc_getUrlType:u=>/^https?:|^mailto:/i.test(u)?1:3};
 const Common={EditorApi:{get:()=>api},NotificationCenter:{trigger(){}},Analytics:{trackEvent(){}},Utils:{String:{htmlEncode:encode,format:(s,v)=>s.replace('{0}',v)}},UI:{alert:o=>alerts.push(o),warning:o=>{warnings.push(o.msg);o.callback('yes');}}};
 const world={Common,URL,api,me:{txtOpenWarning:'Open %1?',txtNo:'No',txtYes:'Yes'},WarningShown:false,common:{utils:{htmlEncode:encode},controller:{modals:{showWarning:o=>{warnings.push(o.message);if(o.callback)o.callback('Yes');}}}},AscCommon:{isSafeHyperlink:safe&&safe.isSafeHyperlink,getSafeHyperlink:safe&&safe.getSafeHyperlink,c_oAscUrlType:{Http:1,Email:2}},window:{location:{origin:'https://office.example.invalid',href:'https://office.example.invalid/editor/'},open:u=>{opens.push(u);return{focus(){}};}},console,setTimeout:f=>f(),_:{bind:f=>f},f7:{dialog:{create:o=>({open(){warnings.push(o.text);for(const button of o.buttons)assert.equal(typeof button.text,'string');if(o.buttons[1]&&o.buttons[1].onClick)o.buttons[1].onClick();}})}}};
 const variant=embed?'embed':forms?(mobile==='visio-main'?'main':'forms'):mobile?'mobile':'main';
 const localePath=path.join(DS,'web-apps/apps',editor,variant,'locale/en.json');
 if(!localeCache.has(localePath))localeCache.set(localePath,JSON.parse(fs.readFileSync(localePath)));
 const locale=localeCache.get(localePath),prefix={documenteditor:'DE',spreadsheeteditor:'SSE',presentationeditor:'PE',visioeditor:'VE'}[editor];
 const textKey=prefix+(embed?'.ApplicationController':mobile==='forms'?'.Controllers.ApplicationController':'.Views.DocumentHolder')+'.txtCannotOpenLink';
 const cannotOpen=variant==='mobile'?locale.ContextMenu.txtCannotOpenLink:editor==='spreadsheeteditor'&&variant==='main'?locale['SSE.Controllers.DocumentHolder.errorInvalidLink']:locale[textKey];
 world.me.txtCannotOpenLink=cannotOpen;
 const fn=vm.runInNewContext(code,world);
 const self={api,errorInvalidLink:cannotOpen,documentHolder:{txtWarnUrl:'Open {0}?',txtCannotOpenLink:cannotOpen},txtCannotOpenLink:cannotOpen,txtWarnUrl:'Open {0}?',props:{t:key=>key.split('.').reduce((v,k)=>v&&v[k],locale)||{}}};
 function method(name){const start=source.indexOf(name+': function');assert(start>=0);const a=source.indexOf('function',start),b=source.indexOf("\n        },",a);return vm.runInNewContext('('+source.slice(a,b+10)+')',world);}
 let configured;
 if(mobile==='forms'){
  configured=()=>{self.onHyperlinkClick=u=>fn.call(self,u);self.onConfiguredHyperlinkClick=method('onConfiguredHyperlinkClick').bind(self);return method('onOptionsClick');};
 }
 return {invoke:u=>fn.call(self,u),opens,warnings,internal,alerts,invokeConfig:(name,url)=>{self.embedConfig={fullscreenUrl:url,saveUrl:url};self.appOptions={};return configured().call(self,null,{value:name});}};

}
const bad=['javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,<script>alert(1)</script>','vbscript:msgbox(1)','file:///tmp/private','smb://host/file','tessa://item','joplin://note','https:\njavascript:alert(1)',' \tjavascript:alert(1)','java\tscript:alert(1)'];
for(const editor of ['documenteditor','spreadsheeteditor','presentationeditor'])for(const mobile of [false,true]){
 const label=editor+(mobile?' mobile':' desktop');
 for(const url of bad)test(label+' rejects '+JSON.stringify(url)+' even after approval',()=>{const h=handler(editor,mobile);h.invoke(url);assert.equal(h.opens.length,0);});
 test(label+' preserves allowed links and internal anchors',()=>{
  for(const url of ['https://example.invalid/path','http://example.invalid','ftp://example.invalid/file','mailto:person@example.invalid','tel:+1234567','#Bookmark','HTTPS://example.invalid']){
   const h=handler(editor,mobile);h.invoke(url);assert.deepEqual(h.opens,[url]);
  }
 });
 test(label+' escapes allowed URL in warning HTML',()=>{
  const h=handler(editor,mobile);h.invoke('ftp://example.invalid/<img src=x onerror=alert(1)>');
  assert.equal(h.warnings.length,1);assert.doesNotMatch(h.warnings[0],/<img/);assert.match(h.warnings[0],/&lt;img/);
 });
}

test('presentation mobile preserves internal slide navigation',()=>{
 for(const url of ['ppaction://hlinkshowjump?jump=firstslide','ppaction://hlinkshowjump?jump=lastslide','ppaction://hlinkshowjump?jump=nextslide','ppaction://hlinkshowjump?jump=previousslide','ppaction://hlinksldjumpslide12']){
  const h=handler('presentationeditor',true);h.invoke(url);assert.deepEqual(h.internal,[url]);assert.equal(h.opens.length,0);
 }
});
test('presentation mobile rejects file and malformed internal actions',()=>{
 for(const url of ['ppaction://hlinkfile?file=javascript:alert(1)','ppaction://hlinkcustom','https://example.invalid/#ppaction://hlinkshowjump?jump=firstslide','ppaction://hlinksldjumpslide1garbage','ppaction://hlinkshowjump?jump=firstslide&file=x']){
  const h=handler('presentationeditor',true);h.invoke(url);
  assert.equal(h.internal.length,0);if(!url.startsWith('https:'))assert.equal(h.opens.length,0);
 }
});
test('spreadsheet desktop keeps existing empty-link alert',()=>{
 for(const url of ['',null,undefined]){
  const h=handler('spreadsheeteditor',false);h.invoke(url);assert.equal(h.alerts.length,1);assert.equal(h.opens.length,0);
 }
});

test('actual converted hostile DOCX relationship targets are blocked at every external opener',()=>{
 const fixture=process.env.EO_SECURITY_DOCX_JSON;assert(fixture,'Explicit verified synthetic DOCX proof required');
 const proof=JSON.parse(fs.readFileSync(fixture));
 assert.equal(proof.actual_docx_editor_docx_roundtrip,true);assert.equal(proof.preserved_hyperlinks,7);
 assert.equal(proof.tracked_font_preserved,true);assert.equal(proof.tracked_style_name_preserved,true);
 for(const editor of ['documenteditor','spreadsheeteditor','presentationeditor'])for(const mobile of [false,true])for(const url of proof.targets){
  const h=handler(editor,mobile);h.invoke(url);
  assert.equal(h.opens.length,/^(https?:|ftp:|mailto:|tel:)/i.test(url)?1:0);
 }
});

const extra=[['documenteditor','embed'],['spreadsheeteditor','embed'],['presentationeditor','embed'],['documenteditor','forms'],['visioeditor','embed'],['visioeditor','visio-main'],['visioeditor',true]];
for(const [editor,variant] of extra){
 const label=editor+' '+variant;
 for(const url of bad)test(label+' rejects '+JSON.stringify(url)+' even after approval',()=>{const h=handler(editor,variant);h.invoke(url);assert.equal(h.opens.length,0);});
 test(label+' preserves allowed links and anchors',()=>{
  for(const url of ['https://example.invalid/path','http://example.invalid','ftp://example.invalid/file','mailto:person@example.invalid','tel:+1234567','#Bookmark','HTTPS://example.invalid']){
   const h=handler(editor,variant);h.invoke(url);assert.deepEqual(h.opens,[url]);
  }
 });
 test(label+' escapes allowed URL in warning HTML',()=>{
  const h=handler(editor,variant);h.invoke('ftp://example.invalid/<img src=x onerror=alert(1)>');
  assert.equal(h.warnings.length,1);assert.doesNotMatch(h.warnings[0],/<img/);assert.match(h.warnings[0],/&lt;img/);
 });
}
test('converted hostile DOCX targets stay blocked in embed and forms callbacks',()=>{
 const proof=JSON.parse(fs.readFileSync(process.env.EO_SECURITY_DOCX_JSON));
 for(const [editor,variant] of extra)for(const url of proof.targets){
  const h=handler(editor,variant);h.invoke(url);assert.equal(h.opens.length,/^(https?:|ftp:|mailto:|tel:)/i.test(url)?1:0);
 }
});

const every=[...['documenteditor','spreadsheeteditor','presentationeditor'].flatMap(ed=>[[ed,false],[ed,true]]),...extra];
for(const [ed,variant] of every){
 test(ed+' '+variant+' normalizes www target to HTTP',()=>{
  const h=handler(ed,variant);h.invoke('www.example.invalid/path');assert.deepEqual(h.opens,['http://www.example.invalid/path']);
 });
 test(ed+' '+variant+' warns without opening relative document target',()=>{
  for(const url of ['other.docx','../other.docx','folder/other.docx','?download','//other.example.invalid/file']){const h=handler(ed,variant);h.invoke(url);assert.equal(h.opens.length,0);assert(h.alerts.length+h.warnings.length>0);for(const alert of h.alerts)assert.equal(typeof alert.msg,'string');for(const msg of h.warnings)assert.equal(typeof msg,'string');}
 });
}
for(const name of ['fullscr','download']){
 test('forms '+name+' resolves integrator relative config URL',()=>{
  const h=handler('documenteditor','forms');h.invokeConfig(name,'assets/file.docx');assert.deepEqual(h.opens,['https://office.example.invalid/assets/file.docx']);
 });
 test('forms '+name+' rejects executable integrator config URL',()=>{
  const h=handler('documenteditor','forms');h.invokeConfig(name,'javascript:alert(1)');assert.equal(h.opens.length,0);
 });
}
