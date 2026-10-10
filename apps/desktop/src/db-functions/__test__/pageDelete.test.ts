import { describe, expect, test } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import { createResolver, type Resolver } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/timeline/convert/writePageConversion";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performUndo } from "../history";
import { createPages, deletePages, deletePageYank } from "../page";
import { addPageFlag, deletePageFlags } from "../pageFlags";
import {
    deletePageYankWithMoves,
    deletePagesWithMoves,
    pageDeleteWithMovesMessage,
    pageRunsLabel,
} from "../pageDelete";
import { moveMarchersInTarget } from "../timelineMoves";
import { createTagAppearances, createTags } from "../tag";
import { readPageGrid } from "../timelineRipple";

keepFixturesInPageMode(
    "its tests build their own timeline state: a show made in timeline mode, or a converted one",
);

/**
 * Deleting a page in timeline mode (defined coordinates, owner decision 3, 2026-10-08). **Delete
 * page** is the flag delete, which keeps every later page's look; **Delete page and its moves** is
 * the ripple delete, and says which pages changed. Every delete moves a deleted page's tag
 * appearances to the next page.
 *
 * The show is `marchersAndPages`: page 0 plus pages 1 to 6 (ids 1 to 6), 8 counts each, so page N's
 * box is `[8N - 7, 8N + 1)` and its flag is at beat `8N + 1`.
 */

const TABLES = [
    schema.beats,
    schema.pages,
    schema.utility,
    schema.marchers,
    schema.marcher_pages,
    schema.tags,
    schema.tag_appearances,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const setTimelineFlag = async (db: DbConnection) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
};

const clearHistory = async (db: DbConnection) => {
    await db.run(sql`DELETE FROM history_undo`);
    await db.run(sql`DELETE FROM history_redo`);
};

/**
 * A show made in timeline mode: everyone at home on every page, until the test moves someone.
 * The converted rows are cleared, so only the test's own moves are stored.
 */
const madeInTimelineMode = async (db: DbConnection) => {
    await setTimelineFlag(db);
    await convertPagesToTimeline(db);
    for (const table of [
        "timeline_slot_destinations",
        "timeline_assignments",
        "timeline_transitions",
        "timeline_shapes",
        "timelines",
    ])
        await db.run(sql.raw(`DELETE FROM ${table}`));
    await clearHistory(db);
};

/**
 * A show made in page mode, then converted: page 2 is a new set, and pages 3 to 6 are copies of
 * page 2 (the owner's file, after copying pages forward).
 */
const convertedWithCopies = async (db: DbConnection) => {
    await db.run(sql`
        UPDATE marcher_pages SET
            x = (SELECT p2.x FROM marcher_pages p2
                 WHERE p2.marcher_id = marcher_pages.marcher_id AND p2.page_id = 2),
            y = (SELECT p2.y FROM marcher_pages p2
                 WHERE p2.marcher_id = marcher_pages.marcher_id AND p2.page_id = 2)
        WHERE page_id IN (3, 4, 5, 6)`);
    await setTimelineFlag(db);
    await convertPagesToTimeline(db);
    await clearHistory(db);
};

const marcherIds = async (db: DbConnection) =>
    (await db.select({ id: schema.marchers.id }).from(schema.marchers).all())
        .map((m) => m.id)
        .sort((a, b) => a - b);

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

const grid = async (db: DbConnection) =>
    await db.transaction(async (tx) => await readPageGrid(tx));

/** Every marcher's position at each beat, as `[marcher, beat, x, y]`. */
const positionsAt = (resolver: Resolver, beats: readonly number[]) =>
    resolver
        .marcherIds()
        .flatMap((id) =>
            beats.map((beat) => [id, beat, ...resolver.positionAt(id, beat)]),
        );

/** Every remaining page's flag beat (its end), home excluded. */
const flags = async (db: DbConnection) =>
    (await grid(db)).pages.filter((p) => p.id !== 0).map((p) => p.end);

/** The owner's S4: marchers A and B move on page 2; pages 3 and 4 hold where page 2 left them. */
const S4 = async (db: DbConnection) => {
    await madeInTimelineMode(db);
    const [a, b] = await marcherIds(db);
    await moveMarchersInTarget({
        db,
        target: { kind: "range", start: 9, end: 17 },
        moves: [
            { marcherId: a!, x: 300, y: 200 },
            { marcherId: b!, x: 320, y: 220 },
        ],
    });
    await clearHistory(db);
    return { a: a!, b: b! };
};

