import { describe, expect } from "vitest";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import {
    getPagePerformerSettings,
    setPageDotModes,
} from "../pagePerformerSettings";
import { deletePages } from "../page";

describeDbTests("pagePerformerSettings", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.page_performer_settings,
    ]);

    describe("setPageDotModes", () => {
        testWithHistory(
            "sets, changes and clears a page's dot mode",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [, p1, p2] = marchersAndPages.expectedPages;
                await setPageDotModes({
                    db,
                    changes: [
                        { pageId: p2!.id, dotMode: "body" },
                        { pageId: p1!.id, dotMode: "body" },
                    ],
                });
                await setPageDotModes({
                    db,
                    changes: [
                        { pageId: p1!.id, dotMode: "foot" },
                        { pageId: p2!.id, dotMode: null },
                    ],
                });
                expect(await getPagePerformerSettings({ db })).toEqual([
                    { pageId: p1!.id, dotMode: "foot" },
                ]);
                await expectNumberOfChanges.test(db, 2);
            },
        );

        it("rejects an unknown dot mode", async ({ db, marchersAndPages }) => {
            const [, p1] = marchersAndPages.expectedPages;
            await expect(
                setPageDotModes({
                    db,
                    changes: [{ pageId: p1!.id, dotMode: "hip" as "foot" }],
                }),
            ).rejects.toThrow();
            expect(await getPagePerformerSettings({ db })).toEqual([]);
        });
    });

    describe("deleting a page", () => {
        const testWithPages = getTestWithHistory(it, [
            schema.page_performer_settings,
            schema.pages,
        ]);
        testWithPages(
            "deletes its row; undo restores it",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [, , p2] = marchersAndPages.expectedPages;
                await setPageDotModes({
                    db,
                    changes: [{ pageId: p2!.id, dotMode: "body" }],
                });
                await deletePages({ db, pageIds: new Set([p2!.id]) });
                expect(await getPagePerformerSettings({ db })).toEqual([]);
                await expectNumberOfChanges.test(db, 2);
            },
        );
    });
});
