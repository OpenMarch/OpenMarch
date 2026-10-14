/**
 * The page-era file the main process is asking the person about, before it
 * converts it (ADR 0001 §6). An open that returns `NEEDS_CONVERSION_STATUS`
 * asks; the renderer's `ConvertShowDialog` shows the question over whatever is
 * open and answers with `conversion:confirm` or `conversion:cancel`. Any other
 * open, a new show or a close makes the question stale, so it is forgotten.
 *
 * It imports no Electron module, so tests drive it directly.
 */
import { basename, dirname, resolve } from "path";
import type { PendingConversion } from "../database/convertOnOpenGate";

/** Tells the renderer the question changed: a file to ask about, or null for none. */
export const PENDING_CONVERSION_CHANNEL = "conversion:pending";

/** The question about `filePath`, whose backup would go to `backupPath`. */
export function pendingConversionFor(
    filePath: string,
    backupPath: string,
): PendingConversion {
    return {
        filePath: resolve(filePath),
        fileName: basename(filePath),
        backupPath,
        backupFileName: basename(backupPath),
        folder: dirname(resolve(filePath)),
    };
}

export interface ConversionQuestion {
    /** The file being asked about, or null. */
    current: () => PendingConversion | null;
    /** Asks about `pending`, replacing any earlier question, and tells the renderer. */
    ask: (pending: PendingConversion) => void;
    /** Forgets a stale question (another open, a new show, a close) and tells the renderer. */
    forget: () => void;
    /**
     * The person agreed: returns the file and forgets it, without a notice, since the dialog
     * stays to show the conversion's progress.
     */
    take: () => PendingConversion | null;
}

/** `notify` receives each change of the question. */
export function createConversionQuestion(
    notify: (pending: PendingConversion | null) => void,
): ConversionQuestion {
    let pending: PendingConversion | null = null;
    return {
        current: () => pending,
        ask(next) {
            pending = next;
            notify(next);
        },
        forget() {
            if (pending === null) return;
            pending = null;
            notify(null);
        },
        take() {
            const taken = pending;
            pending = null;
            return taken;
        },
    };
}
