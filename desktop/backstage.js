// SPDX-License-Identifier: AGPL-3.0-only
// Extend only this packaged editor's existing shared Fluent backstage instance.
(() => {
'use strict';
window.EODesktopBackstage=async function(win,main,info,action){
 const app=win.DE||win.SSE||win.PE||win.PDFE;
 if(win.PDFE&&!app.getController('ElixirChrome')){
  const fm=app.getController('LeftMenu').leftMenu.menuFile,originalGet=app.getController.bind(app);
  const bs=new win.Common.Views.ElixirBackstage({controller:{getApplication:()=>app},menu:fm});
  bs.defaultFileType='pdf';bs.defaultFormat=()=>win.Asc.c_oAscFileType.PDF;bs.formats=()=>[{type:win.Asc.c_oAscFileType.PDF,ext:'.pdf',icon:'pdf',name:'txtFmtPdf',desc:'txtFmtPdfDesc',group:'pdf'}];
  const adapter={backstage:bs,openBackstage:panel=>{originalGet('LeftMenu').leftMenu.showMenu('file');fm.selectMenu(panel)}};
  app.getController=name=>name==='ElixirChrome'?adapter:originalGet(name);
  const render=fm.render;fm.render=function(){const result=render.apply(this,arguments);bs.onRender();return result;};
  if(fm.rendered)bs.onRender();
 }
 const chrome=app.getController('ElixirChrome'),bs=chrome?.backstage;
 if(!bs)throw Error('Bundled backstage unavailable');
 const fm=bs.fm,$=win.$,t=key=>info.strings[key],parent=window;
 // Desktop AutoRecover is configured in Options; the inherited server AutoSave switch is not applicable.
 chrome.titleBar?.$autosave?.remove();
 const original=bs.afterApplyMode;
 bs.afterApplyMode=function(){
  original.apply(this,arguments);if(!this.rendered)return;
  for(const id of ['elx-home','elx-open','elx-export','elx-close'])this.items[id]?.show();
  for(const id of ['elx-share'])this.items[id]?.hide();
  for(const item of [fm.miRecent,fm.miRename,fm.miProtect,fm.miHistory,fm.miAccess,fm.miSaveCopyAs])item?.hide();
  this.items['elx-ai']?.[typeof win.Common.ElixirAI?.Settings?.isConfigured==='function'?'show':'hide']();
  this.items['elx-about']?.show();this.items['elx-about']?.setDisabled(false);
  if(!info.capture&&!this.items['eo-move']){
   const el=$('<li id="fm-btn-eo-move" class="fm-btn" role="menuitem" tabindex="0"/>').attr('aria-label',t('tabMove')).insertAfter(fm.$el.find('#fm-btn-elx-close'));
   const item=new win.Common.UI.MenuItem({el,action:'eo-move',caption:t('tabMove'),canFocused:true,iconCls:'menu__icon'});
   fm.items.push(item);this.items['eo-move']=item;
   item.on('click',()=>{fm.hide();return action('move-menu')});
  }
  if(!this.items['eo-quit']){
   const el=$('<li id="fm-btn-eo-quit" class="fm-btn"/>').insertAfter(fm.$el.find('#fm-btn-elx-about'));
   const item=new win.Common.UI.MenuItem({el,action:'eo-quit',caption:t('quit'),canFocused:false,iconCls:'menu__icon'});
   fm.items.push(item);this.items['eo-quit']=item;
   item.on('click',()=>{fm.hide();return action('quit')});
  }
  fm.miHelp?.show();fm.miHelp?.setDisabled(false);
  // Handle native Help before the server-only delegated panel callback.
  fm.$el.find('#fm-btn-help').off('click.eoDesktopHelp').on('click.eoDesktopHelp',event=>{
   event.preventDefault();event.stopImmediatePropagation();fm.hide();return action('help');
  });
  fm.miInfo?.show();fm.miInfo?.setCaption(t('info'));fm.$el.find('#fm-btn-info').insertAfter(fm.$el.find('#fm-btn-elx-open'));
  for(const item of [fm.miNew,fm.miSave,fm.miDownload,fm.miPrint]){item?.show();item?.setDisabled(false)}
  if(fm.miPrint)fm.miPrintWithPreview?.hide();else{fm.miPrintWithPreview?.show();fm.miPrintWithPreview?.setDisabled(false);fm.miPrintWithPreview?.setCaption(t('print'));}
  fm.miRename?.hide();
  if(win.PDFE)fm.miSave?.setDisabled(!main.api.elixirPdfSaveAllowed?.());
  fm.miSave?.setCaption(t('save'));fm.miDownload?.setCaption(t('saveAs'));
  fm.miPrint?.setCaption(t('print'));
  this.items['elx-export']?.setCaption(bs.txtExport);
  // Keep the existing menu objects, delegated callbacks and focus model.
  // Editors ship different rail orders; append the live nodes in Office order.
  this.items['eo-move']?.hide();
  const rail=fm.$el.find('.panel-menu');
  if(rail[0]?.append){
   for(const id of ['save-desktop','save-copy','rename','edit','export-pdf','suggest'])fm.$el.find('#fm-btn-'+id).hide();
   rail.find('.devider,.devider-last').hide();
   for(const id of ['elx-home','create','elx-open','info','save','download','print','print-with-preview','elx-export','elx-close','elx-ai','settings','help','elx-about','eo-quit'])
    fm.$el.find('#fm-btn-'+id).appendTo(rail);
   for(const [id,before]of [['eo-doc-separator','info'],['eo-app-separator','elx-ai']]){
    let divider=fm.$el.find('#'+id);
    if(!divider.length)divider=$('<li class="devider" role="separator"/>').attr('id',id);
    divider.insertBefore(fm.$el.find('#fm-btn-'+before)).show();
   }
  }
 };
 const captions={txtInfo:'info',txtHome:'home',txtNew:'new',txtOpen:'open',txtSaveAs:'saveAs',txtPrint:'print',txtClose:'close',txtOptions:'options',txtHelp:'help',txtAbout:'about'};
 for(const [key,value] of Object.entries(captions))bs[key]=t(value);
 for(const [name,label] of [['elx-home','home'],['elx-open','open'],['elx-close','close'],['elx-about','about']])bs.items?.[name]?.setCaption(t(label));
 const ensurePanel=name=>{
  if(!fm.panels)return null;
  if(!fm.panels[name]){
   const box=$('<div class="content-box elx-page" style="display:none"/>').attr('id','panel-'+name).appendTo(fm.$el.find('.panel-context'));
   fm.panels[name]=new win.Common.Views.ElixirBackstagePage({el:box,backstage:bs,menu:fm});
  }
  return fm.panels[name];
 };
 const homePage=page=>{page.refresh=async()=>{
  const data=await parent.eoDesktop.home();Object.assign(data,{language:info.language,strings:info.strings,embedded:true});
  parent.EODesktopHome.render(page.$el[0],data,action,page===bs.pages['elx-open']?'open':'home');
 };return page};
 const renderHome=bs.renderHome,renderOpen=bs.renderOpen;bs.renderHome=function(page){return homePage(renderHome.call(this,page))};bs.renderOpen=function(page){return homePage(renderOpen.call(this,page))};
 if(bs.pages){homePage(bs.pages['elx-home']);homePage(bs.pages['elx-open']);}
 bs.enhanceNew=function(){
  const panel=ensurePanel('new');if(!panel)return;
  panel.$el.off('.eoDesktopNew').on('show.eoDesktopNew',()=>{});
  this._newDesktopPanel=panel;
  panel.refresh=async()=>{const data=await parent.eoDesktop.home();Object.assign(data,{language:info.language,strings:info.strings,embedded:true});parent.EODesktopHome.render(panel.$el[0],data,action,'new')};
  const show=panel.show;if(!panel.eoDesktopShow){panel.eoDesktopShow=true;panel.show=function(){show.apply(this,arguments);this.refresh()};}
 };
 bs.enhanceSaveAs=function(){const panel=ensurePanel('saveas');if(!panel)return;panel.$el.empty().append($('<button class="btn btn-primary" type="button"/>').text(t('saveAs')).on('click',()=>action('save-as')),$('<button data-action="rename" type="button"/>').text(bs.txtRename).on('click',()=>{fm.hide();action('rename')}))};
 // Extend, rather than replace, the shared SDK property/protection surface.
 const refreshInfoTiles=bs.refreshInfoTiles;
 bs.refreshInfoTiles=function(panel){
  const result=refreshInfoTiles.apply(this,arguments),target=panel.$el.find('.elx-info-actions');
  const buttons=[['rename',bs.txtRename],['save-as',t('saveAs')]];
  if(!info.capture)buttons.push(['move-menu',t('tabMoveOtherWindow')]);
  target.append(...buttons.map(([command,label])=>$('<button type="button" class="btn normal dlg-btn eo-info-action"/>').text(label).attr('title',command==='move-menu'?t('tabMoveHint'):label).on('click',()=>{fm.hide();return action(command)})));
  return result;
 };
 bs.enhancePrint=function(){};
 bs.onAbout=()=>{fm.hide();return action('about')};
 bs.onClose=()=>action('close');
 // Controller callbacks were bound before this desktop extension was installed.
 // Dispatch native commands before those existing web handlers receive the event.
 const openBackstage=chrome.openBackstage;chrome.openBackstage=function(){const result=openBackstage.apply(this,arguments);parent.dispatchEvent(new parent.CustomEvent('eo:backstage-visibility',{detail:true}));return result;};
 const hideFile=fm.hide;fm.hide=function(){const result=hideFile.apply(this,arguments);parent.dispatchEvent(new parent.CustomEvent('eo:backstage-visibility',{detail:false}));return result;};
 // Keep keyboard focus inside the visible File surface, away from covered
 // ribbon controls with positive tab indexes.
 win.document.addEventListener('keydown',event=>{
  const root=fm.$el?.[0];if(!root||!fm.$el.is(':visible'))return;
  if(event.isComposing||event.keyCode===229||event.ctrlKey||event.altKey||event.metaKey)return;
  if($(win.document).find('.asc-window.modal:visible,[role="dialog"][aria-modal="true"]:visible').length)return;
  const active=win.document.activeElement;
  if(event.key==='Tab'){
   const nodes=[...root.querySelectorAll('.fm-btn,button,input,select,textarea,a[href],[tabindex]')].filter(node=>{
    const item=node.closest('.fm-btn');
    return (!item||item===node)&&!node.disabled&&!node.closest('.disabled,[inert]')&&node.getAttribute('aria-disabled')!=='true'&&node.getAttribute('aria-hidden')!=='true'&&!node.classList.contains('divider')&&node.getClientRects().length>0&&win.getComputedStyle(node).visibility!=='hidden';
   });
   if(!nodes.length)return;
   const index=nodes.findIndex(node=>node===active||node.contains(active));
   const next=index<0?(event.shiftKey?nodes.length-1:0):(index+(event.shiftKey?-1:1)+nodes.length)%nodes.length;
   event.preventDefault();event.stopImmediatePropagation();
   if(!nodes[next].matches('button,input,select,textarea,a[href],[tabindex]'))nodes[next].setAttribute('tabindex','-1');
   // A modal close can re-enable SDK input while File remains visible.
   // Disable its focus redirection before moving to a File control.
   main.api.asc_enableKeyEvents?.(false);
   nodes[next].focus();return;
  }
  const item=active?.closest?.('.fm-btn');
  if((event.key==='Enter'||event.key===' ')&&item&&(active===item||active.matches('a.menu-item,[role="menuitem"]'))&&root.contains(item)&&!item.closest('.disabled,[inert]')&&item.getAttribute('aria-disabled')!=='true'){
   event.preventDefault();event.stopImmediatePropagation();item.click();
  }
 },true);
 const fireEvent=fm.fireEvent;
 fm.fireEvent=function(event,args,...rest){
  const command=event==='item:click'&&{save:'save','save-desktop':'save-as',saveas:'save-as',rename:'rename','save-copy':'save-as',print:'print',printpreview:'print',exit:'close','file:open':'open',settings:'settings',opts:'settings',help:'help','elx-export':'save-as'}[args?.[1]];
  if(command){this.hide();return action(command)}
  return fireEvent.call(this,event,args,...rest);
 };
 main.api.asc_Print=()=>action('print');
 main.api.asc_DownloadAs=()=>action('save-as');
 const localDownloadAs=main.api.downloadAs;
 main.api.downloadAs=(requested,options)=>{
  if(requested===win.Asc.c_oAscAsyncAction.MailMergeLoadFile||
     requested===win.Asc.c_oAscAsyncAction.DownloadMerge||options?.oDocumentMailMerge)
   return localDownloadAs.call(main.api,requested,options);
  return options?.fileType===win.Asc.c_oAscFileType.PDF?action('pdf'):action(options?.asc_getIsSaveAs?.()?'save-as':'save');
 };
 const link=win.document.createElement('link');link.rel='stylesheet';link.href='/example/local-assets/desktop-home/backstage-home.css';win.document.head.append(link);
 const style=win.document.createElement('style');
 style.textContent='.eo-info-action{width:auto!important;min-width:120px;min-height:36px;padding:6px 16px;justify-self:start;white-space:normal;text-align:start} .eo-desktop-page .file-link{display:flex;align-items:center;gap:12px;border:0;background:none;text-align:start;width:100%;cursor:pointer}.eo-desktop-page .file-link .ic{width:28px;height:28px;flex:none}.eo-desktop-page .file-name{display:block;font-weight:600} body.elx-chrome .elx-docname .elx-docstate{display:none!important} body.elx-chrome #id-box-doc-name.elx-docname-box{padding-right:4px!important} @media(min-width:900px){body.elx-chrome .elx-search{left:60%!important} body.elx-chrome.rtl .elx-search,.rtl body.elx-chrome .elx-search{left:40%!important} body.elx-chrome #id-box-doc-name.elx-docname-box{flex:1 1 auto!important;min-width:160px!important}}';
 win.document.head.append(style);
 let operationFeedback,pendingOperation;
 const operationRender=bs.onRender;bs.onRender=function(){const result=operationRender.apply(this,arguments);if(pendingOperation)showOperation(pendingOperation);return result;};
 function showOperation(event){
  pendingOperation=event;const target=fm.$el?.find('.panel-context')[0];if(!target)return;
  if(!operationFeedback){
   operationFeedback=parent.EOOperationFeedback.mount(win.document,target,info.strings,{diagnostics:()=>parent.eoDesktop.copySaveDiagnostics(),open:id=>parent.dispatchEvent(new parent.CustomEvent('eo:saved-open',{detail:id})),show:id=>parent.eoDesktop.savedShow(id)});
   operationFeedback.reset(event.scope);
   if(event.phase!=='preparing')operationFeedback.update({id:event.id,scope:event.scope,kind:event.kind,phase:'preparing'});
   operationFeedback.element.classList.add('eo-operation-backstage');
   const css=win.document.createElement('link');css.rel='stylesheet';css.href='/feedback.css';win.document.head.append(css);
  }
  operationFeedback.update(event);
 }
 chrome.titleBar?.fitName();
 bs.afterApplyMode();bs.enhanceNew();
 return {operation:showOperation,renameLabel:bs.txtRename,setName:()=>fm.loadDocument({doc:main.document||main.appOptions.spreadsheet}),open:async()=>{
  const deadline=Date.now()+30000;
  while(!win.Common.Controllers.LaunchController.isScriptLoaded()){
   if(Date.now()>deadline)throw Error('File menu scripts did not finish loading');
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  chrome.openBackstage('elx-home');
  if(!fm.rendered||!fm.isVisible())throw Error('File menu unavailable');
 }};
};
})();
