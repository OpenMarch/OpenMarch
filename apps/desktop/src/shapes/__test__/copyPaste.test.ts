import { describe, expect, it } from "vitest";
import type { AssignMarcher } from "../assign";
import { arcTool } from "../arc/arcTool";
import { boxTool } from "../box/boxTool";
import { circleTool } from "../circle/circleTool";
import { curveTool, lineTool } from "../line/lineTool";
import {
    dotsTool,
    pastedGroupTool,
    pictureFit,
    pictureOf,
    pictureSummary,
    planPaste,
    standingOnSpots,
    readPicture,
    PICTURE_VERSION,
    type CopiedPicture,
    type PastePlan,
} from "../clipboard/picture";
import {
    groupFrame,
    groupRecipe,
    groupSpots,
    type GroupParams,
} from "../group/groupGeometry";
import { groupShape } from "../group/groupShape";
import { placementOf } from "../tool/shapePlacement";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    openDrawn,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    targetsOf,
    undo,
    type ToolState,
} from "../tool/toolMachine";
import type { ShapeContext, XY } from "../types";

/**
 * Copy and paste of a formation (#961): what a selection copies, and what pasting it onto other
 * marchers opens, through the shape host with the kinds the app draws
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

/** `n` marchers in a row from `from`, `gap` apart */
const row = (n: number, from: XY, gap = STEP, firstId = 1): AssignMarcher[] =>
    Array.from({ length: n }, (_, i) => ({
        id: firstId + i,
        at: { x: from.x + i * gap, y: from.y },
        drillRank: i,
    }));

/** A shape of `kind` drawn for `n` marchers by dragging from `from` to `to` */
function drawn(kind: AnyToolKind, n: number, from: XY, to: XY): ToolState {
    let t = openTool(kind, row(n, { x: 0, y: 0 }));
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx);
}

/** The picture copying the placed shape `tool` describes would keep */
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

/** The preview a plan opens, as the shape host shows it */
const opened = (plan: PastePlan): ToolState =>
    openDrawn(plan.kind, plan.marchers, plan.params, ctx, plan.pivotMoved);

const spotsOf = (plan: PastePlan): XY[] =>
    slotsOf(opened(plan), ctx).map((s) => ({ x: s.x, y: s.y }));

const sorted = (points: readonly XY[]) =>
    [...points]
        .map((p) => ({
            x: Math.round(p.x * 1e6) / 1e6,
            y: Math.round(p.y * 1e6) / 1e6,
        }))
        .sort((a, b) => a.x - b.x || a.y - b.y);

const middleOf = (points: readonly XY[]): XY => ({
    x:
        (Math.min(...points.map((p) => p.x)) +
            Math.max(...points.map((p) => p.x))) /
        2,
    y:
        (Math.min(...points.map((p) => p.y)) +
            Math.max(...points.map((p) => p.y))) /
        2,
});

const DOTS: readonly XY[] = [
    { x: 100, y: 100 },
    { x: 120, y: 100 },
    { x: 110, y: 130 },
    { x: 150, y: 115 },
];
const loose = (dots: readonly XY[] = DOTS) =>
    pictureOf({ positions: dots, shape: null, stepPx: STEP })!;

describe("copying a formation", () => {
    it("copies marchers in no shape as loose dots, where they stand", () => {
        const picture = loose();
        expect(picture.version).toBe(PICTURE_VERSION);
        expect(picture.stepPx).toBe(STEP);
        expect(picture.dots).toEqual(DOTS);
        expect(picture.shape).toBeUndefined();
    });

    it("copies one whole placed shape as its kind and settings, without its count", () => {
        const tool = drawn(boxTool, 16, { x: 0, y: 0 }, { x: 60, y: 60 });
        const picture = copiedShape(tool);
        expect(picture.shape?.kind).toBe(boxTool.shape.id);
        expect(picture.shape?.kindVersion).toBe(boxTool.shape.version);
        expect(picture.shape?.params).not.toHaveProperty("spots");
        expect(picture.dots).toHaveLength(16);
    });

    it("copies nothing with nobody selected", () => {
        expect(
            pictureOf({ positions: [], shape: null, stepPx: STEP }),
        ).toBeNull();
    });

    it("reads back what it stored, and nothing it can't paste", () => {
        const picture = copiedShape(
            drawn(boxTool, 6, { x: 0, y: 0 }, { x: 40, y: 20 }),
        );
        expect(readPicture(JSON.parse(JSON.stringify(picture)))).toEqual(
            picture,
        );
        expect(readPicture(null)).toBeNull();
        expect(readPicture("box")).toBeNull();
        expect(readPicture({ ...picture, version: 99 })).toBeNull();
        expect(readPicture({ ...picture, dots: [] })).toBeNull();
        expect(
            readPicture({ ...picture, dots: [{ x: "1", y: 2 }] }),
        ).toBeNull();
        expect(readPicture({ ...picture, stepPx: 0 })).toBeNull();
        // A shape it can't make sense of is dropped; the dots still paste
        expect(
            readPicture({ ...picture, shape: { kind: 3 } })?.shape,
        ).toBeUndefined();
    });
});

