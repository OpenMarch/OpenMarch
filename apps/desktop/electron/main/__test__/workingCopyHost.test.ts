import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    type RecoverChoice,
    createWorkingCopyHost,
    workingCopySavesEnabled,
} from "../workingCopyHost";
import type { WorkingCopySession } from "../../database/workingCopy/WorkingCopySession";

function readValues(dbPath: string): string[] {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
        return (
            db.prepare("SELECT value FROM notes ORDER BY id").all() as {
                value: string;
            }[]
        ).map((row) => row.value);
    } finally {
        db.close();
    }
}

function edit(session: WorkingCopySession, value: string) {
    const db = new DatabaseSync(session.workingPath);
    db.prepare("INSERT INTO notes (value) VALUES (?)").run(value);
    db.close();
    session.noteActivity();
}

describe("workingCopySavesEnabled", () => {
    it("is on unless turned off, and the env var forces it", () => {
        expect(workingCopySavesEnabled(true, undefined)).toBe(true);
        expect(workingCopySavesEnabled(undefined, undefined)).toBe(true);
        expect(workingCopySavesEnabled(false, undefined)).toBe(false);
        expect(workingCopySavesEnabled(true, "0")).toBe(false);
        expect(workingCopySavesEnabled(false, "1")).toBe(true);
    });
});

