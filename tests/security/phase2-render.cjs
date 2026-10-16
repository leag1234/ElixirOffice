// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const DS=path.resolve(process.env.DS_ROOT||'../DocumentServer');
const read=f=>fs.readFileSync(path.join(DS,'web-apps',f),'utf8');
const _=require(path.join(DS,'web-apps/vendor/underscore/underscore-node.cjs'));
function method(source,name){const start=source.indexOf(name+': function');assert(start>=0);const f=source.indexOf('function',start),end=source.indexOf('\n        },',f);assert(end>f);return '('+source.slice(f,end+10)+')';}
const utils=read('apps/common/main/lib/util/utils.js'),htmlStart=utils.indexOf('htmlEncode: function'),htmlEnd=utils.indexOf('\n            },',htmlStart);
const htmlEncode=vm.runInNewContext('('+utils.slice(utils.indexOf('function',htmlStart),htmlEnd+14)+')',{_});
function changes(kind,value){
 const source=read('apps/common/main/lib/controller/ReviewChanges.js');
 const common={Utils:{String:{textComma:',',htmlEncode},getUserInitials:()=>''},UI:{getId:()=>1,ExternalUsers:{getImage:()=>null,getColor:()=> '#000000'}},Models:{ReviewChange:function(props){Object.assign(this,props);}}};
 const asc={c_oAscRevisionsChangeType:{TextPr:1,ParaPr:2,TextAdd:3,TextRem:4},c_oAscRevisionsMove:{NoMove:0,MoveTo:1,MoveFrom:2}};
 const fn=vm.runInNewContext(method(source,'readSDKChange'),{_,Common:common,Asc:asc,AscCommon:{UserInfoParser:{getParsedName:s=>s}},Date});
 const item=new Proxy({}, {get:(_t,k)=>()=>k==='get_Type'?asc.c_oAscRevisionsChangeType[kind]:k==='get_Value'?value:k==='get_MoveType'?0:k==='get_DateTime'?'':k==='get_LockUserId'?null:'test-user'});
 const self={api:{asc_GetStyleNameById:()=>value.style},userCollection:{findOriginalUser:()=>null},_state:{docProtection:{}},appConfig:{},getUserName:()=>'',dateToLocaleTimeString:()=> 'today',textFormatted:'Formatted',textParaFormatted:'Paragraph formatted',textInserted:'Inserted',textDeleted:'Deleted'};
 return fn.call(self,[item])[0].changetext;
}
function value(overrides){return new Proxy(overrides,{get:(o,k)=>k in o?o[k]:()=>undefined});}
for(const [label,kind,data] of [
 ['font','TextPr',value({Get_FontFamily:()=>'<img src=x onerror="window.pwned=1"> & Font'})],
 ['style','ParaPr',value({Get_PStyle:()=> 'style-id',style:'<svg onload="window.pwned=1"> & Style'})],
 ['inserted text','TextAdd','<img src=x onerror="window.pwned=1">']
])test('review '+label+' stays literal text in actual popover template',async()=>{
 const change=changes(kind,data),browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 const template=_.template(read('apps/common/main/lib/template/ReviewChangesPopover.template'));
 const html=template({id:'test',avatar:null,usercolor:null,initials:'TU',username:'Test user',date:'today',changetext:change,lock:false,lockuser:'',hint:false,editable:true,goto:false,docProtection:{},scope:{appConfig:{},getUserName:htmlEncode}});
 await page.setContent(html);
 assert.equal(await page.locator('img,svg,script').count(),0);assert.equal(await page.evaluate(()=>window.pwned||0),0);
 assert.match(await page.locator('.user-message').textContent(),/<(?:img|svg)/);
 if(kind!=='TextAdd')assert.equal(await page.locator('.user-message b').count(),1);
 }finally{await browser.close();}
});
test('comments linkifier keeps hostile comment and reply text inert while preserving real links',async()=>{
 const source=read('apps/common/main/lib/view/Comments.js'),common={Utils:{String:{htmlEncode}}};
 for(const name of ['ipStrongRe','hostnameStrongRe','emailStrongRe']){
  const line=utils.split('\n').find(s=>s.trim().startsWith(name+' ='));
  assert(line);common.Utils[name]=vm.runInNewContext(line.trim().slice((name+' =').length).replace(/,$/,''));
 }
 const pickLink=vm.runInNewContext(method(source,'pickLink'),{_,Common:common});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 for(const text of ['<img src=x onerror="window.pwned=1">','</textarea><script>window.pwned=1</script>','https://example.invalid/" onclick="window.pwned=1','javascript:alert(1) https://example.invalid/path?a=1&b=2',"person'o@example.invalid"]){
  await page.setContent('<div id="comment">'+pickLink(text)+'</div>');
  assert.equal(await page.locator('img,svg,script').count(),0);assert.equal(await page.evaluate(()=>window.pwned||0),0);
  const links=await page.locator('a').evaluateAll(a=>a.map(e=>({href:e.getAttribute('href'),click:e.getAttribute('onclick')})));
  for(const link of links){assert.equal(link.click,null);assert.match(link.href,/^(https?:|ftp:|mailto:)/);}
 }
 }finally{await browser.close();}
});
