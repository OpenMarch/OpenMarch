import { autoUpdater } from "electron-updater";

export function getAutoUpdater() {
    return autoUpdater;
}

export function automaticUpdatesAreEnabled(value: unknown): boolean {
    return value !== false;
}

export async function startAutomaticUpdates({
    isPackaged,
    automaticUpdatesEnabled,
    isSnap = false,
}: {
    isPackaged: boolean;
    automaticUpdatesEnabled: boolean;
    isSnap?: boolean;
}) {
    if (!isPackaged || !automaticUpdatesEnabled || isSnap) return;

    const autoUpdater = getAutoUpdater();
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("error", (error) => {
        console.error("Unable to automatically update OpenMarch:", error);
    });
    try {
        await autoUpdater.checkForUpdates();
    } catch (error) {
        console.error("Unable to check for automatic updates:", error);
    }
}
