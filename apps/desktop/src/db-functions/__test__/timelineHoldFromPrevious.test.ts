import { refusalText } from "@/test/refusalText";
import { afterEach, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { countDistinct, eq as eqId, getTableName, sql } from "drizzle-orm";
import type { XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { getTestWithHistory } from "@/test/history";
import { readShowTiming } from "@/timeline/showTiming";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import {
    timelineErrorCode,
    timelineErrorMessage,
} from "@/timeline/timelineErrorMessages";
import { carriedOnto } from "@/shapes/placed/commitBox";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { createLastPage, deletePages, updatePages } from "../page";
import { createBeats, deleteBeats, updateBeats } from "../beat";
import { updateUtility } from "../utility";
import {
    moveMarchersInRangeInTransaction,
    moveMarchersInTarget,
    type TimelineEditTarget,
} from "../timelineMoves";
import { timelineDisplayVersion } from "../timelineDisplay";
import { addMarchersToTimeline } from "../timelineMembership";
import {
    saveShapeRecipeInTransaction,
    UNGROUPED_RECIPE_KIND,
} from "../shapeRecipes";
import { readHeldMarks } from "../timelineHeldMarks";
import { holdFromPreviousPage } from "../timelineHoldFromPrevious";
import { setAsShownOnPage } from "../timelineSetAsShown";
import { unsetMarchersAt } from "../timelineUnset";
import { setMarchersToNeighborPage } from "@/utilities/setMarchersToNeighborPage";

keepFixturesInPageMode(
    "its tests trim the show, write timeline rows and set the flag themselves",
);

/**
 * **Hold from last keyframe** and the drag inside a Held hold (holds, fork #472; holds README
 * decisions 2, 3 and 4; ADR 0012 amendment 2026-10-30).
 *
 * The show: home, page 1 [1, 9), page 2 [9, 17), page 3 [17, 25), page 4 [25, 33); beat ids equal
 * their ordinals. Marchers `a` and `b` move on page 2 and are Not set on pages 3 and 4; `c` never
 * moves.
 */

afterEach(() => stopTimelineResolver());

const UP: XY = [100, 100];
const UP2: XY = [200, 100];
const ELSEWHERE: XY = [400, 400];
const FAR: XY = [500, 260];
const LEFT: XY = [60, 300];
const PAGE1 = { start: 1, end: 9 };
const PAGE2 = { start: 9, end: 17 };
const PAGE3 = { start: 17, end: 25 };
const PAGE4 = { start: 25, end: 33 };

const TABLES = [
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
    schema.timeline_held_marks,
];

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const undoGroups = async (db: DbConnection) =>
    (
        await db
            .select({ n: countDistinct(schema.history_undo.history_group) })
            .from(schema.history_undo)
            .get()
    )?.n ?? 0;

const resolver = () => useTimelineResolverStore.getState().resolver!;

const pagesInOrder = async (db: DbConnection) =>
    [...(await readShowTiming(db)).pages].sort((a, b) => a.order - b.order);

/** Where `marcherId` stands at each flag: home, pages 1–4. */
const atFlags = async (db: DbConnection, marcherId: number) => {
    await timelineResolverSettled();
    return (await pagesInOrder(db))
        .map((p) => (p.id === 0 ? 0 : pageEndBeat(p)))
        .map((b) => resolver().positionAt(marcherId, b) as XY);
};

const edit = async (
    db: DbConnection,
    target: TimelineEditTarget,
    moves: { marcherId: number; xy: XY }[],
) => {
    const result = await moveMarchersInTarget({
        db,
        target,
        moves: moves.map(({ marcherId, xy: [x, y] }) => ({ marcherId, x, y })),
    });
    await timelineResolverSettled();
    return result;
};

const move = (
    db: DbConnection,
    range: { start: number; end: number },
    moves: { marcherId: number; xy: XY }[],
) => edit(db, { kind: "range", ...range }, moves);

/**
 * A move written straight over a hold by the range writer alone, so only the commit check (E-H1)
 * sees it: an Expert window drag would end or take away the hold instead (#476).
 */
const writeOver = (
    db: DbConnection,
    range: { start: number; end: number },
    moves: { marcherId: number; xy: XY }[],
) =>
    transactionWithHistory(db, "writeOver", (tx) =>
        moveMarchersInRangeInTransaction({
            tx,
            range,
            moves: moves.map(({ marcherId, xy: [x, y] }) => ({
                marcherId,
                x,
                y,
            })),
        }),
    );

const rowsOf = async (db: DbConnection, marcherId: number) =>
    (await db.select().from(schema.timeline_assignments).all()).filter(
        (r) => r.marcher_id === marcherId,
    );

const marksOf = async (db: DbConnection, marcherId: number) =>
    (await readHeldMarks(db, [marcherId])).map(({ start, end }) => ({
        start,
        end,
    }));

const setTimelineFlag = async (db: DbConnection) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
};

/** Pages 1–4 in timeline mode; `a` and `b` moved on page 2, Not set on 3 and 4. */
const show = async (db: DbConnection) => {
    const pages = await pagesInOrder(db);
    await deletePages({
        db,
        pageIds: new Set(pages.filter((p) => p.order >= 2).map((p) => p.id)),
    });
    for (let i = 0; i < 3; i++) await createLastPage({ db, newPageCounts: 8 });
    await setTimelineFlag(db);
    await startTimelineResolver(db);
    const [a, b, c] = resolver().marcherIds();
    await move(db, PAGE2, [
        { marcherId: a!, xy: UP },
        { marcherId: b!, xy: UP2 },
    ]);
    return { a: a!, b: b!, c: c! };
};

/**
 * A mark over `box` written straight to the file, as a file from before the rule that a hold grows
 * out of what last put the marcher there (owner, 2026-11-09) can hold: the next edit's upkeep
 * reaches it back.
 */
const leftoverMark = (
    db: DbConnection,
    marcherId: number,
    box: { start: number; end: number },
) =>
    db.insert(schema.timeline_held_marks).values({
        marcher_id: marcherId,
        start_beat: box.start,
        end_beat: box.end,
    });

describeDbTests("Hold from last keyframe", (it) => {
    it("holds this page only, growing out of the previous page's arrival", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const before = await atFlags(db, a);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [b, a],
        });
        expect(result).toEqual({
            held: [a, b].sort((x, y) => x - y),
            skipped: [],
        });
        // Nothing moves; the mark runs over page 3 from page 2's flag, where a move ends
        expect(await atFlags(db, a)).toEqual(before);
        expect(await marksOf(db, a)).toEqual([PAGE3]);
        expect(await marksOf(db, b)).toEqual([PAGE3]);
        expect(
            (await rowsOf(db, a)).filter((r) => r.end_beat === PAGE3.start),
        ).toHaveLength(1);
        // Page 4 is still Not set: no mark there
        expect(
            (await readHeldMarks(db)).filter((m) => m.end > PAGE3.end),
        ).toEqual([]);
    });

    it("takes the marcher's own move on the page out first", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await move(db, PAGE3, [{ marcherId: a, xy: ELSEWHERE }]);
        expect((await atFlags(db, a))[3]).toEqual(ELSEWHERE);

        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a],
        });
        expect(result.held).toEqual([a]);
        expect(
            (await rowsOf(db, a)).filter(
                (r) => r.start_beat < PAGE3.end && r.end_beat > PAGE3.start,
            ),
        ).toEqual([]);
        // It stands where page 2 put it, through pages 3 and 4
        expect((await atFlags(db, a)).slice(2)).toEqual([UP, UP, UP]);
        expect(await marksOf(db, a)).toEqual([PAGE3]);
    });

    it("skips, and names, marchers it can't hold", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        // b runs one move over pages 3 and 4 (a marcher whose move ends before the flag reaches
        // back to it: timelineHoldReachBack.test.ts)
        await move(db, { start: 17, end: 33 }, [{ marcherId: b, xy: FAR }]);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const rows = await snapshot(db);
        const groups = await undoGroups(db);

        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a, b],
        });
        expect(result.held).toEqual([]);
        expect(result.skipped).toEqual(
            [
                { marcherId: a, reason: "held" },
                { marcherId: b, reason: "crossesFlag" },
            ].sort((x, y) => x.marcherId - y.marcherId),
        );
        // Nobody held: nothing written, and no undo step
        expect(await snapshot(db)).toEqual(rows);
        expect(await undoGroups(db)).toBe(groups);
    });

    it("joins a Held hold on the next page that grew out of this page's arrival", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await move(db, PAGE1, [{ marcherId: a, xy: LEFT }]);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        expect(await marksOf(db, a)).toEqual([PAGE3]);

        await holdFromPreviousPage({ db, pageBox: PAGE2, marcherIds: [a] });
        // One hold over pages 2 and 3, from page 1's arrival
        expect(await marksOf(db, a)).toEqual([
            { start: PAGE2.start, end: PAGE3.end },
        ]);
        expect((await atFlags(db, a)).slice(1, 4)).toEqual([LEFT, LEFT, LEFT]);
    });

    it("holding the page right after a hold joins it: Page 2 then Page 3 is Page 3 then Page 2", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await move(db, PAGE1, [{ marcherId: a, xy: LEFT }]);
        await holdFromPreviousPage({ db, pageBox: PAGE2, marcherIds: [a] });
        expect(await marksOf(db, a)).toEqual([PAGE2]);

        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a],
        });
        expect(result).toEqual({ held: [a], skipped: [] });
        expect(await marksOf(db, a)).toEqual([
            { start: PAGE2.start, end: PAGE3.end },
        ]);
        expect((await atFlags(db, a)).slice(1, 4)).toEqual([LEFT, LEFT, LEFT]);
    });

    it("needs the arrival a drag would edit: a row ending at the flag inside a longer move isn't one", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        // c's part of a move over pages 2 and 3 ends at page 2's flag; the move doesn't
        await transactionWithHistory(db, "test", async (tx) => {
            const [line] = await tx
                .insert(schema.timelines)
                .values({ start_beat: 9, end_beat: 25 })
                .returning();
            const [tr] = await tx
                .insert(schema.timeline_transitions)
                .values({
                    timeline_id: line!.id,
                    slot_count: 1,
                    start_beat: 9,
                    end_beat: 25,
                })
                .returning();
            await tx.insert(schema.timeline_slot_destinations).values({
                transition_id: tr!.id,
                slot_index: 0,
                x: FAR[0],
                y: FAR[1],
            });
            await tx.insert(schema.timeline_assignments).values({
                transition_id: tr!.id,
                marcher_id: c,
                slot_index: 0,
                layer: 0,
                start_beat: 9,
                end_beat: 17,
            });
        });
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [c],
        });
        expect(result.skipped).toEqual([{ marcherId: c, reason: "noArrival" }]);
        expect(await marksOf(db, c)).toEqual([]);
    });

    it("skips, and names, a marcher whose arrival is a placed shape's move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const arrival = (await rowsOf(db, a)).find(
            (r) => r.end_beat === PAGE3.start,
        )!;
        const [transition] = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eqId(schema.timeline_transitions.id, arrival.transition_id))
            .all();
        await transactionWithHistory(db, "test", async (tx) => {
            const [recipe] = await tx
                .insert(schema.timeline_shape_recipes)
                .values({
                    timeline_id: transition!.timeline_id,
                    kind: "line",
                    kind_version: 1,
                    params: "{}",
                    order_mode: "keep",
                })
                .returning();
            await tx.insert(schema.timeline_shape_recipe_marchers).values({
                recipe_id: recipe!.id,
                marcher_id: a,
                slot: 0,
                x: UP[0],
                y: UP[1],
            });
        });
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a, b],
        });
        expect(result).toEqual({
            held: [b],
            skipped: [{ marcherId: a, reason: "arrivalShape" }],
        });
    });

    it("holds a marcher whose arrival's shape was ungrouped (its recipe is an ungrouped mark)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const arrival = (await rowsOf(db, a)).find(
            (r) => r.end_beat === PAGE3.start,
        )!;
        const [transition] = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eqId(schema.timeline_transitions.id, arrival.transition_id))
            .all();
        // What Ungroup leaves on the shape's own page (`ungroupShape`)
        await transactionWithHistory(db, "test", async (tx) => {
            const [recipe] = await tx
                .insert(schema.timeline_shape_recipes)
                .values({
                    timeline_id: transition!.timeline_id,
                    kind: UNGROUPED_RECIPE_KIND,
                    kind_version: 1,
                    params: "{}",
                    order_mode: "nearest",
                })
                .returning();
            await tx.insert(schema.timeline_shape_recipe_marchers).values({
                recipe_id: recipe!.id,
                marcher_id: a,
                slot: 0,
                x: UP[0],
                y: UP[1],
            });
        });
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a, b],
        });
        expect(result).toEqual({ held: [a, b], skipped: [] });
    });

    it("refuses a box that isn't a page's, worded in pages and counts", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        const rows = await snapshot(db);
        const notABox = await holdFromPreviousPage({
            db,
            pageBox: { start: 17, end: 21 },
            marcherIds: [a],
        }).catch((e: unknown) => e);
        expect(timelineErrorCode(notABox)).toBe("E-ARGS");
        expect(refusalText(notABox)).toContain(
            "Hold from last keyframe works on a whole page, not Page 3, counts 1–4",
        );
        expect(await snapshot(db)).toEqual(rows);
    });
});