describe("pageRunsLabel and the toast", () => {
    const page = (name: string, order: number, renamed = false) => ({
        id: order,
        name,
        order,
        renamed,
    });

    test("runs of pages next to each other", () => {
        expect(pageRunsLabel([page("3", 3), page("4", 4), page("5", 5)])).toBe(
            "3–5",
        );
        expect(
            pageRunsLabel([
                page("2", 2),
                page("4", 4),
                page("4A", 5),
                page("5", 6),
            ]),
        ).toBe("2, 4–5");
        expect(pageRunsLabel([page("1", 1)])).toBe("1");
    });

    test("says where the counts went and which pages changed, by their old numbers", () => {
        expect(
            pageDeleteWithMovesMessage({
                deletedNames: ["2"],
                grownPages: [{ ...page("1", 1), counts: 32 }],
                changedPages: [page("3", 3, true), page("4", 4, true)],
            }),
        ).toBe(
            "Deleted Page 2 · Page 1 is now 32 counts · old Pages 3–4 changed",
        );
        expect(
            pageDeleteWithMovesMessage({
                deletedNames: ["3"],
                grownPages: [],
                changedPages: [page("2", 2), page("4", 4, true)],
            }),
        ).toBe("Deleted Page 3 · Page 2 and old Page 4 changed");
        expect(
            pageDeleteWithMovesMessage({
                deletedNames: ["3"],
                grownPages: [{ ...page("2", 2), counts: 16 }],
                changedPages: [],
            }),
        ).toBe(
            "Deleted Page 3 · Page 2 is now 16 counts · No other page changed",
        );
        // After home, the next page takes the box and is renumbered
        expect(
            pageDeleteWithMovesMessage({
                deletedNames: ["1"],
                grownPages: [{ ...page("2", 2, true), counts: 16 }],
                changedPages: [],
            }),
        ).toBe(
            "Deleted Page 1 · old Page 2 is now 16 counts · No other page changed",
        );
        expect(
            pageDeleteWithMovesMessage({
                deletedNames: ["2", "4"],
                grownPages: [],
                changedPages: [],
            }),
        ).toBe("Deleted Pages 2, 4 · No other page changed");
    });
});

