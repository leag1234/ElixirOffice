// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('eoTabs',Object.freeze({
 home:()=>ipcRenderer.invoke('eo:tabs-shell','home'),
 initial:()=>ipcRenderer.invoke('eo:tabs-shell','initial'),
 activate:(id,focus=true)=>ipcRenderer.invoke('eo:tabs-shell','activate',id,focus),
 close:id=>ipcRenderer.invoke('eo:tabs-shell','close',id),
 beginDrag:(id,token)=>ipcRenderer.invoke('eo:tabs-shell','begin-drag',id,token),
 endDrag:token=>ipcRenderer.invoke('eo:tabs-shell','end-drag',token),
 dropDrag:token=>ipcRenderer.invoke('eo:tabs-shell','drop-drag',token),
 detach:id=>ipcRenderer.invoke('eo:tabs-shell','detach',id),
 moveMenu:id=>ipcRenderer.invoke('eo:tabs-shell','move-menu',id),
 create:()=>ipcRenderer.invoke('eo:tabs-shell','new'),
 onLimit:callback=>{const listener=()=>callback();ipcRenderer.on('eo:tabs-limit',listener);return ()=>ipcRenderer.removeListener('eo:tabs-limit',listener);},
 onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('eo:tabs-state',listener);return ()=>ipcRenderer.removeListener('eo:tabs-state',listener);}
}));
