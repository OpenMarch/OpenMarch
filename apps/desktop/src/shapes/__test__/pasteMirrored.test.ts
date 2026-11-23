import { describe, expect, it } from "vitest";
import type { AssignMarcher } from "../assign";
import { boxTool } from "../box/boxTool";
import { circleTool } from "../circle/circleTool";
import { lineTool } from "../line/lineTool";
import {
    pictureOf,
    planPaste,
    type CopiedPicture,
    type PasteMirror,
} from "../clipboard/picture";
import { placementOf } from "../tool/shapePlacement";
import { rotateFrame } from "../frame/frame";
import {
    mirrorParams,
    mirrorPoint,
    snapMirrorPoint,
    type Mirror,
} from "../tool/mirror";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    edit,
    keepMirror,
    openDrawn,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    pressTarget,
    setMirrorAxes,
    toggleMirror,
    nudgeMirrorPoint,
    undo,
    type ToolState,
} from "../tool/toolMachine";
import type { ShapeContext, XY } from "../types";

/**
 * Paste mirrored: the copy opens where it was copied, mirrored through a point, and stays tied to
 * that point while the point or the paste is moved, until anything else changes it
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    pull: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };

const row = (n: number, from: XY, gap = STEP, firstId = 1): AssignMarcher[] =>
    Array.from({ length: n }, (_, i) => ({
        id: firstId + i,
        at: { x: from.x + i * gap, y: from.y },
        drillRank: i,
    }));

const sorted = (points: readonly XY[]) =>
    [...points]
        .map((p) => ({
            x: Math.round(p.x * 1e6) / 1e6 + 0,
            y: Math.round(p.y * 1e6) / 1e6 + 0,
        }))
        .sort((a, b) => a.x - b.x || a.y - b.y);

const spots = (t: ToolState): XY[] =>
    slotsOf(t, ctx).map((s) => ({ x: s.x, y: s.y }));

/** An asymmetric picture, so a mirror image differs from a move */
const DOTS: readonly XY[] = [
    { x: 100, y: 100 },
    { x: 120, y: 100 },
    { x: 110, y: 130 },
    { x: 150, y: 115 },
];
const loose = (dots: readonly XY[] = DOTS) =>
    pictureOf({ positions: dots, shape: null, stepPx: STEP })!;

/** A shape of `kind` drawn for `n` marchers by dragging from `from` to `to` */
function drawn(kind: AnyToolKind, n: number, from: XY, to: XY): ToolState {
    let t = openTool(kind, row(n, { x: 0, y: 0 }));
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx);
}

function copiedShape(tool: ToolState): CopiedPicture {
    const placement = placementOf(tool, ctx)!;
    const { spots: _spots, ...params } = placement.recipe.params as {
        spots: number;
    };
    return pictureOf({
        positions: placement.members,
        shape: {
            recipe: { ...placement.recipe, id: 1, timelineId: 1, members: [] },
            params,
        },
        stepPx: STEP,
    })!;
}

/** What Paste mirrored opens, as `copyPaste.ts` opens it: tied to its mirror */
function pasteMirrored(
    picture: CopiedPicture,
    marchers: readonly AssignMarcher[],
    mirror: PasteMirror,
): ToolState {
    const plan = planPaste({ picture, marchers, stepPx: STEP, ctx, mirror })!;
    const tie: Mirror = {
        ...mirror,
        source: mirrorParams(
            plan.kind,
            plan.params,
            plan.marchers.length,
            mirror.point,
            mirror,
        ),
    };
    return openDrawn(
        plan.kind,
        plan.marchers,
        plan.params,
        ctx,
        plan.pivotMoved,
        tie,
    );
}

/** A change as the store applies it: kept tied to the mirror, or untied */
const step = (t: ToolState, change: (t: ToolState) => ToolState) =>
    keepMirror(t, change(t));

const mirrored = (
    points: readonly XY[],
    point: XY,
    across = true,
    deep = false,
) => points.map((p) => mirrorPoint(p, point, { across, deep }));

