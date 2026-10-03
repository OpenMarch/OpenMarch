import { afterEach, describe, expect } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/timeline/convert/writePageConversion";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { GOLDEN_FIXTURES } from "@/timeline/fixtures/goldenFixtures";
import { loadTimelineFixture } from "@/timeline/fixtures/loadTimelineFixture";
import { fromDatabasePages } from "@/global/classes/Page";
import { fromDatabaseBeat } from "@/global/classes/Beat";
import { performRedo, performUndo } from "../history";
import { getBeats } from "../beat";
import { getPages } from "../page";
import {
    addPageFlag,
    deletePageFlags,
    pageFlagGrid,
    planPageFlagInsertion,
} from "../pageFlags";
import { readPageGrid } from "../timelineRipple";
import { TimelineWriteError } from "../timelineErrors";

keepFixturesInPageMode(
    "its tests convert the show and set the flag themselves",
);
afterEach(() => stopTimelineResolver());

/** Adversarial tests for P8.13 (UI-9 + and Deleting a flag). Show: see pageFlags.test.ts. */
const TIMELINE_TABLES = [
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];
const TABLES = [
    schema.beats,
    schema.pages,
    schema.utility,
    schema.marchers,
    schema.marcher_pages,
    schema.tags,
    schema.tag_appearances,
    ...TIMELINE_TABLES,
];
const snapshot = async (db: DbConnection, tables = TABLES) => {
    const out: Record<string, unknown[]> = {};
    for (const t of tables)
        out[getTableName(t)] = await db.select().from(t).all();
    return out;
};
const setFlag = async (db: DbConnection, on: boolean) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: on }),
    });
};
const setUp = async (db: DbConnection) => {
    await setFlag(db, true);
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
};
type Row = [number, number, number];
const grid = async (db: DbConnection): Promise<Row[]> =>
    (await db.transaction((tx) => readPageGrid(tx))).pages.map((p) => [
        p.id,
        p.start,
        p.end,
    ]);
const lpc = async (db: DbConnection) =>
    (await db.query.utility.findFirst())!.last_page_counts;
/** Positions at every quarter beat up to `upTo`. */
const positions = async (upTo = 97) => {
    await timelineResolverSettled();
    const r = useTimelineResolverStore.getState().resolver!;
    const out: unknown[] = [];
    for (const id of r.marcherIds())
        for (let q = 0; q <= upTo * 4; q++)
            out.push([id, q / 4, r.positionAt(id, q / 4)]);
    return out;
};
const violations = (db: DbConnection) =>
    db.all(sql`SELECT code FROM timeline_commit_violations`);