/** Where `marcherId`'s starting spot is (`marchers.home_x`/`home_y`). */
const homeOf = async (db: DbConnection, marcherId: number): Promise<XY> => {
    const m = (await db.select().from(schema.marchers).all()).find(
        (r) => r.id === marcherId,
    )!;
    return [m.home_x, m.home_y];
};

/** `snapshot` and the marchers' starting spots, which a drag inside a hold from them writes. */
const snapshotWithHomes = async (db: DbConnection) => ({
    ...(await snapshot(db)),
    homes: (await db.select().from(schema.marchers).all()).map((m) => [
        m.id,
        m.home_x,
        m.home_y,
    ]),
});

/** A placed shape at the starting spots (a recipe with no move) holding `marcherId`. */
const homeRecipe = (db: DbConnection, marcherId: number, kind: string) =>
    transactionWithHistory(db, "test", async (tx) => {
        const [recipe] = await tx
            .insert(schema.timeline_shape_recipes)
            .values({
                timeline_id: null,
                kind,
                kind_version: 1,
                params: "{}",
                order_mode: "nearest",
            })
            .returning();
        await tx.insert(schema.timeline_shape_recipe_marchers).values({
            recipe_id: recipe!.id,
            marcher_id: marcherId,
            slot: 0,
            x: 0,
            y: 0,
        });
    });