describe("pasting loose dots", () => {
    it("opens them centered on the receiving marchers, on the half-step grid", () => {
        const receivers = row(4, { x: 402, y: 303 }, 7, 11);
        const plan = planPaste({
            picture: loose(),
            marchers: receivers,
            stepPx: STEP,
        })!;
        expect(plan.kind).toBe(dotsTool);
        expect(plan.left).toBe(0);
        expect(plan.marchers).toEqual(receivers);
        const spots = spotsOf(plan);
        // The same picture, moved as a whole by half steps
        const by = {
            x: spots[0]!.x - DOTS[0]!.x,
            y: spots[0]!.y - DOTS[0]!.y,
        };
        expect(by.x % half).toBeCloseTo(0);
        expect(by.y % half).toBeCloseTo(0);
        expect(sorted(spots)).toEqual(
            sorted(DOTS.map((d) => ({ x: d.x + by.x, y: d.y + by.y }))),
        );
        // Within a quarter step of the middle of the receivers
        const to = middleOf(receivers.map((m) => m.at));
        const at = middleOf(spots);
        expect(Math.abs(at.x - to.x)).toBeLessThanOrEqual(half / 2);
        expect(Math.abs(at.y - to.y)).toBeLessThanOrEqual(half / 2);
    });

    it("opens them where they were copied for a paste in place", () => {
        const plan = planPaste({
            picture: loose(),
            marchers: row(4, { x: 400, y: 300 }),
            stepPx: STEP,
            inPlace: true,
        })!;
        expect(sorted(spotsOf(plan))).toEqual(sorted(DOTS));
    });

    it("gives every marcher their own spot by least travel", () => {
        const receivers = row(4, { x: 400, y: 300 });
        const tool = opened(
            planPaste({ picture: loose(), marchers: receivers, stepPx: STEP })!,
        );
        const targets = targetsOf(tool, ctx);
        expect(targets.map((t) => t.id)).toEqual(receivers.map((m) => m.id));
        expect(new Set(targets.map((t) => t.slot)).size).toBe(4);
        expect(tool.order).toBe("nearest");
    });

    it("with fewer marchers, uses the dots that give the shortest walk", () => {
        // Two marchers standing on the two left dots of a row of four
        const dots = [0, 10, 20, 30].map((x) => ({ x: 100 + x, y: 100 }));
        const receivers = [
            { id: 1, at: { x: 100, y: 100 }, drillRank: 0 },
            { id: 2, at: { x: 110, y: 100 }, drillRank: 1 },
        ];
        const plan = planPaste({
            picture: loose(dots),
            marchers: receivers,
            stepPx: STEP,
            inPlace: true,
        })!;
        expect(plan.left).toBe(0);
        expect(plan.marchers).toHaveLength(2);
        expect(sorted(spotsOf(plan))).toEqual([
            { x: 100, y: 100 },
            { x: 110, y: 100 },
        ]);
    });

    it("with fewer marchers, draws the dots nobody takes as empty spots that move with it", () => {
        const dots = [0, 10, 20, 30].map((x) => ({ x: 100 + x, y: 100 }));
        const receivers = [
            { id: 1, at: { x: 100, y: 100 }, drillRank: 0 },
            { id: 2, at: { x: 110, y: 100 }, drillRank: 1 },
        ];
        const plan = planPaste({
            picture: loose(dots),
            marchers: receivers,
            stepPx: STEP,
            inPlace: true,
        })!;
        const empty = (params: unknown) =>
            sorted(plan.kind.emptySpots!(params, 2));
        expect(empty(plan.params)).toEqual([
            { x: 120, y: 100 },
            { x: 130, y: 100 },
        ]);
        // The frame holds the whole copy
        expect(plan.kind.frameOf(plan.params, 2)).toMatchObject({
            center: { x: 115, y: 100 },
            halfWidth: 15,
        });
        // Moved, turned and scaled, the empty spots go with the spots
        const moved = plan.kind.move(plan.params, 2, { x: 0, y: 20 }, env);
        expect(empty(moved)).toEqual([
            { x: 120, y: 120 },
            { x: 130, y: 120 },
        ]);
        const turned = plan.kind.withFrame(plan.params, 2, {
            ...plan.kind.frameOf(plan.params, 2),
            rotation: Math.PI,
        });
        expect(empty(turned)).toEqual([
            { x: 100, y: 100 },
            { x: 110, y: 100 },
        ]);
        const interval = plan.kind.params[0]!;
        const doubled = interval.set!(plan.params, 2, 2, env)!;
        expect(empty(doubled)).toEqual([
            { x: 125, y: 100 },
            { x: 145, y: 100 },
        ]);
        // Placing them saves nothing of the empty spots, and no spot moves
        const placement = placementOf(opened(plan), ctx)!;
        expect(placement.plain).toBe(true);
        expect(placement.recipe.params).not.toHaveProperty("empty");
        expect(sorted(placement.members.map((m) => m))).toEqual([
            { x: 100, y: 100 },
            { x: 110, y: 100 },
        ]);
    });

    it("with as many marchers as dots, has no empty spots", () => {
        const plan = planPaste({
            picture: loose(),
            marchers: row(4, { x: 0, y: 0 }),
            stepPx: STEP,
        })!;
        expect(plan.kind.emptySpots!(plan.params, 4)).toEqual([]);
    });

    it("with more marchers, the nearest take the dots and the rest are left out", () => {
        const dots = [
            { x: 100, y: 100 },
            { x: 110, y: 100 },
        ];
        const receivers = [
            { id: 1, at: { x: 500, y: 500 }, drillRank: 0 },
            { id: 2, at: { x: 100, y: 105 }, drillRank: 1 },
            { id: 3, at: { x: 600, y: 100 }, drillRank: 2 },
            { id: 4, at: { x: 112, y: 100 }, drillRank: 3 },
        ];
        const plan = planPaste({
            picture: loose(dots),
            marchers: receivers,
            stepPx: STEP,
            inPlace: true,
        })!;
        expect(plan.left).toBe(2);
        expect(plan.marchers.map((m) => m.id)).toEqual([2, 4]);
        expect(sorted(spotsOf(plan))).toEqual(sorted(dots));
        expect(targetsOf(opened(plan), ctx).map((t) => t.id)).toEqual([2, 4]);
    });

    it("decides who walks from where the marchers start the move", () => {
        // Drawn far away, but both start the move beside the dots
        const receivers = [
            {
                id: 1,
                at: { x: 900, y: 900 },
                from: { x: 111, y: 100 },
                drillRank: 0,
            },
            {
                id: 2,
                at: { x: 100, y: 100 },
                from: { x: 700, y: 700 },
                drillRank: 1,
            },
            { id: 3, at: { x: 100, y: 110 }, drillRank: 2 },
        ];
        const plan = planPaste({
            picture: loose([
                { x: 100, y: 100 },
                { x: 110, y: 100 },
            ]),
            marchers: receivers,
            stepPx: STEP,
            inPlace: true,
        })!;
        expect(plan.marchers.map((m) => m.id)).toEqual([1, 3]);
    });

    it("places them as plain marchers: no recipe is saved", () => {
        const tool = opened(
            planPaste({
                picture: loose(),
                marchers: row(4, { x: 400, y: 300 }),
                stepPx: STEP,
            })!,
        );
        const placement = placementOf(tool, ctx)!;
        expect(placement.plain).toBe(true);
        expect(placement.members).toHaveLength(4);
    });

    it("keeps its size in steps on a field with another step size", () => {
        const plan = planPaste({
            picture: loose(),
            marchers: row(4, { x: 400, y: 300 }),
            stepPx: STEP * 2,
            inPlace: true,
        })!;
        expect(sorted(spotsOf(plan))).toEqual(
            sorted(DOTS.map((d) => ({ x: d.x * 2, y: d.y * 2 }))),
        );
    });

    it("pastes onto nobody as nothing", () => {
        expect(
            planPaste({ picture: loose(), marchers: [], stepPx: STEP }),
        ).toBeNull();
    });
});

