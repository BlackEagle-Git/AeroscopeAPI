const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { executeRequest } = require('./services/http-service');
const { scanPageNetwork } = require('./services/page-scanner');
const { resolveHostname, resolveBatch } = require('./services/dns-service');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    title: 'AeroScope — Postman API Client & Distributed Topology Tracker',
    backgroundColor: '#090d16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      webSecurity: false // allow cross-origin previews in webview
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Register IPC Handlers
  ipcMain.handle('api:send-request', async (_event, options) => {
    try {
      return await executeRequest(options);
    } catch (err) {
      return {
        error: true,
        message: err.message,
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: '',
        timing: { total: 0 }
      };
    }
  });

  ipcMain.handle('api:scan-page', async (_event, targetUrl) => {
    try {
      return await scanPageNetwork(targetUrl);
    } catch (err) {
      return {
        error: true,
        message: err.message,
        resources: []
      };
    }
  });

  ipcMain.handle('api:resolve-dns', async (_event, host) => {
    return await resolveHostname(host);
  });

  ipcMain.handle('api:resolve-batch', async (_event, hosts) => {
    return await resolveBatch(hosts);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