describeDbTests(
    "Hold from last keyframe from the starting spots (#619)",
    (it) => {
        it("holds plain marchers on Page 1 at their starting spots", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, c } = await show(db);
            const aBefore = await atFlags(db, a);
            const cBefore = await atFlags(db, c);
            const result = await holdFromPreviousPage({
                db,
                pageBox: PAGE1,
                marcherIds: [c, a],
            });
            expect(result).toEqual({
                held: [a, c].sort((x, y) => x - y),
                skipped: [],
            });
            expect(await marksOf(db, a)).toEqual([PAGE1]);
            expect(await marksOf(db, c)).toEqual([PAGE1]);
            expect(await atFlags(db, a)).toEqual(aBefore);
            expect(await atFlags(db, c)).toEqual(cBefore);
            expect(await rowsOf(db, c)).toEqual([]);
        });

        it("holds on a later page reached only through the starting spots", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            const result = await holdFromPreviousPage({
                db,
                pageBox: PAGE3,
                marcherIds: [c],
            });
            expect(result).toEqual({
                held: [c],
                skipped: [],
                pagesCovered: ["1", "2", "3"],
            });
            expect(await marksOf(db, c)).toEqual([
                { start: PAGE1.start, end: PAGE3.end },
            ]);
        });

        it("the hold survives later edits that leave it standing on its starting spot", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { b, c } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [c] });
            await move(db, PAGE3, [{ marcherId: b, xy: FAR }]);
            expect(await marksOf(db, c)).toEqual([PAGE1]);
        });

        it("a move written later to arrive at the hold's start becomes its arrival", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await leftoverMark(db, c, PAGE2);
            await move(db, PAGE1, [{ marcherId: c, xy: LEFT }]);
            expect(await marksOf(db, c)).toEqual([PAGE2]);
            expect((await atFlags(db, c)).slice(1, 3)).toEqual([LEFT, LEFT]);
        });

        it("touching holds join into one from the start: Page 1 then Page 2", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            for (const pageBox of [PAGE1, PAGE2])
                expect(
                    (
                        await holdFromPreviousPage({
                            db,
                            pageBox,
                            marcherIds: [c],
                        })
                    ).held,
                ).toEqual([c]);
            expect(await marksOf(db, c)).toEqual([
                { start: PAGE1.start, end: PAGE2.end },
            ]);
        });

        it("Page 2 first already reaches back over Page 1", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE2, marcherIds: [c] });
            expect(
                await holdFromPreviousPage({
                    db,
                    pageBox: PAGE1,
                    marcherIds: [c],
                }),
            ).toEqual({
                held: [],
                skipped: [{ marcherId: c, reason: "held" }],
            });
            expect(await marksOf(db, c)).toEqual([
                { start: PAGE1.start, end: PAGE2.end },
            ]);
        });

        it("skips, and names, a marcher whose starting spot a shape sets; an ungrouped mark isn't a shape", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, c } = await show(db);
            await homeRecipe(db, c, "box");
            await homeRecipe(db, a, "ungrouped");
            const result = await holdFromPreviousPage({
                db,
                pageBox: PAGE1,
                marcherIds: [a, c],
            });
            expect(result).toEqual({
                held: [a],
                skipped: [{ marcherId: c, reason: "homeShape" }],
            });
            expect(await marksOf(db, c)).toEqual([]);
        });

        it("Clear this page removes it", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [c] });
            const result = await moveMarchersInTarget({
                db,
                target: { kind: "range", ...PAGE1 },
                moves: [{ marcherId: c, x: LEFT[0], y: LEFT[1] }],
                clearPage: true,
            });
            expect(result.cleared).toEqual([c]);
            expect(await marksOf(db, c)).toEqual([]);
        });

        it("is undone and redone exactly, the hold and the drag inside it one step each", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, c } = await show(db);
            const start = await snapshotWithHomes(db);
            const groups = await undoGroups(db);
            await holdFromPreviousPage({
                db,
                pageBox: PAGE1,
                marcherIds: [a, c],
            });
            const held = await snapshotWithHomes(db);
            await edit(db, { kind: "range", ...PAGE1 }, [
                { marcherId: c, xy: FAR },
            ]);
            const dragged = await snapshotWithHomes(db);
            expect(await undoGroups(db)).toBe(groups + 2);

            expect((await performUndo(db)).success).toBe(true);
            expect(await snapshotWithHomes(db)).toEqual(held);
            expect((await performUndo(db)).success).toBe(true);
            expect(await snapshotWithHomes(db)).toEqual(start);
            expect((await performRedo(db)).success).toBe(true);
            expect(await snapshotWithHomes(db)).toEqual(held);
            expect((await performRedo(db)).success).toBe(true);
            expect(await snapshotWithHomes(db)).toEqual(dragged);
        });
    },
);

describeDbTests("A drag inside a hold from the starting spots (#619)", (it) => {
    for (const [mode, target] of [
        ["Expert, the page's window", { kind: "range", ...PAGE1 }],
        ["Basic, mid-page", { kind: "point", beat: 5, box: PAGE1 }],
        ["Basic, on the page's flag", { kind: "point", beat: 9, box: PAGE1 }],
    ] as const) {
        it(`moves the starting spot and the hold with it (${mode})`, async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, c } = await show(db);
            await holdFromPreviousPage({
                db,
                pageBox: PAGE1,
                marcherIds: [a, c],
            });
            const result = await edit(db, target, [
                { marcherId: a, xy: ELSEWHERE },
                { marcherId: c, xy: FAR },
            ]);
            expect([...result.homes].sort()).toEqual([a, c].sort());
            expect(await homeOf(db, a)).toEqual(ELSEWHERE);
            expect(await homeOf(db, c)).toEqual(FAR);
            // a still moves on page 2; c never moves, so it stands there all show
            expect(await atFlags(db, a)).toEqual([
                ELSEWHERE,
                ELSEWHERE,
                UP,
                UP,
                UP,
            ]);
            expect(await atFlags(db, c)).toEqual([FAR, FAR, FAR, FAR, FAR]);
            expect(await marksOf(db, a)).toEqual([PAGE1]);
            expect(await marksOf(db, c)).toEqual([PAGE1]);
            expect(await rowsOf(db, c)).toEqual([]);
        });
    }

    it("on a later page reached only through the starting spots, moves the starting spot", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [c] });
        await edit(db, { kind: "point", beat: 21, box: PAGE3 }, [
            { marcherId: c, xy: FAR },
        ]);
        expect(await homeOf(db, c)).toEqual(FAR);
        expect(await atFlags(db, c)).toEqual([FAR, FAR, FAR, FAR, FAR]);
        expect(await marksOf(db, c)).toEqual([
            { start: PAGE1.start, end: PAGE3.end },
        ]);
        expect(await rowsOf(db, c)).toEqual([]);
    });

    it("skips, and names, a marcher whose starting spot a shape set since it was held", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [c] });
        await homeRecipe(db, c, "box");
        const home = await homeOf(db, c);
        const rows = await snapshotWithHomes(db);
        const result = await edit(db, { kind: "range", ...PAGE1 }, [
            { marcherId: c, xy: FAR },
        ]);
        expect(result.skipped).toBeDefined();
        expect(result.skipped?.message).toContain("shape");
        expect(await homeOf(db, c)).toEqual(home);
        expect(await snapshotWithHomes(db)).toEqual(rows);
    });
});

describeDbTests("A drag inside a Held hold", (it) => {
    for (const [mode, target] of [
        ["Expert, the page's window", { kind: "range", ...PAGE3 }],
        ["Basic, mid-page", { kind: "point", beat: 21, box: PAGE3 }],
        ["Basic, on the page's flag", { kind: "point", beat: 25, box: PAGE3 }],
    ] as const) {
        it(`moves the arrival and the whole hold (${mode}); earlier and later pages as before`, async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            // b: page 4 is Set, so it keeps its own spot whatever page 2 does
            await move(db, PAGE4, [{ marcherId: b, xy: LEFT }]);
            await holdFromPreviousPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a, b],
            });
            const aBefore = await atFlags(db, a);
            const bBefore = await atFlags(db, b);

            await edit(db, target, [
                { marcherId: a, xy: ELSEWHERE },
                { marcherId: b, xy: FAR },
            ]);
            // Page 2's arrival moved, and the hold with it; nothing new on page 3
            expect(await atFlags(db, a)).toEqual([
                ...aBefore.slice(0, 2),
                ELSEWHERE,
                ELSEWHERE,
                // Page 4 is Not set: it shows the last set spot, as before
                ELSEWHERE,
            ]);
            expect(await atFlags(db, b)).toEqual([
                ...bBefore.slice(0, 2),
                FAR,
                FAR,
                LEFT,
            ]);
            for (const id of [a, b]) {
                expect(await marksOf(db, id)).toEqual([PAGE3]);
                expect(
                    (await rowsOf(db, id)).filter(
                        (r) =>
                            r.start_beat < PAGE3.end &&
                            r.end_beat > PAGE3.start,
                    ),
                ).toEqual([]);
            }
        });
    }

    it("skips, and names, a marcher whose arrival became a placed shape's move since it was held", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, c } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        // A later edit puts a shape on page 2: its recipe holds a in the arrival's move
        const arrival = (await rowsOf(db, a)).find(
            (r) => r.end_beat === PAGE3.start,
        )!;
        const transition = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eqId(schema.timeline_transitions.id, arrival.transition_id))
            .get();
        await transactionWithHistory(db, "test", async (tx) => {
            const [recipe] = await tx
                .insert(schema.timeline_shape_recipes)
                .values({
                    timeline_id: transition!.timeline_id,
                    kind: "line",
                    kind_version: 1,
                    params: "{}",
                    order_mode: "keep",
                })
                .returning();
            await tx.insert(schema.timeline_shape_recipe_marchers).values({
                recipe_id: recipe!.id,
                marcher_id: a,
                slot: 0,
                x: UP[0],
                y: UP[1],
            });
        });
        const aBefore = await atFlags(db, a);

        const result = await move(db, PAGE3, [
            { marcherId: a, xy: ELSEWHERE },
            { marcherId: c, xy: FAR },
        ]);
        expect(result.skipped?.marcherIds).toEqual([a]);
        expect(result.skipped?.refusal).toBe("inShapeOrFollowTheLeader");
        expect(await atFlags(db, a)).toEqual(aBefore);
        expect(await marksOf(db, a)).toEqual([PAGE3]);
        expect((await atFlags(db, c))[3]).toEqual(FAR);
    });

    it("edits each marcher by its own kind in a mixed selection", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });

        await move(db, PAGE3, [
            { marcherId: a, xy: ELSEWHERE },
            { marcherId: b, xy: FAR },
        ]);
        // a (Held) moves page 2's spot; b (Not set) gets a move of its own on page 3
        expect((await atFlags(db, a)).slice(2, 4)).toEqual([
            ELSEWHERE,
            ELSEWHERE,
        ]);
        expect((await atFlags(db, b)).slice(2, 4)).toEqual([UP2, FAR]);
    });
});