describe("pasting a shape", () => {
    const KINDS: readonly [string, AnyToolKind, XY, XY][] = [
        ["a box", boxTool, { x: 100, y: 100 }, { x: 160, y: 140 }],
        ["a circle", circleTool, { x: 100, y: 100 }, { x: 180, y: 180 }],
        ["a line", lineTool, { x: 100, y: 100 }, { x: 220, y: 160 }],
    ];

    describe.each(KINDS)("%s", (_name, kind, from, to) => {
        const N = 12;
        const original = () => drawn(kind, N, from, to);

        it("opens the same shape in place for the same count", () => {
            const tool = original();
            const plan = planPaste({
                picture: copiedShape(tool),
                marchers: row(N, { x: 400, y: 300 }, STEP, 21),
                stepPx: STEP,
                inPlace: true,
            })!;
            expect(plan.kind).toBe(kind);
            expect(plan.left).toBe(0);
            expect(sorted(spotsOf(plan))).toEqual(
                sorted(slotsOf(tool, ctx).map((s) => ({ x: s.x, y: s.y }))),
            );
        });

        it("opens centered on the receiving marchers, moved by half steps", () => {
            const tool = original();
            const receivers = row(N, { x: 403, y: 302 }, STEP, 21);
            const plan = planPaste({
                picture: copiedShape(tool),
                marchers: receivers,
                stepPx: STEP,
            })!;
            const was = kind.frameOf(tool.params, N).center;
            const now = plan.kind.frameOf(plan.params, N).center;
            expect(((now.x - was.x) / half) % 1).toBeCloseTo(0);
            expect(((now.y - was.y) / half) % 1).toBeCloseTo(0);
            const middle = middleOf(receivers.map((m) => m.at));
            expect(Math.abs(now.x - middle.x)).toBeLessThanOrEqual(half / 2);
            expect(Math.abs(now.y - middle.y)).toBeLessThanOrEqual(half / 2);
            // The same picture, moved as a whole
            const by = { x: now.x - was.x, y: now.y - was.y };
            expect(sorted(spotsOf(plan))).toEqual(
                sorted(
                    slotsOf(tool, ctx).map((s) => ({
                        x: s.x + by.x,
                        y: s.y + by.y,
                    })),
                ),
            );
        });

        it("is laid out for the receiving count, fewer or more, as a live shape", () => {
            const picture = copiedShape(original());
            for (const n of [N - 4, N + 5]) {
                const plan = planPaste({
                    picture,
                    marchers: row(n, { x: 400, y: 300 }, STEP, 21),
                    stepPx: STEP,
                })!;
                expect(plan.kind).toBe(kind);
                expect(plan.left).toBe(0);
                expect(plan.marchers).toHaveLength(n);
                const tool = opened(plan);
                expect(slotsOf(tool, ctx)).toHaveLength(n);
                const placement = placementOf(tool, ctx)!;
                expect(placement.plain).toBeUndefined();
                expect(placement.recipe.kind).toBe(kind.shape.id);
                expect(
                    (placement.recipe.params as { spots: number }).spots,
                ).toBe(n);
                expect(new Set(placement.members.map((m) => m.slot)).size).toBe(
                    n,
                );
            }
        });
    });

    it("keeps a box's files and intervals for a new count: 4 × 4 becomes 4 × 3", () => {
        const tool = drawn(boxTool, 16, { x: 100, y: 100 }, { x: 160, y: 160 });
        const was = tool.params as {
            files: number;
            across: number;
            deep: number;
        };
        expect(was.files).toBe(4);
        const plan = planPaste({
            picture: copiedShape(tool),
            marchers: row(12, { x: 400, y: 300 }),
            stepPx: STEP,
        })!;
        const now = plan.params as typeof was;
        expect(now.files).toBe(4);
        expect(now.across).toBe(was.across);
        expect(now.deep).toBe(was.deep);
        const spots = spotsOf(plan);
        expect(new Set(spots.map((s) => Math.round(s.y))).size).toBe(3);
        expect(new Set(spots.map((s) => Math.round(s.x))).size).toBe(4);
    });

    it("has nothing to undo back to, and is edited like any open shape", () => {
        const plan = planPaste({
            picture: copiedShape(
                drawn(boxTool, 6, { x: 100, y: 100 }, { x: 140, y: 120 }),
            ),
            marchers: row(6, { x: 400, y: 300 }),
            stepPx: STEP,
        })!;
        const tool = opened(plan);
        expect(undo(tool)).toBe(tool);
        // Dragged from its middle, it moves and that is one undo step
        const center = boxTool.frameOf(tool.params, 6).center;
        let moved = press(tool, center, env);
        moved = pointerMove(moved, { x: center.x + 20, y: center.y }, env);
        moved = release(moved, ctx);
        expect(boxTool.frameOf(moved.params, 6).center.x).toBeCloseTo(
            center.x + 20,
        );
        expect(undo(moved).params).toBe(tool.params);
    });

    it("pastes a group as a group, filling its spots as loose dots do", () => {
        const standing = DOTS.map((d, i) => ({ id: i + 1, ...d }));
        const { params } = groupRecipe(standing);
        const { spots: _spots, ...stored } = params;
        const picture = pictureOf({
            positions: DOTS,
            shape: {
                recipe: {
                    id: 1,
                    timelineId: 1,
                    kind: groupShape.id,
                    kindVersion: groupShape.version,
                    params,
                    orderMode: "nearest",
                    reverse: false,
                    members: [],
                },
                params: stored,
            },
            stepPx: STEP,
        })!;
        const plan = planPaste({
            picture,
            marchers: row(3, { x: 100, y: 100 }),
            stepPx: STEP,
            inPlace: true,
        })!;
        expect(plan.kind).toBe(pastedGroupTool);
        expect(spotsOf(plan)).toHaveLength(3);
        expect(plan.kind.emptySpots!(plan.params, 3)).toHaveLength(1);
        const placement = placementOf(opened(plan), ctx)!;
        expect(placement.plain).toBeUndefined();
        expect(placement.recipe.kind).toBe(groupShape.id);
        // The group saved is fitted to its 3 spots, its empty one left out
        const saved = placement.recipe.params as GroupParams;
        expect(saved).not.toHaveProperty("empty");
        expect(sorted(groupSpots(saved))).toEqual(sorted(spotsOf(plan)));
        expect(groupFrame(saved).center).toEqual(middleOf(spotsOf(plan)));
    });

    it("pastes a shape this app can't lay out as loose dots", () => {
        const picture = copiedShape(
            drawn(boxTool, 6, { x: 100, y: 100 }, { x: 140, y: 120 }),
        );
        const receivers = row(6, { x: 400, y: 300 });
        const newer = planPaste({
            picture: {
                ...picture,
                shape: { ...picture.shape!, kind: "spiral" },
            },
            marchers: receivers,
            stepPx: STEP,
            inPlace: true,
        })!;
        expect(newer.kind).toBe(dotsTool);
        expect(sorted(spotsOf(newer))).toEqual(sorted(picture.dots));
        // From a field with another step size: the dots, the same size in steps
        const scaled = planPaste({
            picture,
            marchers: receivers,
            stepPx: STEP / 2,
            inPlace: true,
        })!;
        expect(scaled.kind).toBe(dotsTool);
        expect(sorted(spotsOf(scaled))).toEqual(
            sorted(picture.dots.map((d) => ({ x: d.x / 2, y: d.y / 2 }))),
        );
    });
});

