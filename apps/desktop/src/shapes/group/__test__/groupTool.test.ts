// @vitest-environment node
// cspell:ignore nesw
import { describe, expect, it } from "vitest";
import { boxShape } from "../../box/boxShape";
import { drawBox } from "../../box/boxGeometry";
import { DEGREE } from "../../frame/frame";
import { flipShape, turnShape } from "../../frame/gestures";
import { withPivot } from "../../frame/pivot";
import { scaleKeepingRatio } from "../../frame/scale";
import {
    boxesAt,
    membershipAfter,
    movedBox,
    PLACED_KINDS,
    UNGROUPED_KIND,
    type PlacedRecipe,
} from "../../placed/placedBox";
import type { ToolEnv } from "../../tool/toolKind";
import type { ShapeContext, XY } from "../../types";
import {
    groupFrame,
    groupInterval,
    groupRecipe,
    groupSpots,
    type GroupParams,
} from "../groupGeometry";
import { groupShape } from "../groupShape";
import { groupTool } from "../groupTool";

/**
 * Groups (#603): marchers made a shape where they stand. Its frame turns, flips and scales like
 * any shape's, its interval is the smallest gap between neighbors, and it reads back across pages
 * by the placed-shape rules (ADR 0006).
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

/** A loose form: an L of three with one off to the side, ids 1..4 */
const STANDING = [
    { id: 1, x: 100, y: 100 },
    { id: 2, x: 120, y: 100 },
    { id: 3, x: 100, y: 120 },
    { id: 4, x: 155, y: 133 },
];

const params = (of = STANDING): GroupParams => {
    const { params: stored } = groupRecipe(of);
    const { spots: _spots, ...p } = stored;
    return p;
};

const close = (a: readonly XY[], b: readonly XY[]) => {
    expect(a).toHaveLength(b.length);
    a.forEach((p, i) => {
        expect(p.x).toBeCloseTo(b[i]!.x, 9);
        expect(p.y).toBeCloseTo(b[i]!.y, 9);
    });
};

const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

describe("a group's frame", () => {
    it("keeps everyone where they stand, square to the field, centered on their bounds", () => {
        const { params: stored, members } = groupRecipe(STANDING);
        expect(stored.spots).toBe(4);
        expect(members.map((m) => [m.marcherId, m.slot])).toEqual([
            [1, 0],
            [2, 1],
            [3, 2],
            [4, 3],
        ]);
        const p = params();
        close(groupSpots(p), STANDING);
        expect(groupShape.generate(p, 4, ctx)).toHaveLength(4);
        expect(groupFrame(p)).toMatchObject({
            center: { x: 127.5, y: 116.5 },
            halfWidth: 27.5,
            halfDepth: 16.5,
            rotation: 0,
            flipX: false,
            flipY: false,
        });
    });

    it("turns about its pivot, keeping every gap", () => {
        const p = params();
        const turned = turnShape(
            groupTool,
            p,
            4,
            90 * DEGREE,
            "c",
            env,
        ) as GroupParams;
        const c = groupFrame(p).center;
        // A quarter turn clockwise on screen: (dx, dy) goes to (-dy, dx)
        close(
            groupSpots(turned),
            STANDING.map((s) => ({
                x: c.x - (s.y - c.y),
                y: c.y + (s.x - c.x),
            })),
        );
        expect(groupFrame(turned).rotation).toBeCloseTo(Math.PI / 2, 9);
        // Turned about its back-left corner, where marcher 1 stands, marcher 1 stays put
        const aboutCorner = turnShape(
            groupTool,
            withPivot(p, "nw"),
            4,
            90 * DEGREE,
            "nw",
            env,
        ) as GroupParams;
        close([groupSpots(aboutCorner)[0]!], [STANDING[0]!]);
        expect(
            dist(groupSpots(aboutCorner)[0]!, groupSpots(aboutCorner)[3]!),
        ).toBeCloseTo(dist(STANDING[0]!, STANDING[3]!), 9);
    });

    it("flips side to side and front to back about its pivot, mirroring the form", () => {
        const p = params();
        const c = groupFrame(p).center;
        const across = flipShape(
            groupTool,
            p,
            4,
            "across",
            "c",
            env,
        ) as GroupParams;
        close(
            groupSpots(across),
            STANDING.map((s) => ({ x: 2 * c.x - s.x, y: s.y })),
        );
        const deep = flipShape(
            groupTool,
            p,
            4,
            "deep",
            "c",
            env,
        ) as GroupParams;
        close(
            groupSpots(deep),
            STANDING.map((s) => ({ x: s.x, y: 2 * c.y - s.y })),
        );
        // Flipped twice, it's back
        close(
            groupSpots(
                flipShape(
                    groupTool,
                    across,
                    4,
                    "across",
                    "c",
                    env,
                ) as GroupParams,
            ),
            STANDING,
        );
        // Turned, then flipped: still the form's mirror image
        const turned = turnShape(groupTool, p, 4, 30 * DEGREE, "c", env);
        const mirrored = flipShape(
            groupTool,
            turned,
            4,
            "across",
            "c",
            env,
        ) as GroupParams;
        close(
            groupSpots(mirrored),
            groupSpots(turned as GroupParams).map((s) => ({
                x: 2 * c.x - s.x,
                y: s.y,
            })),
        );
    });

    it("moves on the grid by its first spot", () => {
        const p = params();
        const moved = groupTool.move(p, 4, { x: 12, y: -3 }, env);
        close(
            groupSpots(moved),
            STANDING.map((s) => ({ x: s.x + 10, y: s.y - 5 })),
        );
    });
});