describeDbTests(
    "A drag inside a Held hold: locks and shape bookkeeping",
    (it) => {
        it("Basic refuses, naming the marcher, when the arrival is an Expert move", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await show(db);
            // a's arrival at page 3's start runs over pages 1 and 2: Expert on page 2
            await move(db, { start: 1, end: 17 }, [{ marcherId: a, xy: LEFT }]);
            const held = await holdFromPreviousPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a],
            });
            expect(held.held).toEqual([a]);
            const rows = await snapshot(db);
            const error = await edit(
                db,
                { kind: "point", beat: 21, box: PAGE3 },
                [{ marcherId: a, xy: FAR }],
            ).catch((e: unknown) => e);
            expect((error as Error).name).toBe("TimelineEditRefusedError");
            expect((error as Error).message).toMatch(
                /is Held from an Expert move/,
            );
            expect(await snapshot(db)).toEqual(rows);
            // Expert edits it
            await move(db, PAGE3, [{ marcherId: a, xy: FAR }]);
            expect((await atFlags(db, a))[3]).toEqual(FAR);
        });

        it("with only Held marchers dragged, the after-write step gets the arrival's move, and keepUnchanged writes a stay", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            await holdFromPreviousPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a, b],
            });
            const arrival = (await rowsOf(db, a)).find(
                (r) => r.end_beat === PAGE3.start,
            )!;
            const [transition] = await db
                .select()
                .from(schema.timeline_transitions)
                .where(
                    eqId(schema.timeline_transitions.id, arrival.transition_id),
                )
                .all();
            const seen: (number | null)[] = [];
            const result = await moveMarchersInTarget({
                db,
                target: { kind: "range", ...PAGE3 },
                // b stays where it is
                moves: [
                    { marcherId: a, x: FAR[0], y: FAR[1] },
                    { marcherId: b, x: UP2[0], y: UP2[1] },
                ],
                keepUnchanged: true,
                afterWrite: async (_tx, timelineId) => {
                    seen.push(timelineId);
                },
            });
            expect(seen).toEqual([transition!.timeline_id]);
            expect(result.slots.map((s) => s.marcherId).sort()).toEqual(
                [a, b].sort(),
            );
        });
    },
);

describeDbTests("Held marks at commit", (it) => {
    it("rejects a move inside a mark (E-H1), writing nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const rows = await snapshot(db);
        // A move over pages 3 and 4, written over the hold
        const error = await writeOver(db, { start: 17, end: 33 }, [
            { marcherId: a, xy: FAR },
        ]).catch((e: unknown) => e);
        expect(timelineErrorCode(error)).toBe("E-H1");
        expect(await snapshot(db)).toEqual(rows);
    });

    it("reports overlapping marks of one marcher (E-H3)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        // Written straight, outside an edit, which would refuse it
        const write = (marcherId: number) =>
            db.insert(schema.timeline_held_marks).values({
                marcher_id: marcherId,
                start_beat: 21,
                end_beat: 33,
            });
        const codes = async () =>
            (
                (await db.all(
                    sql`SELECT code FROM timeline_held_violations`,
                )) as unknown[]
            ).map((r) =>
                Array.isArray(r) ? r[0] : (r as { code: string }).code,
            );
        await write(a);
        expect(await codes()).toEqual(["E-H3"]);
        await db
            .delete(schema.timeline_held_marks)
            .where(eqId(schema.timeline_held_marks.start_beat, 21));
        // Another marcher's mark over the same counts is fine
        await write(b);
        expect(await codes()).toEqual([]);
    });
});

describeDbTests("Held marks: undo, redo and views", (it) => {
    it("is one undo step, exactly undone and redone, and a mark-only edit refreshes the views", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const rows = await snapshot(db);
        const groups = await undoGroups(db);
        let display = timelineDisplayVersion();
        // a and b are Not set on page 3: the hold writes only marks
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a, b] });
        const held = await snapshot(db);
        expect(await undoGroups(db)).toBe(groups + 1);
        expect(timelineDisplayVersion()).toBeGreaterThan(display);

        display = timelineDisplayVersion();
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(rows);
        expect(timelineDisplayVersion()).toBeGreaterThan(display);

        display = timelineDisplayVersion();
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(held);
        expect(timelineDisplayVersion()).toBeGreaterThan(display);
    });

    it("undoes a hold that took the marcher's own move out, rows and mark together", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await move(db, PAGE3, [{ marcherId: a, xy: ELSEWHERE }]);
        const rows = await snapshot(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const held = await snapshot(db);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(rows);
        expect((await atFlags(db, a))[3]).toEqual(ELSEWHERE);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(held);
    });
});

describeDbTests("Held marks: history round trips", (it) => {
    const testWithHistory = getTestWithHistory(it, TABLES);

    testWithHistory(
        "Hold from last keyframe, then a drag inside the hold: one undo group each",
        async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
            const { a, b } = await show(db);
            await move(db, PAGE3, [{ marcherId: b, xy: ELSEWHERE }]);
            const state = await expectNumberOfChanges.getDatabaseState(db);
            await holdFromPreviousPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a, b],
            });
            await timelineResolverSettled();
            await move(db, PAGE3, [{ marcherId: a, xy: FAR }]);
            await expectNumberOfChanges.test(db, 2, state);
        },
    );
});

