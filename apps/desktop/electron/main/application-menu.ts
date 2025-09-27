import * as mainProcess from "./index";
import { MenuItem } from "electron";
import { app, dialog, Menu, shell } from "electron";

const isMacOS = process.platform === "darwin";

const template: MenuItem[] = [];

if (isMacOS) {
    template.push(
        new MenuItem({
            label: app.name,
            submenu: [
                { role: "about" },
                { type: "separator" },
                { role: "services" },
                { type: "separator" },
                { role: "hide" },
                { role: "hideOthers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" },
            ],
        }),
    );
}

template.push(
    ...[
        // { role: 'fileMenu' }
        new MenuItem({
            label: "File",
            submenu: [
                {
                    label: "Open File",
                    accelerator: "CommandOrControl+O",
                    click(item: any, focusedWindow: any) {
                        mainProcess.loadDatabaseFile();
                    },
                },
                { type: "separator" },
                {
                    label: "Create New",
                    accelerator: "CommandOrControl+N",
                    click() {
                        mainProcess.newFile();
                    },
                },
                {
                    label: "Save As Copy",
                    //accelerator: "CommandOrControl+S",
                    click(item: any, focusedWindow: any) {
                        if (!focusedWindow) {
                            return dialog.showErrorBox(
                                "Cannot Save or Export",
                                "There is currently no active document to save or export.",
                            );
                        }
                        mainProcess.saveFile();
                    },
                },
                {
                    label: "Close File",
                    accelerator: "CommandOrControl+Q",
                    click(item: any, focusedWindow: any) {
                        mainProcess.closeCurrentFile();
                    },
                },
            ],
        }),
        // { role: 'editMenu' }
        new MenuItem({
            label: "Edit",
            submenu: [
                // {
                //     label: "Undo",
                //     id: "undo",
                //     accelerator: "CommandOrControl+Z",
                //     // role: 'undo',
                //     click(item: any, focusedWindow: any) {
                //         console.log("Undoing");
                //         // if (focusedWindow) focusedWindow.webContents.undo();
                //         mainProcess.executeHistoryAction("undo");
                //     },
                // },
                // {
                //     label: "Redo",
                //     id: "redo",
                //     accelerator: "Shift+CommandOrControl+Z",
                //     // role: 'redo',
                //     click(item: any, focusedWindow: any) {
                //         console.log("Redoing");
                //         // if (focusedWindow) focusedWindow.webContents.undo();
                //         mainProcess.executeHistoryAction("redo");
                //     },
                // },
                { type: "separator" },
                { role: "cut" },
                { role: "copy" },
                { role: "paste" },
                ...(isMacOS
                    ? [
                          { role: "pasteAndMatchStyle" as const },
                          { role: "delete" as const },
                          { role: "selectAll" as const },
                          { type: "separator" as const },
                          {
                              label: "Speech",
                              submenu: [
                                  { role: "startSpeaking" as const },
                                  { role: "stopSpeaking" as const },
                              ],
                          },
                      ]
                    : [
                          { role: "delete" as const },
                          { type: "separator" as const },
                          { role: "selectAll" as const },
                      ]),
            ],
        }),
        // { role: 'viewMenu' }
        new MenuItem({
            label: "View",
            submenu: [
                { role: "reload" },
                { role: "forceReload" },
                { role: "toggleDevTools" },
                { type: "separator" },
                { role: "resetZoom" },
                { role: "zoomIn" },
                { role: "zoomOut" },
                { type: "separator" },
                { role: "togglefullscreen" },
            ],
        }),
        // { role: 'windowMenu' }
        isMacOS
            ? new MenuItem({
                  label: "Window",
                  submenu: [
                      { role: "minimize" },
                      { role: "zoom" },
                      { type: "separator" },
                      { role: "front" },
                      { type: "separator" },
                      { role: "window" },
                  ],
              })
            : new MenuItem({
                  label: "Window",
                  submenu: [
                      { role: "minimize" },
                      { role: "zoom" },
                      { role: "close" },
                  ],
              }),
        new MenuItem({
            role: "help",
            submenu: [
                {
                    label: "Website",
                    click: async () => {
                        await shell.openExternal("https://openmarch.com");
                    },
                },
                {
                    label: "Docs/Guides",
                    click: async () => {
                        await shell.openExternal(
                            "https://openmarch.com/guides",
                        );
                    },
                },
                {
                    label: "Discord",
                    click: async () => {
                        await shell.openExternal(
                            "https://discord.gg/eTsQ98uZzq",
                        );
                    },
                },
                {
                    label: "GitHub",
                    click: async () => {
                        await shell.openExternal(
                            "https://github.com/OpenMarch",
                        );
                    },
                },
            ],
        }),
    ],
);

export const applicationMenu = Menu.buildFromTemplate(template);
