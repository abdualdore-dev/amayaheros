const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('amayaDesktop', {
  version: '1.1.0',
  print: opts => ipcRenderer.invoke('amaya-print', { heightMicrons: opts && opts.heightMicrons }),
  retry: () => ipcRenderer.invoke('amaya-retry'),
  show: () => ipcRenderer.invoke('amaya-show'),
  push: false,
});