/** Undo restores `before` exactly, and redo `after`. */
const roundTrip = async (
    db: DbConnection,
    before: Record<string, unknown[]>,
    after: Record<string, unknown[]>,
) => {
    const undo = await performUndo(db);
    expect(undo.success, undo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(before);
    const redo = await performRedo(db);
    expect(redo.success, redo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(after);
    await timelineResolverSettled();
};

const pageId = async (db: DbConnection, order: number) =>
    (await pagesInOrder(db)).find((p) => p.order === order)!.id;

describeDbTests("Held marks follow page and beat edits", (it) => {
    /** a Held on page 3, growing out of its page 2 move */
    const heldShow = async (db: DbConnection) => {
        const ids = await show(db);
        await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [ids.a],
        });
        return ids;
    };

    it("inserting beats inside the page before the hold: the hold moves with its arrival", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        const before = await snapshot(db);
        // Three beats after beat 12, inside page 2 [9, 17)
        await createBeats({
            db,
            newBeats: [0, 1, 2].map(() => ({
                duration: 0.5,
                include_in_measure: true,
            })),
            startingPosition: 12,
        });
        await timelineResolverSettled();
        expect(await marksOf(db, a)).toEqual([{ start: 20, end: 28 }]);
        expect(
            (await rowsOf(db, a)).filter((r) => r.end_beat === 20),
        ).toHaveLength(1);
        expect((await atFlags(db, a)).slice(2, 4)).toEqual([UP, UP]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("deleting beats in the page before the hold", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        const before = await snapshot(db);
        await deleteBeats({ db, beatIds: new Set([11, 12]) });
        await timelineResolverSettled();
        expect(await marksOf(db, a)).toEqual([{ start: 15, end: 23 }]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("resizing a page: edges on its flags follow them", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        const before = await snapshot(db);
        const beats = await db
            .select()
            .from(schema.beats)
            .orderBy(schema.beats.position)
            .all();
        // Page 3 starts two counts later: page 2's arrival grows, the hold starts with it
        await updatePages({
            db,
            modifiedPages: [
                { id: await pageId(db, 3), start_beat: beats[19]!.id },
            ],
        });
        await timelineResolverSettled();
        expect(await marksOf(db, a)).toEqual([{ start: 19, end: 25 }]);
        await roundTrip(db, before, await snapshot(db));

        // Page 4 starts two counts later: the hold's end follows its flag
        await performUndo(db);
        const restored = await snapshot(db);
        await updatePages({
            db,
            modifiedPages: [
                { id: await pageId(db, 4), start_beat: beats[27]!.id },
            ],
        });
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 27 }]);
        await roundTrip(db, restored, await snapshot(db));
    });

    it("the last page's counts: a hold to its end follows it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 33 }]);
        const before = await snapshot(db);
        await updateUtility({ db, args: { last_page_counts: 4 } });
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 29 }]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("deleting the held page deletes the hold", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        const before = await snapshot(db);
        await deletePages({ db, pageIds: new Set([await pageId(db, 3)]) });
        await timelineResolverSettled();
        expect(await marksOf(db, a)).toEqual([]);
        // Page 2 now runs to where page 3 ended, and its move with it
        expect(
            (await rowsOf(db, a)).filter((r) => r.end_beat === 25),
        ).toHaveLength(1);
        await roundTrip(db, before, await snapshot(db));
    });

    it("deleting the page after the hold leaves the hold's end on its count", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        const before = await snapshot(db);
        await deletePages({ db, pageIds: new Set([await pageId(db, 4)]) });
        expect(await marksOf(db, a)).toEqual([PAGE3]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("deleting the arrival's page deletes the hold (its arrival is gone)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        const before = await snapshot(db);
        await deletePages({ db, pageIds: new Set([await pageId(db, 2)]) });
        expect(await marksOf(db, a)).toEqual([]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("a tempo change keeps the hold on its counts", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        const before = await snapshot(db);
        const beats = await db.select().from(schema.beats).all();
        await updateBeats({
            db,
            modifiedBeats: beats
                .filter((b) => b.position > 0)
                .map((b) => ({ id: b.id, duration: 0.25 })),
        });
        expect(await marksOf(db, a)).toEqual([PAGE3]);
        expect(await snapshot(db)).toEqual(before);
    });
});

describeDbTests("A Held mark goes when its arrival goes", (it) => {
    it("deleting the move that ends at the hold's start deletes the mark in the same edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const held = await snapshot(db);
        const groups = await undoGroups(db);
        const arrival = (await rowsOf(db, a)).find(
            (r) => r.end_beat === PAGE3.start,
        )!;
        // A's part of page 2's move goes (its slot is left vacant, D-13)
        await transactionWithHistory(db, "test", async (tx) => {
            await tx
                .delete(schema.timeline_assignments)
                .where(eqId(schema.timeline_assignments.id, arrival.id));
        });
        expect(await marksOf(db, a)).toEqual([]);
        expect(await undoGroups(db)).toBe(groups + 1);
        // Undo replays the edit backwards, mark included, and drops nothing
        const removed = await snapshot(db);
        await roundTrip(db, held, removed);
        // A drag on page 3 is no longer refused: a is Not set there
        await move(db, PAGE3, [{ marcherId: a, xy: FAR }]);
        expect((await atFlags(db, a))[3]).toEqual(FAR);
    });

    it("a mark stays while a move still ends at its start (the arrival replaced by one ending there)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        // Basic on page 2 deletes and rewrites a's move, which still ends at page 2's flag
        await edit(db, { kind: "point", beat: 17, box: PAGE2 }, [
            { marcherId: a, xy: FAR },
        ]);
        expect(await marksOf(db, a)).toEqual([PAGE3]);
        expect((await atFlags(db, a)).slice(2, 4)).toEqual([FAR, FAR]);
    });
});

// Re-timing the arrival (clip drag, resize, merge refit) moves the hold with it since #473:
// `timelineHeldUpkeep.test.ts`

describeDbTests("The E-H1 refusal names who and where", (it) => {
    it("names the marcher and the page, and points to Clear this page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const error = await writeOver(db, { start: 17, end: 33 }, [
            { marcherId: a, xy: FAR },
        ]).catch((e: unknown) => e);
        expect(timelineErrorCode(error)).toBe("E-H1");
        const m = (await db.select().from(schema.marchers).all()).find(
            (r) => r.id === a,
        )!;
        expect(timelineErrorMessage(error)).toBe(
            `${m.drill_prefix}${m.drill_order} is Held on Page 3. Clear this page to remove the hold, or drag inside it to move it.`,
        );
    });
});

describeDbTests("The E-H1 refusal names the page of the conflict", (it) => {
    it("a hold over pages 3 and 4 and a move over page 4: Page 4", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 33 }]);
        // A move over page 4 and on, written over the hold
        const error = await writeOver(db, { start: 25, end: 37 }, [
            { marcherId: a, xy: FAR },
        ]).catch((e: unknown) => e);
        expect(timelineErrorCode(error)).toBe("E-H1");
        expect(timelineErrorMessage(error)).toContain("is Held on Page 4.");
    });
});

describeDbTests(
    "Set as shown, Only Page N and Remove keyframe on a held page",
    (it) => {
        it("Set as shown skips, and names, a Held marcher and sets the rest", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
            const result = await setAsShownOnPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a, b],
            });
            expect(result).toEqual({
                changed: [b],
                skipped: [{ marcherId: a, state: "held" }],
            });
            expect(await marksOf(db, a)).toEqual([PAGE3]);
            expect(
                (await rowsOf(db, b)).filter(
                    (r) => r.start_beat === PAGE3.start,
                ),
            ).toHaveLength(1);
        });

        it("Only Page N's stays (Set as shown with spots) skip a Held marcher", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
            const result = await setAsShownOnPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a, b],
                at: new Map([
                    [a, FAR],
                    [b, FAR],
                ]),
            });
            expect(result.changed).toEqual([b]);
            expect(await marksOf(db, a)).toEqual([PAGE3]);
            expect((await atFlags(db, a))[3]).toEqual(UP);
        });

        it("Remove keyframe at a hold's arrival writes no move inside the hold, and the hold goes with its arrival", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
            await unsetMarchersAt({ db, beat: PAGE3.start, marcherIds: [a] });
            expect(await marksOf(db, a)).toEqual([]);
            expect(
                (await rowsOf(db, a)).filter(
                    (r) => r.start_beat < PAGE3.end && r.end_beat > PAGE3.start,
                ),
            ).toEqual([]);
        });
    },
);

describeDbTests("Clear this page clears a hold", (it) => {
    for (const [mode, target] of [
        ["Expert, the page's window", { kind: "range", ...PAGE3 }],
        ["Basic, on the page's flag", { kind: "point", beat: 25, box: PAGE3 }],
    ] as const) {
        it(`makes the held page Not set for the cleared marchers (${mode}), in one undo step`, async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            await holdFromPreviousPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a, b],
            });
            const before = await snapshot(db);
            const result = await moveMarchersInTarget({
                db,
                target,
                moves: [{ marcherId: a, x: UP[0], y: UP[1] }],
                clearPage: true,
            });
            await timelineResolverSettled();
            expect(result.cleared).toEqual([a]);
            expect(await marksOf(db, a)).toEqual([]);
            expect(await marksOf(db, b)).toEqual([PAGE3]);
            // Not set: a drag on page 2 now carries into page 3
            await move(db, PAGE2, [{ marcherId: a, xy: FAR }]);
            expect((await atFlags(db, a)).slice(2, 4)).toEqual([FAR, FAR]);
            await performUndo(db);
            await roundTrip(db, before, await snapshot(db));
        });
    }

    it("keeps the part of a joined hold before the page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await move(db, PAGE1, [{ marcherId: a, xy: LEFT }]);
        await holdFromPreviousPage({ db, pageBox: PAGE2, marcherIds: [a] });
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        await moveMarchersInTarget({
            db,
            target: { kind: "range", ...PAGE3 },
            moves: [{ marcherId: a, x: LEFT[0], y: LEFT[1] }],
            clearPage: true,
        });
        expect(await marksOf(db, a)).toEqual([PAGE2]);
    });
});

/** `key`'s English text from en.json, its plurals and parameters filled in. */
const english = (key: string, params: Record<string, string | number> = {}) => {
    const en = JSON.parse(
        readFileSync(resolve(__dirname, "../../../i18n/en.json"), "utf8"),
    ) as Record<string, unknown>;
    const text = key
        .split(".")
        .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)[part],
            en,
        ) as string;
    const branch = "((?:[^{}]|\\{\\w+\\})*)";
    return text
        .replace(
            new RegExp(
                `\\{(\\w+), plural, one \\{${branch}\\} other \\{${branch}\\}\\}`,
                "g",
            ),
            (_, name: string, one: string, other: string) =>
                Number(params[name]) === 1 ? one : other,
        )
        .replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));
};

