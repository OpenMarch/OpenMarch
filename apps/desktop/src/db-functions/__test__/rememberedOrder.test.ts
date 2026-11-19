import { afterEach, describe, expect, it } from "vitest";
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
import { boxMembershipEdit } from "@/shapes/placed/boxMembership";
import {
    ordersInForce,
    rememberedOrder,
    rememberedOrderAt,
    type OrderForm,
} from "../rememberedOrder";

/**
 * The order the show remembers for a line (pathways step 4f, DL-21, QA-DL-19 to QA-DL-25): the
 * most recent form that takes the marchers sets their order, until a later one takes them; a
 * marcher moved off its spot by hand keeps it.
 */

const trail = (endBeat: number, order: number[]): OrderForm => ({
    endBeat,
    kind: "trail",
    order,
});
const line = (endBeat: number, order: (number | null)[]): OrderForm => ({
    endBeat,
    kind: "line",
    order,
});
const clear = (endBeat: number, marcherIds: number[]): OrderForm => ({
    endBeat,
    kind: "clear",
    marcherIds,
});

/** The staggered rows of the owner's report: front G16…G24, back G17…G23, walked as a zigzag */
const ZIGZAG = [16, 17, 18, 19, 20, 21, 22, 23, 24];

describe("rememberedOrder", () => {
    it("QA-DL-19: a trail's order holds at a later start flag; its ends are the first and last", () => {
        const order = rememberedOrder(
            [trail(17, ZIGZAG)],
            [24, 18, 16, 20, 22, 17, 19, 21, 23],
            25,
        );
        expect(order).toEqual(ZIGZAG);
        expect([order![0], order!.at(-1)]).toEqual([16, 24]);
    });

    it("QA-DL-20: a subset of the line keeps the line's order (every other marcher: 1st, 3rd, 5th…)", () => {
        expect(
            rememberedOrder([trail(17, ZIGZAG)], [24, 20, 16, 22, 18], 17),
        ).toEqual([16, 18, 20, 22, 24]);
        expect(
            rememberedOrder([line(9, [5, 3, 1, 2, 4])], [4, 1, 5], 9),
        ).toEqual([5, 1, 4]);
    });

    it("QA-DL-21: a later shape over the same marchers redefines their order", () => {
        const forms = [trail(9, [1, 2, 3, 4]), line(17, [3, 1, 4, 2])];
        expect(rememberedOrder(forms, [1, 2, 3, 4], 17)).toEqual([3, 1, 4, 2]);
        // Before the later one is made, the earlier holds
        expect(rememberedOrder(forms, [1, 2, 3, 4], 16)).toEqual([1, 2, 3, 4]);
        // A shape with no line order (a box) takes them too: nothing is remembered
        expect(
            rememberedOrder(
                [...forms, clear(25, [1, 2, 3, 4])],
                [1, 2, 3, 4],
                25,
            ),
        ).toBeNull();
    });

    it("QA-DL-22: a later form that takes only some of them gives no order (it is guessed)", () => {
        const forms = [trail(9, [1, 2, 3, 4, 5]), line(17, [5, 4, 3])];
        expect(rememberedOrder(forms, [1, 2, 3, 4, 5], 17)).toBeNull();
        // In the same order as the line, and with no holes, it still redefines them
        expect(
            rememberedOrder(
                [trail(9, [1, 2, 3, 4, 5]), line(17, [3, 4, 5])],
                [1, 2, 3, 4, 5],
                17,
            ),
        ).toBeNull();
        // Those it took have its order
        expect(rememberedOrder(forms, [3, 5], 17)).toEqual([5, 3]);
        // A form that holds none of them doesn't count
        expect(
            rememberedOrder(
                [trail(9, [1, 2, 3]), line(17, [7, 8])],
                [1, 2, 3],
                17,
            ),
        ).toEqual([1, 2, 3]);
    });

    it("QA-DL-23: an ungrouped mark clears the order; a shape placed after it sets one again", () => {
        const forms = [trail(9, [1, 2, 3]), clear(17, [2])];
        expect(rememberedOrder(forms, [1, 2, 3], 17)).toBeNull();
        expect(rememberedOrder(forms, [1, 2, 3], 16)).toEqual([1, 2, 3]);
        expect(
            rememberedOrder([...forms, line(25, [3, 2, 1])], [1, 2, 3], 25),
        ).toEqual([3, 2, 1]);
    });

    it("QA-DL-24: with no forms there is no order", () => {
        expect(rememberedOrder([], [1, 2, 3], 17)).toBeNull();
        expect(
            rememberedOrder([trail(25, [1, 2, 3])], [1, 2, 3], 17),
        ).toBeNull();
        expect(rememberedOrder([trail(9, [1, 2, 3])], [], 17)).toBeNull();
    });

    it("QA-DL-25: a marcher moved off a shape by hand keeps the order: its hole holds its place", () => {
        // Moved in the shape's own move: the shape is saved with a hole where they stood
        expect(
            rememberedOrder([line(9, [4, null, 2, 3])], [1, 2, 3, 4], 9),
        ).toEqual([4, 1, 2, 3]);
        // Moved on a later page: the later copy, with its hole, carries the order on
        const forms = [line(9, [4, 1, 2, 3]), line(17, [4, null, 2, 3])];
        expect(rememberedOrder(forms, [1, 2, 3, 4], 17)).toEqual([4, 1, 2, 3]);
        // A trail over them holds all of them, whatever its shape lost in the same move
        expect(
            rememberedOrder(
                [line(9, [4, null, 2, 3]), trail(9, [4, 1, 2, 3])],
                [1, 2, 3, 4],
                9,
            ),
        ).toEqual([4, 1, 2, 3]);
        // Two gone from one shape with nothing earlier: where each stood isn't known
        expect(
            rememberedOrder([line(9, [4, null, null, 3])], [1, 2, 3, 4], 9),
        ).toBeNull();
        // A copy whose order disagrees isn't a copy: it redefines, and who left its hole isn't known
        expect(
            rememberedOrder(
                [line(9, [4, 1, 2, 3]), line(17, [2, null, 4, 3])],
                [1, 2, 3, 4],
                17,
            ),
        ).toBeNull();
        // ...unless the order before it held them there
        expect(
            rememberedOrder(
                [line(9, [2, 1, 4, 3]), line(17, [2, null, 4, 3])],
                [1, 2, 3, 4],
                17,
            ),
        ).toEqual([2, 1, 4, 3]);
    });
});

