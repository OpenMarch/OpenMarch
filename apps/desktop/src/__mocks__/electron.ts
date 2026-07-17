import { vi } from "vitest";

// Mock for Electron modules used in tests
export const ipcMain = {
    handle: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
    removeHandler: vi.fn(),
};

export const ipcRenderer = {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
    send: vi.fn(),
    sendSync: vi.fn(),
};

export const app = {
    getPath: vi.fn(),
    getName: vi.fn(),
    getVersion: vi.fn(),
    isReady: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
    exit: vi.fn(),
};

export const BrowserWindow = vi.fn().mockImplementation(() => ({
    loadFile: vi.fn(),
    loadURL: vi.fn(),
    webContents: {
        send: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
    },
    on: vi.fn(),
    off: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    setMenuBarVisibility: vi.fn(),
    setTitle: vi.fn(),
    setSize: vi.fn(),
    setPosition: vi.fn(),
    center: vi.fn(),
    maximize: vi.fn(),
    minimize: vi.fn(),
    restore: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
}));

export const dialog = {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
    showErrorBox: vi.fn(),
};

export const shell = {
    openExternal: vi.fn(),
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
    trashItem: vi.fn(),
    beep: vi.fn(),
};

export const Menu = {
    buildFromTemplate: vi.fn(),
    setApplicationMenu: vi.fn(),
    getApplicationMenu: vi.fn(),
};

export const MenuItem = vi.fn();

export const contextBridge = {
    exposeInMainWorld: vi.fn(),
};

export const webContents = {
    fromId: vi.fn(),
    getAllWebContents: vi.fn(() => []),
};

// Default export for when electron is imported as a module
// eslint-disable-next-line import/no-anonymous-default-export
export default {
    ipcMain,
    ipcRenderer,
    app,
    BrowserWindow,
    dialog,
    shell,
    Menu,
    MenuItem,
    contextBridge,
    webContents,
};