describeDbTests("deleting a page in timeline mode", (it) => {
    describe("Delete page (the flag delete) keeps every later page's look", () => {
        it("owner S4: deleting page 2 keeps its move's look on pages 3 and 4, and every beat", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await S4(db);
            const before = await resolverOf(db);
            expect(before.positionAt(a, 25)).toEqual([300, 200]);
            const beats = Array.from({ length: 97 * 4 }, (_, q) => q / 4);
            const all = positionsAt(before, beats);

            await deletePageFlags({ db, pageIds: new Set([2]) });

            const after = await resolverOf(db);
            const remaining = await flags(db);
            expect(remaining).toEqual([9, 25, 33, 41, 49]);
            expect(positionsAt(after, remaining)).toEqual(
                positionsAt(before, remaining),
            );
            expect(positionsAt(after, beats)).toEqual(all);
            expect(after.positionAt(a, 25)).toEqual([300, 200]);
        });

        it("a converted show with copied pages: every later flag keeps its look", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertedWithCopies(db);
            const before = await resolverOf(db);
            await deletePageFlags({ db, pageIds: new Set([2]) });
            const after = await resolverOf(db);
            const remaining = await flags(db);
            expect(positionsAt(after, remaining)).toEqual(
                positionsAt(before, remaining),
            );
        });
    });

    describe("Delete page and its moves", () => {
        it("owner S4: page 2's move goes, and the toast names every page whose flag changed", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await S4(db);
            const homeA = (await resolverOf(db)).positionAt(a, 0);

            const result = await deletePagesWithMoves({
                db,
                pageIds: new Set([2]),
            });

            expect(result.deleted.map((p) => p.id)).toEqual([2]);
            expect(result.deletedNames).toEqual(["2"]);
            // Page 1 now ends at page 2's old flag but still shows its own set; pages 3 to 6 (now 2
            // to 5) held page 2's set. Named as before the delete.
            expect(
                result.changedPages.map((p) => [p.id, p.name, p.renamed]),
            ).toEqual([
                [3, "3", true],
                [4, "4", true],
                [5, "5", true],
                [6, "6", true],
            ]);
            // Page 1 took page 2's 8 counts
            expect(result.grownPages).toEqual([
                { id: 1, name: "1", order: 1, renamed: false, counts: 16 },
            ]);
            expect(pageDeleteWithMovesMessage(result)).toBe(
                "Deleted Page 2 · Page 1 is now 16 counts · old Pages 3–6 changed",
            );
            const after = await resolverOf(db);
            expect(after.positionAt(a, 25)).toEqual(homeA);
            expect(after.positionAt(b, 49)).toEqual(after.positionAt(b, 0));
        });

        it("a page no one moved on: nothing changes, and the toast says so", async ({
            db,
            marchersAndPages: _,
        }) => {
            await S4(db);
            const result = await deletePagesWithMoves({
                db,
                pageIds: new Set([4]),
            });
            expect(result.changedPages).toEqual([]);
            expect(pageDeleteWithMovesMessage(result)).toBe(
                "Deleted Page 4 · Page 3 is now 16 counts · No other page changed",
            );
        });

        it("a converted show with copied pages: reports exactly the flags that look different", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertedWithCopies(db);
            const before = await resolverOf(db);
            const endBefore = new Map(
                (await grid(db)).pages.map((p) => [p.id, p.end]),
            );
            const result = await deletePagesWithMoves({
                db,
                pageIds: new Set([2]),
            });
            const after = await resolverOf(db);
            // Each page left is compared with its own flag before the delete, which may be at
            // another beat now, so only marcher and position are compared
            const look = (resolver: Resolver, beat: number) =>
                JSON.stringify(
                    positionsAt(resolver, [beat]).map(([id, , x, y]) => [
                        id,
                        x,
                        y,
                    ]),
                );
            const expected = (await grid(db)).pages
                .filter((p) => p.id !== 0)
                .filter(
                    (p) =>
                        look(before, endBefore.get(p.id)!) !==
                        look(after, p.end),
                )
                .map((p) => p.id);
            expect(result.changedPages.map((p) => p.id)).toEqual(expected);
        });

        it("yank: later pages move back, and each is compared with its own flag before", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await S4(db);
            const result = await deletePageYankWithMoves({ db, pageId: 3 });
            // Page 3 held page 2's set; pages 4 to 6 still do, a page earlier
            expect(result.deletedNames).toEqual(["3"]);
            expect(result.changedPages).toEqual([]);
            // Nobody took its box: later pages moved back instead
            expect(result.grownPages).toEqual([]);
            expect(pageDeleteWithMovesMessage(result)).toBe(
                "Deleted Page 3 · No other page changed",
            );
            expect((await resolverOf(db)).positionAt(a, 25)).toEqual([
                300, 200,
            ]);
        });

        it("page 1, right after home: the next page takes its box, named by its old number", async ({
            db,
            marchersAndPages: _,
        }) => {
            await S4(db);
            const result = await deletePagesWithMoves({
                db,
                pageIds: new Set([1]),
            });
            expect(result.deletedNames).toEqual(["1"]);
            expect(result.grownPages).toEqual([
                { id: 2, name: "2", order: 2, renamed: true, counts: 16 },
            ]);
            expect(pageDeleteWithMovesMessage(result)).toMatch(
                /^Deleted Page 1 · old Page 2 is now 16 counts · /,
            );
        });

        it("Undo puts the page, its move and every later page's look back in one step", async ({
            db,
            marchersAndPages: _,
        }) => {
            await S4(db);
            const before = await snapshot(db);
            const look = positionsAt(await resolverOf(db), await flags(db));
            await deletePagesWithMoves({ db, pageIds: new Set([2]) });
            const undo = await performUndo(db);
            expect(undo.success, undo.error?.message).toBe(true);
            expect(await snapshot(db)).toEqual(before);
            expect(positionsAt(await resolverOf(db), await flags(db))).toEqual(
                look,
            );
        });

        it("page mode: deletes as Delete page does, and reports no look", async ({
            db,
            marchersAndPages: _,
        }) => {
            const result = await deletePagesWithMoves({
                db,
                pageIds: new Set([2]),
            });
            expect(result.deleted.map((p) => p.id)).toEqual([2]);
            expect(result.changedPages).toEqual([]);
            // The counts still went somewhere
            expect(result.grownPages.map((p) => [p.name, p.counts])).toEqual([
                ["1", 16],
            ]);
            expect((await grid(db)).pages.map((p) => p.id)).toEqual([
                0, 1, 3, 4, 5, 6,
            ]);
        });

        it("home is skipped: deleting only home writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await S4(db);
            const before = await snapshot(db);
            const result = await deletePagesWithMoves({
                db,
                pageIds: new Set([0]),
            });
            expect(result.deleted).toEqual([]);
            expect(await snapshot(db)).toEqual(before);
        });
    });
});

