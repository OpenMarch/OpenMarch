const { app, dialog, Menu, shell } = require('electron');
import * as db from '../database/database.services';
import Store from 'electron-store'
import * as mainProcess from './index';

interface MenuItem {
  label: string;
  accelerator?: string;
  role: string;
  type?: string;
  submenu?: MenuItem[];
}

const template = [
  {
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
          mainProcess.loadFile();
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
      // {
      //   label: 'Export HTML',
      //   accelerator: 'Shift+CommandOrControl+S',
      //   click(item:any, focusedWindow:any) {
      //     if (!focusedWindow) {
      //       return dialog.showErrorBox(
      //         'Cannot Save or Export',
      //         'There is currently no active document to save or export.'
      //       );
      //     }
      //     focusedWindow.webContents.send('save-html');
      //   },
      // },
    ],
  },
  {
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
          console.log("Undoing");
          // if (focusedWindow) focusedWindow.webContents.undo();
          mainProcess.executeHistoryAction('redo');
        }
      },
      { type: 'separator' },
      {
        label: 'Bulk Actions',
        submenu: [
          {
            label: 'Set coordinates of all marchers to previous page',
            accelerator: 'Shift+CommandOrControl+G',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              db.setAllCoordsToPreviousPage(store.get('selectedPageId') as number);
              mainProcess.triggerFetch('marcher_page');
            }
          },]
      },
      {
        label: 'Snap X and Y',
        submenu: [
          {
            label: 'Nearest whole step',
            accelerator: '1',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 1, true, true);
              mainProcess.triggerFetch('marcher_page');
            }
          },
          {
            label: 'Nearest half step',
            accelerator: '2',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 2, true, true);
              mainProcess.triggerFetch('marcher_page');
            }
          },
          {
            label: 'Nearest quarter step',
            accelerator: '3',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 4, true, true);
              mainProcess.triggerFetch('marcher_page');
            }
          },
          {
            label: 'Nearest tenth step',
            accelerator: '4',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 10, true, true);
              mainProcess.triggerFetch('marcher_page');
            }
          },
        ]
      },
      {
        label: 'X Snap',
        submenu: [
          {
            label: 'Nearest whole step',
            accelerator: 'Shift+1',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 1, true, false);
              mainProcess.triggerFetch('marcher_page');
            }
          },
          {
            label: 'Nearest half step',
            accelerator: 'Shift+2',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 2, true, false);
              mainProcess.triggerFetch('marcher_page');
            }
          },
          {
            label: 'Nearest quarter step',
            accelerator: 'Shift+3',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 4, true, false);
              mainProcess.triggerFetch('marcher_page');
            }
          },
          {
            label: 'Nearest tenth step',
            accelerator: 'Shift+4',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 10, true, false);
              mainProcess.triggerFetch('marcher_page');
            }
          },
        ]
      },
      {
        label: 'Y Snap',
        submenu: [
          {
            label: 'Nearest whole step',
            accelerator: 'Alt+1',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 1, false, true);
              mainProcess.triggerFetch('marcher_page');
            }
          },
          {
            label: 'Nearest half step',
            accelerator: 'Alt+2',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 2, false, true);
              mainProcess.triggerFetch('marcher_page');
            }
          },
          {
            label: 'Nearest quarter step',
            accelerator: 'Alt+3',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 4, false, true);
              mainProcess.triggerFetch('marcher_page');
            }
          },
          {
            label: 'Nearest tenth step',
            accelerator: 'Alt+4',
            click(item: any, focusedWindow: any) {
              // if (focusedWindow) focusedWindow.webContents.undo();
              const store = new Store();
              const marcherPages = [];
              const selectedPageId = store.get('selectedPageId') as number;
              for (const marcherId of store.get('selectedMarchersId') as number[]) {
                marcherPages.push({
                  marcherId: marcherId,
                  pageId: selectedPageId,
                });
              }
              db.roundCoordinates(marcherPages, 10, false, true);
              mainProcess.triggerFetch('marcher_page');
            }
          },
        ]
      },
      // {
      //   label: 'Cut',
      //   accelerator: 'CommandOrControl+X',
      //   role: 'cut',
      // },
      // {
      //   label: 'Copy',
      //   accelerator: 'CommandOrControl+C',
      //   role: 'copy',
      // },
      // {
      //   label: 'Paste',
      //   accelerator: 'CommandOrControl+V',
      //   role: 'paste',
      // },
      // {
      //   label: 'Select All',
      //   accelerator: 'CommandOrControl+A',
      //   role: 'selectall',
      // },
    ],
  },
  {
    label: 'Window',
    submenu: [
      {
        label: 'Minimize',
        accelerator: 'CommandOrControl+M',
        role: 'minimize',
      },
      {
        label: 'Close',
        accelerator: 'CommandOrControl+W',
        role: 'close',
      },
      {
        label: 'Refresh',
        accelerator: 'CommandOrControl+R',
        click(item: any, focusedWindow: any) {
          if (focusedWindow) {
            // Reload the current window
            focusedWindow.reload();
          }
        },
      },
    ],
  },
  {
    label: 'Help',
    role: 'help',
    submenu: [
      // {
      //   label: 'Visit Website',
      //   click() { /* To be implemented */ }
      // },
      {
        label: 'Toggle Developer Tools',
        click(item: any, focusedWindow: any) {
          if (focusedWindow) focusedWindow.webContents.toggleDevTools();
        }
      }
    ],
  }
];

if (process.platform === 'darwin') {
  const name = 'OpenMarch';
  template.unshift({
    label: name,
    submenu: [
      {
        label: `About ${name}`,
        role: 'about',
        accelerator: '',
      },
      { type: 'separator' },
      {
        label: 'Services',
        role: 'services',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        submenu: [{ label: 'No Services', enabled: false }],
      },
      { type: 'separator' },
      {
        label: `Hide ${name}`,
        accelerator: 'Command+H',
        role: 'hide',
      },
      {
        label: 'Hide Others',
        accelerator: 'Command+Alt+H',
        role: 'hideothers',
      },
      {
        label: 'Show All',
        role: 'unhide',
        accelerator: '',
      },
      { type: 'separator' },
      {
        label: `Quit ${name}`,
        accelerator: 'Command+Q',
        click() { app.quit(); }, // A
      },
    ],
  });

  const windowMenu = template.find(item => item.label === 'Window'); // B
  if (!windowMenu) throw new Error(`Menu template does not have a submenu item 'Window'`);
  windowMenu.role = 'window';
  windowMenu.submenu.push(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    { type: 'separator' },
    {
      label: 'Bring All to Front',
      role: 'front',
    }
  );
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// module.exports = Menu.buildFromTemplate(template);
export const applicationMenu = Menu.buildFromTemplate(template);
