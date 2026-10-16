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
  this.items['elx-ai']?.[win.Common.ElixirAI?.Settings?.isConfigured?.()?'show':'hide']();
  fm.miHelp?.show();fm.miHelp?.setDisabled(false);
  // Handle native Help before the server-only delegated panel callback.
  fm.$el.find('#fm-btn-help').off('click.eoDesktopHelp').on('click.eoDesktopHelp',event=>{
   event.preventDefault();event.stopImmediatePropagation();fm.hide();return action('help');
  });
  fm.miInfo?.show();fm.miInfo?.setCaption(t('info'));fm.$el.find('#fm-btn-info').insertAfter(fm.$el.find('#fm-btn-elx-open'));
  for(const item of [fm.miNew,fm.miSave,fm.miDownload,fm.miPrint]){item?.show();item?.setDisabled(false)}
  if(fm.miPrint)fm.miPrintWithPreview?.hide();else{fm.miPrintWithPreview?.show();fm.miPrintWithPreview?.setDisabled(false);fm.miPrintWithPreview?.setCaption(t('print'));}
  fm.miRename?.show();fm.miRename?.setDisabled(false);fm.miRename?.setCaption(bs.txtRename);
  if(win.PDFE)fm.miSave?.setDisabled(!main.api.elixirPdfSaveAllowed?.());
  fm.miSave?.setCaption(t('save'));fm.miDownload?.setCaption(t('saveAs'));
  fm.miPrint?.setCaption(t('print'));
  this.items['elx-export']?.setCaption(t('pdf'));
 };
 const captions={txtInfo:'info',txtHome:'home',txtNew:'new',txtOpen:'open',txtSaveAs:'saveAs',txtPrint:'print',txtExport:'pdf',txtClose:'close',txtOptions:'options',txtHelp:'help',txtAbout:'about'};
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
 bs.enhancePrint=function(){};
 bs.onClose=()=>action('home');
 // Controller callbacks were bound before this desktop extension was installed.
 // Dispatch native commands before those existing web handlers receive the event.
 const openBackstage=chrome.openBackstage;chrome.openBackstage=function(){const result=openBackstage.apply(this,arguments);parent.dispatchEvent(new parent.CustomEvent('eo:backstage-visibility',{detail:true}));return result;};
 const hideFile=fm.hide;fm.hide=function(){const result=hideFile.apply(this,arguments);parent.dispatchEvent(new parent.CustomEvent('eo:backstage-visibility',{detail:false}));return result;};
 const fireEvent=fm.fireEvent;
 fm.fireEvent=function(event,args,...rest){
  const command=event==='item:click'&&{save:'save','save-desktop':'save-as',saveas:'save-as',rename:'rename','save-copy':'save-as',print:'print',printpreview:'print',exit:'home','file:open':'open',settings:'settings',opts:'settings',help:'help','elx-export':'pdf'}[args?.[1]];
  if(command){this.hide();return action(command)}
  return fireEvent.call(this,event,args,...rest);
 };
 main.api.asc_Print=()=>action('print');
 main.api.asc_DownloadAs=()=>action('save-as');
 main.api.downloadAs=(_action,options)=>options?.fileType===win.Asc.c_oAscFileType.PDF?action('pdf'):action(options?.asc_getIsSaveAs?.()?'save-as':'save');
 const link=win.document.createElement('link');link.rel='stylesheet';link.href='/example/local-assets/desktop-home/backstage-home.css';win.document.head.append(link);
 const style=win.document.createElement('style');
 style.textContent='.eo-desktop-page .file-link{display:flex;align-items:center;gap:12px;border:0;background:none;text-align:left;width:100%;cursor:pointer}.eo-desktop-page .file-link .ic{width:28px;height:28px;flex:none}.eo-desktop-page .file-name{display:block;font-weight:600} body.elx-chrome .elx-docname .elx-docstate{display:none!important} body.elx-chrome #id-box-doc-name.elx-docname-box{padding-right:4px!important} @media(min-width:900px){body.elx-chrome .elx-search{left:60%!important} body.elx-chrome.rtl .elx-search,.rtl body.elx-chrome .elx-search{left:40%!important} body.elx-chrome #id-box-doc-name.elx-docname-box{flex:1 1 auto!important;min-width:160px!important}}';
 win.document.head.append(style);
 let operationFeedback,pendingOperation;
 const operationRender=bs.onRender;bs.onRender=function(){const result=operationRender.apply(this,arguments);if(pendingOperation)showOperation(pendingOperation);return result;};
 function showOperation(event){
  pendingOperation=event;const target=fm.$el?.find('.panel-context')[0];if(!target)return;
  if(!operationFeedback){
   operationFeedback=parent.EOOperationFeedback.mount(win.document,target,info.strings,{open:id=>parent.dispatchEvent(new parent.CustomEvent('eo:saved-open',{detail:id})),show:id=>parent.eoDesktop.savedShow(id)});
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