describe("pasting onto marchers already standing in it", () => {
    // Pasting again onto the same marchers leaves them where they are (#961, simulated users:
    // a second paste moved them about 5 steps)
    const standing = (points: readonly XY[], firstId = 1): AssignMarcher[] =>
        points.map((at, i) => ({ id: firstId + i, at, drillRank: i }));

    it("loose dots, fewer marchers: they stay on the dots they stand on", () => {
        const dots = [0, 20, 40, 60, 80, 100].map((x) => ({
            x: 100 + x,
            y: 100,
        }));
        for (const on of [[0, 1, 2], [3, 4, 5], [0, 2, 5], [1]]) {
            const receivers = standing(on.map((i) => dots[i]!));
            const plan = planPaste({
                picture: loose(dots),
                marchers: receivers,
                stepPx: STEP,
            })!;
            expect(sorted(spotsOf(plan))).toEqual(
                sorted(receivers.map((m) => m.at)),
            );
        }
    });

    it("loose dots, more marchers: those on the dots stay, the rest are left out", () => {
        const dots = [
            { x: 100, y: 100 },
            { x: 120, y: 100 },
            { x: 140, y: 110 },
        ];
        const receivers = standing([
            { x: 100, y: 100 },
            { x: 300, y: 200 },
            { x: 120, y: 100 },
            { x: 140, y: 110 },
            { x: 60, y: 260 },
        ]);
        const plan = planPaste({
            picture: loose(dots),
            marchers: receivers,
            stepPx: STEP,
        })!;
        expect(plan.left).toBe(2);
        expect(plan.marchers.map((m) => m.id)).toEqual([1, 3, 4]);
        expect(sorted(spotsOf(plan))).toEqual(sorted(dots));
    });

    it("pasted twice in a row, loose dots land where the first paste put them", () => {
        const dots = [0, 20, 40, 60, 80, 100].map((x) => ({
            x: 100 + x,
            y: 100,
        }));
        let receivers = row(3, { x: 403, y: 307 }, 13);
        const first = spotsOf(
            planPaste({
                picture: loose(dots),
                marchers: receivers,
                stepPx: STEP,
            })!,
        );
        receivers = standing(first);
        const second = spotsOf(
            planPaste({
                picture: loose(dots),
                marchers: receivers,
                stepPx: STEP,
            })!,
        );
        expect(sorted(second)).toEqual(sorted(first));
    });

    const SHAPES: readonly [string, AnyToolKind, XY, XY][] = [
        ["a box", boxTool, { x: 100, y: 100 }, { x: 160, y: 140 }],
        ["a circle", circleTool, { x: 100, y: 100 }, { x: 180, y: 180 }],
        ["a line", lineTool, { x: 100, y: 100 }, { x: 220, y: 160 }],
        ["a curve", curveTool, { x: 100, y: 100 }, { x: 220, y: 160 }],
        ["an arc", arcTool, { x: 100, y: 100 }, { x: 220, y: 160 }],
    ];
    it.each(SHAPES)("%s: they stay on its spots", (_name, kind, from, to) => {
        for (const n of [12, 7]) {
            const tool = drawn(kind, n, from, to);
            const spots = slotsOf(tool, ctx).map((s) => ({ x: s.x, y: s.y }));
            const plan = planPaste({
                picture: copiedShape(tool),
                marchers: standing(spots),
                stepPx: STEP,
                ctx,
            })!;
            expect(sorted(spotsOf(plan))).toEqual(sorted(spots));
        }
    });
});

