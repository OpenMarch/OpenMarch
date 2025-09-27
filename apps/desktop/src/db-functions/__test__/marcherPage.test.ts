import { describeDbTests, schema, transaction } from "@/test/base";
import { describe, expect } from "vitest";
import { getNextMarcherPage, getPreviousMarcherPage } from "../marcherPage";
import { and, eq } from "drizzle-orm";

describeDbTests("marcherPage", (it) => {
    describe.each([
        {
            direction: "next",
            start_ids: { marcherId: 1, pageId: 0 },
            expected_id: 77,
        },
        {
            direction: "previous",
            start_ids: { marcherId: 1, pageId: 1 },
            expected_id: 1,
        },
        {
            direction: "next",
            start_ids: { marcherId: 2, pageId: 1 },
            expected_id: 153,
        },
    ])(
        "should be able to get $direction marcher page - $start_ids",
        ({ direction, start_ids, expected_id }) => {
            it("get single direct neighbor by marcherId and pageId", async ({
                db,
                marchersAndPages,
            }) => {
                let curMp;
                let nextMp;

                const func =
                    direction === "next"
                        ? getNextMarcherPage
                        : getPreviousMarcherPage;

                await transaction(db, async (tx) => {
                    curMp = await tx.query.marcher_pages.findFirst({
                        where: and(
                            eq(
                                schema.marcher_pages.marcher_id,
                                start_ids.marcherId,
                            ),
                            eq(schema.marcher_pages.page_id, start_ids.pageId),
                        ),
                    });
                    nextMp = await func(tx, {
                        marcherId: start_ids.marcherId,
                        pageId: start_ids.pageId,
                    });
                });
                expect(curMp).toBeTruthy();
                expect(curMp!.marcher_id).toEqual(start_ids.marcherId);
                expect(curMp!.page_id).toBe(start_ids.pageId);

                const expectedPageId =
                    curMp!.page_id + (direction === "next" ? 1 : -1);

                expect(nextMp).toBeTruthy();
                expect(nextMp!.id).toEqual(expected_id);
                expect(nextMp!.marcher_id).toEqual(1);
                // Not a great check because ID doesn't inherently define order
                expect(nextMp!.page_id).toBe(expectedPageId);
            });
        },
    );

    describe.each([
        {
            direction: "next",
            marcherPageId: 1,
            expected_id: 77,
        },
        {
            direction: "previous",
            marcherPageId: 77,
            expected_id: 1,
        },
    ])(
        "should be able to get $direction marcher page - $marcherPageId",
        ({ direction, marcherPageId, expected_id }) => {
            it("get single direct neighbor by marcherPageId", async ({
                db,
                marchersAndPages,
            }) => {
                let curMp;
                let nextMp;

                const func =
                    direction === "next"
                        ? getNextMarcherPage
                        : getPreviousMarcherPage;

                await transaction(db, async (tx) => {
                    curMp = await tx.query.marcher_pages.findFirst({
                        where: eq(schema.marcher_pages.id, marcherPageId),
                    });
                    nextMp = await func(tx, {
                        marcherPageId: marcherPageId,
                    });
                });
                expect(curMp).toBeTruthy();
                expect(curMp!.id).toEqual(marcherPageId);

                const expectedPageId =
                    curMp!.page_id + (direction === "next" ? 1 : -1);

                expect(nextMp).toBeTruthy();
                expect(nextMp!.id).toEqual(expected_id);
                expect(nextMp!.marcher_id).toEqual(1);
                // Not a great check because ID doesn't inherently define order
                expect(nextMp!.page_id).toBe(expectedPageId);
            });
        },
    );
});
