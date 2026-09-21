import electronUpdater from "electron-updater";

export function getAutoUpdater() {
    // Using destructuring to access autoUpdater due to the CommonJS module of 'electron-updater'.
    // It is a workaround for ESM compatibility issues, see https://github.com/electron-userland/electron-builder/issues/7976.
    const { autoUpdater } = electronUpdater;
    return autoUpdater;
}

export function automaticUpdatesAreEnabled(value: unknown): boolean {
    return value !== false;
}

/**
 * Arm or disarm the updater for the rest of this session.
 *
 * Turning the setting off has to clear `autoInstallOnAppQuit`: an update may already be
 * downloaded and staged, and would otherwise still install on the next quit even though
 * the user just opted out.
 */
export function applyAutomaticUpdatesSetting(enabled: boolean) {
    const autoUpdater = getAutoUpdater();
    autoUpdater.autoDownload = enabled;
    autoUpdater.autoInstallOnAppQuit = enabled;
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
    applyAutomaticUpdatesSetting(true);
    // Re-enabling the setting mid-session starts updates again; don't stack error listeners.
    autoUpdater.removeAllListeners("error");
    autoUpdater.on("error", (error) => {
        console.error("Unable to automatically update OpenMarch:", error);
    });
    try {
        await autoUpdater.checkForUpdates();
    } catch (error) {
        console.error("Unable to check for automatic updates:", error);
    }
}
