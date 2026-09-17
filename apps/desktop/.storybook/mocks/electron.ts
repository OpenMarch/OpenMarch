/**
 * The small, safe portion of the preload API required by the currently
 * documented components. Keep the object identity stable so individual stories
 * can override a method, then reset it before the next story renders.
 */
const createElectronMock = (): Partial<Window["electron"]> => ({
    isMacOS: false,
    isCodegen: false,
    isPlaywrightSession: true,
    databaseIsReady: async () => false,
    databaseGetPath: async () => "/Users/example/My Show.dots",
    sqlProxy: async () => ({ rows: [] }),
    openMenu: () => {},
    minimizeWindow: () => {},
    maximizeWindow: () => {},
    closeWindow: () => {},
    openExternal: async () => {},
});

export const electronMock = createElectronMock();

export const resetElectronMock = () => {
    Object.assign(electronMock, createElectronMock());
};