const refused = async (write: Promise<unknown>) => {
    const e = await write.then(
        () => null,
        (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(TimelineWriteError);
    expect((e as TimelineWriteError).code).toBe("E-ARGS");
};
/** The renderer's grid (fromDatabasePages → pageFlagGrid) must match readPageGrid. */
const rendererGrid = async (db: DbConnection) => {
    const beats = (await getBeats({ db })).map((b, i) =>
        fromDatabaseBeat(b, i),
    );
    const pages = fromDatabasePages({
        databasePages: await getPages({ db }),
        allMeasures: [],
        allBeats: beats,
        lastPageCounts: await lpc(db),
    });
    return pageFlagGrid(pages, beats.length).pages.map((p) => [
        p.id,
        p.start,
        p.end,
    ]);
};
const ORIGINAL: Row[] = [
    [0, 0, 1],
    [1, 1, 9],
    [2, 9, 17],
    [3, 17, 25],
    [4, 25, 33],
    [5, 33, 41],
    [6, 41, 49],
];
/** The expected grid after + at `beat` on ORIGINAL, with the new page as -1, or null if refused. */
const expectedAfterPlus = (beat: number): Row[] | null => {
    if (!Number.isInteger(beat)) return null;
    if (beat > 49) return beat <= 97 ? [...ORIGINAL, [-1, 49, beat]] : null;
    const i = ORIGINAL.findIndex(
        ([id, s, e]) => id !== 0 && s < beat && beat < e,
    );
    if (i < 0) return null;
    const [id, s, e] = ORIGINAL[i]!;
    return [
        ...ORIGINAL.slice(0, i),
        [-1, s, beat],
        [id, beat, e],
        ...ORIGINAL.slice(i + 1),
    ];
};

describeDbTests("page flags, adversarial (P8.13)", (it) => {
    it("+ at every beat from -2 to 99 (and odd values): grid, counts, motion, undo/redo", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        // Mid-page moves and steals on top of the converted page moves
        await loadTimelineFixture(db, GOLDEN_FIXTURES[1]!.build(), {
            beatOffset: 3,
        });
        await loadTimelineFixture(db, GOLDEN_FIXTURES[2]!.build(), {
            beatOffset: 30,
        });
        await db
            .update(schema.pages)
            .set({ notes: "n6" })
            .where(eq(schema.pages.id, 6));
        const before = await snapshot(db);
        const timelinesBefore = await snapshot(db, TIMELINE_TABLES);
        const motionBefore = await positions();
        expect(await grid(db)).toEqual(ORIGINAL);
        expect(await rendererGrid(db)).toEqual(ORIGINAL);

        const beats = [
            ...Array.from({ length: 102 }, (_, i) => i - 2),
            2.5,
            0.25,
            Number.NaN,
            Infinity,
            -Infinity,
            1e9,
        ];
        for (const beat of beats) {
            const expected = expectedAfterPlus(beat);
            if (!expected) {
                await refused(addPageFlag({ db, beat }));
                expect(await snapshot(db), `beat ${beat}`).toEqual(before);
                continue;
            }
            const added = await addPageFlag({ db, beat });
            const id = added.page.id;
            const after = expected.map(([p, s, e]) => [
                p === -1 ? id : p,
                s,
                e,
            ]);
            expect(await grid(db), `beat ${beat}`).toEqual(after);
            expect(await rendererGrid(db), `renderer, beat ${beat}`).toEqual(
                after,
            );
            const mine = after.find(([p]) => p === id)!;
            expect([added.startBeat, added.endBeat]).toEqual([
                mine[1],
                mine[2],
            ]);
            expect(added.page.is_subset).toBe(false);
            // Last flag stays at 49, or the new page ends at beat when appending
            expect(await lpc(db), `lpc, beat ${beat}`).toBe(
                beat > 49 ? beat - 49 : 49 - after.at(-1)![1],
            );
            const six = await db.query.pages.findFirst({
                where: eq(schema.pages.id, 6),
            });
            expect(six!.notes).toBe("n6");
            expect(await snapshot(db, TIMELINE_TABLES)).toEqual(
                timelinesBefore,
            );
            expect(await positions(), `motion, beat ${beat}`).toEqual(
                motionBefore,
            );
            expect(await violations(db)).toEqual([]);
            const afterRows = await snapshot(db);

            // Exactly one undo step: one undo restores everything
            expect((await performUndo(db)).success).toBe(true);
            expect(await snapshot(db), `undo, beat ${beat}`).toEqual(before);
            expect((await performRedo(db)).success).toBe(true);
            expect(await snapshot(db), `redo, beat ${beat}`).toEqual(afterRows);
            expect((await performUndo(db)).success).toBe(true);
            expect(await snapshot(db)).toEqual(before);
        }
    });

    it("deleting each flag: grid, counts, motion, undo/redo; renderer agrees", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        await loadTimelineFixture(db, GOLDEN_FIXTURES[1]!.build(), {
            beatOffset: 3,
        });
        const before = await snapshot(db);
        const timelinesBefore = await snapshot(db, TIMELINE_TABLES);
        const motionBefore = await positions();
        for (const [id] of ORIGINAL.slice(1)) {
            const i = ORIGINAL.findIndex(([p]) => p === id);
            const expected: Row[] =
                i === ORIGINAL.length - 1
                    ? ORIGINAL.slice(0, i)
                    : [
                          ...ORIGINAL.slice(0, i),
                          [
                              ORIGINAL[i + 1]![0],
                              ORIGINAL[i]![1],
                              ORIGINAL[i + 1]![2],
                          ],
                          ...ORIGINAL.slice(i + 2),
                      ];
            const deleted = await deletePageFlags({
                db,
                pageIds: new Set([id]),
            });
            expect(deleted.map((p) => p.id)).toEqual([id]);
            expect(await grid(db), `delete ${id}`).toEqual(expected);
            expect(await rendererGrid(db), `renderer, delete ${id}`).toEqual(
                expected,
            );
            // The last remaining flag is where it was
            expect(await lpc(db)).toBe(
                expected.at(-1)![2] - expected.at(-1)![1],
            );
            expect(await snapshot(db, TIMELINE_TABLES)).toEqual(
                timelinesBefore,
            );
            expect(await positions()).toEqual(motionBefore);
            const afterRows = await snapshot(db);
            expect((await performUndo(db)).success).toBe(true);
            expect(await snapshot(db), `undo delete ${id}`).toEqual(before);
            expect((await performRedo(db)).success).toBe(true);
            expect(await snapshot(db)).toEqual(afterRows);
            expect((await performUndo(db)).success).toBe(true);
        }
    });

    it("deleting a page created by +, and delete then + round trips the grid", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const a = await addPageFlag({ db, beat: 10 }); // 1 after flag 9
        const b = await addPageFlag({ db, beat: 48 }); // 1 before the last flag
        await deletePageFlags({ db, pageIds: new Set([a.page.id, b.page.id]) });
        expect(await grid(db)).toEqual(ORIGINAL);
        expect(await lpc(db)).toBe(8);

        await deletePageFlags({ db, pageIds: new Set([3]) });
        const c = await addPageFlag({ db, beat: 25 });
        expect(await grid(db)).toEqual([
            ...ORIGINAL.slice(0, 3),
            [c.page.id, 17, 25],
            ...ORIGINAL.slice(4),
        ]);
        await deletePageFlags({ db, pageIds: new Set([6]) });
        const d = await addPageFlag({ db, beat: 49 });
        expect(await grid(db)).toEqual([
            ...ORIGINAL.slice(0, 3),
            [c.page.id, 17, 25],
            ...ORIGINAL.slice(4, 6),
            [d.page.id, 41, 49],
        ]);
        expect(await lpc(db)).toBe(8);
    });

    it("deleting every flag leaves home; + then appends after home", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        await deletePageFlags({ db, pageIds: new Set([0, 1, 2, 3, 4, 5, 6]) });
        expect(await grid(db)).toEqual([[0, 0, 1]]);
        await refused(addPageFlag({ db, beat: 1 }));
        const a = await addPageFlag({ db, beat: 5 });
        expect(await grid(db)).toEqual([
            [0, 0, 1],
            [a.page.id, 1, 5],
        ]);
        expect(await lpc(db)).toBe(4);
        const b = await addPageFlag({ db, beat: 3 });
        expect(await grid(db)).toEqual([
            [0, 0, 1],
            [b.page.id, 1, 3],
            [a.page.id, 3, 5],
        ]);
        expect(await lpc(db)).toBe(2);
    });

    it("unknown ids refuse the whole delete, even mixed with valid ones", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const before = await snapshot(db);
        await refused(deletePageFlags({ db, pageIds: new Set([3, 99]) }));
        await refused(deletePageFlags({ db, pageIds: new Set([-1]) }));
        expect(await snapshot(db)).toEqual(before);
    });

    it("a tag appearance on a deleted page goes with it, and undo restores it", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        await db.insert(schema.tags).values({ id: 1, name: "t" });
        await db.insert(schema.tag_appearances).values([
            { id: 1, tag_id: 1, start_page_id: 3, fill_color: "red" },
            { id: 2, tag_id: 1, start_page_id: 2, fill_color: "blue" },
        ]);
        const before = await snapshot(db);
        await addPageFlag({ db, beat: 12 }); // split page 2: its appearance stays on page 2
        expect(
            (await db.select().from(schema.tag_appearances).all()).map(
                (r) => r.start_page_id,
            ),
        ).toEqual([3, 2]);
        await deletePageFlags({ db, pageIds: new Set([3]) });
        expect(
            (await db.select().from(schema.tag_appearances).all()).map(
                (r) => r.id,
            ),
        ).toEqual([2]);
        expect((await performUndo(db)).success).toBe(true);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
    });

    it("beat ids that aren't ordinals: + and delete work in ordinals", async ({
        db,
        marchersAndPages: _,
    }) => {
        // Insert beat 1000 at position 5 in page mode, so beat ordinals ≥ 5 differ from ids
        await db.run(
            sql`UPDATE beats SET position = position + 1000 WHERE position >= 5`,
        );
        await db.run(
            sql`UPDATE beats SET position = position - 999 WHERE position >= 1000`,
        );
        await db.run(
            sql`INSERT INTO beats (id, duration, position, include_in_measure) VALUES (1000, 0.5, 5, 1)`,
        );
        await setUp(db);
        const g0 = await grid(db);
        expect(g0[1]).toEqual([1, 1, 10]);
        const a = await addPageFlag({ db, beat: 12 });
        expect(await grid(db)).toEqual([
            g0[0],
            g0[1],
            [a.page.id, 10, 12],
            [2, 12, 18],
            ...g0.slice(3),
        ]);
        expect(await rendererGrid(db)).toEqual(await grid(db));
        await deletePageFlags({ db, pageIds: new Set([a.page.id]) });
        expect(await grid(db)).toEqual(g0);
    });

    it("a refused + leaves no undo step behind", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const before = await snapshot(db);
        await addPageFlag({ db, beat: 13 });
        const afterAdd = await snapshot(db);
        await refused(addPageFlag({ db, beat: 9 }));
        await refused(deletePageFlags({ db, pageIds: new Set([99]) }));
        expect(await snapshot(db)).toEqual(afterAdd);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
    });

    it("refuses in page mode, and plan matches the refusals", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setFlag(db, false);
        const before = await snapshot(db);
        await refused(addPageFlag({ db, beat: 13 }));
        await refused(addPageFlag({ db, beat: 60 }));
        await refused(deletePageFlags({ db, pageIds: new Set([3]) }));
        expect(await snapshot(db)).toEqual(before);
        expect(
            planPageFlagInsertion({ beatCount: 97, pages: [] }, 5),
        ).toBeNull();
    });

    it("a last flag past the show's end stays put when its page is split or the next-to-last is deleted", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        await db.update(schema.utility).set({ last_page_counts: 100 }); // flag at 141, drawn at 97
        expect((await grid(db)).at(-1)).toEqual([6, 41, 97]);
        await refused(addPageFlag({ db, beat: 97 }));
        await addPageFlag({ db, beat: 60 });
        expect(await lpc(db)).toBe(81);
        await deletePageFlags({ db, pageIds: new Set([5]) });
        expect(await lpc(db)).toBe(81);
        expect((await grid(db)).at(-1)).toEqual([6, 60, 97]);
    });

    describe("history runner", () => {
        const testWithHistory = getTestWithHistory(it, TABLES);
        for (const [name, edit] of [
            [
                "+ first timed page",
                (db: DbConnection) => addPageFlag({ db, beat: 2 }),
            ],
            [
                "+ last page",
                (db: DbConnection) => addPageFlag({ db, beat: 42 }),
            ],
            ["+ append", (db: DbConnection) => addPageFlag({ db, beat: 97 })],
            [
                "delete after home",
                (db: DbConnection) =>
                    deletePageFlags({ db, pageIds: new Set([1]) }),
            ],
            [
                "delete last",
                (db: DbConnection) =>
                    deletePageFlags({ db, pageIds: new Set([6]) }),
            ],
            [
                "delete 5 and 6",
                (db: DbConnection) =>
                    deletePageFlags({ db, pageIds: new Set([5, 6]) }),
            ],
        ] as const)
            testWithHistory(
                `${name} is one undo step`,
                async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                    await setUp(db);
                    const state =
                        await expectNumberOfChanges.getDatabaseState(db);
                    await edit(db);
                    await expectNumberOfChanges.test(db, 1, state);
                },
            );
    });
});