describe("Paste mirrored opens the copy's mirror image", () => {
    it("loose dots, side to side through the point", () => {
        const point = { x: 200, y: 50 };
        const t = pasteMirrored(loose(), row(4, { x: 400, y: 300 }), {
            point,
            across: true,
            deep: false,
        });
        expect(sorted(spots(t))).toEqual(sorted(mirrored(DOTS, point)));
        expect(t.mirror?.point).toEqual(point);
    });

    it("both ways: half a turn around the point", () => {
        const point = { x: 200, y: 200 };
        const t = pasteMirrored(loose(), row(4, { x: 400, y: 300 }), {
            point,
            across: true,
            deep: true,
        });
        expect(sorted(spots(t))).toEqual(
            sorted(DOTS.map((d) => ({ x: 400 - d.x, y: 400 - d.y }))),
        );
    });

    it("with fewer marchers, uses the mirrored dots nearest them", () => {
        // A row of four on side 1; two marchers on side 2 stand on the two mirrored right dots
        const dots = [0, 10, 20, 30].map((x) => ({ x: 100 + x, y: 100 }));
        const point = { x: 200, y: 100 };
        const receivers = [
            { id: 1, at: { x: 270, y: 100 }, drillRank: 0 },
            { id: 2, at: { x: 280, y: 100 }, drillRank: 1 },
        ];
        const t = pasteMirrored(loose(dots), receivers, {
            point,
            across: true,
            deep: false,
        });
        expect(sorted(spots(t))).toEqual([
            { x: 270, y: 100 },
            { x: 280, y: 100 },
        ]);
    });

    describe.each([
        ["a box", boxTool, { x: 100, y: 100 }, { x: 160, y: 140 }],
        ["a circle", circleTool, { x: 100, y: 100 }, { x: 180, y: 180 }],
        ["a line", lineTool, { x: 100, y: 100 }, { x: 220, y: 160 }],
    ] as const)("%s", (_name, kind, from, to) => {
        const N = 12;
        it("is the mirror image of the copied spots, still a shape of its kind", () => {
            const tool = drawn(kind, N, from, to);
            const point = { x: 300, y: 150 };
            const t = pasteMirrored(
                copiedShape(tool),
                row(N, { x: 400, y: 300 }, STEP, 21),
                { point, across: true, deep: false },
            );
            expect(t.kind).toBe(kind);
            expect(sorted(spots(t))).toEqual(
                sorted(mirrored(spots(tool), point)),
            );
        });
    });

    it("a turned box turns the other way, its spots on their mirror images", () => {
        let tool = drawn(boxTool, 12, { x: 100, y: 100 }, { x: 160, y: 140 });
        const frame = boxTool.frameOf(tool.params, 12);
        tool = edit(
            tool,
            boxTool.withFrame(
                tool.params,
                12,
                rotateFrame(frame, Math.PI / 6, frame.center),
            ),
            ctx,
        );
        const point = { x: 300, y: 120 };
        const t = pasteMirrored(
            copiedShape(tool),
            row(12, { x: 400, y: 300 }, STEP, 21),
            { point, across: true, deep: true },
        );
        expect(sorted(spots(t))).toEqual(
            sorted(mirrored(spots(tool), point, true, true)),
        );
    });
});