describeDbTests("Clear this page on the first page of a joined hold", (it) => {
    it("clears the later pages too, and a quiet message says so", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
        const pages = await pagesInOrder(db);
        const m = (await db.select().from(schema.marchers).all()).find(
            (r) => r.id === a,
        )!;
        const notify = { success: vi.fn(), error: vi.fn(), note: vi.fn() };
        const count = await setMarchersToNeighborPage({
            direction: "previous",
            scope: "selected",
            selectedPage: pages.find((p) => p.name === "3")!,
            pages,
            selectedMarcherIds: [a],
            writeTimeline: (request) =>
                moveMarchersInTarget({ db, ...request }),
            notify,
            t: english,
        });
        expect(count).toBe(1);
        expect(await marksOf(db, a)).toEqual([]);
        expect(notify.success).not.toHaveBeenCalled();
        expect(notify.note).toHaveBeenCalledExactlyOnceWith(
            `${m.drill_prefix}${m.drill_order}'s hold on Page 4 was cleared too.`,
        );
    });
});

/** The move of marcher `id` that ends at `beat`, as its timeline id */
const moveEndingAt = async (db: DbConnection, id: number, beat: number) => {
    const row = (await rowsOf(db, id)).find((r) => r.end_beat === beat)!;
    const [transition] = await db
        .select()
        .from(schema.timeline_transitions)
        .where(eqId(schema.timeline_transitions.id, row.transition_id))
        .all();
    return transition!.timeline_id;
};

/** Marks marchers ungrouped on move `timelineId`, as Ungroup does (`ungroupShape`) */
const markUngrouped = (
    db: DbConnection,
    timelineId: number,
    members: readonly { marcherId: number; xy: XY }[],
) =>
    transactionWithHistory(db, "test", (tx) =>
        saveShapeRecipeInTransaction({
            tx,
            timelineId,
            recipe: {
                kind: UNGROUPED_RECIPE_KIND,
                kindVersion: 1,
                params: {},
                orderMode: "nearest",
                reverse: false,
            },
            members: members.map((m, slot) => ({
                marcherId: m.marcherId,
                slot,
                x: m.xy[0],
                y: m.xy[1],
            })),
        }),
    );

/** Both recipe tables, for exact undo/redo checks */
const recipeTables = async (db: DbConnection) => ({
    recipes: await db.select().from(schema.timeline_shape_recipes).all(),
    members: await db
        .select()
        .from(schema.timeline_shape_recipe_marchers)
        .all(),
});

/** Who move `timelineId`'s ungrouped marks list */
const ungroupedOn = async (db: DbConnection, timelineId: number) =>
    (
        await db
            .select({
                marcherId: schema.timeline_shape_recipe_marchers.marcher_id,
            })
            .from(schema.timeline_shape_recipe_marchers)
            .innerJoin(
                schema.timeline_shape_recipes,
                eqId(
                    schema.timeline_shape_recipes.id,
                    schema.timeline_shape_recipe_marchers.recipe_id,
                ),
            )
            .where(eqId(schema.timeline_shape_recipes.timeline_id, timelineId))
            .all()
    )
        .map((r) => r.marcherId)
        .sort((x, y) => x - y);

describeDbTests(
    "Holds and a shape ungrouped on a page it was carried onto (#618 review)",
    (it) => {
        it("Hold from last keyframe still skips a marcher whose arrival is the real shape", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            const arrival = await moveEndingAt(db, a, PAGE3.start);
            // A shape on page 2 holds a; Ungroup on page 3, where it's only carried, sets a and b
            // there and marks them ungrouped on page 3's move
            await transactionWithHistory(db, "test", (tx) =>
                saveShapeRecipeInTransaction({
                    tx,
                    timelineId: arrival,
                    recipe: {
                        kind: "line",
                        kindVersion: 1,
                        params: {},
                        orderMode: "keep",
                        reverse: false,
                    },
                    members: [{ marcherId: a, slot: 0, x: UP[0], y: UP[1] }],
                }),
            );
            // (a fixture move can't write rows that go nowhere, so page 3 moves them a little)
            const there: XY = [UP[0] + 10, UP[1]];
            const there2: XY = [UP2[0] + 10, UP2[1]];
            await move(db, PAGE3, [
                { marcherId: a, xy: there },
                { marcherId: b, xy: there2 },
            ]);
            await markUngrouped(db, await moveEndingAt(db, a, PAGE3.end), [
                { marcherId: a, xy: there },
                { marcherId: b, xy: there2 },
            ]);
            const result = await holdFromPreviousPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a, b],
            });
            expect(result).toEqual({
                held: [b],
                skipped: [{ marcherId: a, reason: "arrivalShape" }],
            });
        });

        it("Clear this page for some of them takes them out of the page's ungrouped mark", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            const page2 = await moveEndingAt(db, a, PAGE3.start);
            await markUngrouped(db, page2, [
                { marcherId: a, xy: UP },
                { marcherId: b, xy: UP2 },
            ]);
            const pages = await pagesInOrder(db);
            const clear = (ids: number[]) =>
                setMarchersToNeighborPage({
                    direction: "previous",
                    scope: "selected",
                    selectedPage: pages.find((p) => p.name === "2")!,
                    pages,
                    selectedMarcherIds: ids,
                    writeTimeline: (request) =>
                        moveMarchersInTarget({ db, ...request }),
                    notify: { success: vi.fn(), error: vi.fn() },
                    t: english,
                });
            const recipesBefore = await recipeTables(db);
            expect(await clear([a])).toBe(1);
            // The mark lists only who is still in the move, as when the move empties
            expect(await ungroupedOn(db, page2)).toEqual([b]);
            // One undo step, exact both ways
            const recipesAfter = await recipeTables(db);
            await performUndo(db);
            expect(await recipeTables(db)).toEqual(recipesBefore);
            await performRedo(db);
            expect(await recipeTables(db)).toEqual(recipesAfter);
            expect(await clear([b])).toBe(1);
            expect(await ungroupedOn(db, page2)).toEqual([]);
            expect(
                await db
                    .select()
                    .from(schema.timeline_shape_recipes)
                    .where(
                        eqId(
                            schema.timeline_shape_recipes.kind,
                            UNGROUPED_RECIPE_KIND,
                        ),
                    )
                    .all(),
            ).toEqual([]);
        });

        it("Clear this page leaves a later page's ungrouped mark alone (the check is per move)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            const page2 = await moveEndingAt(db, a, PAGE3.start);
            const there: XY = [UP[0] + 10, UP[1]];
            const there2: XY = [UP2[0] + 10, UP2[1]];
            await move(db, PAGE3, [
                { marcherId: a, xy: there },
                { marcherId: b, xy: there2 },
            ]);
            const page3 = await moveEndingAt(db, a, PAGE3.end);
            await markUngrouped(db, page2, [
                { marcherId: a, xy: UP },
                { marcherId: b, xy: UP2 },
            ]);
            await markUngrouped(db, page3, [
                { marcherId: a, xy: there },
                { marcherId: b, xy: there2 },
            ]);
            const pages = await pagesInOrder(db);
            await setMarchersToNeighborPage({
                direction: "previous",
                scope: "selected",
                selectedPage: pages.find((p) => p.name === "2")!,
                pages,
                selectedMarcherIds: [a],
                writeTimeline: (request) =>
                    moveMarchersInTarget({ db, ...request }),
                notify: { success: vi.fn(), error: vi.fn() },
                t: english,
            });
            expect(await ungroupedOn(db, page2)).toEqual([b]);
            expect(await ungroupedOn(db, page3)).toEqual(
                [a, b].sort((x, y) => x - y),
            );
        });

        it("a Basic point mid-page only re-cuts the move: the marcher stays in the page's ungrouped mark", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            const page2 = await moveEndingAt(db, a, PAGE3.start);
            await markUngrouped(db, page2, [
                { marcherId: a, xy: UP },
                { marcherId: b, xy: UP2 },
            ]);
            await edit(db, { kind: "point", beat: 13, box: PAGE2 }, [
                { marcherId: a, xy: [150, 150] },
            ]);
            // a's page 2 is now two moves, but it was never cleared off the page
            expect(
                (await rowsOf(db, a)).filter(
                    (r) =>
                        r.start_beat >= PAGE2.start && r.end_beat <= PAGE2.end,
                ).length,
            ).toBeGreaterThan(1);
            const marked = (
                await db
                    .select({
                        marcherId:
                            schema.timeline_shape_recipe_marchers.marcher_id,
                    })
                    .from(schema.timeline_shape_recipe_marchers)
                    .innerJoin(
                        schema.timeline_shape_recipes,
                        eqId(
                            schema.timeline_shape_recipes.id,
                            schema.timeline_shape_recipe_marchers.recipe_id,
                        ),
                    )
                    .where(
                        eqId(
                            schema.timeline_shape_recipes.kind,
                            UNGROUPED_RECIPE_KIND,
                        ),
                    )
                    .all()
            ).map((r) => r.marcherId);
            expect(marked).toContain(a);
        });
    },
);