describe("createWorkingCopyHost", () => {
    let root: string;
    let showPath: string;
    let workingRoot: string;
    let asked: string[];
    let answer: RecoverChoice;

    const makeHost = (
        extra: Partial<Parameters<typeof createWorkingCopyHost>[0]> = {},
    ) =>
        createWorkingCopyHost({
            sessionOptions: () => ({
                workingRoot,
                debounceMs: 60_000,
                maxWaitMs: 60_000,
                pollMs: 60_000,
            }),
            askRecover: async (entry) => {
                asked.push(entry.manifest.showPath);
                return answer;
            },
            ...extra,
        });

    const openThrough = (host: ReturnType<typeof makeHost>, recover?: any) =>
        host.open(showPath, {
            recover,
            migrate: async () => ({ status: 200 }),
            connect: () => undefined,
        });

    /** Leaves unpublished changes behind, as a quit whose publish failed or a crash would. */
    async function leaveUnpublishedChanges(value: string) {
        const host = makeHost();
        const { session } = await openThrough(host);
        edit(session!, value);
        // Closing without publishing keeps the working copy, as a crash does.
        await session!.close();
    }

    beforeEach(() => {
        root = fs.mkdtempSync(join(tmpdir(), "openmarch-wc-host-"));
        workingRoot = join(root, "working-copies");
        showPath = join(root, "Show.dots");
        const db = new DatabaseSync(showPath);
        db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, value TEXT)");
        db.prepare("INSERT INTO notes (value) VALUES ('first')").run();
        db.close();
        asked = [];
        answer = "recover";
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("publishes and deletes the working copy when the show closes", async () => {
        const host = makeHost();
        const { session } = await openThrough(host);
        edit(session!, "mine");
        let closed = false;

        expect(await host.end("close", () => (closed = true))).toBe(true);

        expect(closed).toBe(true);
        expect(host.current).toBeNull();
        expect(readValues(showPath)).toEqual(["first", "mine"]);
        expect(fs.readdirSync(workingRoot)).toEqual([]);
    });

    /** A host whose publishes run `duringRename` just before each rename, as an edit would. */
    const hostEditingDuringPublish = (duringRename: () => void) =>
        makeHost({
            sessionOptions: () => ({
                workingRoot,
                debounceMs: 60_000,
                maxWaitMs: 60_000,
                pollMs: 60_000,
                renameOptions: {
                    rename: async (from, to) => {
                        duringRename();
                        await fs.promises.rename(from, to);
                    },
                },
            }),
        });

    it("publishes again for edits made while the last publish before closing ran", async () => {
        let session: WorkingCopySession | null = null;
        let typeDuringPublish = false;
        const host = hostEditingDuringPublish(() => {
            if (!typeDuringPublish) return;
            typeDuringPublish = false;
            edit(session!, "typed during the publish");
        });
        ({ session } = await openThrough(host));
        edit(session!, "mine");
        typeDuringPublish = true;

        expect(await host.end("quit", () => undefined)).toBe(true);

        expect(readValues(showPath)).toEqual([
            "first",
            "mine",
            "typed during the publish",
        ]);
        expect(fs.readdirSync(workingRoot)).toEqual([]);
    });

    it("still closes when edits keep coming, and keeps them for recovery", async () => {
        let session: WorkingCopySession | null = null;
        let typed = 0;
        const host = hostEditingDuringPublish(() =>
            edit(session!, `typed ${++typed}`),
        );
        ({ session } = await openThrough(host));
        edit(session!, "mine");

        expect(await host.end("quit", () => undefined)).toBe(true);

        expect(fs.readdirSync(workingRoot)).toHaveLength(1);
        expect(readValues(showPath)).not.toContain(`typed ${typed}`);
    });

    it("finishes an open before a quit or update restart ends it", async () => {
        const host = makeHost();
        let ended: Promise<boolean> | undefined;
        // The quit arrives while the session is starting (its save worker is loading)
        const opening = host.open(showPath, {
            migrate: async () => ({ status: 200 }),
            connect: () => {
                setImmediate(() => {
                    ended = host.end("quit", () => undefined);
                });
            },
        });

        await expect(opening).resolves.toMatchObject({
            result: { status: 200 },
        });
        await new Promise((resolve) => setImmediate(resolve));
        expect(await ended).toBe(true);
        expect(host.current).toBeNull();
        expect(fs.readdirSync(workingRoot)).toEqual([]);
    });

    it("asks before every open of a show with unpublished changes, and recovers them", async () => {
        await leaveUnpublishedChanges("lost?");
        const host = makeHost();
        host.scanAtStartup();
        expect(host.listRecoverable()).toHaveLength(1);

        const entry = await host.checkRecoveryBeforeOpen(showPath);

        expect(asked).toEqual([showPath]);
        expect(entry).not.toBeNull();
        const { session, recovered } = await openThrough(host, entry);
        expect(recovered).toBe(true);
        expect(host.listRecoverable()).toEqual([]);
        await host.end("close", () => undefined);
        expect(readValues(showPath)).toEqual(["first", "lost?"]);
        expect(session?.hasUnsavedChanges).toBe(false);
    });

    it("discards the changes when asked, and opens the show as it is", async () => {
        await leaveUnpublishedChanges("unwanted");
        const host = makeHost();
        host.scanAtStartup();
        answer = "discard";

        expect(await host.checkRecoveryBeforeOpen(showPath)).toBeNull();

        expect(host.listRecoverable()).toEqual([]);
        expect(fs.readdirSync(workingRoot)).toEqual([]);
        expect(readValues(showPath)).toEqual(["first"]);
    });

    it("opens nothing when the person cancels, and keeps the changes", async () => {
        await leaveUnpublishedChanges("kept");
        const host = makeHost();
        host.scanAtStartup();
        answer = "cancel";

        expect(await host.checkRecoveryBeforeOpen(showPath)).toBe("cancel");
        expect(host.listRecoverable()).toHaveLength(1);
    });

    it("doesn't ask about other shows", async () => {
        await leaveUnpublishedChanges("x");
        const host = makeHost();
        host.scanAtStartup();

        expect(
            await host.checkRecoveryBeforeOpen(join(root, "Other.dots")),
        ).toBeNull();
        expect(asked).toEqual([]);
    });

    it("lists a show whose last publish failed at close for recovery later", async () => {
        const host = makeHost();
        const { session } = await openThrough(host);
        edit(session!, "mine");
        fs.rmSync(showPath);

        expect(await host.end("quit", () => undefined)).toBe(true);

        expect(host.listRecoverable().map((s) => s.showExists)).toEqual([
            false,
        ]);
    });

    it("can be cancelled from the unpublished-changes question", async () => {
        const host = makeHost({ askUnpublished: async () => "cancel" });
        const { session } = await openThrough(host);
        edit(session!, "mine");
        fs.rmSync(showPath);

        expect(await host.end("quit", () => undefined)).toBe(false);
        expect(host.current).toBe(session);
        await session!.close({ discard: true });
    });

    it("offers the changes a close just left when the same show is opened again", async () => {
        const host = makeHost({ askUnpublished: async () => "close" });
        const { session } = await openThrough(host);
        edit(session!, "mine");
        // The publish can't happen (the show is gone), and the person closes anyway.
        fs.renameSync(showPath, `${showPath}.away`);
        let closed = false;

        const entry = await host.prepareOpen(showPath, {
            closeConnections: () => (closed = true),
        });

        expect(closed).toBe(true);
        expect(host.current).toBeNull();
        expect(asked).toEqual([showPath]);
        expect(entry).not.toBeNull();
        expect(entry).not.toBe("cancel");
    });

    it("keeps the open show open for a file that only asks a question first", async () => {
        const host = makeHost();
        const { session } = await openThrough(host);
        edit(session!, "mine");

        const entry = await host.prepareOpen(join(root, "PageEra.dots"), {
            closeConnections: () => undefined,
            keepCurrentOpen: true,
        });

        expect(entry).toBeNull();
        expect(host.current).toBe(session);
        await host.end("close", () => undefined);
        expect(readValues(showPath)).toEqual(["first", "mine"]);
    });

    it("throws away a new working copy whose open is refused", async () => {
        const host = makeHost();
        const { session, result } = await host.open(showPath, {
            migrate: async () => ({ status: 426 }),
            connect: () => undefined,
        });

        expect(result.status).toBe(426);
        expect(session).toBeNull();
        expect(host.current).toBeNull();
        expect(fs.readdirSync(workingRoot)).toEqual([]);
    });
});
