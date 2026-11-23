import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { schema } from "@/global/database/db";
import { DbConnection, describeDbTests } from "@/test/base";
import { readShowTiming } from "@/timeline/showTiming";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { createLastPage, deletePages } from "@/db-functions/page";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import {
    readAllShapeRecipes,
    saveShapeRecipeInTransaction,
} from "@/db-functions/shapeRecipes";
import { readTimelineEndBeats } from "@/db-functions/timelines";
import { boxesAt } from "@/shapes/placed/placedBox";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { mergeMoves, splitMarchersIntoNewMove } from "../timelineSplitMoves";
import { createBeats, deleteBeats, type NewBeatArgs } from "../beat";
import { deleteTimeline } from "../timelineCommands";
import { orderMarkPlace } from "../timelineRipple";
import { rememberedOrderAt } from "../rememberedOrder";
import { dragTrail, followOrderAt } from "../timelineTrailDrag";
import { reverseTrail } from "../timelineTrails";
import { clearMarcherOrder, setMarcherOrder } from "../marcherOrder";

/**
 * A line's order set by hand (pathways step 4g, DL-26..DL-29, QA-DL-26..QA-DL-33): stored as an
 * order mark that `rememberedOrder` reads, moving no one and showing no shape.
 */

afterEach(() => stopTimelineResolver());

const BEAT: NewBeatArgs = { duration: 0.5, include_in_measure: true };
const PAGE2 = { kind: "range", start: 9, end: 17 } as const;
const resolver = () => useTimelineResolverStore.getState().resolver!;

/** Pages 1–4 of 8 counts, nobody moved yet; four marchers */
const show = async (db: DbConnection) => {
    const pages = [...(await readShowTiming(db)).pages].sort(
        (a, b) => a.order - b.order,
    );
    await deletePages({
        db,
        pageIds: new Set(pages.filter((p) => p.order >= 2).map((p) => p.id)),
    });
    for (let i = 0; i < 3; i++) await createLastPage({ db, newPageCounts: 8 });
    await startTimelineResolver(db);
    return resolver().marcherIds().slice(0, 4);
};

/** The four in a row on page 2, left to right as `ids` are given, 20 apart */
const SPOTS = [100, 120, 140, 160].map((x) => ({ x, y: 40 }));
const inARow = async (db: DbConnection, along: readonly number[]) => {
    await moveMarchersInTarget({
        db,
        target: PAGE2,
        moves: along.map((marcherId, slot) => ({
            marcherId,
            ...SPOTS[slot]!,
        })),
    });
    await timelineResolverSettled();
};

/**
 * The move that holds `marcherIds`' positions at `beat`: the latest ending by then that holds any
 * of them (the first of those ending together), else the latest ending by then; null for the homes
 */
const orderMoveAt = async (
    db: DbConnection,
    beat: number,
    marcherIds: readonly number[],
): Promise<number | null> => {
    const T = schema.timelines;
    const A = schema.timeline_assignments;
    const TR = schema.timeline_transitions;
    if (marcherIds.length > 0) {
        const holding = await db
            .selectDistinct({ id: T.id, end: T.end_beat })
            .from(T)
            .innerJoin(TR, eq(TR.timeline_id, T.id))
            .innerJoin(A, eq(A.transition_id, TR.id))
            .where(
                and(
                    lte(T.end_beat, beat),
                    inArray(A.marcher_id, [...marcherIds]),
                ),
            )
            .orderBy(desc(T.end_beat), asc(T.id))
            .limit(1)
            .get();
        if (holding) return holding.id;
    }
    const last = await db
        .select({ id: T.id })
        .from(T)
        .where(lte(T.end_beat, beat))
        .orderBy(desc(T.end_beat), asc(T.id))
        .limit(1)
        .get();
    return last?.id ?? null;
};

const positions = (ids: readonly number[], beat: number) =>
    ids.map((id) => resolver().positionAt(id, beat));

const LINE = {
    points: [
        { x: 100, y: 40, tension: 0 },
        { x: 160, y: 40, tension: 0 },
    ],
    spacing: { mode: "fit" },
    spots: 4,
};

