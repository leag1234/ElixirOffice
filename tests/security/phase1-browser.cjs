// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {test}=require('node:test');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const DS=path.resolve(process.env.DS_ROOT||'../DocumentServer');
test('FormulaWizard renders untrusted names, arguments, descriptions and results as text',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();
 await page.setContent('<div id="formula-wizard-args"></div><div id="formula-wizard-desc"></div><div id="formula-wizard-name"></div><div id="results"></div><label id="arg-desc" style="min-height:30px;height:30px"></label><table id="args"></table>');
 await page.addScriptTag({path:path.join(DS,'web-apps/vendor/jquery/jquery.js')});
 await page.addScriptTag({path:path.join(DS,'web-apps/vendor/underscore/underscore.js')});
 await page.evaluate(()=>{
 window.SSE={Views:{}};window.Asc={c_oAscFormulaArgumentType:{text:1}};
 window.Common={Views:{AdvancedSettingsWindow:{extend:o=>o}},UI:{FocusManager:{add(){},insert(){}},InputFieldBtn:function(o){this.options=o;this._input=$('<input>');this.on=()=>this;this.setValue=()=>{};}},Utils:{String:{format:(s,n)=>s.replace(/\{0\}/g,n)}}};
 window.define=(deps,f)=>f();
 });
 await page.addScriptTag({path:path.join(DS,'web-apps/apps/spreadsheeteditor/main/app/view/FormulaWizard.js')});
 const r=await page.evaluate(()=>{
 const w=Object.create(SSE.Views.FormulaWizard),payload='<img src=x onerror="window.pwned=1"><svg onload="window.pwned=1"> & "text"';
 Object.assign(w,{funcprops:{name:payload,args:'('+payload+')',desc:payload,custom:true},$window:$('<div>'),getFooterButtons:()=>[],api:{asc_getFunctionArgumentSeparator:()=>';'},args:[],argsDesc:[],argsNames:[],panelArgs:$('<div>'),lblFunctionResult:$('<div>'),lblFormulaResult:$('<div>'),lblArgDesc:$('#arg-desc'),tableArgs:$('#args'),textValue:'Result',minArgWidth:50,minArgCount:1,maxArgCount:1,_noApply:true});
 w.props={asc_getArgumentMin:()=>1,asc_getArgumentMax:()=>1,asc_getFunctionResult:()=>payload,asc_getFormulaResult:()=>payload,asc_getArgumentsResult:()=>null,asc_getArgumentsType:()=>null,asc_getArgumentsValue:()=>null};
 w.recalcArgTableSize=()=>{};w._setDefaults();
 // Exercise actual setControls, live result updates, selected descriptions and sizing.
 w.getArgumentName=()=>payload;w.getArgumentDesc=()=>payload;w.getArgType=()=>payload;
 w.setControls(0,1,'',payload);
 w.api.asc_insertArgumentsInFormula=()=>({asc_getArgumentsResult:()=>[payload],asc_getFunctionResult:()=>payload,asc_getFormulaResult:()=>payload});
 w.getArgumentsValue=()=>[];w.onInputChanging({options:{index:0}},false);
 w.onSelectArgument({options:{index:0}});w.argsDesc=[payload];w.setInnerHeight=()=>{};w.recalcMaxArgDesc(true);
 $('#results').append(w.lblFunctionResult,w.lblFormulaResult);
 return {elements:document.querySelectorAll('img,svg').length,pwned:window.pwned||0,text:document.body.textContent,html:document.body.innerHTML,desc:w.lblArgDesc.text(),result:w.lblFunctionResult.text()};
 });
 assert.equal(r.pwned,0);assert.equal(r.elements,0);assert.match(r.text,/<img src=x/);assert.match(r.desc,/<img src=x/);assert.match(r.result,/<img src=x/);
 assert.match(r.html,/<b>/,'formatting remains bold');
 }finally{await browser.close();}
});
test('WOPI conversion statusHandler cannot break out of script or hidden attribute',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();
 // Render with the real EJS implementation, installed in an isolated test cache.
 const ejs=require(process.env.EJS_MODULE||'ejs');
 const hostile='</script><script>window.pwned=1</script><img src=x onerror="window.pwned=1">"&';
 const html=ejs.render(fs.readFileSync(path.join(DS,'web-apps/apps/api/wopi/convert-and-edit-wopi.ejs'),'utf8'),{statusHandler:hostile});
 await page.route('**/*',route=>route.abort());
 await page.setContent(html);
 assert.equal(await page.evaluate(()=>window.pwned||0),0);
 assert.equal(await page.locator('img').count(),0);
 assert.equal(await page.locator('#statusHandler').inputValue(),hostile);
 }finally{await browser.close();}
});