describe("a group's interval and scaling", () => {
    it("is the smallest gap between neighbors", () => {
        // 100,100 to 120,100 and 100,120: 20 apart (2 steps); the fourth is further off
        expect(groupInterval(params())).toBeCloseTo(20, 9);
        expect(groupTool.params[0]!.display(params(), 4, STEP)).toBe("2");
    });

    it("scales every gap in proportion, its pivot kept, in half steps of the interval", () => {
        const p = params();
        const bigger = scaleKeepingRatio(
            groupTool,
            p,
            4,
            1,
            "c",
            env,
        ) as GroupParams;
        expect(groupInterval(bigger)).toBeCloseTo(25, 9);
        const k = 25 / 20;
        const c = groupFrame(p).center;
        close(
            groupSpots(bigger),
            STANDING.map((s) => ({
                x: c.x + (s.x - c.x) * k,
                y: c.y + (s.y - c.y) * k,
            })),
        );
        // Around a corner, that corner stays put
        const fromCorner = scaleKeepingRatio(
            groupTool,
            withPivot(p, "nw"),
            4,
            -1,
            "nw",
            env,
        ) as GroupParams;
        expect(groupInterval(fromCorner)).toBeCloseTo(15, 9);
        close([groupSpots(fromCorner)[0]!], [STANDING[0]!]);
    });

    it("goes onto the half steps from a loose interval, and no smaller than half a step", () => {
        const loose = params([
            { id: 1, x: 0, y: 0 },
            { id: 2, x: 18.3, y: 0 },
            { id: 3, x: 40, y: 7 },
        ]);
        expect(groupTool.params[0]!.derived!(loose, 3, STEP)).toBe(true);
        const up = scaleKeepingRatio(groupTool, loose, 3, 1, "c", env);
        expect(groupInterval(up as GroupParams)).toBeCloseTo(20, 9);
        const down = scaleKeepingRatio(groupTool, loose, 3, -1, "c", env);
        expect(groupInterval(down as GroupParams)).toBeCloseTo(15, 9);
        const tight = params([
            { id: 1, x: 0, y: 0 },
            { id: 2, x: 5, y: 0 },
        ]);
        expect(scaleKeepingRatio(groupTool, tight, 2, -1, "c", env)).toBe(null);
    });

    it("leaves out a near-duplicate pair, so the interval doesn't collapse", () => {
        const withDuplicate = params([
            { id: 1, x: 0, y: 0 },
            { id: 2, x: 20, y: 0 },
            { id: 3, x: 40, y: 0 },
            { id: 4, x: 60, y: 0 },
            { id: 5, x: 60.2, y: 0 },
        ]);
        expect(groupInterval(withDuplicate)).toBeCloseTo(20, 9);
        // Stacked on one spot, there is no interval to scale by
        const stacked = params([
            { id: 1, x: 5, y: 5 },
            { id: 2, x: 5, y: 5 },
        ]);
        expect(groupInterval(stacked)).toBe(null);
        expect(scaleKeepingRatio(groupTool, stacked, 2, 1, "c", env)).toBe(
            null,
        );
    });
});