/**
 * A converted show after a flag delete: one page's box now holds the moves of the pages merged
 * into it, which no longer start at the box's start. Deleting the merged page with its moves takes
 * every page move ending at its flag or inside its box (wp3 found it refused with E-A3).
 */
describeDbTests("deleting a page with its moves after a flag delete", (it) => {
    const converted = async (db: DbConnection) => {
        await setTimelineFlag(db);
        await convertPagesToTimeline(db);
        await clearHistory(db);
    };

    /** Marcher `id`'s rows at `layer`, as `[start, end)`, in order. */
    const rowsOf = async (db: DbConnection, id: number, layer = 0) =>
        (await db.select().from(schema.timeline_assignments).all())
            .filter((r) => r.marcher_id === id && r.layer === layer)
            .map((r) => [r.start_beat, r.end_beat])
            .sort((a, b) => a[0]! - b[0]!);

    it("the merged page and both moves in its box go; page 1's move runs to its flag", async ({
        db,
        marchersAndPages: _,
    }) => {
        await converted(db);
        const [m] = await marcherIds(db);
        await deletePageFlags({ db, pageIds: new Set([2]) });
        const before = await resolverOf(db);

        const result = await deletePagesWithMoves({
            db,
            pageIds: new Set([3]),
        });

        expect(result.deletedNames).toEqual(["2"]);
        expect(await flags(db)).toEqual([25, 33, 41, 49]);
        expect(await rowsOf(db, m!)).toEqual([
            [1, 25],
            [25, 33],
            [33, 41],
            [41, 49],
        ]);
        const after = await resolverOf(db);
        // Page 1's set now arrives at its flag; later flags are as they were
        expect(after.positionAt(m!, 25)).toEqual(before.positionAt(m!, 9));
        expect(positionsAt(after, [33, 41, 49])).toEqual(
            positionsAt(before, [33, 41, 49]),
        );
    });

    it("two flag deletes, then the page holding three moves goes with them", async ({
        db,
        marchersAndPages: _,
    }) => {
        await converted(db);
        const [m] = await marcherIds(db);
        await deletePageFlags({ db, pageIds: new Set([2]) });
        await deletePageFlags({ db, pageIds: new Set([3]) });
        await deletePagesWithMoves({ db, pageIds: new Set([4]) });
        expect(await flags(db)).toEqual([33, 41, 49]);
        expect(await rowsOf(db, m!)).toEqual([
            [1, 33],
            [33, 41],
            [41, 49],
        ]);
    });

    it("yank: the merged page's moves go and later pages move back with theirs", async ({
        db,
        marchersAndPages: _,
    }) => {
        await converted(db);
        const [m] = await marcherIds(db);
        await deletePageFlags({ db, pageIds: new Set([2]) });
        const before = await resolverOf(db);
        const result = await deletePageYankWithMoves({ db, pageId: 3 });
        expect(await flags(db)).toEqual([9, 17, 25, 33]);
        expect(await rowsOf(db, m!)).toEqual([
            [1, 9],
            [9, 17],
            [17, 25],
            [25, 33],
        ]);
        // Pages 4 to 6 keep their look, a box earlier
        expect(positionsAt(await resolverOf(db), [17, 25, 33])).toEqual(
            positionsAt(before, [33, 41, 49]).map(([id, beat, x, y]) => [
                id,
                (beat as number) - 16,
                x,
                y,
            ]),
        );
        expect(result.changedPages).toEqual([]);
    });

    it("a page added inside the merged box can be deleted with its moves; moves crossing its edges stay", async ({
        db,
        marchersAndPages: _,
    }) => {
        await converted(db);
        const [m] = await marcherIds(db);
        await deletePageFlags({ db, pageIds: new Set([2]) });
        // Page mode's add at beat 13 (a split), then a timeline flag at 21
        const beats = await db
            .select()
            .from(schema.beats)
            .orderBy(schema.beats.position)
            .all();
        await createPages({
            db,
            newPages: [{ start_beat: beats[13]!.id, is_subset: false }],
        });
        const { page: added } = await addPageFlag({ db, beat: 21 });
        expect(
            (await grid(db)).pages.find((p) => p.id === added.id),
        ).toMatchObject({ start: 13, end: 21 });

        await deletePagesWithMoves({ db, pageIds: new Set([added.id]) });
        expect(await rowsOf(db, m!)).toEqual([
            [1, 9],
            [9, 17],
            [17, 25],
            [25, 33],
            [33, 41],
            [41, 49],
        ]);
        // The page before it (page 3, what the split left it) now ends at its flag
        expect((await grid(db)).pages.find((p) => p.id === 3)).toMatchObject({
            start: 9,
            end: 21,
        });
    });

    it("after a drag over the merged box, its page moves go; the drag's move on top stays", async ({
        db,
        marchersAndPages: _,
    }) => {
        await converted(db);
        const [m] = await marcherIds(db);
        await deletePageFlags({ db, pageIds: new Set([2]) });
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 9, end: 25 },
            moves: [{ marcherId: m!, x: 123, y: 456 }],
        });
        expect(await rowsOf(db, m!, 1)).toEqual([[9, 25]]);

        await deletePagesWithMoves({ db, pageIds: new Set([3]) });
        expect(await rowsOf(db, m!)).toEqual([
            [1, 25],
            [25, 33],
            [33, 41],
            [41, 49],
        ]);
        // A move above a page move is a track (not a page move), so it stays
        expect(await rowsOf(db, m!, 1)).toEqual([[9, 25]]);
        expect((await resolverOf(db)).positionAt(m!, 25)).toEqual([123, 456]);
    });

    it("a move crossing the deleted page's flag stays, and the page before's move stops where it starts", async ({
        db,
        marchersAndPages: _,
    }) => {
        await madeInTimelineMode(db);
        const [m] = await marcherIds(db);
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 9 },
            moves: [{ marcherId: m!, x: 100, y: 100 }],
        });
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 13, end: 29 },
            moves: [{ marcherId: m!, x: 200, y: 200 }],
        });
        expect(await rowsOf(db, m!)).toEqual([
            [1, 9],
            [13, 29],
        ]);

        await deletePagesWithMoves({ db, pageIds: new Set([2]) });
        // Page 1 now ends at 17, but the marcher's next move starts at 13, so it takes over there
        expect(await rowsOf(db, m!)).toEqual([
            [1, 13],
            [13, 29],
        ]);
        const after = await resolverOf(db);
        const [hx, hy] = after.positionAt(m!, 0);
        const [x, y] = after.positionAt(m!, 13);
        // Page 1's move still runs to its flag (17): at 13 it is 12 of its 16 beats along
        expect(x).toBeCloseTo(hx + (100 - hx) * 0.75);
        expect(y).toBeCloseTo(hy + (100 - hy) * 0.75);
        expect(after.positionAt(m!, 29)).toEqual([200, 200]);
    });
});

