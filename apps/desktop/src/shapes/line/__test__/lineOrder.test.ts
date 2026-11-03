import { describe, expect, it } from "vitest";
import { lineTool } from "../lineTool";
import type { LineParams } from "../lineGeometry";
import { boxTool } from "../../box/boxTool";
import { drawBox } from "../../box/boxGeometry";
import { liveTargets, recalculatedTargets } from "../../placed/liveBox";
import {
    boxesAt,
    type PlacedBox,
    type PlacedRecipe,
} from "../../placed/placedBox";
import { placedOrderChoice, withPlacedOrder } from "../../placed/placedOrder";
import { recipeOrderFields } from "../../placed/commitBox";
import { placementOf } from "../../tool/shapePlacement";
import type { ToolEnv } from "../../tool/toolKind";
import {
    canRecalculate,
    edit,
    keepOrderOffered,
    openTool,
    pointerMove,
    press,
    recalculate,
    redo,
    release,
    setOrder,
    slotsOf,
    switchKind,
    targetsOf,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import { orderChoiceOf, type AssignMarcher } from "../../assign";
import type { ShapeContext, XY } from "../../types";

/**
 * Who goes where on a Line (#528, spec #522): Least travel by default, Keep order when every
 * selected marcher is a member of one placed Line (they keep their order along it), and Reverse
 * order, which flips which end gets the first marcher. Driven through the shape session with the real
 * Line kind, and read back from recipes as the database keeps them.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };

const N = 5;

/**
 * A placed Line of marchers 1..5 along y = 100, its first spot at the right end (x = 180) and its
 * last at the left (x = 100): marcher 1 is first along it, at the right.
 */
function placedLine(id = 1, ids = [1, 2, 3, 4, 5], y = 100): PlacedBox {
    const params: LineParams = {
        points: [
            { x: 180, y, tension: 0 },
            { x: 100, y, tension: 0 },
        ],
        spacing: { mode: "fit" },
    };
    const slots = lineTool.shape.generate(params, ids.length, ctx);
    return readBack({
        id,
        timelineId: 10,
        kind: "line",
        kindVersion: 2,
        params: { ...params, spots: ids.length },
        orderMode: "nearest",
        reverse: false,
        members: ids.map((marcherId, slot) => ({
            marcherId,
            slot,
            x: slots[slot]!.x,
            y: slots[slot]!.y,
        })),
    });
}

/** A recipe read back as a placed shape, everyone on their spot */
function readBack(recipe: PlacedRecipe): PlacedBox {
    const at = new Map(recipe.members.map((m) => [m.marcherId, m]));
    const [placed] = boxesAt({
        recipes: [recipe],
        endBeatOf: () => 8,
        beat: 8,
        positionOf: (id) => at.get(id),
    });
    return placed!;
}

/** The marchers where `boxes` put them, in `ids` order, ranked by id */
function standing(boxes: readonly PlacedBox[], ids: number[]) {
    const at = new Map(
        boxes.flatMap((b) => b.recipe.members.map((m) => [m.marcherId, m])),
    );
    return ids.map(
        (id, i): AssignMarcher => ({
            id,
            at: { x: at.get(id)?.x ?? 400 + id, y: at.get(id)?.y ?? 400 },
            drillRank: i,
        }),
    );
}

const fromLine = (ids = [1, 2, 3, 4, 5], boxes = [placedLine()]) =>
    withPlacedOrder(standing(boxes, ids), boxes);

/** A Line drawn from `from` to `to` on `marchers` */
function drawn(marchers: readonly AssignMarcher[], from: XY, to: XY) {
    let t = openTool(lineTool, marchers);
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx);
}

/**
 * The new line, drawn left to right below the old one: its first spot is at the left (x = 100),
 * so least travel puts marcher 5 (at the left) first and Keep order puts marcher 1 first
 */
const intoNewLine = (marchers: readonly AssignMarcher[]) =>
    drawn(marchers, { x: 100, y: 200 }, { x: 180, y: 200 });

/** Marcher ids in the order of the spots they take along the open line */
function alongOrder(t: ToolState): number[] {
    const targets = targetsOf(t, ctx);
    return [...targets].sort((a, b) => a.slot - b.slot).map((x) => x.id);
}

