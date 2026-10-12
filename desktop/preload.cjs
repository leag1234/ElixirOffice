// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {contextBridge, ipcRenderer, webUtils} = require('electron');
contextBridge.exposeInMainWorld('eoDesktop', Object.freeze({
  closeSaved: () => ipcRenderer.invoke('eo:closed-saved'),
  initial: () => ipcRenderer.invoke('eo:initial'),
  choose: () => ipcRenderer.invoke('eo:open'),
  recent: id => ipcRenderer.invoke('eo:recent', id),
  recents: () => ipcRenderer.invoke('eo:recents'),
  create: format => ipcRenderer.invoke('eo:new', format),
  drop: file => ipcRenderer.invoke('eo:drop', webUtils.getPathForFile(file)),
  save: (token, bytes, as) => ipcRenderer.invoke('eo:save', token, bytes, !!as),
  pdf: (token, bytes, print) => ipcRenderer.invoke('eo:pdf', token, bytes, !!print),
  state: (token, dirty) => ipcRenderer.invoke('eo:state', token, !!dirty),
  fontConsent: () => ipcRenderer.invoke('eo:font-consent'),
  fonts: () => ipcRenderer.invoke('eo:fonts'),
  font: id => ipcRenderer.invoke('eo:font', id),
  onAction: callback => { const listener = (_event, action) => callback(action); ipcRenderer.on('eo:action', listener); return () => ipcRenderer.removeListener('eo:action', listener); }
}));
