import os from "node:os";
import { ipcMain } from "electron";

export const isMacOS = os.platform() === "darwin";

ipcMain.handle("get-is-macos", () => {
    return { isMacOS };
});
