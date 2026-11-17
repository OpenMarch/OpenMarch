import { describe, expect } from "vitest";
import { eq } from "drizzle-orm";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { timelineHistoryTables } from "@/test/timelineMode";
import { getFieldPropertiesInTransaction } from "../fieldEdits";
import { setFieldImage } from "../fieldImage";
import { getCurrentUndoGroup, performUndo } from "../history";
import type { DbConnection } from "../types";

const imageOf = async (db: DbConnection) =>
    (
        await db
            .select({ image: schema.field_properties.image })
            .from(schema.field_properties)
            .where(eq(schema.field_properties.id, 1))
            .get()
    )?.image ?? null;

describeDbTests("fieldImage", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.field_properties,
        ...timelineHistoryTables(),
    ]);

    describe("setFieldImage", () => {
        testWithHistory(
            "imports an image and turns it on as one undo step",
            async ({ db, expectNumberOfChanges }) => {
                const before = await getFieldPropertiesInTransaction({
                    tx: db,
                });
                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);
                await setFieldImage({
                    db,
                    image: new Uint8Array([1, 2, 3]),
                    edits: [
                        {
                            edit: "setFieldSettings",
                            args: {
                                patch: {
                                    showFieldImage: !before.showFieldImage,
                                },
                            },
                        },
                    ],
                });
                expect([...((await imageOf(db)) ?? [])]).toEqual([1, 2, 3]);
                expect(
                    (await getFieldPropertiesInTransaction({ tx: db }))
                        .showFieldImage,
                ).toBe(!before.showFieldImage);
                await expectNumberOfChanges.test(db, 1, databaseState);

                // One undo takes both back
                await performUndo(db);
                expect(await imageOf(db)).toBeNull();
                expect(
                    (await getFieldPropertiesInTransaction({ tx: db }))
                        .showFieldImage,
                ).toBe(before.showFieldImage);
            },
        );

        testWithHistory(
            "removes the image as one undo step",
            async ({ db, expectNumberOfChanges }) => {
                await setFieldImage({ db, image: new Uint8Array([4, 5]) });
                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);
                await setFieldImage({ db, image: null });
                expect(await imageOf(db)).toBeNull();
                await expectNumberOfChanges.test(db, 1, databaseState);
                await performUndo(db);
                expect([...((await imageOf(db)) ?? [])]).toEqual([4, 5]);
            },
        );
    });

    it("writes nothing when a field edit that goes with it is refused", async ({
        db,
    }) => {
        const groupBefore = await getCurrentUndoGroup(db);
        await expect(
            setFieldImage({
                db,
                image: new Uint8Array([9]),
                edits: [
                    {
                        edit: "setFieldSettings",
                        args: { patch: { stepSizeInches: -1 } },
                    },
                ],
            }),
        ).rejects.toThrow();
        expect(await imageOf(db)).toBeNull();
        expect(await getCurrentUndoGroup(db)).toBe(groupBefore);
    });
});
