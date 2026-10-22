// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture({embedded=false,language='en',recents=[]}={}){
 const document={createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag,ns)};
 class Element{
  constructor(tag,ns){this.tagName=tag;this.namespaceURI=ns;this.ownerDocument=document;this.children=[];this.attrs={};this.dataset={};this.className='';this.value='';this.classList={add:name=>{this.className+=' '+name}}}
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=nodes}
  setAttribute(key,value){this.attrs[key]=value}
  set textContent(value){this.value=String(value);this.children=[]}
  get textContent(){return this.value+this.children.map(node=>node.textContent).join('')}
 }
 const container=new Element('div'),actions=[],strings=language==='fr'?{home:'Accueil',new:'Nouveau',open:'Ouvrir',options:'Options',help:'Aide',about:'À propos',recent:'Récents',browse:'Parcourir',privacy:'Les documents restent sur cet ordinateur'}:{home:'Home',new:'New',open:'Open',options:'Options',help:'Help',about:'About',recent:'Recent',browse:'Browse',privacy:'Documents stay on this computer'};
 const info={embedded,language,recents,strings:{...strings,blankDoc:'Blank document',blankBook:'Blank workbook',blankSlide:'Blank presentation',name:'Name',modified:'Date modified',noRecent:'No recent documents'},templates:Array.from({length:4},(_,i)=>({id:'public-'+i,title:'Public template '+i,thumb:language+'/public-'+i+'.png'}))};
 const window={EOHomeTheme:{bind(){}}};
 vm.runInNewContext(fs.readFileSync(process.env.EO_HOME_SOURCE||path.join(__dirname,'../../desktop/home.js'),'utf8'),{window,Intl,Date});
 const render=view=>window.EODesktopHome.render(container,info,(...args)=>actions.push(args),view);
 const all=(predicate,node=container)=>[...(predicate(node)?[node]:[]),...node.children.flatMap(child=>all(predicate,child))];
 const cls=name=>all(node=>node.className.split(' ').includes(name));
 render('home');return {container,all,cls,actions,strings,render};
}
for(const language of ['en','fr']){
 test(language+' standalone Home has application commands without document commands or another brand row',()=>{
  const f=fixture({language});const rail=f.cls('rail')[0];assert(rail);
  const buttons=f.all(node=>node.tagName==='button',rail);
  assert.deepEqual(buttons.map(node=>node.textContent),['home','new','open','options','help','about'].map(key=>f.strings[key]));
  assert.equal(f.cls('topbar').length,0);
  for(const key of ['options','help','about'])buttons.find(node=>node.textContent===f.strings[key]).onclick();
  assert.deepEqual(f.actions,[['settings'],['help'],['about']]);
 });
}
test('embedded Home/New/Open keep one shared content component with no second rail or application actions',()=>{
 const f=fixture({embedded:true});
 for(const view of ['home','new','open']){
  f.render(view);assert.equal(f.cls('rail').length,0);assert.equal(f.cls('topbar').length,0);
  assert.equal(f.cls('desktop-footer')[0].textContent,f.strings.privacy);
  assert.equal(f.all(node=>node.tagName==='button'&&['Options','Help','About'].includes(node.textContent)).length,0);
  assert.equal(f.cls('tile-blank').length,view==='open'?0:3);assert.equal(f.cls('tile-template').length,view==='open'?0:4);
 }
});
test('Home retains localized previews, all blank families, recent type/folder/date and live actions',()=>{
 const f=fixture({language:'fr',recents:[{id:'public-recent',name:'Public.xlsx',folder:'/public/example',modified:'2026-10-22T10:00:00Z'}]});
 assert.equal(f.cls('thumb-image').length,4);assert(f.all(node=>node.tagName==='img').every(node=>node.src.includes('/templates/fr/')));
 for(const tile of f.cls('tile-blank'))tile.onclick();
 assert.deepEqual(f.actions,[['new','docx'],['new','xlsx'],['new','pptx']]);
 f.cls('tile-template')[0].onclick();f.cls('file-link')[0].onclick();
 assert.deepEqual(f.actions.slice(-2),[['template','public-0'],['recent','public-recent']]);
 assert.equal(f.cls('file-name')[0].textContent,'Public.xlsx');assert.equal(f.cls('file-where')[0].textContent,'/public/example');
 assert.equal(f.cls('c-date')[0].textContent,new Intl.DateTimeFormat('fr',{dateStyle:'medium',timeStyle:'short'}).format(new Date('2026-10-22T10:00:00Z')));
 assert(f.cls('t-cell').length);assert(f.all(node=>node.tagName==='button'&&node.textContent==='Parcourir').length);
 f.all(node=>node.dataset.view==='open')[0].onclick();assert.equal(f.cls('tile-blank').length,0);
 f.all(node=>node.dataset.view==='new')[0].onclick();assert.equal(f.cls('tile-blank').length,3);
});
