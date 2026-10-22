// SPDX-License-Identifier: AGPL-3.0-only
// Compile the production Underscore templates with the production template engine.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const web=path.resolve(process.env.EO_WEBAPPS||path.join(process.env.UPSTREAM||path.join(os.homedir(),'elixiroffice/DocumentServer'),'web-apps'));
const _=require(path.join(web,'vendor/underscore/underscore-node.cjs'));
const source=fs.readFileSync(path.join(web,'apps/common/main/lib/component/Button.js'),'utf8');
const start=source.indexOf('var templateBtnIcon ='),end=source.indexOf('var getWidthOfCaption',start);
assert(start>=0&&end>start);
const begin=source.indexOf('template: _.template(['),finish=source.indexOf("].join('')),",begin);
assert(begin>=0&&finish>begin);
const scope={_};vm.createContext(scope);
vm.runInContext(source.slice(start,end)+'\nthis.templates={huge:_.template(templateHugeCaption),hugeMenu:_.template(templateHugeMenuCaption),hugeSplit:_.template(templateHugeSplitCaption)};',scope);
scope.templates.default=vm.runInContext(source.slice(begin+'template: '.length,finish+"].join(''))".length),scope);
const options={id:'public-button',cls:'',groupCls:'',style:'',dataHint:'',dataHintDirection:'',dataHintOffset:'',dataHintTitle:'',iconImg:'',iconCls:'',caption:'Public caption',menu:null,onlyIcon:false,split:false};
const variants=[['default',{}],['default',{onlyIcon:true}],['default',{menu:{}}],['default',{menu:{},onlyIcon:true}],['default',{menu:{},split:true}],['huge',{}],['hugeMenu',{}],['hugeSplit',{}]];
const sprite=fs.readFileSync(path.join(web,'apps/common/main/resources/img/toolbar/equationicons.svg'),'utf8');
const symbols=[...sprite.matchAll(/<symbol id="(svg-icon-[A-Za-z0-9_-]+)"/g)].map(m=>m[1]);assert.equal(symbols.length,12);
for(const [template,variant] of variants)for(const symbol of symbols)test(template+' '+JSON.stringify(variant)+' renders '+symbol,()=>{
 const html=scope.templates[template]({...options,...variant,iconCls:'svgicon '+symbol});
 assert(html.includes('<svg class="icon uni-scale">'),html);
 assert(html.includes('<use href="#'+symbol+'">'),html);
 assert(!html.includes('<i class="icon svgicon'),html);
 assert(html.includes('Public caption')||variant.onlyIcon);
});
for(const [template,variant] of variants){
 test(template+' '+JSON.stringify(variant)+' preserves modern icons, CSS/raster fallback and image precedence',()=>{
  const render=value=>scope.templates[template]({...options,...variant,...value});
  assert(render({iconCls:'toolbar btn-more-vertical'}).includes('<use href="#btn-more-vertical">'));
  assert(render({iconCls:'svgicon svg-icon-fraction btn-save'}).includes('<use href="#btn-save">'));
  assert(render({iconCls:'custom-image-icon'}).includes('<i class="icon custom-image-icon">'));
  const image=render({iconImg:'public.png',iconCls:'svgicon svg-icon-fraction'});
  assert(image.includes('<img src="public.png">'));assert(!image.includes('<svg'));
  const empty=render({iconCls:''});assert(!empty.includes('<use '));
 });
 test(template+' '+JSON.stringify(variant)+' only accepts a complete safe legacy symbol token',()=>{
  const render=iconCls=>scope.templates[template]({...options,...variant,iconCls});
  assert(render('svgicon\tsvg-icon-fraction\n').includes('<use href="#svg-icon-fraction">'));
  for(const cls of ['svgicon xsvg-icon-fraction','svgicon svg-icon-fraction/other','svgicon svg-icon-fraction"extra']){
   assert(!render(cls).includes('<use '),'Invalid legacy symbol token must retain the existing fallback');
  }
 });
}
