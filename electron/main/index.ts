import { app, BrowserWindow, shell, ipcMain, ipcRenderer, Menu, dialog } from 'electron'
import Store from 'electron-store'
import * as fs from 'fs';
import { release } from 'node:os'
import { join } from 'node:path'
import { update } from './update'
import * as DatabaseServices from '../database/database.services'
import { applicationMenu } from './application-menu';
import { on } from 'events';

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
  await loadDbFromFile(true);
  await createWindow('OpenMarch - ' + store.get('databasePath'));
  DatabaseServices.initDatabase();
  DatabaseServices.initHandlers();
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

// app.on('close', (event) => {
//   if (newWindow.isDocumentEdited()) {
//     event.preventDefault();

//     const result = dialog.showMessageBox(newWindow, {
//       type: 'warning',
//       title: 'Quit with Unsaved Changes?',
//       message: 'Your changes will be lost permanently if you do not save.',
//       buttons: [
//         'Quit Anyway',
//         'Cancel',
//       ],
//       cancelId: 1,
//       defaultId: 0
//     });

//     if (result === 0) newWindow.destroy();
//   }
// });


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

export async function saveFile() {
  console.log('saveFile');

  const db = DatabaseServices.connect();
  const store = new Store();

  // Save database file
  store.set('database', db.serialize());

  // Save
  const path = await dialog.showSaveDialog({
    filters: [
      { name: 'drill', extensions: ['feet'] }
    ]
  });
  if (path.canceled || !path.filePath) return;
  fs.writeFileSync(path.filePath, db.serialize());
  DatabaseServices.setDbPath(path.filePath);
  // Save the path for next time
  store.set('databasePath', path.filePath);
}

/**
 * Opens a dialog to load a database file path to connect to.
 *
 * @returns 200 for success, -1 for failure
 */
export async function loadDbFromFile(onLaunch = false) {
  console.log('loadDbFromFile');

  try {
    let previousPath = '';
    // Load the previous path on launch
    if (onLaunch) {
      previousPath = store.get('databasePath') as string;
      if(previousPath && previousPath.length > 0)
        DatabaseServices.setDbPath(previousPath);
    }
    // If there is no previous path, open a dialog
    if(previousPath === '') {
      const path = await dialog.showOpenDialog({
        filters: [
          { name: 'drill', extensions: ['feet'] }
        ]
      });
      DatabaseServices.setDbPath(path.filePaths[0]);
      store.set('databasePath', path.filePaths[0]); // Save the path for next time

      // If the user cancels the dialog, and there is no previous path, return -1
      if (path.canceled || !path.filePaths[0]) {
        if (!onLaunch) return -1;
        // App is launching, so app quits on cancel
        console.log('No database file selected. Exiting.');
        app.quit();
      }

      DatabaseServices.setDbPath(path.filePaths[0]);
      store.set('databasePath', path.filePaths[0]); // Save the path for next time
      win?.setTitle('OpenMarch - ' + path.filePaths[0]);
      win?.webContents.reload();
    }
  }
  catch (e) {
    console.log(e);
    return -1;
  }
  return 200;
}