describe("what the Clipboard card says", () => {
    it("a shape pastes onto any number, laid out for the selection", () => {
        const summary = pictureSummary(
            copiedShape(drawn(boxTool, 16, { x: 0, y: 0 }, { x: 60, y: 60 })),
            STEP,
        );
        expect(summary).toEqual({
            type: "shape",
            kind: boxTool,
            count: 16,
            anyNumber: true,
        });
        expect(pictureFit(summary, 0)).toEqual({ fit: "none" });
        expect(pictureFit(summary, 12)).toEqual({
            fit: "laidOut",
            selected: 12,
        });
        expect(pictureFit(summary, 30)).toEqual({
            fit: "laidOut",
            selected: 30,
        });
    });

    it("positions fill so many spots: exact, some spots empty, or some marchers left out", () => {
        const summary = pictureSummary(loose(), STEP);
        expect(summary).toEqual({
            type: "positions",
            kind: null,
            count: 4,
            anyNumber: false,
        });
        expect(pictureFit(summary, 4)).toEqual({ fit: "exact", selected: 4 });
        expect(pictureFit(summary, 3)).toEqual({
            fit: "emptySpots",
            selected: 3,
            empty: 1,
        });
        expect(pictureFit(summary, 6)).toEqual({
            fit: "leftOut",
            selected: 6,
            left: 2,
        });
    });

    it("a group fills its own spots, as positions do", () => {
        const { params } = groupRecipe(
            DOTS.map((d, i) => ({ id: i + 1, ...d })),
        );
        const { spots: _spots, ...stored } = params;
        const summary = pictureSummary(
            pictureOf({
                positions: DOTS,
                shape: {
                    recipe: {
                        id: 1,
                        timelineId: 1,
                        kind: groupShape.id,
                        kindVersion: groupShape.version,
                        params,
                        orderMode: "nearest",
                        reverse: false,
                        members: [],
                    },
                    params: stored,
                },
                stepPx: STEP,
            })!,
            STEP,
        );
        expect(summary.type).toBe("group");
        expect(summary.anyNumber).toBe(false);
        expect(summary.count).toBe(4);
    });

    it("says positions for a shape it would paste as positions", () => {
        const picture = copiedShape(
            drawn(boxTool, 6, { x: 0, y: 0 }, { x: 40, y: 20 }),
        );
        expect(pictureSummary(picture, STEP * 2).type).toBe("positions");
        expect(
            pictureSummary(
                { ...picture, shape: { ...picture.shape!, kind: "spiral" } },
                STEP,
            ).type,
        ).toBe("positions");
    });
});

