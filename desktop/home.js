// SPDX-License-Identifier: AGPL-3.0-only
// Use the shared web home stylesheet, Fluent sprite and approved template previews.
(() => {
'use strict';
const base='/example/local-assets/desktop-home/';
function render(container,info,actions,view='home'){
 const doc=container.ownerDocument,t=key=>info.strings[key],element=(tag,cls,text)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
 const icon=name=>{const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS(svg.namespaceURI,'use');svg.setAttribute('class','ic');svg.setAttribute('aria-hidden','true');use.setAttribute('href',base+'icons.svg#i-'+name);svg.append(use);return svg};
 const button=(label,fn,cls='btn')=>{const b=element('button',cls,label);b.type='button';b.onclick=fn;return b};
 container.replaceChildren();container.classList.add('eo-desktop-page');
 const header=element('div','topbar');header.append(element('span','brand-text','ElixirOffice'));if(!info.embedded)container.append(header);
 const layout=element('div',info.embedded?'desktop-home-content':'layout'),rail=element('nav','rail');rail.setAttribute('aria-label',t('home'));
 for(const [name,symbol] of [['home','home'],['new','add'],['open','open']]){
  const b=button('',()=>render(container,info,actions,name),'rail-item');b.append(icon(symbol),element('span','',t(name)));b.dataset.view=name;if(name===view)b.setAttribute('aria-current','page');rail.append(b);
 }
 if(!info.embedded)layout.append(rail);const main=element('main');main.append(element('h1','section-title',t(view)));layout.append(main);container.append(layout);
 if(view!=='open'){
  const section=element('section','start'),tiles=element('div','tiles');
  for(const [format,type,key] of [['docx','word','blankDoc'],['xlsx','cell','blankBook'],['pptx','slide','blankSlide']]){
   const tile=button('',()=>actions('new',format),'tile tile-blank');tile.dataset.new=format;
   const thumb=element('span','thumb thumb-'+type),sheet=element('span','sheet');thumb.setAttribute('aria-hidden','true');thumb.append(sheet);
   tile.append(thumb,element('span','tile-label',t(key)));tiles.append(tile);
  }
  for(const template of info.templates){
   const tile=button('',()=>actions('template',template.id),'tile tile-template'),thumb=element('span','thumb thumb-image'),img=element('img');img.src=base+'templates/'+template.thumb;img.alt='';thumb.append(img);
   tile.append(thumb,element('span','tile-label',t(template.titleKey)));tile.dataset.template=template.id;tiles.append(tile);
  }
  section.append(tiles);main.append(section);
 }
 const recent=element('section','recent'),head=element('div','recent-head');head.append(element('h2','section-title',t('recent')),element('span','recent-fill'),button(t('browse'),()=>actions('open')));recent.append(head);
 if(view==='open'){const drop=element('div','dropzone');drop.append(icon('open'),button(t('browse'),()=>actions('open'),'btn btn-primary'));main.append(drop);}
 const table=element('table','files'),thead=element('thead'),tr=element('tr');for(const text of [t('name'),t('modified')])tr.append(element('th','',text));thead.append(tr);table.append(thead);
 const tbody=element('tbody');
 for(const item of info.recents){
  const row=element('tr'),cell=element('td','c-name'),b=button('',()=>actions('recent',item.id),'file-link');
  const type=/\.(xlsx|xls|ods|csv|xltx|xlsm)$/i.test(item.name)?'cell':/\.(pptx|ppt|odp|potx|ppsx)$/i.test(item.name)?'slide':'word',symbol=icon(type);symbol.classList.add('t-'+type);
  const label=element('span');label.append(element('span','file-name',item.name),element('span','file-where',item.folder));b.append(symbol,label);cell.append(b);row.append(cell);
  const date=item.modified?new Intl.DateTimeFormat(info.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.modified)):'—';row.append(element('td','c-date',date));tbody.append(row);
 }
 table.append(tbody);if(info.recents.length)recent.append(table);else recent.append(element('p','recent-empty',t('noRecent')));main.append(recent);
 const footer=element('footer','desktop-footer',t('privacy'));container.append(footer);
}
window.EODesktopHome={render};
})();