describe("the order on a line", () => {
    it("is Least travel on marchers that aren't from a placed line, with Keep order not offered", () => {
        const t = intoNewLine(standing([], [1, 2, 3, 4, 5]));
        expect(t.order).toBe("nearest");
        expect(keepOrderOffered(t)).toBe(false);
    });

    it("is Keep order when every selected marcher is a member of one placed line", () => {
        const t = intoNewLine(fromLine());
        expect(keepOrderOffered(t)).toBe(true);
        expect(t.order).toBe("keep");
        // Marcher 1 was first along the old line, so is first along the new one
        expect(alongOrder(t)).toEqual([1, 2, 3, 4, 5]);
    });

    it("keeps the order along the old line for some of its members", () => {
        const t = intoNewLine(fromLine([4, 2, 5]));
        expect(t.order).toBe("keep");
        expect(alongOrder(t)).toEqual([2, 4, 5]);
    });

    it("is kept from the line holding them all when the first marcher is in two lines", () => {
        // Marcher 1 is in a line of two that comes first, and in the line of all five
        const boxes = [placedLine(2, [1, 2], 300), placedLine()];
        const t = intoNewLine(fromLine([1, 2, 3, 4, 5], boxes));
        expect(keepOrderOffered(t)).toBe(true);
        expect(t.order).toBe("keep");
        expect(alongOrder(t)).toEqual([1, 2, 3, 4, 5]);
    });

    it("is Least travel when the marchers come from two placed lines, or one isn't on any", () => {
        const two = [placedLine(1, [1, 2, 3]), placedLine(2, [4, 5], 300)];
        const mixed = intoNewLine(fromLine([1, 2, 3, 4, 5], two));
        expect(keepOrderOffered(mixed)).toBe(false);
        expect(mixed.order).toBe("nearest");
        const stray = intoNewLine(fromLine([1, 2, 3, 6]));
        expect(keepOrderOffered(stray)).toBe(false);
        expect(stray.order).toBe("nearest");
    });

    it("isn't kept from a placed box", () => {
        const params = drawBox({ x: 0, y: 0 }, { x: 20, y: 20 }, 4, env)!;
        const slots = boxTool.shape.generate(params, 4, ctx);
        const box = readBack({
            id: 3,
            timelineId: 10,
            kind: "block",
            kindVersion: 1,
            params: { ...params, spots: 4 },
            orderMode: "nearest",
            reverse: false,
            members: slots.map((s, i) => ({
                marcherId: i + 1,
                slot: i,
                x: s.x,
                y: s.y,
            })),
        });
        const t = intoNewLine(fromLine([1, 2, 3, 4], [box]));
        expect(keepOrderOffered(t)).toBe(false);
    });

    it("goes by least travel when Least travel is picked, as one undo step", () => {
        const kept = intoNewLine(fromLine());
        const nearest = setOrder(kept, "nearest", ctx);
        expect(nearest.order).toBe("nearest");
        // The left end of the new line is nearest the left end of the old
        expect(alongOrder(nearest)).toEqual([5, 4, 3, 2, 1]);
        const back = undo(nearest);
        expect(back.order).toBe("keep");
        expect(alongOrder(back)).toEqual([1, 2, 3, 4, 5]);
        expect(redo(back).order).toBe("nearest");
    });
});

describe("Reverse", () => {
    it("flips which end gets the first marcher, as one undo step", () => {
        const kept = intoNewLine(fromLine());
        const reversed = setOrder(kept, "reverse", ctx);
        expect(reversed.order).toBe("reverse");
        expect(alongOrder(reversed)).toEqual([5, 4, 3, 2, 1]);
        const back = undo(reversed);
        expect(back.order).toBe("keep");
        expect(alongOrder(back)).toEqual([1, 2, 3, 4, 5]);
    });

    it("flips marchers not from a placed line too, end for end", () => {
        const t = intoNewLine(standing([], [1, 2, 3, 4, 5]));
        const before = alongOrder(t);
        const reversed = setOrder(t, "reverse", ctx);
        expect(alongOrder(reversed)).toEqual([...before].reverse());
    });

    it("works along a line with more than two points", () => {
        const kept = intoNewLine(fromLine());
        // A U: down, across and back up, so where a spot projects isn't how far along it is
        const u: LineParams = {
            points: [
                { x: 100, y: 200, tension: 0 },
                { x: 100, y: 260, tension: 0 },
                { x: 140, y: 260, tension: 0 },
                { x: 140, y: 200, tension: 0 },
            ],
            spacing: { mode: "fit" },
        };
        const onU = edit(kept, u, ctx);
        expect(onU.order).toBe("keep");
        expect(alongOrder(recalculate(onU, ctx))).toEqual([1, 2, 3, 4, 5]);
        const spots = slotsOf(onU, ctx);
        const first = targetsOf(onU, ctx).find((x) => x.id === 1)!;
        expect(first.to).toMatchObject({ x: spots[0]!.x, y: spots[0]!.y });
        expect(alongOrder(setOrder(onU, "reverse", ctx))).toEqual([
            5, 4, 3, 2, 1,
        ]);
    });
});