/** `marcherId`'s drill name ("T1"), as the hold messages say it. */
const nameOf = async (db: DbConnection, marcherId: number) => {
    const m = (await db.select().from(schema.marchers).all()).find(
        (r) => r.id === marcherId,
    )!;
    return `${m.drill_prefix}${m.drill_order}`;
};

const recipes = (db: DbConnection) =>
    db.select().from(schema.timeline_shape_recipes).all();

describeDbTests(
    "A shape placed over marchers Held from their starting spots (#619 review)",
    (it) => {
        it("is saved at the starting spots, and their Held holds from them go, in one undo step", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, c } = await show(db);
            await holdFromPreviousPage({
                db,
                pageBox: PAGE1,
                marcherIds: [a, c],
            });
            const before = await snapshotWithHomes(db);
            const groups = await undoGroups(db);
            const seen: (number | null)[] = [];
            await moveMarchersInTarget({
                db,
                target: { kind: "range", ...PAGE1 },
                moves: [
                    { marcherId: a, x: FAR[0], y: FAR[1] },
                    { marcherId: c, x: LEFT[0], y: LEFT[1] },
                ],
                afterWrite: async (tx, timelineId) => {
                    seen.push(timelineId);
                    await saveShapeRecipeInTransaction({
                        tx,
                        timelineId,
                        recipe: {
                            kind: "box",
                            kindVersion: 1,
                            params: {},
                            orderMode: "nearest",
                            reverse: false,
                        },
                        members: [
                            { marcherId: a, slot: 0, x: FAR[0], y: FAR[1] },
                            { marcherId: c, slot: 1, x: LEFT[0], y: LEFT[1] },
                        ],
                    });
                },
            });
            expect(seen).toEqual([null]);
            const [recipe] = await recipes(db);
            expect(recipe?.timeline_id).toBeNull();
            expect(await homeOf(db, a)).toEqual(FAR);
            expect(await homeOf(db, c)).toEqual(LEFT);
            // A shape's starting spots get no Held hold: the shape carried on is the hold
            expect(await marksOf(db, a)).toEqual([]);
            expect(await marksOf(db, c)).toEqual([]);
            expect(await undoGroups(db)).toBe(groups + 1);
            const after = await snapshotWithHomes(db);
            expect((await performUndo(db)).success).toBe(true);
            expect(await snapshotWithHomes(db)).toEqual(before);
            expect(await recipes(db)).toEqual([]);
            expect((await performRedo(db)).success).toBe(true);
            expect(await snapshotWithHomes(db)).toEqual(after);
        });

        it("a later Hold from last keyframe then skips them as homeShape", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [c] });
            await moveMarchersInTarget({
                db,
                target: { kind: "range", ...PAGE1 },
                moves: [{ marcherId: c, x: LEFT[0], y: LEFT[1] }],
                afterWrite: (tx, timelineId) =>
                    saveShapeRecipeInTransaction({
                        tx,
                        timelineId,
                        recipe: {
                            kind: "box",
                            kindVersion: 1,
                            params: {},
                            orderMode: "nearest",
                            reverse: false,
                        },
                        members: [
                            { marcherId: c, slot: 0, x: LEFT[0], y: LEFT[1] },
                        ],
                    }).then(() => undefined),
            });
            expect(
                await holdFromPreviousPage({
                    db,
                    pageBox: PAGE1,
                    marcherIds: [c],
                }),
            ).toEqual({
                held: [],
                skipped: [{ marcherId: c, reason: "homeShape" }],
            });
        });

        it("a drag inside with no app data keeps the holds (only a saved shape drops them)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [c] });
            const seen: (number | null)[] = [];
            await moveMarchersInTarget({
                db,
                target: { kind: "range", ...PAGE1 },
                moves: [{ marcherId: c, x: LEFT[0], y: LEFT[1] }],
                afterWrite: async (_tx, timelineId) => {
                    seen.push(timelineId);
                    return false;
                },
            });
            expect(seen).toEqual([null]);
            expect(await marksOf(db, c)).toEqual([PAGE1]);
        });
    },
);

describeDbTests(
    "An edit of an earlier page: a hold from the starting spots reaches back to it (#619, owner 2026-11-09)",
    (it) => {
        it("a move on Page 1 before a Page 3 hold: it now grows out of that move", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await leftoverMark(db, c, PAGE3);
            const before = await snapshot(db);
            await move(db, PAGE1, [{ marcherId: c, xy: LEFT }]);
            expect(await marksOf(db, c)).toEqual([
                { start: PAGE1.end, end: PAGE3.end },
            ]);
            expect((await atFlags(db, c)).slice(1, 4)).toEqual([
                LEFT,
                LEFT,
                LEFT,
            ]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("a Basic point edit on Page 1 does too", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await leftoverMark(db, c, PAGE3);
            await edit(db, { kind: "point", beat: 9, box: PAGE1 }, [
                { marcherId: c, xy: LEFT },
            ]);
            expect(await marksOf(db, c)).toEqual([
                { start: PAGE1.end, end: PAGE3.end },
            ]);
        });

        it("a drag inside a hold from the start moves the starting spot, on any page it covers", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [c] });
            await edit(db, { kind: "point", beat: 9, box: PAGE1 }, [
                { marcherId: c, xy: LEFT },
            ]);
            expect(await homeOf(db, c)).toEqual(LEFT);
            expect(await rowsOf(db, c)).toEqual([]);
            expect(await marksOf(db, c)).toEqual([
                { start: PAGE1.start, end: PAGE3.end },
            ]);
        });

        it("Set as shown on Page 1 leaves it growing out of the new move", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await leftoverMark(db, c, PAGE3);
            const result = await setAsShownOnPage({
                db,
                pageBox: PAGE1,
                marcherIds: [c],
            });
            expect(result.changed).toEqual([c]);
            expect(await marksOf(db, c)).toEqual([
                { start: PAGE1.end, end: PAGE3.end },
            ]);
        });

        it("a move that arrives at the hold's start keeps it, growing out of that move", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await leftoverMark(db, c, PAGE2);
            await move(db, PAGE1, [{ marcherId: c, xy: LEFT }]);
            expect(await marksOf(db, c)).toEqual([PAGE2]);
        });
    },
);