const set = (endBeat: number, order: (number | null)[]): OrderForm => ({
    endBeat,
    kind: "set",
    order,
});
const unset = (endBeat: number, marcherIds: number[]): OrderForm => ({
    endBeat,
    kind: "unset",
    marcherIds,
});

describe("rememberedOrder: orders set by hand (step 4g)", () => {
    it("DL-26: an order set by hand holds like a placed shape, and wins over any form at its beat", () => {
        const forms = [line(9, [1, 2, 3, 4]), set(9, [4, 2, 3, 1])];
        expect(rememberedOrder(forms, [1, 2, 3, 4], 9)).toEqual([4, 2, 3, 1]);
        expect(rememberedOrder(forms, [1, 2, 3, 4], 25)).toEqual([4, 2, 3, 1]);
        expect(
            rememberedOrder(
                [trail(9, [1, 2, 3, 4]), set(9, [4, 2, 3, 1])],
                [1, 2, 3, 4],
                9,
            ),
        ).toEqual([4, 2, 3, 1]);
        // A later shape redefines it
        expect(
            rememberedOrder(
                [...forms, line(17, [1, 2, 3, 4])],
                [1, 2, 3, 4],
                17,
            ),
        ).toEqual([1, 2, 3, 4]);
    });

    it("DL-29: Clear order ends it, even at the beat of a trail or a shape; a later form sets one again", () => {
        const forms = [trail(9, [1, 2, 3]), unset(9, [1, 2, 3])];
        expect(rememberedOrder(forms, [1, 2, 3], 9)).toBeNull();
        expect(
            rememberedOrder([...forms, set(17, [2, 1, 3])], [1, 2, 3], 17),
        ).toEqual([2, 1, 3]);
        // Cleared for some of the line: the line's order is no longer known for all of them
        expect(
            rememberedOrder([set(9, [1, 2, 3]), unset(17, [2])], [1, 2, 3], 17),
        ).toBeNull();
        expect(
            rememberedOrder([set(9, [1, 2, 3]), unset(17, [2])], [1, 3], 17),
        ).toEqual([1, 3]);
    });

    it("DL-28: a later copy with a hole carries a reversed order on, either way along it", () => {
        // A Line, reversed by hand on its page, then copied on a later page with a member gone
        const forms = [
            line(9, [1, 2, 3, 4]),
            set(9, [4, 3, 2, 1]),
            line(17, [1, null, 3, 4]),
        ];
        expect(rememberedOrder(forms, [1, 2, 3, 4], 17)).toEqual([4, 3, 2, 1]);
    });

    it("a copy running the other way only carries on an order set by hand: a Line placed reversed after a trail sets its own, holes and all", () => {
        // A trail, then a Line placed the other way round with a member dragged off it
        const forms = [trail(16, [1, 2, 3, 4]), line(24, [4, 3, null, 1])];
        expect(rememberedOrder(forms, [1, 3, 4], 24)).toEqual([4, 3, 1]);
        expect(ordersInForce(forms, 24)).toEqual([
            { order: [4, 3, 1], kind: "line" },
        ]);
        // The same direction still carries the trail on
        expect(
            rememberedOrder(
                [trail(16, [1, 2, 3, 4]), line(24, [1, null, 3, 4])],
                [1, 2, 3, 4],
                24,
            ),
        ).toEqual([1, 2, 3, 4]);
        // Set by hand instead: either way carries it on
        expect(
            rememberedOrder(
                [set(16, [1, 2, 3, 4]), line(24, [4, 3, null, 1])],
                [1, 3, 4],
                24,
            ),
        ).toEqual([1, 3, 4]);
    });
});

