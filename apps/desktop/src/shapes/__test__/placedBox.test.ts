// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { boxShape } from "../box/boxShape";
import { boxTool } from "../box/boxTool";
import { drawBox, filesOf, ranksOf, type BoxSize } from "../box/boxGeometry";
import {
    boxesAt,
    membershipAfter,
    movedBox,
    resplit,
    withoutMembers,
    type PlacedBox,
    type PlacedRecipe,
} from "../placed/placedBox";
import type { ToolEnv } from "../tool/toolKind";
import type { ShapeContext, XY } from "../types";

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

/** A placed box of `n` marchers (ids 1..n) drawn from (0,0) to `to`, in move `timelineId` */
function recipe(
    n: number,
    to: XY,
    timelineId: number | null,
    id = 1,
): PlacedRecipe {
    const params = drawBox({ x: 0, y: 0 }, to, n, env)!;
    const slots = boxShape.generate(params, n, ctx);
    return {
        id,
        timelineId,
        kind: "block",
        kindVersion: 1,
        params: { ...params, spots: n },
        orderMode: "nearest",
        reverse: false,
        members: slots.map((s, i) => ({
            marcherId: i + 1,
            slot: i,
            x: s.x,
            y: s.y,
        })),
    };
}

const at = (r: PlacedRecipe) =>
    new Map(r.members.map((m) => [m.marcherId, { x: m.x, y: m.y }]));

describe("which placed box holds at a moment", () => {
    const ends = new Map<number | null, number>([
        [null, 0],
        [10, 8],
        [20, 16],
    ]);
    const endBeatOf = (id: number | null) => ends.get(id);

    it("shows a box at its move's end and later, while every member stands on its spot", () => {
        const r = recipe(4, { x: 40, y: 40 }, 10);
        const positions = at(r);
        const find = (beat: number) =>
            boxesAt({
                recipes: [r],
                endBeatOf,
                beat,
                positionOf: (id) => positions.get(id),
            });
        expect(find(8)).toHaveLength(1);
        expect(find(30)).toHaveLength(1);
        // Before its move ends, it isn't there yet
        expect(find(4)).toHaveLength(0);
    });

    it("hides the box once any member stands elsewhere", () => {
        const r = recipe(4, { x: 40, y: 40 }, 10);
        const positions = at(r);
        positions.set(2, { x: 99, y: 99 });
        expect(
            boxesAt({
                recipes: [r],
                endBeatOf,
                beat: 12,
                positionOf: (id) => positions.get(id),
            }),
        ).toHaveLength(0);
    });

    it("takes the latest box when an earlier one still matches", () => {
        const early = recipe(4, { x: 40, y: 40 }, 10, 1);
        const late = { ...recipe(4, { x: 40, y: 40 }, 20, 2) };
        const positions = at(late);
        const found = boxesAt({
            recipes: [early, late],
            endBeatOf,
            beat: 20,
            positionOf: (id) => positions.get(id),
        });
        expect(found.map((b) => b.recipe.id)).toEqual([2]);
        expect(found[0]!.endBeat).toBe(16);
    });

    it("counts a box's spots, not its members, so a hole stays a hole", () => {
        const r = withoutMembers(recipe(4, { x: 40, y: 40 }, null), [3]);
        const positions = at(r);
        const [box] = boxesAt({
            recipes: [r],
            endBeatOf,
            beat: 0,
            positionOf: (id) => positions.get(id),
        });
        expect(box!.spots).toBe(4);
        expect(box!.recipe.members).toHaveLength(3);
    });

    it("skips recipes that aren't boxes or whose move is gone", () => {
        const r = recipe(4, { x: 40, y: 40 }, 99);
        const line = { ...recipe(4, { x: 40, y: 40 }, 10), kind: "line" };
        expect(
            boxesAt({
                recipes: [r, line],
                endBeatOf,
                beat: 20,
                positionOf: () => ({ x: 0, y: 0 }),
            }),
        ).toEqual([]);
    });
});