describeDbTests(
    "Ungrouping a shape that sets the starting spots (#619 review)",
    (it) => {
        const box = {
            kind: "box",
            kindVersion: 1,
            params: {},
            orderMode: "nearest",
            reverse: false,
        };
        const ungrouped = { ...box, kind: UNGROUPED_RECIPE_KIND };

        /** A box placed at the starting spots holding `c`, as the Shape tool saves it */
        const placeAtHome = async (db: DbConnection, c: number) => {
            await edit(db, { kind: "home" }, [{ marcherId: c, xy: LEFT }]);
            return transactionWithHistory(db, "test", (tx) =>
                saveShapeRecipeInTransaction({
                    tx,
                    timelineId: null,
                    recipe: box,
                    members: [
                        { marcherId: c, slot: 0, x: LEFT[0], y: LEFT[1] },
                    ],
                }),
            );
        };

        it("on Page 1 it's carried onto, so Ungroup marks Page 1's move, and Page 1 still can't be held", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            const id = await placeAtHome(db, c);
            const stored = (await recipes(db)).find((r) => r.id === id)!;
            // ungroupShape's routing: a Page 1 edit window is past the homes recipe (beat 0)
            expect(
                carriedOnto(
                    {
                        ok: true,
                        target: { kind: "range", ...PAGE1 },
                        beat: PAGE1.end,
                    },
                    {
                        recipe: {
                            id,
                            timelineId: stored.timeline_id,
                            members: [],
                        },
                        endBeat: 0,
                    } as unknown as Parameters<typeof carriedOnto>[1],
                ),
            ).toBe(true);
            // markUngrouped: writePlacement with setAll, the members set where they stand
            await moveMarchersInTarget({
                db,
                target: { kind: "range", ...PAGE1 },
                moves: [{ marcherId: c, x: LEFT[0], y: LEFT[1] }],
                keepUnchanged: true,
                afterWrite: (tx, timelineId) =>
                    saveShapeRecipeInTransaction({
                        tx,
                        timelineId,
                        recipe: ungrouped,
                        members: [
                            { marcherId: c, slot: 0, x: LEFT[0], y: LEFT[1] },
                        ],
                    }).then(() => undefined),
            });
            expect((await recipes(db)).map((r) => r.kind).sort()).toEqual([
                "box",
                UNGROUPED_RECIPE_KIND,
            ]);
            const result = await holdFromPreviousPage({
                db,
                pageBox: PAGE1,
                marcherIds: [c],
            });
            expect(result.skipped).toEqual([
                { marcherId: c, reason: "homeShape" },
            ]);
        });

        it("at the start of the show it's ungrouped in place, and then Page 1 can be held", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            const id = await placeAtHome(db, c);
            expect(
                carriedOnto({ ok: true, target: { kind: "home" }, beat: 0 }, {
                    recipe: { id, timelineId: null, members: [] },
                    endBeat: 0,
                } as unknown as Parameters<typeof carriedOnto>[1]),
            ).toBe(false);
            // ungroupInPlace
            await transactionWithHistory(db, "ungroupShape", (tx) =>
                saveShapeRecipeInTransaction({
                    tx,
                    timelineId: null,
                    recipe: ungrouped,
                    members: [
                        { marcherId: c, slot: 0, x: LEFT[0], y: LEFT[1] },
                    ],
                    replaces: id,
                }),
            );
            expect(
                await holdFromPreviousPage({
                    db,
                    pageBox: PAGE1,
                    marcherIds: [c],
                }),
            ).toEqual({ held: [c], skipped: [] });
        });
    },
);

describeDbTests(
    "Holds from the starting spots with other edits (#619 review)",
    (it) => {
        it("a mixed drag: a plain marcher, one Held from an arrival, and one Held from its starting spot since before the window, which the window wins over (R2)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c } = await show(db);
            // a: Held on Page 3 from its Page 2 move; c: Held on Pages 1–3 from its starting spot
            await holdFromPreviousPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a, c],
            });
            await holdFromPreviousPage({ db, pageBox: PAGE2, marcherIds: [c] });
            await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [c] });
            expect(await marksOf(db, c)).toEqual([{ start: 1, end: 25 }]);
            const home = await homeOf(db, c);
            const before = await snapshotWithHomes(db);
            const groups = await undoGroups(db);
            const result = await edit(db, { kind: "range", ...PAGE3 }, [
                { marcherId: a, xy: FAR },
                { marcherId: b, xy: ELSEWHERE },
                { marcherId: c, xy: LEFT },
            ]);
            // c's hold starts before the window's start flag: the window wins (#476), so c gets
            // a move on Page 3 and its hold ends at the flag; its starting spot stays
            expect(result.homes).toEqual([]);
            expect(await homeOf(db, c)).toEqual(home);
            // a's Page 2 move ends at FAR, so it stands there over its hold; b moves on Page 3
            expect((await atFlags(db, a)).slice(2)).toEqual([FAR, FAR, FAR]);
            expect((await atFlags(db, b)).slice(2)).toEqual([
                UP2,
                ELSEWHERE,
                ELSEWHERE,
            ]);
            expect(await atFlags(db, c)).toEqual([
                home,
                home,
                home,
                LEFT,
                LEFT,
            ]);
            expect(await marksOf(db, a)).toEqual([PAGE3]);
            expect(await marksOf(db, c)).toEqual([{ start: 1, end: 17 }]);
            expect(await undoGroups(db)).toBe(groups + 1);
            const after = await snapshotWithHomes(db);
            expect((await performUndo(db)).success).toBe(true);
            expect(await snapshotWithHomes(db)).toEqual(before);
            expect((await performRedo(db)).success).toBe(true);
            expect(await snapshotWithHomes(db)).toEqual(after);
        });

        it("deleting Page 1 under a hold from the start on Page 2", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE2, marcherIds: [c] });
            const before = await snapshot(db);
            await deletePages({ db, pageIds: new Set([await pageId(db, 1)]) });
            await timelineResolverSettled();
            const first = (await pagesInOrder(db)).find((p) => p.order === 1)!;
            expect([first.id === 0, pageEndBeat(first)]).toEqual([false, 17]);
            // Page 1's counts go to Page 2, now the first page [1, 17): the hold starts where it
            // does, so it covers the whole page and still grows out of the starting spot
            expect(await marksOf(db, c)).toEqual([{ start: 1, end: 17 }]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("deleting Page 1 when it is the hold from the start", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [c] });
            const before = await snapshot(db);
            await deletePages({ db, pageIds: new Set([await pageId(db, 1)]) });
            await timelineResolverSettled();
            expect(await marksOf(db, c)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("Remove keyframe on a later page leaves a hold from the start alone", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [a] });
            await unsetMarchersAt({ db, beat: PAGE2.end, marcherIds: [a] });
            expect(await marksOf(db, a)).toEqual([PAGE1]);
        });

        it("Remove keyframe after a hold from the start, joining the later moves, keeps the hold", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await move(db, PAGE2, [{ marcherId: c, xy: LEFT }]);
            await move(db, PAGE3, [{ marcherId: c, xy: FAR }]);
            await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [c] });
            expect(await marksOf(db, c)).toEqual([PAGE1]);
            await unsetMarchersAt({ db, beat: PAGE2.end, marcherIds: [c] });
            // The moves on pages 2 and 3 join into one from Page 2's start: the hold still stands
            // on its starting spot up to Page 1's end
            expect(await marksOf(db, c)).toEqual([PAGE1]);
        });

        it("a move written over a hold from the start is refused (E-H1), naming who and where", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [c] });
            const rows = await snapshotWithHomes(db);
            // A move over pages 1 and 2, written over the hold
            const error = await writeOver(db, { start: 1, end: 17 }, [
                { marcherId: c, xy: FAR },
            ]).catch((e: unknown) => e);
            expect(timelineErrorCode(error)).toBe("E-H1");
            expect(timelineErrorMessage(error)).toBe(
                `${await nameOf(db, c)} is Held on Page 1. Clear this page to remove the hold, or drag inside it to move it.`,
            );
            expect(await snapshotWithHomes(db)).toEqual(rows);
        });
    },
);

describeDbTests(
    "Holds from the starting spots, the paths the #619 re-check found",
    (it) => {
        it("placing a shape at the starting spots drops those marchers' holds from the start", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE1, marcherIds: [c] });
            expect(await marksOf(db, c)).toEqual([PAGE1]);
            const before = await snapshot(db);
            await moveMarchersInTarget({
                db,
                target: { kind: "home" },
                moves: [{ marcherId: c, x: LEFT[0], y: LEFT[1] }],
                afterWrite: (tx, timelineId) =>
                    saveShapeRecipeInTransaction({
                        tx,
                        timelineId,
                        recipe: {
                            kind: "box",
                            kindVersion: 1,
                            params: {},
                            orderMode: "nearest",
                            reverse: false,
                        },
                        members: [
                            { marcherId: c, slot: 0, x: LEFT[0], y: LEFT[1] },
                        ],
                    }).then(() => undefined),
            });
            expect(await marksOf(db, c)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("Add to move on Page 1 before a Page 3 hold: it reaches back to that move", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await leftoverMark(db, c, PAGE3);
            await addMarchersToTimeline({
                db,
                range: PAGE1,
                marcherIds: [c],
            });
            expect(await marksOf(db, c)).toEqual([
                { start: PAGE1.end, end: PAGE3.end },
            ]);
        });
    },
);
