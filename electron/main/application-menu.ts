import * as mainProcess from './index';
import { MenuItem } from 'electron';
const { app, dialog, Menu } = require('electron');

const isMac = process.platform === 'darwin'

const template: MenuItem[] = [];

if (isMac) {
  template.push(new MenuItem({
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }))
}

template.push(...[
  // { role: 'fileMenu' }
  new MenuItem({
    label: 'File',
    submenu: [
      {
        label: 'Open File',
        accelerator: 'CommandOrControl+O',
        click(item: any, focusedWindow: any) {
          //   if (focusedWindow) {
          //     return mainProcess.getFileFromUser(focusedWindow);
          //   }

          //   const newWindow = mainProcess.createWindow();

          //   newWindow.on('show', () => {
          //     mainProcess.getFileFromUser(newWindow);
          //   });
          mainProcess.loadDatabaseFile();
        },
      },
      { type: 'separator' },
      {
        label: 'Create New',
        accelerator: 'CommandOrControl+N',
        click() {
          mainProcess.newFile();
        }
      },
      {
        label: 'Save As Copy',
        accelerator: 'CommandOrControl+S',
        click(item: any, focusedWindow: any) {
          if (!focusedWindow) {
            return dialog.showErrorBox(
              'Cannot Save or Export',
              'There is currently no active document to save or export.'
            );
          }
          mainProcess.saveFile();
        },
      },
      { type: 'separator' },
      {
        label: 'Load Audio',
        click() {
          mainProcess.loadAudioFile();
        }
      },
    ]
  }),
  // { role: 'editMenu' }
  new MenuItem({
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        id: 'undo',
        accelerator: 'CommandOrControl+Z',
        // role: 'undo',
        click(item: any, focusedWindow: any) {
          console.log("Undoing");
          // if (focusedWindow) focusedWindow.webContents.undo();
          mainProcess.executeHistoryAction('undo');
        }
      },
      {
        label: 'Redo',
        id: 'redo',
        accelerator: 'Shift+CommandOrControl+Z',
        // role: 'redo',
        click(item: any, focusedWindow: any) {
          console.log("Redoing");
          // if (focusedWindow) focusedWindow.webContents.undo();
          mainProcess.executeHistoryAction('redo');
        }
      },
    ]
  }),
  // { role: 'viewMenu' }
  new MenuItem({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }),
  // { role: 'windowMenu' }
  (isMac ?
    new MenuItem({
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ]
    }) :
    new MenuItem({
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' }
      ]
    })
  ),
  new MenuItem({
    role: 'help',
    submenu: [
      {
        label: 'Learn More',
        click: async () => {
          const { shell } = require('electron')
          await shell.openExternal('https://electronjs.org')
        }
      }
    ]
  })
]);

export const applicationMenu = Menu.buildFromTemplate(template);
