const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('da', {
  start: () => ipcRenderer.invoke('l-start'),
  open: p => ipcRenderer.invoke('l-open', p),
  folder: () => ipcRenderer.invoke('l-folder'),
  onProgress: f => ipcRenderer.on('l-progress', (e, p, t) => f(p, t)),
  onOpen: f => ipcRenderer.on('da-open', (e, list) => f(list)),
});
