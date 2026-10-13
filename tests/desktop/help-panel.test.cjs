// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
for(const [editor,namespace]of [['documenteditor','DE'],['spreadsheeteditor','SSE'],['presentationeditor','PE']]){
 test(editor+' actual Help handler accepts absent panel in every online mode',()=>{
  for(const online of [false,true])for(const state of ['absent','null','local','external']){
   const opened=[],events=[],target={},scope={Views:{}};
   const $=()=>({hasClass:()=>false,addClass(){return this},removeClass(){return this}});
   const _={extend:Object.assign,template:()=>()=>'',bind:(fn,self)=>fn.bind(self),findWhere:(items,match)=>items.find(item=>Object.keys(match).every(key=>item[key]===match[key]))};
   const context={window:{open:url=>opened.push(url)},navigator:{onLine:online},$,
    Common:{UI:{BaseView:{extend:definition=>definition}},Utils:{InternalSettings:{get:()=> 'https://help.example.invalid/'}}},
    define:(_deps,factory)=>factory('',_),[namespace]:scope};
   vm.runInNewContext(fs.readFileSync(path.join(upstream,'web-apps/apps',editor,'main/app/view/FileMenu.js'),'utf8'),context);
   let shown=0;const panel=state==='absent'?undefined:state==='null'?null:{noHelpContents:state==='external',show:()=>shown++};
   const view={items:[{el:target,options:{action:'help'}}],panels:{help:panel},el:{},$el:{find:()=>({hide(){}})},fireEvent:(name,args)=>events.push({name,action:args[1],panel:args[2]})};
   const handler=scope.Views.FileMenu.events.call(view)['click .fm-btn'];
   assert.doesNotThrow(()=>handler({currentTarget:target}),state+'/'+online);
   const external=state==='external'&&online;
   assert.deepEqual(events,[{name:'item:click',action:external?'external-help':'help',panel:external||!!panel}]);
   assert.equal(opened.length,external?1:0);assert.equal(shown,panel&&!external?1:0);
  }
 });
}
