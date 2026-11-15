import { describe, expect } from "vitest";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { timelineHistoryTables } from "@/test/timelineMode";
import {
    applyFieldEdit,
    applyFieldEdits,
    getFieldPropertiesInTransaction,
} from "../fieldEdits";
import { getCurrentUndoGroup, performUndo, performRedo } from "../history";
import { runFieldEdit } from "@/field/edits";

describeDbTests("fieldEdits", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.field_properties,
        ...timelineHistoryTables(),
    ]);

    describe("applyFieldEdit", () => {
        testWithHistory(
            "writes one edit as one undo step, and undo restores the field",
            async ({ db, expectNumberOfChanges }) => {
                const before = await getFieldPropertiesInTransaction({
                    tx: db,
                });
                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);

                const result = await applyFieldEdit({
                    db,
                    edit: {
                        edit: "addCheckpoint",
                        args: { axis: "x", steps: 4, mirror: true },
                    },
                });
                expect(result.diff.ok).toBe(true);
                expect(result.diff.checkpoints.added).toHaveLength(2);
                const after = await getFieldPropertiesInTransaction({
                    tx: db,
                });
                expect(after.xCheckpoints).toHaveLength(
                    before.xCheckpoints.length + 2,
                );
                // What was written is what the dry run said
                expect(JSON.stringify(after)).toBe(
                    JSON.stringify(
                        runFieldEdit(before, {
                            edit: "addCheckpoint",
                            args: { axis: "x", steps: 4, mirror: true },
                        }).next,
                    ),
                );

                await expectNumberOfChanges.test(db, 1, databaseState);

                // One undo takes the whole edit back
                await performUndo(db);
                const undone = await getFieldPropertiesInTransaction({
                    tx: db,
                });
                expect(JSON.stringify(undone)).toBe(JSON.stringify(before));
                await performRedo(db);
            },
        );

        testWithHistory(
            "several edits are still one undo step",
            async ({ db, expectNumberOfChanges }) => {
                const before = await getFieldPropertiesInTransaction({
                    tx: db,
                });
                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);
                const first = before.xCheckpoints[0]!;
                const result = await applyFieldEdits({
                    db,
                    edits: [
                        {
                            edit: "updateCheckpoints",
                            args: {
                                ids: [{ axis: "x", id: first.id }],
                                patch: { name: "Renamed", visible: false },
                            },
                        },
                        {
                            edit: "setFieldSettings",
                            args: { patch: { topLabelsVisible: false } },
                        },
                    ],
                });
                expect(result.diff.ok).toBe(true);
                await expectNumberOfChanges.test(db, 1, databaseState);
            },
        );
    });

    it("a refused or empty edit writes nothing and makes no undo step", async ({
        db,
    }) => {
        const before = await getFieldPropertiesInTransaction({ tx: db });
        const groupBefore = await getCurrentUndoGroup(db);

        const refused = await applyFieldEdit({
            db,
            edit: {
                edit: "removeCheckpoints",
                args: {
                    ids: before.yCheckpoints.map((c) => ({
                        axis: "y" as const,
                        id: c.id,
                    })),
                },
            },
        });
        expect(refused.diff.ok).toBe(false);
        expect(refused.diff.errors[0]!.code).toBe("min-checkpoints");

        const empty = await applyFieldEdit({
            db,
            edit: {
                edit: "setFieldSettings",
                args: { patch: { name: before.name } },
            },
        });
        expect(empty.diff).toMatchObject({ ok: true, empty: true });

        expect(await getCurrentUndoGroup(db)).toBe(groupBefore);
        expect(
            JSON.stringify(await getFieldPropertiesInTransaction({ tx: db })),
        ).toBe(JSON.stringify(before));
    });

    it("a refusal found inside the transaction rolls back and resolves refused (a race)", async ({
        db,
    }) => {
        // Leave 3 Y lines, then delete two of them at once: both dry runs see 3 and pass, the
        // second write finds 2 and is refused
        const start = await getFieldPropertiesInTransaction({ tx: db });
        const extra = start.yCheckpoints.slice(3);
        if (extra.length > 0)
            await applyFieldEdit({
                db,
                edit: {
                    edit: "removeCheckpoints",
                    args: {
                        ids: extra.map((c) => ({
                            axis: "y" as const,
                            id: c.id,
                        })),
                    },
                },
            });
        const before = await getFieldPropertiesInTransaction({ tx: db });
        expect(before.yCheckpoints).toHaveLength(3);
        const groupBefore = await getCurrentUndoGroup(db);
        const remove = (id: number) =>
            applyFieldEdit({
                db,
                edit: {
                    edit: "removeCheckpoints",
                    args: { ids: [{ axis: "y", id }] },
                },
            });
        const [first, second] = await Promise.all([
            remove(before.yCheckpoints[0]!.id),
            remove(before.yCheckpoints[1]!.id),
        ]);
        expect(first.diff.ok).toBe(true);
        expect(second.diff.ok).toBe(false);
        expect(second.diff.errors[0]!.code).toBe("min-checkpoints");

        const after = await getFieldPropertiesInTransaction({ tx: db });
        expect(after.yCheckpoints).toHaveLength(2);
        // One undo step, for the delete that landed
        expect(await getCurrentUndoGroup(db)).toBe(groupBefore + 1);
        await performUndo(db);
        expect(
            JSON.stringify(await getFieldPropertiesInTransaction({ tx: db })),
        ).toBe(JSON.stringify(before));
    });
});