describe("what moving marchers does to a box", () => {
    const box = (): PlacedBox => {
        const r = recipe(4, { x: 40, y: 40 }, 10);
        const p = r.params as PlacedBox["params"];
        return { recipe: r, kind: boxTool, params: p, spots: 4, endBeat: 8 };
    };

    it("nothing when no member moves off its spot", () => {
        expect(membershipAfter(box(), new Map([[9, { x: 1, y: 1 }]]))).toEqual({
            type: "none",
        });
    });

    it("moves the box when every member moves the same way", () => {
        const b = box();
        const moved = new Map(
            b.recipe.members.map((m) => [
                m.marcherId,
                { x: m.x + 5, y: m.y - 10 },
            ]),
        );
        expect(membershipAfter(b, moved)).toEqual({
            type: "move",
            delta: { x: 5, y: -10 },
        });
        const out = movedBox(b, { x: 5, y: -10 });
        expect(out.params.center).toEqual({
            x: b.params.center.x + 5,
            y: b.params.center.y - 10,
        });
        expect(out.members[0]).toMatchObject({
            x: b.recipe.members[0]!.x + 5,
            y: b.recipe.members[0]!.y - 10,
        });
    });

    it("lets the moved members leave when only some move, or not all the same way", () => {
        const b = box();
        expect(membershipAfter(b, new Map([[2, { x: 99, y: 0 }]]))).toEqual({
            type: "leave",
            left: [2],
        });
        const uneven = new Map(
            b.recipe.members.map((m, i) => [
                m.marcherId,
                { x: m.x + (i === 0 ? 5 : 10), y: m.y },
            ]),
        );
        expect(membershipAfter(b, uneven)).toEqual({
            type: "leave",
            left: [1, 2, 3, 4],
        });
    });
});

describe("filling a hole", () => {
    // 5 × 4 = 20; one leaves
    const r = recipe(20, { x: 80, y: 60 }, 10);
    const params = r.params as PlacedBox["params"];
    const left = withoutMembers(r, [7]);
    const remaining = left.members.map((m) => ({
        id: m.marcherId,
        at: { x: m.x, y: m.y },
        drillRank: m.marcherId,
    }));

    it("re-split splits the remaining marchers again inside the same edges", () => {
        const out = resplit(params, 20, remaining, env, ctx);
        expect(out.members).toHaveLength(19);
        expect(out.spots).toBe(19);
        expect(filesOf(out.params) * ranksOf(out.params, 19)).toBeGreaterThan(
            0,
        );
        const xs = out.members.map((m) => m.x);
        expect(Math.min(...xs)).toBe(0);
    });
});

describe("a box recipe edited by hand (B4)", () => {
    it("counts its files as one when the stored count isn't a number", () => {
        for (const files of [NaN, Infinity, "4", null])
            expect(filesOf({ files } as unknown as BoxSize)).toBe(1);
        expect(filesOf({ files: 3.4 } as BoxSize)).toBe(3);
    });

    it.each([
        ["files", "four"],
        ["files", Infinity],
        ["across", "20"],
        ["across", -10],
        ["deep", null],
    ])(
        "isn't shown when its %s is %s, as a kind it can't draw isn't",
        (key, value) => {
            const r = recipe(4, { x: 40, y: 40 }, 10);
            const broken = {
                ...r,
                params: { ...(r.params as object), [key]: value },
            };
            const show = (rec: PlacedRecipe) =>
                boxesAt({
                    recipes: [rec],
                    endBeatOf: () => 8,
                    beat: 8,
                    positionOf: (id) => at(r).get(id),
                });
            expect(show(r)).toHaveLength(1);
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            try {
                expect(show(broken)).toEqual([]);
                expect(warn).toHaveBeenCalledWith(
                    expect.stringContaining(`shape ${r.id}`),
                );
            } finally {
                warn.mockRestore();
            }
        },
    );
});