describe("Recalculate on a line", () => {
    it("has nothing to do while the order is kept, where least travel would differ", () => {
        const kept = intoNewLine(fromLine());
        expect(canRecalculate(kept, ctx)).toBe(false);
        expect(recalculate(kept, ctx)).toBe(kept);
        expect(canRecalculate(setOrder(kept, "reverse", ctx), ctx)).toBe(false);
    });

    it("works the order out again after a change that held who goes where", () => {
        const nearest = setOrder(intoNewLine(fromLine()), "nearest", ctx);
        const kept = setOrder(nearest, "keep", ctx);
        // Drag the whole line: who goes where is held
        let t = press(kept, { x: 140, y: 200 }, env);
        t = pointerMove(t, { x: 140, y: 240 }, env);
        t = release(t, ctx);
        expect(alongOrder(t)).toEqual([1, 2, 3, 4, 5]);
        expect(canRecalculate(t, ctx)).toBe(false);
    });

    it("is Least travel for a kind with no order of its own", () => {
        const boxed = switchKind(intoNewLine(fromLine()), boxTool, ctx, env);
        expect(boxed.order).toBe("keep");
        expect(placementOf(boxed, ctx)!.recipe).toMatchObject({
            orderMode: "nearest",
            reverse: false,
        });
        // Back to a line, the order is kept again
        const back = switchKind(boxed, lineTool, ctx, env);
        expect(alongOrder(back)).toEqual([1, 2, 3, 4, 5]);
    });
});

