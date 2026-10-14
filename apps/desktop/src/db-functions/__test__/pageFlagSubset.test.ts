import { afterEach, describe, expect, test } from "vitest";
import { asc } from "drizzle-orm";
import { generatePageNames } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import {
    startTimelineResolver,
    stopTimelineResolver,
} from "@/timeline/timelineStore";
import { updatePages } from "../page";
import { addPageFlag, newPageNames } from "../pageFlags";

/**
 * Subset pages from timeline mode (ui.md UI-9 **+**, Add subset page, and the page box's Subset
 * toggle), on a converted `marchersAndPages` show: pages 0 to 6, flags at 9, 17, …, 49.
 */

keepFixturesInPageMode("its tests convert the show themselves");

afterEach(() => stopTimelineResolver());

const setUp = async (db: DbConnection) => {
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
};

/** `[id, name]` of every page in show order, named the way the app names them */
const names = async (db: DbConnection) => {
    const pages = await db
        .select()
        .from(schema.pages)
        .orderBy(asc(schema.pages.start_beat))
        .all();
    const named = generatePageNames(
        pages.map((p) => p.is_subset === 1),
        0,
    );
    return pages.map((p, i) => [p.id, named[i]]);
};

const subsetOf = async (db: DbConnection, id: number) =>
    (await db.select().from(schema.pages).all()).find((p) => p.id === id)!
        .is_subset === 1;

describeDbTests("subset pages in timeline mode", (it) => {
    it("Add subset page splits a page: the new page is lettered and no later page renumbers", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const before = await names(db);

        const added = await addPageFlag({ db, beat: 13, subset: true });

        expect(added.page.is_subset).toBe(true);
        const after = await names(db);
        expect(after.map(([, name]) => name)).toEqual([
            "0",
            "1",
            "1A",
            "2",
            "3",
            "4",
            "5",
            "6",
        ]);
        // Every page that was there keeps its name
        for (const [id, name] of before)
            expect(after.find(([i]) => i === id)![1]).toBe(name);
    });

    it("Add subset page past the last flag appends a lettered page", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        await addPageFlag({ db, beat: 60, subset: true });
        expect((await names(db)).map(([, name]) => name)).toEqual([
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "6A",
        ]);
    });

    it("a plain add still renumbers later pages", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        await addPageFlag({ db, beat: 13 });
        expect((await names(db)).map(([, name]) => name)).toEqual([
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
        ]);
    });
});

describeDbTests("the Subset toggle on a page in timeline mode", (it) => {
    it("flips the page and its name, and back", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);

        await updatePages({ db, modifiedPages: [{ id: 3, is_subset: true }] });
        expect(await subsetOf(db, 3)).toBe(true);
        expect((await names(db)).map(([, name]) => name)).toEqual([
            "0",
            "1",
            "2",
            "2A",
            "3",
            "4",
            "5",
        ]);

        await updatePages({ db, modifiedPages: [{ id: 3, is_subset: false }] });
        expect(await subsetOf(db, 3)).toBe(false);
    });

    it("can't make the first page a subset", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        // Home is filtered out (as page mode does), so nothing is written and the edit is refused
        await updatePages({
            db,
            modifiedPages: [{ id: 0, is_subset: true }],
        }).catch(() => undefined);
        expect(await subsetOf(db, 0)).toBe(false);
    });
});

describeDbTests("subset pages undo", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.pages,
        schema.utility,
        schema.timelines,
    ]);

    testWithHistory(
        "Add subset page and the toggle are one undoable edit each",
        async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
            await setUp(db);
            const state = await expectNumberOfChanges.getDatabaseState(db);
            await addPageFlag({ db, beat: 13, subset: true });
            await updatePages({
                db,
                modifiedPages: [{ id: 3, is_subset: true }],
            });
            await expectNumberOfChanges.test(db, 2, state);
        },
    );
});

describe("newPageNames", () => {
    const pages = [
        { id: 0, isSubset: false },
        { id: 1, isSubset: false },
        { id: 2, isSubset: false },
        { id: 3, isSubset: true },
        { id: 4, isSubset: false },
    ];
    const grid = (id: number) => ({ id, start: 0, end: 1 });

    test("a split names the new page before the split page", () => {
        // Before page 2 ("2"): a plain page takes "2" and pushes the rest on; a subset is "1A"
        expect(
            newPageNames(pages, {
                kind: "split",
                beat: 5,
                page: grid(2),
                last: false,
            }),
        ).toEqual({ page: "2", subset: "1A" });
        // Before the subset "2A": a plain page is "3", and a subset one is "2A" (the old one is "2B")
        expect(
            newPageNames(pages, {
                kind: "split",
                beat: 5,
                page: grid(3),
                last: false,
            }),
        ).toEqual({ page: "3", subset: "2A" });
    });

    test("an append names the new last page", () => {
        expect(
            newPageNames(pages, {
                kind: "append",
                beat: 99,
                lastPage: grid(4),
            }),
        ).toEqual({ page: "4", subset: "3A" });
    });

    test("names start at the file's first page number", () => {
        // A show whose home page is "1": the same split as above is one higher
        expect(
            newPageNames(
                pages,
                { kind: "split", beat: 5, page: grid(2), last: false },
                1,
            ),
        ).toEqual({ page: "3", subset: "2A" });
    });
});
