import { expect } from "vitest";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { timelineHistoryTables } from "@/test/timelineMode";
import {
    applyFieldEdit,
    readFieldSnapshot,
    restoreFieldSnapshot,
} from "../fieldEdits";
import { setFieldImage } from "../fieldImage";
import { getCurrentUndoGroup, performUndo } from "../history";

// The Field panel's X (#824): the field goes back as it was when the panel opened, image too,
// as one undo step that undo takes back
describeDbTests("fieldSnapshot", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.field_properties,
        ...timelineHistoryTables(),
    ]);

    testWithHistory(
        "puts back the lines and the image as one undo step, and undo brings the changes back",
        async ({ db }) => {
            const snapshot = await readFieldSnapshot(db);
            await applyFieldEdit({
                db,
                edit: {
                    edit: "addCheckpoint",
                    args: { axis: "x", steps: 4, mirror: true },
                },
            });
            await setFieldImage({ db, image: new Uint8Array([1, 2, 3]) });
            const changed = await readFieldSnapshot(db);
            expect(changed.json).not.toBe(snapshot.json);

            const groupBefore = await getCurrentUndoGroup(db);
            expect(await restoreFieldSnapshot({ db, snapshot })).toBe(true);
            expect(await getCurrentUndoGroup(db)).toBe(groupBefore + 1);
            const restored = await readFieldSnapshot(db);
            expect(restored.json).toBe(snapshot.json);
            expect(restored.image).toEqual(snapshot.image);

            await performUndo(db);
            const undone = await readFieldSnapshot(db);
            expect(undone.json).toBe(changed.json);
            expect([...(undone.image ?? [])]).toEqual([1, 2, 3]);
        },
    );

    it("writes nothing, and makes no undo step, when nothing changed", async ({
        db,
    }) => {
        const snapshot = await readFieldSnapshot(db);
        const groupBefore = await getCurrentUndoGroup(db);
        expect(await restoreFieldSnapshot({ db, snapshot })).toBe(false);
        expect(await getCurrentUndoGroup(db)).toBe(groupBefore);
    });
});
