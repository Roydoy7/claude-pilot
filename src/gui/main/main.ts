/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Electron main process
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc-handlers';
import { deployAutoCADPlugin } from '../../core/services/autocad-plugin-deployer';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load Vite dev server in development
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // Load built files in production
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Register IPC handlers
  registerIpcHandlers(mainWindow);
}

app.whenReady().then(() => {
  createWindow();

  // Deploy AutoCAD plugin if source files are available
  try {
    const result = deployAutoCADPlugin();
    if (result.success) {
      console.log('[AutoCAD Plugin]', result.message);
    } else {
      console.warn('[AutoCAD Plugin]', result.message);
    }
  } catch (error) {
    console.warn('[AutoCAD Plugin] Deployment check failed:', error);
  }

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
