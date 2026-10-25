import { describe, expect } from "vitest";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    getLatestUndoEntryToken,
    performRedo,
    performUndo,
    transactionWithHistory,
} from "../history";
import { DbTransaction } from "../types";

describeDbTests("getLatestUndoEntryToken", (it) => {
    const insertBeat = (tx: DbConnection | DbTransaction, duration: number) =>
        tx.insert(schema.beats).values({ duration, position: 1 });
    const edit = (db: DbConnection, duration: number) =>
        transactionWithHistory(db, "test edit", async (tx) => {
            await insertBeat(tx, duration);
        });

    describe("while the entry is the latest", () => {
        it("gives the same token again", async ({ db }) => {
            await edit(db, 0.5);
            const token = await getLatestUndoEntryToken(db);
            expect(token).not.toBeNull();
            expect(await getLatestUndoEntryToken(db)).toBe(token);
        });
    });

    it("changes after another edit", async ({ db }) => {
        await edit(db, 0.5);
        const token = await getLatestUndoEntryToken(db);
        await edit(db, 0.75);
        expect(await getLatestUndoEntryToken(db)).not.toBe(token);
    });

    it("changes once the entry has been undone", async ({ db }) => {
        await edit(db, 0.5);
        await edit(db, 0.75);
        const token = await getLatestUndoEntryToken(db);
        await performUndo(db);
        expect(await getLatestUndoEntryToken(db)).not.toBe(token);
    });

    it("is the same again after an undo and a redo of that entry", async ({
        db,
    }) => {
        await edit(db, 0.5);
        await edit(db, 0.75);
        const token = await getLatestUndoEntryToken(db);
        await performUndo(db);
        expect(await getLatestUndoEntryToken(db)).not.toBe(token);
        await performRedo(db);
        expect(await getLatestUndoEntryToken(db)).toBe(token);
    });

    it("differs after an undo and a new edit, even a redo-like one", async ({
        db,
    }) => {
        await edit(db, 0.5);
        const token = await getLatestUndoEntryToken(db);
        await performUndo(db);
        // The same insert again: same group, sequences and statements
        await edit(db, 0.5);
        expect(await getLatestUndoEntryToken(db)).not.toBe(token);
    });

    it("differs for a new edit that reuses the undone entry's numbers", async ({
        db,
    }) => {
        await edit(db, 0.5);
        const token = await getLatestUndoEntryToken(db);
        await performUndo(db);
        // The next edit gets the same group and sequence numbers back
        await edit(db, 0.9);
        const next = await getLatestUndoEntryToken(db);
        expect(next).not.toBeNull();
        expect(next).not.toBe(token);
    });

    describe("onUndoToken (read inside the transaction)", () => {
        const captureEdit = (db: DbConnection, duration: number) => {
            let token: string | null | undefined;
            const done = transactionWithHistory(
                db,
                "test edit",
                async (tx) => {
                    await insertBeat(tx, duration);
                },
                { onUndoToken: (t) => (token = t) },
            );
            return done.then(() => token);
        };

        it("is the token of the entry the transaction made", async ({ db }) => {
            const token = await captureEdit(db, 0.5);
            expect(token).not.toBeNull();
            expect(token).toBe(await getLatestUndoEntryToken(db));
        });

        it("is not fooled by a write queued right behind it", async ({
            db,
        }) => {
            // Started together: the second runs as soon as the first commits
            const [first, second] = await Promise.all([
                captureEdit(db, 0.5),
                captureEdit(db, 0.75),
            ]);
            const latest = await getLatestUndoEntryToken(db);
            expect(second).toBe(latest);
            expect(first).not.toBe(latest);
            expect(first).not.toBe(second);
        });
    });
});