describe("ordersInForce (Show order's Always, step 4g)", () => {
    it("is each line whose order holds, kept to the marchers no later form took", () => {
        const forms = [
            trail(9, [1, 2, 3, 4]),
            set(9, [7, 6, 5]),
            clear(17, [2]),
            line(17, [9, 8]),
        ];
        expect(ordersInForce(forms, 9)).toEqual([
            { order: [1, 2, 3, 4], kind: "trail" },
            { order: [7, 6, 5], kind: "set" },
        ]);
        expect(ordersInForce(forms, 17)).toEqual([
            { order: [1, 3, 4], kind: "trail" },
            { order: [7, 6, 5], kind: "set" },
            { order: [9, 8], kind: "line" },
        ]);
        // One left of a line is no line
        expect(ordersInForce([set(9, [1, 2]), unset(17, [1])], 17)).toEqual([]);
    });

    it("a copy with holes that agrees carries the line on", () => {
        expect(
            ordersInForce(
                [set(9, [4, 3, 2, 1]), line(17, [1, null, 3, 4])],
                17,
            ),
        ).toEqual([{ order: [4, 3, 2, 1], kind: "set" }]);
    });
});

afterEach(() => stopTimelineResolver());

const PAGE2 = { kind: "range", start: 9, end: 17 } as const;
const resolver = () => useTimelineResolverStore.getState().resolver!;

/** Pages 1–4, nobody moved yet; four marchers */
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

/** A Line's four spots, left to right, 20 apart */
const SPOTS = [100, 120, 140, 160].map((x) => ({ x, y: 40 }));
const LINE = {
    points: [
        { x: 100, y: 40, tension: 0 },
        { x: 160, y: 40, tension: 0 },
    ],
    spacing: { mode: "fit" },
    spots: 4,
};

describeDbTests("Remembered order in the show", (it) => {
    it("QA-DL-25: a marcher who was never in the line doesn't fill its hole", () => {
        // B (2) dragged off the Line in its own move; E (5) never stood in it, and is in a form of
        // their own: plainly not the one who left
        expect(
            rememberedOrder(
                [clear(1, [5]), line(9, [1, null, 3, 4])],
                [1, 3, 4, 5],
                9,
            ),
        ).toBeNull();
        // E was in another line before this one: not the one who left this hole
        expect(
            rememberedOrder(
                [line(1, [5, 6, 7]), line(9, [1, null, 3, 4])],
                [1, 3, 4, 5],
                9,
            ),
        ).toBeNull();
    });

    it("QA-DL-25: a Line placed on page 2, one member dragged off by hand: the order holds at page 3", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        // Along the Line, left to right: the 3rd, the 1st, the 4th, the 2nd
        const along = [ids[2]!, ids[0]!, ids[3]!, ids[1]!];
        await moveMarchersInTarget({
            db,
            target: PAGE2,
            moves: along.map((marcherId, slot) => ({
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
                    members: along.map((marcherId, slot) => ({
                        marcherId,
                        slot,
                        ...SPOTS[slot]!,
                    })),
                });
            },
        });
        await timelineResolverSettled();
        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(along);

        // The 1st (second along the Line) dragged off by hand, as the field's edits do
        const moves = [{ marcherId: ids[0]!, x: 300, y: 300 }];
        const membership = boxMembershipEdit({
            moves,
            beat: PAGE2.end,
            positionOf: (id) => {
                const [x, y] = resolver().positionAt(id, PAGE2.end);
                return { x, y };
            },
        });
        await moveMarchersInTarget({
            db,
            target: PAGE2,
            moves,
            afterWrite: membership.afterWrite,
        });
        await timelineResolverSettled();
        const [saved] = await readAllShapeRecipes(db);
        expect(saved!.members.map((m) => m.marcherId)).not.toContain(ids[0]);

        expect(await rememberedOrderAt(db, ids, PAGE2.end)).toEqual(along);
        expect(await rememberedOrderAt(db, ids, 25)).toEqual(along);
        // Before it was placed, nothing is remembered
        expect(await rememberedOrderAt(db, ids, PAGE2.start)).toBeNull();
    });
});
