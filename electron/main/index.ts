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
import { UiSettings } from '@/global/Interfaces';
import { generatePDF } from './export-coordinates';

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
    win.on("ready-to-show", () => {
      if (win)
        win.webContents.openDevTools();
    });
  } else {
    win.loadFile(indexHtml);
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

  // File IO handlers
  ipcMain.handle('database:isReady', DatabaseServices.databaseIsReady);
  ipcMain.handle('database:save', async () => saveFile());
  ipcMain.handle('database:load', async () => loadFile());
  ipcMain.handle('database:create', async () => newFile());
  ipcMain.handle('history:undo', async () => executeHistoryAction("undo"));
  ipcMain.handle('history:redo', async () => executeHistoryAction("redo"));

  // Getters
  initGetters();

  await createWindow('OpenMarch - ' + store.get('databasePath'));
})

function initGetters() {
  // Store selected page and marchers
  ipcMain.on('send:selectedPage', async (_, selectedPageId: number) => {
    store.set('selectedPageId', selectedPageId);
  });
  ipcMain.on('send:selectedMarchers', async (_, selectedMarchersId: number[]) => {
    store.set('selectedMarchersId', selectedMarchersId);
  });

  // Store locked x or y axis
  store.set('lockX', false);
  store.set('lockY', false);
  ipcMain.on('send:lockX', async (_, lockX: boolean) => {
    console.log('lockX: ' + lockX);
    store.set('lockX', lockX as boolean);
  });
  ipcMain.on('send:lockY', async (_, lockY: boolean) => {
    console.log('lockY: ' + lockY);
    store.set('lockY', lockY as boolean);
  });

  // Snap to grid
  ipcMain.on('send:snap', async (_, marcherPages: { marcherId: number, pageId: number }[], roundFactor: number, lockX: boolean, lockY: boolean) => {
    DatabaseServices.roundCoordinates(marcherPages, roundFactor, !lockX, !lockY).then(() => {
      triggerFetch('marcher_page');
    });
  });

  // Export Individual Coordinate Sheets
  ipcMain.on('send:exportIndividual', async (_, coordinateSheets: string[]) => await generatePDF(coordinateSheets));
}

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

/************************************** FILE SYSTEM INTERACTIONS **************************************/
/**
 * Creates a new database file path to connect to.
 *
 * @returns 200 for success, -1 for failure
 */
export async function newFile() {
  console.log('newFile');

  if (!win) return -1;

  // Get path to new file
  dialog.showSaveDialog(win, {
    buttonLabel: 'Create New',
    filters: [{ name: 'OpenMarch File', extensions: ['dots'] }]
  }).then((path) => {
    if (path.canceled || !path.filePath) return;

    setActiveDb(path.filePath, true);
    DatabaseServices.initDatabase();
    win?.webContents.reload();

    return 200;
  }).catch((err) => {
    console.log(err);
    return -1;
  });

}

/**
 * Opens a dialog to create a new database file path to connect to with the data of the current database.
 * I.e. Save As..
 * OpenMarch automatically saves changes to the database, so this is not a save function.
 *
 * @returns 200 for success, -1 for failure
 */
export async function saveFile() {
  console.log('saveFile');

  if (!win) return -1;

  const db = DatabaseServices.connect();

  // Save database file
  store.set('database', db.serialize());

  // Save
  dialog.showSaveDialog(win, {
    buttonLabel: 'Save Copy',
    filters: [{ name: 'OpenMarch File', extensions: ['dots'] }]
  }).then((path) => {
    if (path.canceled || !path.filePath) return -1;

    fs.writeFileSync(path.filePath, db.serialize());

    setActiveDb(path.filePath);
    return 200;
  }).catch((err) => {
    console.log(err);
    return -1;
  });
}

/**
 * Opens a dialog to load a database file path to connect to.
 *
 * @returns 200 for success, -1 for failure
 */
export async function loadFile() {
  console.log('loadFile');

  if (!win) return -1;

  // If there is no previous path, open a dialog
  dialog.showOpenDialog(win, {
    filters: [{ name: 'OpenMarch File', extensions: ['dots'] }]
  }).then((path) => {
    DatabaseServices.setDbPath(path.filePaths[0]);
    store.set('databasePath', path.filePaths[0]); // Save the path for next time

    // If the user cancels the dialog, and there is no previous path, return -1
    if (path.canceled || !path.filePaths[0])
      return -1;

    setActiveDb(path.filePaths[0]);
    return 200;
  }).catch((err) => {
    console.log(err);
    return -1;
  });
}

/**
 * Performs an undo or redo action on the history stacks based on the type.
 *
 * @param type 'undo' or 'redo'
 * @returns 200 for success, -1 for failure
 */
export async function executeHistoryAction(type: 'undo' | 'redo') {
  const response = await DatabaseServices.historyAction(type);

  if (!response?.success) {
    console.log(`Error ${type}ing`);
    return -1;
  }

  // send a message to the renderer to fetch the updated data
  win?.webContents.send('history:action', response.history_data);

  return 200;
}

/**
 * Triggers the renderer to fetch all data of the given type.
 *
 * @param type 'marcher' | 'page' | 'marcher_page'
 */
export async function triggerFetch(type: 'marcher' | 'page' | 'marcher_page') {
  win?.webContents.send('fetch:all', type);
}



function setActiveDb(path: string, isNewFile = false) {
  DatabaseServices.setDbPath(path, isNewFile);
  win?.setTitle('OpenMarch - ' + path);
  !isNewFile && win?.webContents.reload();
  store.set('databasePath', path); // Save current db path
}
