/* eslint-disable no-console */
/**
 * The open flow's convert-on-open step: runs `runConvertOnOpen` and turns its
 * outcome into dialogs and a "continue", "stop" or "ask" answer. It imports no
 * Electron module, so tests drive it with fake dialogs;
 * `convertOnOpenDialogs.ts` holds the real ones. Asking the person before a
 * conversion is the renderer's (`ConvertShowDialog`): this step only reports
 * that it must ask.
 */
import { basename } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
    runConvertOnOpen,
    type ConvertOnOpenHooks,
    type ConvertOnOpenResult,
    type ConvertProgress,
    type ConvertRequest,
} from "../database/convertOnOpen";

/** What the step shows the person. `convertOnOpenDialogs.ts` implements it. */
export interface ConvertOnOpenDialogs {
    /**
     * Runs `work` while the renderer shows the conversion's progress, and
     * passes `work` a function that reports it there.
     */
    whilePreparing<T>(
        work: (onProgress?: (progress: ConvertProgress) => void) => Promise<T>,
    ): Promise<T>;
    backupFailed(fileName: string, message: string): Promise<void>;
    conversionFailed(
        fileName: string,
        error: Error,
        backupPath: string,
    ): Promise<void>;
}

/**
 * What the open does next: open the file, open nothing (the person was told
 * why), or open nothing until the person agrees to convert the file, whose
 * backup would go to `backupPath`.
 */
export type ConvertOnOpenNext =
    | { next: "continue" }
    | { next: "stop" }
    | { next: "ask"; backupPath: string };

/**
 * Runs the convert-on-open step for the file at `filePath`, open on `db`
 * before its migrations, and tells the person what happened.
 */
export async function convertOnOpenInMain(
    filePath: string,
    db: DatabaseSync,
    dialogs: ConvertOnOpenDialogs,
    {
        confirmed,
        backupPath,
        migrationsFolder,
        hooks,
        convert,
    }: {
        /** The person agreed to convert this file. */
        confirmed: boolean;
        /** The backup path the person was shown when they agreed. */
        backupPath?: string;
        migrationsFolder: string;
        hooks?: ConvertOnOpenHooks;
        /** Backs up and converts the file elsewhere (the worker); see `runConvertOnOpen`. */
        convert?: (
            onProgress: (progress: ConvertProgress) => void,
            request: ConvertRequest,
        ) => Promise<ConvertOnOpenResult>;
    },
): Promise<ConvertOnOpenNext> {
    const fileName = basename(filePath);
    const started = Date.now();
    const outcome = await runConvertOnOpen(
        filePath,
        db,
        { whilePreparing: (work) => dialogs.whilePreparing(work) },
        { confirmed, backupPath, migrationsFolder, hooks, convert },
    );
    switch (outcome.kind) {
        case "none":
            return { next: "continue" };
        case "needs-confirmation":
            return { next: "ask", backupPath: outcome.backupPath };
        case "conversion":
            break;
    }

    switch (outcome.status) {
        case "converted":
            console.log(
                `convert on open: converted ${filePath} in ${Date.now() - started} ms; backup at ${outcome.backupPath}`,
                JSON.stringify(outcome.report ?? null),
            );
            return { next: "continue" };
        case "already-converted":
            console.log(
                `convert on open: ${filePath} was converted meanwhile; opened as it is, and this open's backup was removed`,
            );
            return { next: "continue" };
        case "backup-failed":
            console.error(
                `convert on open: backup of ${filePath} failed (${outcome.backup.code}); not converted`,
            );
            await dialogs.backupFailed(fileName, outcome.backup.message);
            return { next: "stop" };
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
            return { next: "stop" };
    }
}
