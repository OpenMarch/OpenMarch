import { describe, expect } from "vitest";
import { describeDbTests, schema } from "@/test/base";
import { transactionWithHistory } from "../history";

describeDbTests("transactionWithHistory", (baseIt) => {
    // const it = baseIt.extend<{
    //     db: DbConnection;
    // }>({
    //     db: async ({ db }, use) => {
    //         await db
    //             .insert(schema.history_stats)
    //             .values({
    //                 group_limit: 500,
    //                 cur_undo_group: 0,
    //                 cur_redo_group: 0,
    //             })
    //             .run();
    //         await use(db);
    //     },
    // });

    describe.each([0, 1])("when starting undo group at %s", (initialGroup) => {
        baseIt.only("should increment undo group", async ({ db }) => {
            await db
                .insert(schema.history_stats)
                .values({
                    group_limit: 500,
                    cur_undo_group: initialGroup,
                    cur_redo_group: initialGroup,
                })
                .run();
            const startGroup = await db.query.history_stats.findFirst({
                columns: { cur_undo_group: true },
            });
            expect(startGroup?.cur_undo_group).toBe(initialGroup);
            const testValue = "test result";
            const result = await transactionWithHistory(
                db,
                "test",
                async (tx) => {
                    await tx
                        .insert(schema.history_undo)
                        .values({
                            sequence: 1,
                            history_group: 1,
                            sql: "SELECT 1",
                        })
                        .run();
                    return testValue;
                },
            );

            expect(result).toBe(testValue);
            const endGroup = await db.query.history_stats.findFirst({
                columns: { cur_undo_group: true },
            });
            expect(endGroup?.cur_undo_group).toBe(
                initialGroup === 0 ? initialGroup + 2 : initialGroup + 1,
            );
        });
    });
});
