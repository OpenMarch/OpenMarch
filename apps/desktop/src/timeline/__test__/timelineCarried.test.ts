// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxShape } from "@/shapes/box/boxShape";
import { drawBox } from "@/shapes/box/boxGeometry";
import { boxesAt, type PlacedRecipe } from "@/shapes/placed/placedBox";
import { carriedMembers, carriedStretches } from "../timelineCarried";
import type { ToolEnv } from "@/shapes/tool/toolKind";
import type { ShapeContext, XY } from "@/shapes/types";
import type { CarrySpan } from "../timelineCarryForward";
import { marcherDecided, notDefinedAt } from "../timelineDecided";
import {
    marcherHolds,
    selectionHolds,
    type SelectionHolds,
} from "../timelineHoldBars";

/**
 * A shape carried on draws its members solid on the field (#478) and on the timeline (#477) by one
 * rule (`carriedStretches`, `boxesAt`). Pages flag at 8, 16, 24 and 32 (spec beats).
 */

const STEP = 10;
const half = STEP / 2;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({
        x: Math.round(p.x / half) * half,
        y: Math.round(p.y / half) * half,
    }),
    hitRadius: 3,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const SHOW_END = 32;
const BOX_MOVE = 10;

/** A box of marchers 1–4 placed in move `BOX_MOVE`, which ends on page 2's flag (beat 8) */
function boxRecipe(): PlacedRecipe {
    const params = drawBox({ x: 0, y: 0 }, { x: 40, y: 40 }, 4, env)!;
    const slots = boxShape.generate(params, 4, ctx);
    return {
        id: 1,
        timelineId: BOX_MOVE,
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
    };
}

const endBeatOf = (id: number | null) =>
    id === null ? 0 : id === BOX_MOVE ? 8 : undefined;

const move = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "founding",
});
const hold = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "hold",
});

/**
 * Marchers 1–4 walk into the box on page 2 (beats 0–8) and stand on its spots. On page 3 (8–16),
 * `four` says what marcher 4 does: stands still with the rest, is dragged off alone, or walks off
 * and back onto its spot.
 */
function show(four: "stays" | "off" | "offAndBack") {
    const recipe = boxRecipe();
    const spot = new Map(recipe.members.map((m) => [m.marcherId, m]));
    const OFF: XY = { x: 200, y: 200 };
    const still = [move(0, 8), hold(8, Infinity)];
    const spans = new Map<number, CarrySpan[]>([
        [1, still],
        [2, still],
        [3, still],
        [
            4,
            four === "stays"
                ? still
                : [move(0, 8), move(8, 16), hold(16, Infinity)],
        ],
    ]);
    const spansOf = (id: number) => spans.get(id) ?? [];
    const positionAt = (id: number, beat: number): XY | undefined => {
        const s = spot.get(id);
        if (!s) return undefined;
        const home = { x: -100, y: -100 };
        if (beat <= 8) {
            const t = beat / 8;
            return {
                x: home.x + (s.x - home.x) * t,
                y: home.y + (s.y - home.y) * t,
            };
        }
        if (id !== 4 || four === "stays") return { x: s.x, y: s.y };
        // Out and, for offAndBack, back again by the flag
        const t = Math.min(1, (beat - 8) / 8);
        const away = four === "off" ? t : 1 - Math.abs(2 * t - 1);
        return { x: s.x + (OFF.x - s.x) * away, y: s.y + (OFF.y - s.y) * away };
    };
    return { recipe, spansOf, positionAt };
}

/** The bar kind drawn over `[c - 1, c)` for `id`, or undefined where it has no bar */
const barKindAt = (holds: SelectionHolds, id: number, c: number) =>
    holds.bars.find(
        (b) => b.marcherIds.includes(id) && b.start <= c - 1 && c <= b.end,
    )?.kind;

/** The selection's bars and the field's Not defined marchers, count by count, as the app reads them */
function barsAndField(four: "stays" | "off" | "offAndBack", ids: number[]) {
    const { recipe, spansOf, positionAt } = show(four);
    const recipes = [recipe];
    const carried = carriedStretches({
        marcherIds: ids,
        within: ids.flatMap((id) => marcherHolds(spansOf(id), SHOW_END)),
        recipes,
        endBeatOf,
        spansOf,
        positionAt,
    });
    const holds = selectionHolds({
        marcherIds: ids,
        spansOf,
        marks: [],
        showEnd: SHOW_END,
        carriedOf: (id) => carried.get(id),
    });
    const decided = new Map(
        ids.map((id) => [id, marcherDecided(spansOf(id), [])]),
    );
    const fieldAt = (c: number) =>
        notDefinedAt(decided, c, () =>
            carriedMembers(
                boxesAt({
                    recipes,
                    endBeatOf,
                    beat: c,
                    positionOf: (id) => positionAt(id, c),
                }),
            ),
        );
    return { holds, fieldAt, spansOf };
}

/** Every count in a hold of one of `ids`: the bar is Held exactly where the field draws it decided */
function expectAgreement(four: "stays" | "off" | "offAndBack", ids: number[]) {
    const { holds, fieldAt, spansOf } = barsAndField(four, ids);
    for (let c = 1; c <= SHOW_END; c++) {
        const field = fieldAt(c);
        for (const id of ids) {
            const inHold = marcherHolds(spansOf(id), SHOW_END).some(
                (h) => h.start <= c - 1 && c <= h.end,
            );
            if (!inHold) continue;
            expect({ count: c, id, bar: barKindAt(holds, id, c) }).toEqual({
                count: c,
                id,
                bar: field.has(id) ? "notDefined" : "held",
            });
        }
    }
    return holds;
}

describe("a shape carried on: the timeline's bars and the field agree", () => {
    it("while every member stands on its spot, the whole box draws Held to the end", () => {
        const holds = expectAgreement("stays", [1, 2, 3, 4]);
        expect(
            holds.bars.map((b) => [b.start, b.end, b.kind, b.shape]),
        ).toEqual([[8, SHOW_END, "held", true]]);
    });

    it("once one member is dragged off alone, the rest draw Not defined on both", () => {
        const holds = expectAgreement("off", [1, 2, 3]);
        expect(
            holds.bars.map((b) => [b.start, b.end, b.kind, b.shape]),
        ).toEqual([[8, SHOW_END, "notDefined", false]]);
    });

    it("a member that walks off and back carries the box again from the count it's back", () => {
        const holds = expectAgreement("offAndBack", [1, 2, 3, 4]);
        expect(
            holds.bars
                .filter((b) => b.marcherIds.includes(1))
                .map((b) => [b.start, b.end, b.kind]),
        ).toEqual([
            [8, 15, "notDefined"],
            [15, SHOW_END, "held"],
        ]);
    });
});