describe("groups read back across pages", () => {
    // Moves 10, 20 and 30 end at beats 8, 16 and 24
    const ends = new Map<number | null, number>([
        [10, 8],
        [20, 16],
        [30, 24],
    ]);
    const endBeatOf = (id: number | null) => ends.get(id);

    const group = (
        timelineId: number,
        id = 1,
        standing = STANDING,
    ): PlacedRecipe => {
        const { params: stored, members } = groupRecipe(standing);
        return {
            id,
            timelineId,
            kind: groupShape.id,
            kindVersion: groupShape.version,
            params: stored,
            orderMode: "nearest",
            reverse: false,
            members,
        };
    };
    const standingAt = new Map(STANDING.map((s) => [s.id, { x: s.x, y: s.y }]));
    const find = (
        recipes: PlacedRecipe[],
        beat: number,
        positions = standingAt,
    ) =>
        boxesAt({
            recipes,
            endBeatOf,
            beat,
            positionOf: (id) => positions.get(id),
        });

    it("reads a group recipe back as a group, through the placed kinds", () => {
        expect(PLACED_KINDS).toContain(groupTool);
        const [shown] = find([group(10)], 8);
        expect(shown?.kind).toBe(groupTool);
        expect(shown?.spots).toBe(4);
        close(
            groupShape.generate(shown!.params, 4, ctx),
            STANDING.map((s) => ({ x: s.x, y: s.y })),
        );
    });

    it("shows on later pages while the form is held, and not once a member moves", () => {
        const r = group(10);
        expect(find([r], 16)).toHaveLength(1);
        const moved = new Map(standingAt);
        moved.set(4, { x: 170, y: 133 });
        expect(find([r], 16, moved)).toEqual([]);
        // Moving one takes it out, leaving a hole; moving all the same way moves the group
        const [shown] = find([r], 8);
        expect(membershipAfter(shown!, new Map([[4, { x: 1, y: 1 }]]))).toEqual(
            { type: "leave", left: [4] },
        );
        const delta = { x: 10, y: 0 };
        const all = new Map(
            STANDING.map((s) => [s.id, { x: s.x + delta.x, y: s.y }]),
        );
        expect(membershipAfter(shown!, all)).toEqual({ type: "move", delta });
        close(
            movedBox(shown!, delta).members,
            STANDING.map((s) => ({ x: s.x + 10, y: s.y })),
        );
    });

    it("takes its marchers from a shape held from an earlier page, which earlier pages keep", () => {
        // A box on move 10 whose spots the group's first three marchers stand on later
        const boxParams = drawBox({ x: 0, y: 0 }, { x: 20, y: 20 }, 4, env)!;
        const spots = boxShape.generate(boxParams, 4, ctx);
        const box: PlacedRecipe = {
            id: 5,
            timelineId: 10,
            kind: "block",
            kindVersion: 1,
            params: { ...boxParams, spots: 4 },
            orderMode: "nearest",
            reverse: false,
            members: spots.map((s, i) => ({
                marcherId: i + 1,
                slot: i,
                x: s.x,
                y: s.y,
            })),
        };
        const onBox = new Map(spots.map((s, i) => [i + 1, { x: s.x, y: s.y }]));
        const grouped = group(
            20,
            6,
            spots.map((s, i) => ({ id: i + 1, x: s.x, y: s.y })),
        );
        expect(find([box, grouped], 8, onBox).map((b) => b.recipe.id)).toEqual([
            5,
        ]);
        expect(find([box, grouped], 16, onBox).map((b) => b.recipe.id)).toEqual(
            [6],
        );
        expect(find([box, grouped], 16, onBox)[0]!.kind).toBe(groupTool);
    });

    it("ends where it's ungrouped on a later page", () => {
        const r = group(10);
        const ungrouped: PlacedRecipe = {
            ...r,
            id: 9,
            timelineId: 30,
            kind: UNGROUPED_KIND,
            params: {},
        };
        expect(find([r, ungrouped], 16)).toHaveLength(1);
        expect(find([r, ungrouped], 24)).toEqual([]);
    });

    it("isn't drawn or picked: it's no kind the shape tool offers", () => {
        expect(groupTool.draw({ x: 0, y: 0 }, { x: 50, y: 50 }, 4, env)).toBe(
            undefined,
        );
        expect(groupTool.asIs).toBe(true);
        expect(groupTool.closed).toBeUndefined();
    });
});

