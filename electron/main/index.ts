import { app, BrowserWindow, shell, ipcMain, ipcRenderer, Menu, dialog } from 'electron'
import Store from 'electron-store'
import * as fs from 'fs';
import { release } from 'node:os'
import { join } from 'node:path'
import { update } from './update'
import * as DatabaseServices from '../database/database.services'
import { applicationMenu } from './application-menu';
import { on } from 'events';
import { create } from 'domain';

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.js    > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//

const store = new Store();

process.env.DIST_ELECTRON = join(__dirname, '../')
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let win: BrowserWindow | null = null
// Here, you can also use other preload
const preload = join(__dirname, '../preload/index.js')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = join(process.env.DIST, 'index.html')

async function createWindow(title?: string) {
  win = new BrowserWindow({
    title: title || 'OpenMarch',
    icon: join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      nodeIntegration: false, // is default value after Electron v5
      contextIsolation: true, // protect against prototype pollution
    },
  })

  if (url) { // electron-vite-vue#298
    win.loadURL(url)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Apply electron-updater
  update(win)
}

app.whenReady().then(async () => {
  app.setName('OpenMarch');
  Menu.setApplicationMenu(applicationMenu);
  const previousPath = store.get('databasePath') as string;
  if (previousPath && previousPath.length > 0)
    setActiveDb(previousPath);
  DatabaseServices.initHandlers();

  // Database handlers
  console.log("db_path: " + DatabaseServices.getDbPath());
  ipcMain.handle('database:isReady', DatabaseServices.databaseIsReady);
  ipcMain.handle('database:save', async () => saveFile());
  ipcMain.handle('database:load', async () => loadFile());
  ipcMain.handle('database:create', async () => newFile());

  await createWindow('OpenMarch - ' + store.get('databasePath'));
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${url}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

export async function newFile() {
  console.log('newFile');

  // Get path to new file
  const path = await dialog.showSaveDialog({
    buttonLabel: 'Create New',
    filters: [{ name: 'OpenMarch File', extensions: ['dots'] }]
  });
  if (path.canceled || !path.filePath) return;

  setActiveDb(path.filePath, true);
  DatabaseServices.initDatabase();
  win?.webContents.reload();

  return 200;
}

export async function saveFile() {
  console.log('saveFile');

  const db = DatabaseServices.connect();

  // Save database file
  store.set('database', db.serialize());

  // Save
  const path = await dialog.showSaveDialog({
    buttonLabel: 'Save Copy',
    filters: [{ name: 'OpenMarch File', extensions: ['dots'] }]
  });
  if (path.canceled || !path.filePath) return;
  fs.writeFileSync(path.filePath, db.serialize());

  setActiveDb(path.filePath);

  return 200;
}

/**
 * Opens a dialog to load a database file path to connect to.
 *
 * @returns 200 for success, -1 for failure
 */
export async function loadFile() {
  console.log('loadFile');

  try {
    // If there is no previous path, open a dialog
    const path = await dialog.showOpenDialog({
      filters: [{ name: 'OpenMarch File', extensions: ['dots'] }]
    });
    DatabaseServices.setDbPath(path.filePaths[0]);
    store.set('databasePath', path.filePaths[0]); // Save the path for next time

    // If the user cancels the dialog, and there is no previous path, return -1
    if (path.canceled || !path.filePaths[0])
      return -1;

    setActiveDb(path.filePaths[0]);
  }
  catch (e) {
    console.log(e);
    return -1;
  }
  return 200;
}

export async function executeUndo() {
  const response = await DatabaseServices.undo();

  if (!response?.success) {
    console.log("Error undoing");
    return;
  }

  // send a message to the renderer to fetch the updated data
  win?.webContents.send('history:undo', response.undo_data);

  DatabaseServices.deleteUndo(response.undo_id);
}

function setActiveDb(path: string, isNewFile = false) {
  DatabaseServices.setDbPath(path, isNewFile);
  win?.setTitle('OpenMarch - ' + path);
  !isNewFile && win?.webContents.reload();
  store.set('databasePath', path); // Save current db path
}
