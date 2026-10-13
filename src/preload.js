const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Postman HTTP Request Execution
  sendRequest: (options) => ipcRenderer.invoke('api:send-request', options),

  // Deep Network & Multi-Domain Page Scanner
  scanPage: (targetUrl) => ipcRenderer.invoke('api:scan-page', targetUrl),

  // DNS & IP Resolution
  resolveDns: (host) => ipcRenderer.invoke('api:resolve-dns', host),
  resolveBatchDns: (hosts) => ipcRenderer.invoke('api:resolve-batch', hosts),

  // Platform info
  platform: process.platform
});
