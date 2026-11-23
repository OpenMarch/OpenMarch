/* eslint-disable no-console */
/**
 * The app's side of working-copy saves (ADR 0018): which show is open through a working copy,
 * the working copies a crash left behind, recovery when such a show opens, and publishing and
 * releasing the open one before a switch, close or quit.
 *
 * It has no Electron import: `electron/main/index.ts` passes in the dialogs and the database
 * open, so tests drive it directly.
 */
import * as fs from "node:fs";
import {
    type RecoverableShow,
    type RecoverableWorkingCopy,
    type SaveOutcome,
    type WorkingCopyOptions,
    WorkingCopySession,
    discardWorkingCopy,
    findRecoverableFor,
    scanWorkingCopies,
} from "../database/workingCopy/WorkingCopySession";

/** The setting for working-copy saves (Settings ▸ General). On unless it is set to false. */
export const WORKING_COPY_SETTING = "workingCopySaves";
/** `1` or `0` forces working-copy saves on or off, whatever the setting says. */
export const WORKING_COPY_ENV = "OPENMARCH_WORKING_COPY";

/**
 * How many more times closing publishes when edits arrived during the last publish. Past that
 * the person is still editing as the show closes; those edits are kept for recovery.
 */
const MAX_EXTRA_FINAL_PUBLISHES = 3;

/** Whether shows open through a working copy: the env var wins over the setting. */
export function workingCopySavesEnabled(
    setting: unknown,
    env: string | undefined = process.env[WORKING_COPY_ENV],
): boolean {
    if (env === "1") return true;
    if (env === "0") return false;
    return setting !== false;
}

/** What the person chose for a show that has unpublished changes from an earlier session. */
export type RecoverChoice = "recover" | "discard" | "cancel";

/** What the person chose when the last publish before a close or quit failed. */
export type UnpublishedChoice = "close" | "cancel";

export interface WorkingCopyHostDeps {
    /** Options for every session (working root, version, status and publish callbacks). */
    sessionOptions: () => WorkingCopyOptions;
    /** Asks about a show with unpublished changes that is being opened. */
    askRecover: (entry: RecoverableWorkingCopy) => Promise<RecoverChoice>;
    /**
     * Asks what to do when the publish before closing failed. Without it, the show closes and
     * its working copy is kept for recovery.
     */
    askUnpublished?: (
        session: WorkingCopySession,
        outcome: Extract<SaveOutcome, { ok: false }>,
    ) => Promise<UnpublishedChoice | "retried">;
    /** Called when the open session changes (null once it's released). */
    onSessionChange?: (session: WorkingCopySession | null) => void;
}

/** How an open through a working copy went, for `setActiveDb` and telemetry. */
export interface WorkingCopyOpen<T> {
    result: T;
    session: WorkingCopySession | null;
    staleTempFiles: number;
    recovered: boolean;
}

export type WorkingCopyHost = ReturnType<typeof createWorkingCopyHost>;

