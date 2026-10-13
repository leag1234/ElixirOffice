// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
function render(desktop,localized={}){
 const ai={langOf:l=>l,ConfigForm:localized,Settings:{get:()=>({endpoint:'',model:'',apiKey:'',hasKey:true,extraParams:'',maxRounds:8}),hasUserConfig:()=>false}};
 const nodes=new Map(),container={innerHTML:'',querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'',style:{},textContent:'',addEventListener(){},classList:{toggle(){}}});return nodes.get(selector)}};
 const window={Common:{ElixirAI:ai},eoDesktopAI:desktop?{}:undefined};
 const context={window,document:{getElementById:()=>({})},define:(_deps,factory)=>factory(),URL};
 vm.runInNewContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-ai/Strings.js'),'utf8'),context);
 vm.runInNewContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-ai/View.js'),'utf8'),context);
 ai.ConfigForm.render(container);
 return container.innerHTML;
}
test('desktop AI form describes encrypted key storage without browser disclosure',()=>{
 const html=render(true);
 assert.match(html,/encrypted by your operating system/);assert.match(html,/never shown again/);
 assert.doesNotMatch(html,/localStorage|in clear text|stored only in this browser/i);
 assert.match(html,/type="password" autocomplete="off" value="" placeholder="••••••••"/);
});
test('hosted AI form retains its accurate browser disclosure',()=>{
 const html=render(false);assert.match(html,/stored only in this browser/i);assert.match(html,/localStorage/);assert.match(html,/in clear text/);
 assert.doesNotMatch(html,/encrypted by your operating system|never shown again/);
});
test('desktop form preserves strings loaded before the AMD module',()=>{
 const html=render(true,{desktopKeyLabel:'Localized encrypted label',desktopPrivacy:'Localized private disclosure'});
 assert.match(html,/Localized encrypted label/);assert.match(html,/Localized private disclosure/);
});
test('all 45 locale files in each editor carry the desktop disclosure fallback',()=>{
 for(const editor of ['documenteditor','spreadsheeteditor','presentationeditor']){
  const directory=path.join(upstream,'web-apps/apps',editor,'main/locale');
  const files=fs.readdirSync(directory).filter(n=>n.endsWith('.json'));assert.equal(files.length,45);
  for(const name of files){const locale=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
   for(const key of ['desktopKeyLabel','desktopPrivacy'])assert.ok(locale['Common.ElixirAI.ConfigForm.'+key],editor+'/'+name+'/'+key);
  }
 }
});
