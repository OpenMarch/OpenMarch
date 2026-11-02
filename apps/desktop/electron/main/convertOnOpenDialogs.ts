/* eslint-disable no-console */
/**
 * The native dialogs of convert on open, and the progress it sends the
 * renderer. Asking before a conversion is the renderer's (`ConvertShowDialog`).
 * The text is in the app language (`./i18n`).
 */
import { BrowserWindow, dialog } from "electron";
import { captureException } from "@sentry/electron/main";
import type { ConvertOnOpenDialogs } from "./convertOnOpenFlow";
import { showConversionProgress, throttleProgress } from "./conversionProgress";
import {
    CONVERSION_STOPPED_CODE,
    conversionWorkersStopped,
} from "./convertWorkerHost";
import { NO_PAGES_TO_CONVERT_MESSAGE } from "../database/convertOnOpenGate";
import { t } from "./i18n";

function messageBox(
    win: BrowserWindow | null,
    options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
    return win && !win.isDestroyed()
        ? dialog.showMessageBox(win, options)
        : dialog.showMessageBox(options);
}

/**
 * Why a conversion failed, for the dialog. The expected failures are translated; anything
 * else is a technical error's own message.
 */
function conversionErrorText(error: Error): string {
    if (error.message === NO_PAGES_TO_CONVERT_MESSAGE)
        return t("convertShow.openFailed.noPages");
    const { code, reason } = error as { code?: unknown; reason?: unknown };
    if (code === CONVERSION_STOPPED_CODE)
        return t("convertShow.openFailed.conversionStopped", {
            reason: String(reason),
        });
    return error.message;
}

/** Native dialogs over `win` (or app-modal when there is no window yet, at startup). */
export function electronConvertOnOpenDialogs(
    win: BrowserWindow | null,
): ConvertOnOpenDialogs {
    return {
        async whilePreparing(work) {
            const target = win && !win.isDestroyed() ? win : undefined;
            try {
                // The worker converts off this thread: the renderer's dialog shows how far it got.
                return await work(
                    throttleProgress((p) => showConversionProgress(target, p)),
                );
            } finally {
                if (target && !target.isDestroyed()) target.setProgressBar(-1);
            }
        },

        async backupFailed(fileName, failure) {
            // The app is quitting and stopped the worker: nothing to tell.
            if (conversionWorkersStopped()) return;
            await messageBox(win, {
                type: "error",
                title: t("convertShow.openFailed.backupTitle"),
                message: t("convertShow.openFailed.backupMessage", {
                    fileName,
                }),
                detail: t("convertShow.openFailed.backupDetail", {
                    error: t(failure.messageKey, failure.messageParams),
                }),
                buttons: [t("convertShow.openFailed.ok")],
            });
        },

        async conversionFailed(fileName, error, backupPath) {
            if (conversionWorkersStopped()) return;
            // A file with no pages to convert is expected, not a bug.
            if (error.message !== NO_PAGES_TO_CONVERT_MESSAGE)
                captureException(error);
            await messageBox(win, {
                type: "error",
                title: t("convertShow.openFailed.convertTitle"),
                message: t("convertShow.openFailed.convertMessage", {
                    fileName,
                }),
                detail: t("convertShow.openFailed.convertDetail", {
                    error: conversionErrorText(error),
                    backupPath,
                }),
                buttons: [t("convertShow.openFailed.ok")],
            });
        },
    };
}
