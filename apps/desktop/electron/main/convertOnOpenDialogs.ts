/* eslint-disable no-console */
/**
 * The native dialogs and the "preparing your file" window for convert on open
 * (P9.3). All of them belong to the main process, so no IPC channel is added.
 * The text is English only, like the other main-process dialogs; translating
 * it is left for when P9.4 makes the step permanent.
 */
import { BrowserWindow, dialog, shell } from "electron";
import { captureException } from "@sentry/electron/main";
import type { ConvertOnOpenDialogs } from "./convertOnOpenFlow";
import {
    showPreparingProgress,
    showPreparingWindow,
    throttleProgress,
    type PreparingWindow,
} from "./preparingWindow";
import { conversionWorkersStopped } from "./convertWorkerHost";

const createPreparingWindow = (parent: BrowserWindow): PreparingWindow =>
    new BrowserWindow({
        parent,
        modal: true,
        width: 440,
        height: 150,
        frame: false,
        resizable: false,
        closable: false,
        skipTaskbar: true,
        show: false,
        webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

function messageBox(
    win: BrowserWindow | null,
    options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
    return win && !win.isDestroyed()
        ? dialog.showMessageBox(win, options)
        : dialog.showMessageBox(options);
}

/** Native dialogs over `win` (or app-modal when there is no window yet, at startup). */
export function electronConvertOnOpenDialogs(
    win: BrowserWindow | null,
): ConvertOnOpenDialogs {
    return {
        async whilePreparing(fileName, work) {
            // Without a main window (a file opened at startup) nothing is on screen yet, and a
            // lone extra window would quit the app on Windows and Linux when it closes.
            const parent = win && !win.isDestroyed() ? win : undefined;
            const preparing = parent
                ? await showPreparingWindow(
                      parent,
                      fileName,
                      createPreparingWindow,
                  )
                : undefined;
            try {
                // The worker converts off this thread (P9.8): show how far it has got.
                return await work(
                    throttleProgress((p) =>
                        showPreparingProgress(preparing, parent, p),
                    ),
                );
            } finally {
                if (preparing && !preparing.isDestroyed()) preparing.destroy();
                if (parent && !parent.isDestroyed()) parent.setProgressBar(-1);
            }
        },

        async warnOlderRelease(fileName, backupPath) {
            const buttons = backupPath
                ? ["Open Without Converting", "Show Backup", "Cancel"]
                : ["Open Without Converting", "Cancel"];
            const cancelId = buttons.length - 1;
            const { response } = await messageBox(win, {
                type: "warning",
                title: "Saved by an older version",
                message: `"${fileName}" was saved by an older version of OpenMarch after it was converted to timelines.`,
                detail:
                    "Changes made in the older version are not in its timelines. It won't be converted again." +
                    (backupPath
                        ? `\n\nA backup from before the conversion is at:\n${backupPath}`
                        : "\n\nNo backup from before the conversion was found next to it."),
                buttons,
                defaultId: cancelId,
                cancelId,
                noLink: true,
            });
            if (response === 0) return "open";
            if (backupPath && response === 1)
                shell.showItemInFolder(backupPath);
            return "stop";
        },

        converted(fileName, backupPath) {
            void messageBox(win, {
                type: "info",
                title: "Converted to timelines",
                message: `"${fileName}" now uses timelines.`,
                detail: `A copy from before the conversion was saved at:\n${backupPath}`,
                buttons: ["OK"],
            });
        },

        async backupFailed(fileName, message) {
            // The app is quitting and stopped the worker: nothing to tell.
            if (conversionWorkersStopped()) return;
            await messageBox(win, {
                type: "error",
                title: "Couldn't back up your file",
                message: `"${fileName}" wasn't opened, because it couldn't be backed up before converting it to timelines.`,
                detail: `${message}\n\nYour file was not changed.`,
                buttons: ["OK"],
            });
        },

        async conversionFailed(fileName, error, backupPath) {
            if (conversionWorkersStopped()) return;
            captureException(error);
            await messageBox(win, {
                type: "error",
                title: "Couldn't convert your file",
                message: `"${fileName}" wasn't opened, because converting it to timelines failed.`,
                detail: `${error.message}\n\nNothing in your file was changed. A backup is at:\n${backupPath}`,
                buttons: ["OK"],
            });
        },
    };
}
