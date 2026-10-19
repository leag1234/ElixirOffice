// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
const source=fs.readFileSync(process.env.EO_FORMULA_SOURCE||path.join(upstream,'web-apps/apps/spreadsheeteditor/main/app/view/FormulaWizard.js'),'utf8');
// Load the actual AMD view definition; framework construction is outside these contracts.
function AdvancedSettingsWindow(){}
AdvancedSettingsWindow.prototype.getDefaultFocusableComponent=function(){};
AdvancedSettingsWindow.extend=function(definition){
 function View(){}
 View.prototype=Object.assign(Object.create(AdvancedSettingsWindow.prototype),definition);
 return View;
};
const sandbox={SSE:{Views:{}},Common:{Views:{AdvancedSettingsWindow}},_:{extend:Object.assign}};
sandbox.define=(_dependencies,factory)=>factory();
vm.runInNewContext(source,sandbox,{filename:'FormulaWizard.js'});
const view=sandbox.SSE.Views.FormulaWizard.prototype;
test('a formula without arguments supplies the existing primary footer as its initial keyboard target',()=>{
 const primary={name:'OK'},cancel={name:'Cancel'};
 const state={args:[],getFooterButtons:()=>[primary,cancel]};
 assert.equal(view.getDefaultFocusableComponent.call(state),primary);
});
test('an argument formula supplies no additional default focus target',()=>{
 const state={args:[{argInput:{name:'first argument'}}],getFooterButtons(){throw Error('Argument wizard must not request a footer focus target');}};
 assert.equal(view.getDefaultFocusableComponent.call(state),undefined);
});

test('multiple arguments supply no footer target that could override range return',()=>{
 const state={args:[{},{},{}],getFooterButtons(){throw Error('Argument wizard must not request a footer focus target');}};
 assert.equal(view.getDefaultFocusableComponent.call(state),undefined);
});
test('an absent footer provides no default target without throwing',()=>{
 assert.equal(view.getDefaultFocusableComponent.call({args:[],getFooterButtons:()=>[]}),undefined);
});