// eslint-disable-next-line max-lines-per-function
export function createWorkingCopyHost(deps: WorkingCopyHostDeps) {
    let current: WorkingCopySession | null = null;
    let recoverable: RecoverableWorkingCopy[] = [];
    let ending: Promise<boolean> | null = null;

    const setCurrent = (session: WorkingCopySession | null) => {
        current = session;
        deps.onSessionChange?.(session);
    };

    const rescan = () => {
        recoverable = scanWorkingCopies(
            deps.sessionOptions().workingRoot,
            new Set(current ? [current.id] : []),
        );
    };

    /**
     * Before any open of `showPath` (startup, Recent Files, the file dialog, a double-click):
     * if it has unpublished changes from an earlier session, asks first. Returns the entry
     * to recover, `null` to open the show as it is, or `"cancel"` to open nothing.
     */
    async function checkRecoveryBeforeOpen(
        showPath: string,
    ): Promise<RecoverableWorkingCopy | null | "cancel"> {
        const entry = findRecoverableFor(recoverable, showPath);
        if (!entry) return null;
        const choice = await deps.askRecover(entry);
        if (choice === "cancel") return "cancel";
        if (choice === "discard") {
            discardWorkingCopy(entry);
            recoverable = recoverable.filter((item) => item.id !== entry.id);
            return null;
        }
        return entry;
    }

    /**
     * Publishes the open show for the last time and releases its working copy. When that
     * publish fails, asks (if it can); returns false if the person cancels. Concurrent calls
     * share one run. `closeConnections` closes the app's connections to the working copy.
     */
    /** The open session's start, while an open is finishing it. */
    let starting: Promise<void> | null = null;

    function end(
        reason: string,
        closeConnections: () => void,
    ): Promise<boolean> {
        if (!current) return Promise.resolve(true);
        ending ??= (async () => {
            // The session may still be starting (an open in progress): ending it now would
            // delete the folder its start is about to open.
            try {
                await starting?.catch(() => undefined);
                const session = current;
                if (!session) return true;
                let outcome = await session.flush(reason);
                // The window stays usable while it publishes, so edits can arrive during a
                // publish that then succeeds: publish again for those, a few times at most.
                for (
                    let again = 0;
                    outcome.ok &&
                    session.hasUnsavedChanges &&
                    again < MAX_EXTRA_FINAL_PUBLISHES;
                    again++
                )
                    outcome = await session.flush(reason);
                if (outcome.ok && session.hasUnsavedChanges)
                    console.warn(
                        "Edits kept coming while closing the show; they're kept for recovery",
                    );
                while (
                    !outcome.ok &&
                    outcome.state !== "closed" &&
                    session.hasUnsavedChanges &&
                    deps.askUnpublished
                ) {
                    const choice = await deps.askUnpublished(session, outcome);
                    if (choice === "cancel") return false;
                    if (choice === "close") break;
                    outcome = await session.flush(reason);
                }
                setCurrent(null);
                closeConnections();
                const { keptForRecovery } = await session.close();
                if (keptForRecovery) rescan();
                return true;
            } finally {
                ending = null;
            }
        })();
        return ending;
    }

    /**
     * Before any open: publishes and releases the open show, then asks about unpublished changes
     * the show being opened has from an earlier session, including any that closing the open
     * show just left (its publish failed and the person closed anyway). With `keepCurrentOpen`
     * (a file that first asks whether to convert it) the open show stays open unless the person
     * recovers. Returns the entry to recover, `null` to open the show as it is, or `"cancel"`.
     */
    async function prepareOpen(
        showPath: string,
        {
            closeConnections,
            keepCurrentOpen = false,
        }: { closeConnections: () => void; keepCurrentOpen?: boolean },
    ): Promise<RecoverableWorkingCopy | null | "cancel"> {
        if (!keepCurrentOpen && !(await end("switch", closeConnections)))
            return "cancel";
        const recover = await checkRecoveryBeforeOpen(showPath);
        if (
            recover &&
            recover !== "cancel" &&
            keepCurrentOpen &&
            !(await end("switch", closeConnections))
        )
            return "cancel";
        return recover;
    }

    return {
        /** The session of the open show, if it is edited through a working copy. */
        get current() {
            return current;
        },

        /**
         * Lists working copies a previous run left. Call at startup, before any show opens:
         * folders without unpublished changes are deleted.
         */
        scanAtStartup(): RecoverableWorkingCopy[] {
            rescan();
            return recoverable;
        },

        listRecoverable(): RecoverableShow[] {
            return recoverable.map((entry) => ({
                id: entry.id,
                showPath: entry.manifest.showPath,
                showExists: fs.existsSync(entry.manifest.showPath),
                lastEditAt: entry.manifest.lastEditAt,
            }));
        },

        findRecoverable(id: string) {
            return recoverable.find((entry) => entry.id === id);
        },

        discard(id: string) {
            const entry = recoverable.find((item) => item.id === id);
            if (!entry) return false;
            discardWorkingCopy(entry);
            recoverable = recoverable.filter((item) => item.id !== id);
            return true;
        },

        checkRecoveryBeforeOpen,

        prepareOpen,

        /**
         * Opens `showPath` through a new working copy, or continues `recover`. `migrate` runs the
         * usual open (version checks, migrations) on the working copy and returns its result;
         * `connect` points the app's connections at the session once that succeeded.
         */
        async open<T extends { status: number }>(
            showPath: string,
            {
                recover,
                migrate,
                connect,
            }: {
                recover?: RecoverableWorkingCopy;
                migrate: (workingPath: string) => Promise<T>;
                connect: (session: WorkingCopySession) => void;
            },
        ): Promise<WorkingCopyOpen<T>> {
            const options = deps.sessionOptions();
            const { session, staleTempFiles } = recover
                ? {
                      session: WorkingCopySession.resume(recover, options),
                      staleTempFiles: 0,
                  }
                : await WorkingCopySession.open(showPath, options);
            let result: T;
            try {
                result = await migrate(session.workingPath);
            } catch (error) {
                // A recovered copy keeps its changes for another try.
                await session.close({ discard: !recover });
                throw error;
            }
            if (result.status !== 200) {
                await session.close({ discard: !recover });
                return {
                    result,
                    session: null,
                    staleTempFiles,
                    recovered: false,
                };
            }
            connect(session);
            setCurrent(session);
            if (recover)
                recoverable = recoverable.filter(
                    (entry) => entry.id !== recover.id,
                );
            // A quit or update restart that arrives now waits for this (see end())
            starting = session.start();
            try {
                await starting;
            } finally {
                starting = null;
            }
            return { result, session, staleTempFiles, recovered: !!recover };
        },

        /**
         * Drops the open show's working copy without publishing it ("Use the version on
         * disk"). `closeConnections` closes the app's connections to it first.
         */
        async discardCurrent(closeConnections: () => void): Promise<void> {
            const session = current;
            if (!session) return;
            setCurrent(null);
            closeConnections();
            await session.close({ discard: true });
        },

        end,
    };
}