describeDbTests("tag appearances survive a page delete", (it) => {
    const appearances = async (db: DbConnection) =>
        (await db.select().from(schema.tag_appearances).all())
            .map((r) => [r.id, r.tag_id, r.start_page_id, r.fill_color])
            .sort((x, y) => (x[0] as number) - (y[0] as number));

    const withTags = async (
        db: DbConnection,
        rows: { id: number; tag_id: number; start_page_id: number }[],
    ) => {
        await db.insert(schema.tags).values([
            { id: 1, name: "t" },
            { id: 2, name: "u" },
        ]);
        await db
            .insert(schema.tag_appearances)
            .values(rows.map((r) => ({ ...r, fill_color: `c${r.id}` })));
        await clearHistory(db);
    };

    const deletes: [
        string,
        boolean,
        (db: DbConnection, pageId: number) => Promise<unknown>,
    ][] = [
        [
            "Delete page (flag delete)",
            true,
            (db, id) => deletePageFlags({ db, pageIds: new Set([id]) }),
        ],
        [
            "Delete page and its moves",
            true,
            (db, id) => deletePagesWithMoves({ db, pageIds: new Set([id]) }),
        ],
        [
            "yank, timeline mode",
            true,
            (db, id) => deletePageYankWithMoves({ db, pageId: id }),
        ],
        [
            "page mode delete",
            false,
            (db, id) => deletePages({ db, pageIds: new Set([id]) }),
        ],
        [
            "page mode yank",
            false,
            (db, id) => deletePageYank({ db, pageId: id }),
        ],
    ];

    for (const [name, timeline, remove] of deletes)
        describe(name, () => {
            const setUp = async (db: DbConnection) => {
                if (timeline) await S4(db);
            };

            it("moves to the next page; one undo puts it back", async ({
                db,
                marchersAndPages: _,
            }) => {
                await setUp(db);
                await withTags(db, [
                    { id: 1, tag_id: 1, start_page_id: 2 },
                    { id: 2, tag_id: 2, start_page_id: 4 },
                ]);
                const before = await snapshot(db);
                await remove(db, 2);
                expect(await appearances(db)).toEqual([
                    [1, 1, 3, "c1"],
                    [2, 2, 4, "c2"],
                ]);
                expect((await performUndo(db)).success).toBe(true);
                expect(await snapshot(db)).toEqual(before);
            });

            it("is dropped where the next page has its own for the same tag", async ({
                db,
                marchersAndPages: _,
            }) => {
                await setUp(db);
                await withTags(db, [
                    { id: 1, tag_id: 1, start_page_id: 2 },
                    { id: 2, tag_id: 1, start_page_id: 3 },
                    { id: 3, tag_id: 2, start_page_id: 2 },
                ]);
                const before = await snapshot(db);
                await remove(db, 2);
                expect(await appearances(db)).toEqual([
                    [2, 1, 3, "c2"],
                    [3, 2, 3, "c3"],
                ]);
                expect((await performUndo(db)).success).toBe(true);
                expect(await snapshot(db)).toEqual(before);
            });

            it("is dropped with the last page", async ({
                db,
                marchersAndPages: _,
            }) => {
                await setUp(db);
                await withTags(db, [
                    { id: 1, tag_id: 1, start_page_id: 6 },
                    { id: 2, tag_id: 1, start_page_id: 5 },
                ]);
                const before = await snapshot(db);
                await remove(db, 6);
                expect(await appearances(db)).toEqual([[2, 1, 5, "c2"]]);
                expect((await performUndo(db)).success).toBe(true);
                expect(await snapshot(db)).toEqual(before);
            });
        });

    it("several pages at once: the one nearest the next page kept is the one that moves", async ({
        db,
        marchersAndPages: _,
    }) => {
        await withTags(db, [
            { id: 1, tag_id: 1, start_page_id: 2 },
            { id: 2, tag_id: 1, start_page_id: 3 },
            { id: 3, tag_id: 2, start_page_id: 2 },
        ]);
        await deletePages({ db, pageIds: new Set([2, 3]) });
        expect(await appearances(db)).toEqual([
            [2, 1, 4, "c2"],
            [3, 2, 4, "c3"],
        ]);
    });

    it("several flags at once, in timeline mode", async ({
        db,
        marchersAndPages: _,
    }) => {
        await S4(db);
        await withTags(db, [
            { id: 1, tag_id: 1, start_page_id: 2 },
            { id: 2, tag_id: 1, start_page_id: 3 },
            { id: 3, tag_id: 2, start_page_id: 2 },
        ]);
        await deletePageFlags({ db, pageIds: new Set([2, 3]) });
        expect(await appearances(db)).toEqual([
            [2, 1, 4, "c2"],
            [3, 2, 4, "c3"],
        ]);
    });

    describe("history", () => {
        const testWithHistory = getTestWithHistory(it, TABLES);

        // Every write here goes through history, so the fixture can undo back to the start
        testWithHistory(
            "each delete, its tag appearances included, is one undoable edit",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                await setTimelineFlag(db);
                await convertPagesToTimeline(db);
                const [a] = await marcherIds(db);
                await moveMarchersInTarget({
                    db,
                    target: { kind: "range", start: 9, end: 17 },
                    moves: [{ marcherId: a!, x: 300, y: 200 }],
                });
                await createTags({
                    db,
                    newTags: [{ name: "t" }, { name: "u" }],
                });
                const [t, u] = (await db.select().from(schema.tags).all()).map(
                    (r) => r.id,
                );
                await createTagAppearances({
                    db,
                    newItems: [
                        { tag_id: t!, start_page_id: 2 },
                        { tag_id: t!, start_page_id: 4 },
                        { tag_id: u!, start_page_id: 5 },
                    ],
                });
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await deletePagesWithMoves({ db, pageIds: new Set([3]) });
                await deletePageFlags({ db, pageIds: new Set([2]) });
                await deletePageYankWithMoves({ db, pageId: 5 });
                await expectNumberOfChanges.test(db, 3, state);
            },
        );

        testWithHistory(
            "a flag delete, then delete page and its moves on the merged page, undo one at a time",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                await setTimelineFlag(db);
                await convertPagesToTimeline(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await deletePageFlags({ db, pageIds: new Set([2]) });
                await deletePagesWithMoves({ db, pageIds: new Set([3]) });
                await deletePageYankWithMoves({ db, pageId: 4 });
                await expectNumberOfChanges.test(db, 3, state);
            },
        );
    });
});