describeDbTests("A line's order set by hand", (it) => {
    it("QA-DL-26: Set order round-trips through rememberedOrder from the displayed beat on, and moves no one", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        const before = positions(ids, 25);
        // The 3rd leads, then the 1st, the 4th, the 2nd: not the order they stand in
        const order = [ids[2]!, ids[0]!, ids[3]!, ids[1]!];
        await setMarcherOrder(db, { beat: PAGE2.end, order });
        await timelineResolverSettled();

        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(order);
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(order);
        // Kept to a subset, in the same order
        expect(
            await rememberedOrderAt(db, [ids[1]!, ids[2]!], PAGE2.end),
        ).toEqual([ids[2]!, ids[1]!]);
        // Not before the page it was set on
        expect(await rememberedOrderAt(db, ids, PAGE2.start)).toBeNull();
        // Nobody moved
        expect(positions(ids, 25)).toEqual(before);
    });

    it("QA-DL-27: an order mark shows no placed shape, and leaves the shapes at its beat alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        // A Line placed on page 2, its spots left to right
        await moveMarchersInTarget({
            db,
            target: PAGE2,
            moves: ids.map((marcherId, slot) => ({
                marcherId,
                ...SPOTS[slot]!,
            })),
            afterWrite: async (tx, timelineId) => {
                await saveShapeRecipeInTransaction({
                    tx,
                    timelineId,
                    recipe: {
                        kind: "line",
                        kindVersion: 2,
                        params: LINE,
                        orderMode: "keep",
                        reverse: false,
                    },
                    members: ids.map((marcherId, slot) => ({
                        marcherId,
                        slot,
                        ...SPOTS[slot]!,
                    })),
                });
            },
        });
        await timelineResolverSettled();
        const shapesNow = async () => {
            const recipes = await readAllShapeRecipes(db);
            const ends = await readTimelineEndBeats(
                db,
                recipes.flatMap((r) =>
                    r.timelineId === null ? [] : [r.timelineId],
                ),
            );
            return boxesAt({
                recipes,
                endBeatOf: (id) => (id === null ? 0 : ends.get(id)),
                beat: PAGE2.end,
                positionOf: (id) => {
                    const [x, y] = resolver().positionAt(id, PAGE2.end);
                    return { x, y };
                },
            });
        };
        const shown = await shapesNow();
        expect(shown.map((b) => b.recipe.kind)).toEqual(["line"]);

        // Set by hand at the same beat: it wins over the Line, which keeps its members and shows
        const order = [...ids].reverse();
        await setMarcherOrder(db, { beat: PAGE2.end, order });
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(order);
        const after = await shapesNow();
        expect(after.map((b) => b.recipe.id)).toEqual(
            shown.map((b) => b.recipe.id),
        );
        expect(after[0]!.recipe.members.map((m) => m.marcherId)).toEqual(ids);

        // A shape placed after it at that beat takes them back: its order wins
        await transactionWithHistory(db, "placeLine", async (tx) => {
            await saveShapeRecipeInTransaction({
                tx,
                timelineId: shown[0]!.recipe.timelineId,
                recipe: {
                    kind: "line",
                    kindVersion: 2,
                    params: LINE,
                    orderMode: "keep",
                    reverse: false,
                },
                members: ids.map((marcherId, slot) => ({
                    marcherId,
                    slot,
                    ...SPOTS[slot]!,
                })),
            });
        });
        const kinds = (await readAllShapeRecipes(db)).map((r) => r.kind);
        expect(kinds).not.toContain("order");
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(ids);
    });

    it("QA-DL-28: Reverse and Clear are one undo step each", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        await setMarcherOrder(db, { beat: PAGE2.end, order: ids });
        const reversed = [...ids].reverse();
        await setMarcherOrder(db, {
            beat: PAGE2.end,
            order: reversed,
            operation: "reverseMarcherOrder",
        });
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(reversed);
        // One mark at the beat: the reversed one replaced the first's members
        expect(
            (await readAllShapeRecipes(db)).filter((r) => r.kind === "order"),
        ).toHaveLength(1);

        await clearMarcherOrder(db, { beat: PAGE2.end, marcherIds: ids });
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toBeNull();

        expect((await performUndo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(reversed);
        expect((await performUndo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(ids);
        expect((await performUndo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toBeNull();
    });

    it("QA-DL-29: Clear on a later page ends the order from there; a later order sets one again", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        // Page 3 has its own move: one step forward each
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 17, end: 25 },
            moves: ids.map((marcherId, slot) => ({
                marcherId,
                x: SPOTS[slot]!.x,
                y: SPOTS[slot]!.y + 8,
            })),
        });
        await timelineResolverSettled();
        await setMarcherOrder(db, { beat: PAGE2.end, order: ids });
        // Cleared on the next page: page 2 keeps it, page 3 on guesses
        await clearMarcherOrder(db, { beat: 25, marcherIds: ids });
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(ids);
        expect(await rememberedOrderAt(db, ids, 25)).toBeNull();
        expect(await rememberedOrderAt(db, ids, 33)).toBeNull();
        await setMarcherOrder(db, { beat: 33, order: [...ids].reverse() });
        expect(await rememberedOrderAt(db, ids, 33)).toEqual(
            [...ids].reverse(),
        );
    });

    it("QA-DL-29 with nobody moving on page 3: Clear there keeps page 2's order; so does an order set there", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        const pageMove = (await orderMoveAt(db, PAGE2.end, ids))!;
        // Standing still on page 3, they're in page 2's move
        expect(await orderMoveAt(db, 25, ids)).toBe(pageMove);
        const reversed = [...ids].reverse();
        const marks = async () =>
            (await readAllShapeRecipes(db)).filter((r) =>
                ["order", "orderClear"].includes(r.kind),
            );

        // Clear on page 3
        await setMarcherOrder(db, { beat: PAGE2.end, order: ids });
        await clearMarcherOrder(db, { beat: 25, marcherIds: ids });
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(ids);
        expect(await rememberedOrderAt(db, ids, 21)).toEqual(ids);
        expect(await rememberedOrderAt(db, ids, 25)).toBeNull();
        // Both marks kept, in no move, each at its own beat
        expect(
            (await marks()).map((m) => [
                m.kind,
                m.timelineId,
                (m.params as { beat?: number }).beat,
                m.members.length,
            ]),
        ).toEqual([
            ["order", null, PAGE2.end, 4],
            ["orderClear", null, 25, 4],
        ]);

        // An order set on page 3 after: page 2 still keeps its own
        await setMarcherOrder(db, { beat: 25, order: reversed });
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(ids);
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(reversed);
        // ...and it replaced the Clear at its beat (the latest action wins)
        expect((await marks()).map((m) => m.kind)).toEqual(["order", "order"]);

        // Redefined straight away, without a Clear between
        expect((await performUndo(db)).success).toBe(true);
        expect((await performUndo(db)).success).toBe(true);
        await setMarcherOrder(db, { beat: 25, order: reversed });
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(ids);
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(reversed);
        expect(
            (await marks()).map((m) => m.members.map((x) => x.marcherId)),
        ).toEqual([ids, reversed]);
    });

    it("a shape placed again at its move's end leaves an order mark said about a later beat alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        const pageMove = (await orderMoveAt(db, PAGE2.end, ids))!;
        const reversed = [...ids].reverse();
        await setMarcherOrder(db, { beat: 25, order: reversed });
        // A box placed again in page 2's move, at beat 17: before the mark, so it stays
        await transactionWithHistory(db, "placeBox", async (tx) => {
            await saveShapeRecipeInTransaction({
                tx,
                timelineId: pageMove,
                recipe: {
                    kind: "box",
                    kindVersion: 1,
                    params: {},
                    orderMode: "keep",
                    reverse: false,
                },
                members: ids.map((marcherId, slot) => ({
                    marcherId,
                    slot,
                    ...SPOTS[slot]!,
                })),
            });
        });
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(reversed);
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toBeNull();
    });

    it("merging a move fitted to the target's counts keeps its order marks at their own beat", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        const pageMove = (await orderMoveAt(db, PAGE2.end, ids))!;
        // Half the line in a move of its own on page 3, ending at 23
        const [a, b] = ids as [number, number];
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 17, end: 23 },
            moves: [
                { marcherId: a, x: 100, y: 60 },
                { marcherId: b, x: 120, y: 60 },
            ],
        });
        await timelineResolverSettled();
        const short = (await orderMoveAt(db, 23, [a, b]))!;
        expect(short).not.toBe(pageMove);
        expect((await readTimelineEndBeats(db, [short])).get(short)).toBe(23);
        await setMarcherOrder(db, { beat: 23, order: [b, a] });
        // ...and the rest of page 3 in a move ending at 25, which the short one merges into
        const [, , c, d] = ids as [number, number, number, number];
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 17, end: 25 },
            moves: [
                { marcherId: c, x: 140, y: 60 },
                { marcherId: d, x: 160, y: 60 },
            ],
        });
        await timelineResolverSettled();
        const page3 = (await orderMoveAt(db, 25, [c, d]))!;
        expect(page3).not.toBe(short);
        await mergeMoves({ db, sourceId: short, targetId: page3 });
        await timelineResolverSettled();
        const mark = (await readAllShapeRecipes(db)).find(
            (r) => r.kind === "order",
        )!;
        expect(mark.timelineId).toBeNull();
        expect((mark.params as { beat?: number }).beat).toBe(23);
        expect(await rememberedOrderAt(db, [a, b], 23)).toEqual([b, a]);
    });

    it("a trail edit on page 2 leaves an order set on page 3 alone, though nobody moves there", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        // In a row at page 2's start flag, and a step forward at its end
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: PAGE2.start },
            moves: ids.map((marcherId, slot) => ({
                marcherId,
                ...SPOTS[slot]!,
            })),
        });
        await moveMarchersInTarget({
            db,
            target: PAGE2,
            moves: ids.map((marcherId, slot) => ({
                marcherId,
                x: SPOTS[slot]!.x,
                y: SPOTS[slot]!.y + 8,
            })),
        });
        await timelineResolverSettled();
        const starts = positions(ids, PAGE2.start);
        // A trail on page 2 (Keep end spots), the first leading
        const lead = starts[0]!;
        const trail = await dragTrail({
            db,
            window: { start: PAGE2.start, end: PAGE2.end },
            marcherIds: ids,
            leaderId: ids[0]!,
            points: [{ at: [lead[0] - 30, lead[1] + 30] }],
            spacing: { kind: "keep" },
            step: 5,
            ends: "keep",
        });
        await timelineResolverSettled();
        const pageMove = (await orderMoveAt(db, PAGE2.end, ids))!;
        expect(await orderMoveAt(db, 25, ids)).toBe(pageMove);
        const page3 = [ids[1]!, ids[3]!, ids[0]!, ids[2]!];
        await setMarcherOrder(db, { beat: 25, order: page3 });
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(page3);

        await reverseTrail({ db, routeId: trail.routeId });
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(
            [...ids].reverse(),
        );
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(page3);
        // An order set on page 2 itself still gives way to the edit
        await setMarcherOrder(db, { beat: PAGE2.end, order: page3 });
        await reverseTrail({ db, routeId: trail.routeId });
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(ids);
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(page3);
    });

    it("QA-DL-32: the Follow tool takes a hand-set order over the guess", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        const starts = positions(ids, PAGE2.end).map(
            ([x, y]) => [x, y] as [number, number],
        );
        // Guessed from the row: left to right, or right to left
        const guess = await followOrderAt(db, ids, PAGE2.end, starts);
        expect(guess).not.toBeNull();
        const order = [ids[1]!, ids[3]!, ids[0]!, ids[2]!];
        await setMarcherOrder(db, { beat: PAGE2.end, order });
        // Its start flag on the page after: the order set there, as indexes into ids
        expect(await followOrderAt(db, ids, PAGE2.end, starts)).toEqual({
            order: order.map((id) => ids.indexOf(id)),
            leaderFirst: true,
        });
    });

    it("redo brings back Set, Reverse and Clear in turn", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        const order = [ids[2]!, ids[0]!, ids[3]!, ids[1]!];
        const reversed = [...order].reverse();
        await setMarcherOrder(db, { beat: PAGE2.end, order });
        await setMarcherOrder(db, {
            beat: PAGE2.end,
            order: reversed,
            operation: "reverseMarcherOrder",
        });
        await clearMarcherOrder(db, { beat: PAGE2.end, marcherIds: ids });
        for (let i = 0; i < 3; i++)
            expect((await performUndo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toBeNull();

        expect((await performRedo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(order);
        expect((await performRedo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(reversed);
        expect((await performRedo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toBeNull();
    });

    it("splitting marchers off into a move of their own, and merging them back, keeps the whole order set by hand", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        // Interleaved, so either half split off breaks it up
        const order = [ids[3]!, ids[0]!, ids[2]!, ids[1]!];
        await setMarcherOrder(db, { beat: PAGE2.end, order });
        const pageMove = (await orderMoveAt(db, PAGE2.end, ids))!;
        const split = await splitMarchersIntoNewMove({
            db,
            timelineId: pageMove,
            marcherIds: [ids[0]!, ids[1]!],
        });
        await timelineResolverSettled();
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(order);
        const mark = (await readAllShapeRecipes(db)).find(
            (r) => r.kind === "order",
        )!;
        expect(mark.members.map((m) => m.marcherId)).toEqual(order);

        await mergeMoves({
            db,
            sourceId: split.timeline.id,
            targetId: pageMove,
        });
        await timelineResolverSettled();
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(order);
    });

    it("merging a move whose order mark holds some of a line into the move with the rest's mark keeps both", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        const pageMove = (await orderMoveAt(db, PAGE2.end, ids))!;
        const split = await splitMarchersIntoNewMove({
            db,
            timelineId: pageMove,
            marcherIds: [ids[0]!, ids[1]!],
        });
        await timelineResolverSettled();
        const left = [ids[1]!, ids[0]!];
        const right = [ids[3]!, ids[2]!];
        // Each half's order lives in the move that holds it
        await setMarcherOrder(db, { beat: PAGE2.end, order: left });
        await setMarcherOrder(db, { beat: PAGE2.end, order: right });
        expect(await orderMoveAt(db, PAGE2.end, left)).toBe(split.timeline.id);
        expect(await orderMoveAt(db, PAGE2.end, right)).toBe(pageMove);

        await mergeMoves({
            db,
            sourceId: split.timeline.id,
            targetId: pageMove,
        });
        expect(await rememberedOrderAt(db, left, PAGE2.end)).toEqual(left);
        expect(await rememberedOrderAt(db, right, PAGE2.end)).toEqual(right);
    });

    it("a Line placed reversed on purpose sets its order, though a member is dragged off it; a copy of an order set by hand either way carries that order on", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        const P3 = { kind: "range", start: 17, end: 25 } as const;
        await moveMarchersInTarget({
            db,
            target: P3,
            moves: ids.map((marcherId, slot) => ({
                marcherId,
                x: SPOTS[slot]!.x,
                y: SPOTS[slot]!.y + 8,
            })),
        });
        await timelineResolverSettled();
        const [a, b, c, d] = ids as [number, number, number, number];
        const place = async (
            beat: number,
            bySlot: readonly (number | null)[],
        ) => {
            const timelineId = await orderMoveAt(db, beat, ids);
            await transactionWithHistory(db, "placeLine", async (tx) => {
                await saveShapeRecipeInTransaction({
                    tx,
                    timelineId,
                    recipe: {
                        kind: "line",
                        kindVersion: 2,
                        params: { ...LINE, spots: bySlot.length },
                        orderMode: "keep",
                        reverse: false,
                    },
                    members: bySlot.flatMap((marcherId, slot) =>
                        marcherId === null
                            ? []
                            : [{ marcherId, slot, ...SPOTS[slot]! }],
                    ),
                });
            });
        };
        // A Line a→d on page 2, then on page 3 one placed d→a with c dragged off it
        await place(PAGE2.end, [a, b, c, d]);
        await place(25, [d, c, null, a]);
        expect(await rememberedOrderAt(db, [a, c, d], 25)).toEqual([d, c, a]);

        // Set by hand a→d on page 2 instead: the same copy carries the order set by hand on
        await setMarcherOrder(db, { beat: PAGE2.end, order: [a, b, c, d] });
        expect(await rememberedOrderAt(db, [a, c, d], 25)).toEqual([a, c, d]);
    });

    it("an order set on page 3, where the line stands still, survives deleting page 2's move, through undo and redo", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        // Standing still on page 3, their positions are in page 2's move
        const pageMove = (await orderMoveAt(db, PAGE2.end, ids))!;
        expect(await orderMoveAt(db, 25, ids)).toBe(pageMove);
        const page3 = [ids[2]!, ids[0]!, ids[3]!, ids[1]!];
        await setMarcherOrder(db, { beat: 25, order: page3 });
        const mark = (await readAllShapeRecipes(db)).find(
            (r) => r.kind === "order",
        )!;
        expect(mark.timelineId).toBeNull();

        // Moved back: page 2's move goes
        await deleteTimeline({ db, timelineId: pageMove });
        await timelineResolverSettled();
        expect((await readTimelineEndBeats(db, [pageMove])).has(pageMove)).toBe(
            false,
        );
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(page3);

        expect((await performUndo(db)).success).toBe(true);
        await timelineResolverSettled();
        expect((await readTimelineEndBeats(db, [pageMove])).get(pageMove)).toBe(
            PAGE2.end,
        );
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(page3);

        expect((await performRedo(db)).success).toBe(true);
        await timelineResolverSettled();
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(page3);
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toBeNull();
    });

    it("beats inserted on page 2 move an order set on page 3 with page 3's flag, through undo and redo", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        const page3 = [ids[2]!, ids[0]!, ids[3]!, ids[1]!];
        await setMarcherOrder(db, { beat: 25, order: page3 });
        // Two beats inside page 2: page 3 now ends at 27
        await createBeats({
            db,
            newBeats: [BEAT, BEAT],
            startingPosition: 12,
        });
        await timelineResolverSettled();
        expect(await rememberedOrderAt(db, ids, 25)).toBeNull();
        expect(await rememberedOrderAt(db, ids, 27)).toEqual(page3);

        expect((await performUndo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(page3);
        expect((await performRedo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, 25)).toBeNull();
        expect(await rememberedOrderAt(db, ids, 27)).toEqual(page3);
    });

    it("marks a beat delete brings onto one beat: the one that was later wins, through undo and redo", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        await inARow(db, ids);
        const reversed = [...ids].reverse();
        // Clear mid-page 3, then an order set at page 3's end flag
        await clearMarcherOrder(db, { beat: 24, marcherIds: ids });
        await setMarcherOrder(db, { beat: 25, order: reversed });
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(reversed);
        // The beat at 24 goes: both marks land on 24
        const beat24 = await db
            .select({ id: schema.beats.id })
            .from(schema.beats)
            .where(eq(schema.beats.position, 24))
            .get();
        await deleteBeats({ db, beatIds: new Set([beat24!.id]) });
        await timelineResolverSettled();
        expect(await rememberedOrderAt(db, ids, 24)).toEqual(reversed);
        // One mark left, holding everyone
        const marks = async () =>
            (await readAllShapeRecipes(db)).filter((r) =>
                ["order", "orderClear"].includes(r.kind),
            );
        expect((await marks()).map((m) => m.kind)).toEqual(["order"]);

        expect((await performUndo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, 24)).toBeNull();
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(reversed);
        expect((await performRedo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, 24)).toEqual(reversed);
    });
});

describe("orderMarkPlace: an order mark's own beat after a page or beat edit", () => {
    /** Page 0 is beat 0; pages 1–4 of 8 counts; beat ids are 100 + the ordinal */
    const PAGES = [
        { id: 1, start: 0, end: 1 },
        { id: 2, start: 1, end: 9 },
        { id: 3, start: 9, end: 17 },
        { id: 4, start: 17, end: 25 },
        { id: 5, start: 25, end: 33 },
    ];
    const grid = (beatIds: number[], pages = PAGES) => ({ beatIds, pages });
    const BEATS = Array.from({ length: 33 }, (_, i) => 100 + i);

    it("follows its page flag, or its count, when beats go in before it", () => {
        // Two beats after beat 12, inside page 3 [9, 17)
        const after = grid(
            [...BEATS.slice(0, 13), 900, 901, ...BEATS.slice(13)],
            [
                PAGES[0]!,
                PAGES[1]!,
                { id: 3, start: 9, end: 19 },
                { id: 4, start: 19, end: 27 },
                { id: 5, start: 27, end: 35 },
            ],
        );
        const place = orderMarkPlace(grid(BEATS), after);
        expect(place(25)).toBe(27);
        expect(place(17)).toBe(19);
        expect(place(33)).toBe(35);
        expect(place(9)).toBe(9);
        expect(place(5)).toBe(5);
    });

    it("goes with a page that's deleted, inside it or on its end flag", () => {
        // Page 4 [17, 25) and its beats deleted
        const after = grid(
            [...BEATS.slice(0, 17), ...BEATS.slice(25)],
            [PAGES[0]!, PAGES[1]!, PAGES[2]!, { id: 5, start: 17, end: 25 }],
        );
        const place = orderMarkPlace(grid(BEATS), after);
        expect(place(25)).toBeNull();
        expect(place(21)).toBeNull();
        // On its start flag: said about the page before, which stays
        expect(place(17)).toBe(17);
        expect(place(33)).toBe(25);
    });
});