describe("the order stored with a placed line", () => {
    const recipeOf = (t: ToolState): PlacedRecipe => {
        const placement = placementOf(t, ctx)!;
        return {
            ...placement.recipe,
            id: 2,
            timelineId: 11,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
    };

    it("is saved in the recipe's order mode and reverse", () => {
        const kept = intoNewLine(fromLine());
        expect(placementOf(kept, ctx)!.recipe).toMatchObject({
            orderMode: "keep",
            reverse: false,
        });
        expect(
            placementOf(setOrder(kept, "reverse", ctx), ctx)!.recipe,
        ).toMatchObject({ orderMode: "keep", reverse: true });
        expect(
            placementOf(setOrder(kept, "nearest", ctx), ctx)!.recipe,
        ).toMatchObject({ orderMode: "nearest", reverse: false });
    });

    it("reads back as the same choice", () => {
        const kept = intoNewLine(fromLine());
        for (const choice of ["keep", "reverse", "nearest"] as const)
            expect(
                placedOrderChoice(
                    readBack(recipeOf(setOrder(kept, choice, ctx))),
                ),
            ).toBe(choice);
    });

    it("reads an older recipe's drill order as Least travel", () => {
        const placed = placedLine();
        expect(
            placedOrderChoice({
                ...placed,
                recipe: { ...placed.recipe, orderMode: "drill" },
            }),
        ).toBe("nearest");
    });

    it("lays the placed line out again in the order picked, members keeping theirs", () => {
        const placed = readBack(recipeOf(intoNewLine(fromLine())));
        const slotOf = (members: { marcherId: number; slot: number }[]) =>
            new Map(members.map((m) => [m.marcherId, m.slot]));
        const reversed = liveTargets(
            placed,
            placed.params,
            ctx,
            true,
            undefined,
            "reverse",
        ).members;
        expect(slotOf(reversed)).toEqual(
            new Map(
                placed.recipe.members.map((m) => [m.marcherId, N - 1 - m.slot]),
            ),
        );
        const kept = liveTargets(
            placed,
            placed.params,
            ctx,
            true,
            undefined,
            "keep",
        ).members;
        expect(slotOf(kept)).toEqual(slotOf([...placed.recipe.members]));
    });

    it("has Recalculate keep the stored order", () => {
        const placed = readBack(recipeOf(intoNewLine(fromLine())));
        // From the start flag, least travel would put them the other way round
        const origins = new Map(
            placed.recipe.members.map((m) => [
                m.marcherId,
                { x: 280 - m.x, y: m.y },
            ]),
        );
        expect(recalculatedTargets(placed, ctx, origins)).toBeNull();
        const nearest = readBack({
            ...recipeOf(intoNewLine(fromLine())),
            orderMode: "nearest",
        });
        expect(recalculatedTargets(nearest, ctx, origins)).not.toBeNull();
    });
});

describe("the order picked on a placed line", () => {
    const recipeOf = (t: ToolState): PlacedRecipe => {
        const placement = placementOf(t, ctx)!;
        return {
            ...placement.recipe,
            id: 2,
            timelineId: 11,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
    };
    const slotOf = (members: readonly { marcherId: number; slot: number }[]) =>
        new Map(members.map((m) => [m.marcherId, m.slot]));
    const kept = () => readBack(recipeOf(intoNewLine(fromLine())));
    const reversed = () =>
        readBack(recipeOf(setOrder(intoNewLine(fromLine()), "reverse", ctx)));
    const pick = (placed: PlacedBox, choice: "nearest" | "keep" | "reverse") =>
        liveTargets(placed, placed.params, ctx, true, undefined, choice);

    it("has Recalculate leave a line saved as Reverse as it is", () => {
        const placed = reversed();
        expect(placedOrderChoice(placed)).toBe("reverse");
        // From the start flag, least travel would put them the other way round
        const origins = new Map(
            placed.recipe.members.map((m) => [
                m.marcherId,
                { x: 280 - m.x, y: m.y },
            ]),
        );
        expect(recalculatedTargets(placed, ctx, origins)).toBeNull();
        expect(slotOf(pick(placed, "reverse").members)).toEqual(
            slotOf(placed.recipe.members),
        );
    });

    it("reads a line saved as Reverse as Reverse order, and saves Keep order as before", () => {
        expect(placedOrderChoice(reversed())).toBe("reverse");
        expect(orderChoiceOf("keep", true)).toBe("reverse");
        expect(recipeOrderFields(reversed(), "keep")).toEqual({
            orderMode: "keep",
            reverse: false,
        });
    });

    it("ignores a reverse stored with Least travel, and clears it on the next save", () => {
        const placed = kept();
        const stray = {
            ...placed,
            recipe: { ...placed.recipe, orderMode: "nearest", reverse: true },
        };
        expect(placedOrderChoice(stray)).toBe("nearest");
        expect(recipeOrderFields(stray, placedOrderChoice(stray))).toEqual({
            orderMode: "nearest",
            reverse: false,
        });
    });

    it("puts a line saved as Reverse back in order when Keep order is picked", () => {
        expect(slotOf(pick(reversed(), "keep").members)).toEqual(
            slotOf(kept().recipe.members),
        );
    });

    /** A placed line of 8 spots along y = 100 with 6 members, spots 2 and 5 empty */
    function holedLine(reverse = false): PlacedBox {
        const params: LineParams = {
            points: [
                { x: 100, y: 100, tension: 0 },
                { x: 170, y: 100, tension: 0 },
            ],
            spacing: { mode: "fit" },
        };
        const slots = lineTool.shape.generate(params, 8, ctx);
        return readBack({
            id: 4,
            timelineId: 10,
            kind: "line",
            kindVersion: 2,
            params: { ...params, spots: 8 },
            orderMode: "keep",
            reverse,
            members: [0, 1, 3, 4, 6, 7].map((slot, i) => ({
                marcherId: i + 1,
                slot,
                x: slots[slot]!.x,
                y: slots[slot]!.y,
            })),
        });
    }

    it("keeps a line's holes whichever order is picked", () => {
        const placed = holedLine();
        const flipped = pick(placed, "reverse");
        expect(flipped.spots).toBe(8);
        expect(slotOf(flipped.members)).toEqual(
            new Map(
                placed.recipe.members.map((m) => [m.marcherId, 7 - m.slot]),
            ),
        );
        const back = pick(holedLine(true), "keep");
        expect(back.spots).toBe(8);
        expect(slotOf(back.members)).toEqual(
            new Map(
                placed.recipe.members.map((m) => [m.marcherId, 7 - m.slot]),
            ),
        );
        // Least travel from where they stand: nobody moves, the holes stay
        const nearest = pick(placed, "nearest");
        expect(nearest.spots).toBe(8);
        expect(slotOf(nearest.members)).toEqual(slotOf(placed.recipe.members));
        // From elsewhere, still on 8 spots, each on their own
        const origins = new Map(
            placed.recipe.members.map((m) => [
                m.marcherId,
                { x: 270 - m.x, y: m.y },
            ]),
        );
        const moved = liveTargets(
            placed,
            placed.params,
            ctx,
            true,
            origins,
            "nearest",
        );
        expect(moved.spots).toBe(8);
        expect(new Set(moved.members.map((m) => m.slot)).size).toBe(6);
        expect(slotOf(moved.members).get(1)).toBe(7);
    });

    it("is saved with the recipe, and a kind without an order keeps its stored reverse", () => {
        expect(recipeOrderFields(kept(), "reverse")).toEqual({
            orderMode: "keep",
            reverse: true,
        });
        expect(recipeOrderFields(kept(), "nearest")).toEqual({
            orderMode: "nearest",
            reverse: false,
        });
        const params = drawBox({ x: 0, y: 0 }, { x: 20, y: 20 }, 4, env)!;
        const slots = boxTool.shape.generate(params, 4, ctx);
        const box = readBack({
            id: 3,
            timelineId: 10,
            kind: "block",
            kindVersion: 1,
            params: { ...params, spots: 4 },
            orderMode: "keep",
            reverse: true,
            members: slots.map((s, i) => ({
                marcherId: i + 1,
                slot: i,
                x: s.x,
                y: s.y,
            })),
        });
        expect(recipeOrderFields(box, "keep")).toEqual({
            orderMode: "nearest",
        });
    });
});
