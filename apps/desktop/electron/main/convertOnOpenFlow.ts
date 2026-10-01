/* eslint-disable no-console */
/**
 * The open flow's convert-on-open step (P9.3): runs `runConvertOnOpen` and
 * turns its outcome into dialogs and a "continue" or "stop" answer. It imports
 * no Electron module, so tests drive it with fake dialogs;
 * `convertOnOpenDialogs.ts` holds the real ones. `openShow.ts` loads this
 * module with a dynamic `import()` only once the gate is on.
 */
import { basename } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
    runConvertOnOpen,
    type ConvertOnOpenHooks,
    type ConvertOnOpenResult,
    type ConvertProgress,
} from "../database/convertOnOpen";

/** What the step shows the person. `convertOnOpenDialogs.ts` implements it with native dialogs. */
export interface ConvertOnOpenDialogs {
    /**
     * The file was converted, then saved by an older release. Resolves `open`
     * to open it as it is, or `stop` to open nothing. Offering the backup, or
     * saying none was found (`backupPath` undefined), is the dialog's job.
     */
    warnOlderRelease(
        fileName: string,
        backupPath: string | undefined,
    ): Promise<"open" | "stop">;
    /**
     * Shows a "preparing your file" state while `work` runs, and passes `work`
     * a function that reports its progress there.
     */
    whilePreparing<T>(
        fileName: string,
        work: (onProgress?: (progress: ConvertProgress) => void) => Promise<T>,
    ): Promise<T>;
    /** The file was converted (doesn't wait for the person). */
    converted(fileName: string, backupPath: string): void;
    backupFailed(fileName: string, message: string): Promise<void>;
    conversionFailed(
        fileName: string,
        error: Error,
        backupPath: string,
    ): Promise<void>;
}

/** What the open does next: open the file, or open nothing (the person was told why). */
export type ConvertOnOpenNext = "continue" | "stop";

/**
 * Runs the convert-on-open step for the file at `filePath`, open on `db` with
 * migrations applied, and tells the person what happened.
 */
export async function convertOnOpenInMain(
    filePath: string,
    db: DatabaseSync,
    dialogs: ConvertOnOpenDialogs,
    {
        env,
        hooks,
        convert,
    }: {
        env?: Record<string, string | undefined>;
        hooks?: ConvertOnOpenHooks;
        /** Backs up and converts the file elsewhere (the worker, P9.8); see `runConvertOnOpen`. */
        convert?: (
            onProgress: (progress: ConvertProgress) => void,
        ) => Promise<ConvertOnOpenResult>;
    } = {},
): Promise<ConvertOnOpenNext> {
    const fileName = basename(filePath);
    const started = Date.now();
    const outcome = await runConvertOnOpen(
        filePath,
        db,
        {
            warnOlderRelease: (backupPath) =>
                dialogs.warnOlderRelease(fileName, backupPath),
            whilePreparing: (work) => dialogs.whilePreparing(fileName, work),
        },
        { env, hooks, convert },
    );
    switch (outcome.kind) {
        case "disabled":
            return "continue";
        case "none":
            if (outcome.reason === "dev-timeline-file")
                console.log(
                    `convert on open: ${filePath} has timeline rows but no conversion marker or backup (dev flag); opened as it is`,
                );
            return "continue";
        case "older-release":
            console.log(
                `convert on open: ${filePath} was converted, then saved at version 7; ${outcome.choice}`,
            );
            return outcome.choice === "open" ? "continue" : "stop";
        case "conversion":
            break;
    }

    switch (outcome.status) {
        case "converted":
            console.log(
                `convert on open: converted ${filePath} in ${Date.now() - started} ms; backup at ${outcome.backupPath}`,
                JSON.stringify(outcome.report ?? null),
            );
            dialogs.converted(fileName, outcome.backupPath);
            return "continue";
        case "already-converted":
            console.log(
                `convert on open: ${filePath} was converted meanwhile; opened as it is, and this open's backup was removed`,
            );
            return "continue";
        case "backup-failed":
            console.error(
                `convert on open: backup of ${filePath} failed (${outcome.backup.code}); not converted`,
            );
            await dialogs.backupFailed(fileName, outcome.backup.message);
            return "stop";
        case "conversion-failed":
            console.error(
                `convert on open: converting ${filePath} failed; rolled back`,
                outcome.error,
            );
            await dialogs.conversionFailed(
                fileName,
                outcome.error,
                outcome.backupPath,
            );
            return "stop";
    }
}