describe("the open paste stays tied to its mirror point", () => {
    const point = { x: 200, y: 50 };
    const open = () =>
        pasteMirrored(loose(), row(4, { x: 400, y: 300 }), {
            point,
            across: true,
            deep: false,
        });

    it("dragging the point shows the copy mirrored through where it lands, as one undo step", () => {
        let t = open();
        t = step(t, (s) => press(s, { x: 201, y: 51 }, env));
        expect(t.gesture?.type).toBe("mirror");
        // Lands on the half-step grid
        t = step(t, (s) => pointerMove(s, { x: 241, y: 49 }, env));
        t = step(t, (s) => release(s, ctx));
        expect(t.mirror?.point).toEqual({ x: 240, y: 50 });
        expect(sorted(spots(t))).toEqual(
            sorted(mirrored(DOTS, { x: 240, y: 50 })),
        );
        t = step(t, undo);
        expect(t.mirror?.point).toEqual(point);
        expect(sorted(spots(t))).toEqual(sorted(mirrored(DOTS, point)));
    });

    it("takes a press over the shape under it", () => {
        // The point dragged onto one of the paste's own spots, which is on the point itself
        let t = open();
        const onDot = { x: 300, y: 100 };
        t = step(t, (s) => press(s, point, env));
        t = step(t, (s) => pointerMove(s, { x: 200, y: 100 }, env));
        t = step(t, (s) => release(s, ctx));
        // The dot at x 100 is mirrored onto x 300
        expect(spots(t)).toContainEqual(onDot);
        t = step(t, (s) => press(s, { x: 200, y: 100 }, env));
        expect(t.gesture?.type).toBe("mirror");
    });

    it("snaps the point onto a marcher, a field line, or else the half-step grid", () => {
        const at = { x: 152, y: 98 };
        const withSnaps: ToolEnv = {
            ...env,
            marcherSnaps: () => [{ x: 150, y: 100 }],
            fieldLines: { x: [80], y: [60] },
            pullRadius: 2,
        };
        expect(snapMirrorPoint(at, withSnaps)).toEqual({ x: 150, y: 100 });
        expect(snapMirrorPoint({ x: 81.5, y: 61 }, withSnaps)).toEqual({
            x: 80,
            y: 60,
        });
        expect(snapMirrorPoint({ x: 93, y: 72 }, withSnaps)).toEqual({
            x: 95,
            y: 70,
        });
        // The Snap toggle off: where the pointer is
        expect(
            snapMirrorPoint(at, { ...withSnaps, snap: false, pull: false }),
        ).toEqual(at);
    });

    it("moving the paste moves the point half as far, and keeps it level where it doesn't mirror", () => {
        let t = open();
        // Its center dot, which moves it
        const grab = t.kind.frameOf(t.params, t.spots).center;
        t = step(t, (s) => press(s, grab, env));
        expect(["center", "move"]).toContain(t.gesture?.type);
        // 40 to the right and 20 down: only side to side is mirrored
        t = step(t, (s) =>
            pointerMove(s, { x: grab.x + 40, y: grab.y + 20 }, env),
        );
        t = step(t, (s) => release(s, ctx));
        expect(t.mirror?.point).toEqual({ x: 220, y: 50 });
        expect(sorted(spots(t))).toEqual(
            sorted(mirrored(DOTS, { x: 220, y: 50 })),
        );
        t = step(t, undo);
        expect(t.mirror?.point).toEqual(point);
    });

    it("the Mirror choice sets which ways it mirrors through the same point", () => {
        let t = open();
        t = step(t, (s) => setMirrorAxes(s, { across: true, deep: true }));
        expect(t.mirror).toMatchObject({ across: true, deep: true });
        expect(sorted(spots(t))).toEqual(
            sorted(mirrored(DOTS, point, true, true)),
        );
        t = step(t, (s) => setMirrorAxes(s, { across: false, deep: true }));
        expect(sorted(spots(t))).toEqual(
            sorted(mirrored(DOTS, point, false, true)),
        );
        // Neither isn't a choice
        expect(
            step(t, (s) => setMirrorAxes(s, { across: false, deep: false })),
        ).toBe(t);
        t = step(t, undo);
        t = step(t, undo);
        expect(t.mirror).toMatchObject({ across: true, deep: false });
        expect(sorted(spots(t))).toEqual(sorted(mirrored(DOTS, point)));
    });

    it("the flip keys switch one way; switching off the last one switches to the other", () => {
        let t = open();
        const swapped = step(t, (s) => toggleMirror(s, "across"));
        expect(swapped.mirror).toMatchObject({ across: false, deep: true });
        t = step(t, (s) => toggleMirror(s, "deep"));
        expect(t.mirror).toMatchObject({ across: true, deep: true });
        t = step(t, (s) => toggleMirror(s, "across"));
        expect(t.mirror).toMatchObject({ across: false, deep: true });
    });

    it("the arrow keys move the mirror point, on the half-step grid, one undo step each", () => {
        let t = open();
        t = step(t, (s) => nudgeMirrorPoint(s, { x: STEP, y: 0 }, env));
        expect(t.mirror?.point).toEqual({ x: 210, y: 50 });
        expect(sorted(spots(t))).toEqual(
            sorted(mirrored(DOTS, { x: 210, y: 50 })),
        );
        // Off the grid, it lands back on it
        t = step(t, (s) => nudgeMirrorPoint(s, { x: 1.2, y: 0 }, env));
        expect(t.mirror?.point).toEqual({ x: 210, y: 50 });
        t = step(t, (s) => nudgeMirrorPoint(s, { x: 0, y: -STEP }, env));
        expect(t.mirror?.point).toEqual({ x: 210, y: 40 });
        t = step(t, undo);
        t = step(t, undo);
        expect(t.mirror?.point).toEqual(point);
    });

    it("a click off the paste puts the mirror point there", () => {
        let t = open();
        t = step(t, (s) => press(s, { x: 251, y: 302 }, env));
        expect(t.gesture?.type).toBe("mirror");
        t = step(t, (s) => release(s, ctx));
        expect(t.mirror?.point).toEqual({ x: 250, y: 300 });
        expect(sorted(spots(t))).toEqual(
            sorted(mirrored(DOTS, { x: 250, y: 300 })),
        );
        t = step(t, undo);
        expect(t.mirror?.point).toEqual(point);
    });

    it("a move along a way it doesn't mirror changes nothing and leaves no undo step", () => {
        const t = open();
        const kind = t.kind;
        const frame = kind.frameOf(t.params, t.spots);
        const nudged = step(t, (s) =>
            edit(
                s,
                kind.withFrame(s.params, s.spots, {
                    ...frame,
                    center: { x: frame.center.x, y: frame.center.y + STEP },
                }),
                ctx,
            ),
        );
        expect(nudged).toBe(t);
    });

    it("only mirrors: a press on one of its handles grabs the whole paste to move it", () => {
        let t = open();
        const handle = t.kind.handles(t.params, t.spots, null)[0];
        expect(handle).toBeDefined();
        expect(pressTarget(t, handle!.at, env).type).toBe("move");
        t = step(t, (s) => press(s, handle!.at, env));
        expect(t.gesture?.type).toBe("move");
        t = step(t, (s) =>
            pointerMove(s, { x: handle!.at.x + 20, y: handle!.at.y }, env),
        );
        t = step(t, (s) => release(s, ctx));
        expect(t.mirror?.point).toEqual({ x: 210, y: 50 });
        expect(sorted(spots(t))).toEqual(
            sorted(mirrored(DOTS, { x: 210, y: 50 })),
        );
    });

    it("anything else unties it, and undo ties it again", () => {
        let t = open();
        const kind = t.kind;
        const frame = kind.frameOf(t.params, t.spots);
        t = step(t, (s) =>
            edit(
                s,
                kind.withFrame(
                    s.params,
                    s.spots,
                    rotateFrame(frame, Math.PI / 2, frame.center),
                ),
                ctx,
            ),
        );
        expect(t.mirror).toBeUndefined();
        // Untied, it's an ordinary open shape: the flip keys flip around its pivot
        expect(step(t, (s) => toggleMirror(s, "deep"))).toBe(t);
        t = step(t, undo);
        expect(t.mirror?.point).toEqual(point);
        expect(sorted(spots(t))).toEqual(sorted(mirrored(DOTS, point)));
    });

    it("places as an ordinary shape: the mirror isn't saved", () => {
        const t = open();
        const placement = placementOf(t, ctx)!;
        expect(
            sorted(placement.members.map((m) => ({ x: m.x, y: m.y }))),
        ).toEqual(sorted(mirrored(DOTS, point)));
        expect(JSON.stringify(placement)).not.toContain("source");
    });
});