describe("a group's handles stretch it as an ungrouped selection's do (owner on #606)", () => {
    // STANDING's bounds: x 100 to 155, y 100 to 133
    const free: ToolEnv = { ...env, snap: false };
    const drag = (key: string, to: XY, with_: Partial<ToolEnv> = {}) =>
        groupSpots(
            groupTool.dragHandle(params(), 4, key, to, { ...free, ...with_ }),
        );

    it("has a box's eight handles, on its frame", () => {
        const handles = groupTool.handles(params(), 4);
        expect(handles.map((h) => h.key).sort()).toEqual(
            ["e", "n", "ne", "nw", "s", "se", "sw", "w"].sort(),
        );
        close(
            handles.filter((h) => h.key === "se").map((h) => h.at),
            [{ x: 155, y: 133 }],
        );
    });

    it("a corner's cursor is diagonal and a side's straight, however wide the group (owner on #606)", () => {
        // 100 wide and 20 deep: its corners lie about 11° off across, nearer across than diagonal
        const wide = params([
            { id: 1, x: 0, y: 0 },
            { id: 2, x: 100, y: 0 },
            { id: 3, x: 0, y: 20 },
            { id: 4, x: 100, y: 20 },
        ]);
        const cursors = Object.fromEntries(
            groupTool.handles(wide, 4).map((h) => [h.key, h.cursor]),
        );
        expect(cursors).toEqual({
            nw: "nwse-resize",
            n: "ns-resize",
            ne: "nesw-resize",
            e: "ew-resize",
            se: "nwse-resize",
            s: "ns-resize",
            sw: "nesw-resize",
            w: "ew-resize",
        });
    });

    it("a side stretches one way, the opposite side staying put", () => {
        close(drag("e", { x: 210, y: 0 }), [
            { x: 100, y: 100 },
            { x: 140, y: 100 },
            { x: 100, y: 120 },
            { x: 210, y: 133 },
        ]);
    });

    it("a corner stretches both ways from the opposite corner", () => {
        close(drag("se", { x: 210, y: 166 }), [
            { x: 100, y: 100 },
            { x: 140, y: 100 },
            { x: 100, y: 140 },
            { x: 210, y: 166 },
        ]);
    });

    it("constrain keeps the proportions, a side growing about the middle of its other way", () => {
        close(drag("e", { x: 210, y: 0 }, { constrain: true }), [
            { x: 100, y: 83.5 },
            { x: 140, y: 83.5 },
            { x: 100, y: 123.5 },
            { x: 210, y: 149.5 },
        ]);
    });

    it("constrain on a corner follows the pointer along the diagonal, as a selection's does", () => {
        // From the nw corner (100, 100) toward se (155, 133); the pointer mostly sideways and a
        // little in: its progress along that diagonal, not the sideways pull alone
        const k = (110 * 55 + 20 * 33) / (55 * 55 + 33 * 33);
        close(
            drag("se", { x: 210, y: 120 }, { constrain: true }),
            STANDING.map(({ x, y }) => ({
                x: 100 + (x - 100) * k,
                y: 100 + (y - 100) * k,
            })),
        );
    });

    it("from center stretches about the middle", () => {
        close(drag("e", { x: 182.5, y: 0 }, { fromCenter: true }), [
            { x: 72.5, y: 100 },
            { x: 112.5, y: 100 },
            { x: 72.5, y: 120 },
            { x: 182.5, y: 133 },
        ]);
    });

    it("with snapping on, the handle lands on the half-step grid", () => {
        close(
            drag("e", { x: 211.2, y: 0 }, { snap: true }),
            drag("e", { x: 210, y: 0 }),
        );
    });

    it("dragged past the opposite side, it flattens rather than turning inside out", () => {
        const xs = drag("e", { x: 50, y: 0 }).map((s) => s.x);
        for (const x of xs) {
            expect(x).toBeGreaterThanOrEqual(100);
            expect(x).toBeLessThan(101);
        }
    });

    it("turned and flipped, it stretches along its own axes and keeps both", () => {
        const turned = flipShape(
            groupTool,
            turnShape(groupTool, params(), 4, 90 * DEGREE, "c", env),
            4,
            "across",
            "c",
            env,
        ) as GroupParams;
        const before = groupFrame(turned);
        const handle = groupTool.handles(turned, 4).find((h) => h.key === "e")!;
        // Out along the frame's across axis by its whole width again
        const out = {
            x: handle.at.x + (handle.at.x - before.center.x) * 2,
            y: handle.at.y + (handle.at.y - before.center.y) * 2,
        };
        const after = groupFrame(
            groupTool.dragHandle(turned, 4, "e", out, free),
        );
        expect(after.halfWidth).toBeCloseTo(before.halfWidth * 2, 9);
        expect(after.halfDepth).toBeCloseTo(before.halfDepth, 9);
        expect(after.rotation).toBeCloseTo(before.rotation, 9);
        expect(after.flipX).toBe(before.flipX);
    });

    it("a rank has no handles stretching its depth, only its ends", () => {
        const rank = params([
            { id: 1, x: 0, y: 0 },
            { id: 2, x: 20, y: 0 },
            { id: 3, x: 40, y: 0 },
        ]);
        expect(
            groupTool
                .handles(rank, 3)
                .map((h) => h.key)
                .sort(),
        ).toEqual(["e", "w"]);
    });
});