describe("pasting a shape as its positions", () => {
    it("fills the shape's exact copied spots, as plain marchers, for any count", () => {
        const tool = drawn(boxTool, 16, { x: 100, y: 100 }, { x: 160, y: 160 });
        const picture = copiedShape(tool);
        const copiedSpots = sorted(
            slotsOf(tool, ctx).map((s) => ({ x: s.x, y: s.y })),
        );
        const same = planPaste({
            picture,
            marchers: row(16, { x: 400, y: 300 }),
            stepPx: STEP,
            inPlace: true,
            asPositions: true,
        })!;
        expect(same.kind).toBe(dotsTool);
        expect(sorted(spotsOf(same))).toEqual(copiedSpots);
        expect(placementOf(opened(same), ctx)!.plain).toBe(true);
        // Fewer: some of the very same spots, not a smaller box
        const fewer = planPaste({
            picture,
            marchers: row(12, { x: 400, y: 300 }),
            stepPx: STEP,
            inPlace: true,
            asPositions: true,
        })!;
        const used = spotsOf(fewer);
        expect(used).toHaveLength(12);
        for (const spot of sorted(used))
            expect(copiedSpots).toContainEqual(spot);
    });

    it("says positions on the card, and a group stays a group", () => {
        const picture = copiedShape(
            drawn(boxTool, 6, { x: 0, y: 0 }, { x: 40, y: 20 }),
        );
        expect(
            pictureSummary(picture, STEP, { asPositions: true }),
        ).toMatchObject({ type: "positions", anyNumber: false, count: 6 });
    });
});

describe("marchers already standing on the pasted spots", () => {
    const spots = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
    ];
    it("each keeps the spot they stand on", () => {
        expect(
            standingOnSpots(
                [
                    { x: 0, y: 10 },
                    { x: 0, y: 0.0004 },
                ],
                spots,
            ),
        ).toEqual([2, 0]);
    });
    it("is nothing when anyone isn't on a spot, or two share one", () => {
        expect(
            standingOnSpots(
                [
                    { x: 0, y: 0 },
                    { x: 5, y: 5 },
                ],
                spots,
            ),
        ).toBeNull();
        expect(
            standingOnSpots(
                [
                    { x: 0, y: 0 },
                    { x: 0, y: 0 },
                ],
                spots.slice(0, 1),
            ),
        ).toBeNull();
    });
});
