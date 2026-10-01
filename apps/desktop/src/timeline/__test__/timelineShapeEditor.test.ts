import { describe, expect, it } from "vitest";
import {
    validateShapeGeometry,
    type ShapeRow,
    type TransitionRow,
    type XY,
} from "@openmarch/core";
import { shapeSlotPoints } from "../timelineTransitionEditor";
import {
    blockNeeds,
    buildShapeEditTargets,
    convertShape,
    deleteBlocker,
    DEFAULT_BLOCK_CELLS,
    gridFor,
    kindBlocker,
    newShapeThrough,
    planNewShape,
    planShapeEdit,
    SHAPE_KINDS,
    shapeBounds,
    shapeFrameFor,
    type ShapeEditTarget,
    type ShapeFrame,
} from "../timelineShapeEditor";

/**
 * P8.2: the shape editor's planner. New shapes and kind changes are always valid geometry (I-S1),
 * a kind change keeps the transitions using the shape valid where the editor picks the numbers
 * (I-T4), and a change that writes nothing is planned as null.
 */

const FRAME: ShapeFrame = { center: [100, 50], size: 16, spacing: 2 };

const LINE: ShapeRow = {
    kind: "line",
    geometry: {
        points: [
            [0, 0],
            [10, 0],
        ],
    },
};
const FREEHAND: ShapeRow = {
    kind: "freehand",
    geometry: {
        points: [
            [0, 0],
            [4, 3],
            [10, 0],
            [6, -2],
        ],
    },
};
const CIRCLE: ShapeRow = {
    kind: "circle",
    geometry: {
        center: [5, 5],
        radius: 4,
        start_angle: Math.PI / 2,
        clockwise: true,
    },
};
const BOX: ShapeRow = {
    kind: "box",
    geometry: { origin: [0, 0], width: 8, height: 4 },
};
const BLOCK: ShapeRow = {
    kind: "block",
    geometry: { origin: [0, 0], rows: 2, cols: 3, spacing: [2, 2] },
};
const ALL: ShapeRow[] = [LINE, FREEHAND, CIRCLE, BOX, BLOCK];

const transition = (over: Partial<TransitionRow>): TransitionRow => ({
    id: 1,
    start: 0,
    end: 8,
    dest: 1,
    slots: 2,
    style: "direct",
    order: "inherit",
    params: null,
    ...over,
});

const target = (
    shape: ShapeRow,
    over: Partial<ShapeEditTarget> = {},
): ShapeEditTarget => ({
    id: 1,
    name: null,
    shape,
    version: 3,
    usedBy: [],
    minCells: 0,
    ...over,
});

/** No two of `points` are on the same spot. */
const expectDistinct = (points: readonly XY[], what = "") => {
    for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++)
            expect(
                Math.hypot(
                    points[i]![0] - points[j]![0],
                    points[i]![1] - points[j]![1],
                ),
                `${what}: slots ${i} and ${j}`,
            ).toBeGreaterThan(1e-9);
};

const expectValid = (shape: ShapeRow) =>
    expect(validateShapeGeometry(shape.kind, shape.geometry)).toEqual({
        ok: true,
    });

describe("buildShapeEditTargets", () => {
    it("lists every shape by id, with its name and the transitions using it", () => {
        const targets = buildShapeEditTargets(
            { 2: BLOCK, 1: LINE, 3: CIRCLE },
            [
                { id: 1, name: "Opener" },
                { id: 2, name: null },
            ],
            {
                5: transition({ id: 5, dest: 2, slots: 4 }),
                4: transition({ id: 4, dest: 2, slots: 6 }),
                6: transition({
                    id: 6,
                    dest: 1,
                    slots: 3,
                    style: "follow_the_leader",
                }),
                7: transition({
                    id: 7,
                    dest: null,
                    points: [[0, 0]],
                    slots: 1,
                }),
            },
            9,
        );
        expect(targets.map((t) => t.id)).toEqual([1, 2, 3]);
        expect(targets[0]).toMatchObject({
            name: "Opener",
            version: 9,
            minCells: 3,
            usedBy: [
                { transitionId: 6, style: "follow_the_leader", slotCount: 3 },
            ],
        });
        expect(targets[1]!.usedBy.map((u) => u.transitionId)).toEqual([4, 5]);
        expect(targets[1]!.minCells).toBe(6);
        expect(blockNeeds(targets[1]!)).toEqual([4]);
        expect(targets[2]).toMatchObject({
            name: null,
            usedBy: [],
            minCells: 0,
        });
    });
});

describe("blockers", () => {
    const ftl = target(LINE, {
        usedBy: [
            { transitionId: 4, style: "direct", slotCount: 2 },
            { transitionId: 8, style: "follow_the_leader", slotCount: 2 },
        ],
        minCells: 2,
    });

    it("a shape a follow-the-leader move ends in can't become a block (I-T3)", () => {
        expect(kindBlocker(ftl, "block")).toBe("ftlBlock");
        for (const kind of ["line", "freehand", "circle", "box"] as const)
            expect(kindBlocker(ftl, kind)).toBeNull();
        expect(kindBlocker(target(LINE), "block")).toBeNull();
    });

    it("a shape in use can't be deleted (I-D1)", () => {
        expect(deleteBlocker(ftl)).toBe("inUse");
        expect(deleteBlocker(target(LINE))).toBeNull();
    });
});

describe("gridFor", () => {
    it("fits the cells in a grid as square as can be", () => {
        expect(gridFor(1)).toEqual({ rows: 1, cols: 1 });
        expect(gridFor(2)).toEqual({ rows: 1, cols: 2 });
        expect(gridFor(16)).toEqual({ rows: 4, cols: 4 });
        expect(gridFor(17)).toEqual({ rows: 4, cols: 5 });
        for (let n = 1; n <= 200; n++) {
            const { rows, cols } = gridFor(n);
            expect(rows * cols).toBeGreaterThanOrEqual(n);
        }
    });
});

describe("newShapeThrough", () => {
    const POINTS: XY[] = [
        [10, 10],
        [30, 12],
        [20, 40],
        [12, 30],
    ];

    it.each(SHAPE_KINDS)(
        "draws a valid %s with no, one or several points",
        (kind) => {
            for (const points of [[], [[5, 5]], POINTS] as XY[][]) {
                const shape = newShapeThrough(kind, points, FRAME);
                expect(shape.kind).toBe(kind);
                expectValid(shape);
            }
        },
    );

    it("with nobody selected, centres the shape on the field's middle", () => {
        for (const kind of SHAPE_KINDS) {
            const b = shapeBounds(newShapeThrough(kind, [], FRAME));
            expect((b.minX + b.maxX) / 2).toBeCloseTo(100);
            expect((b.minY + b.maxY) / 2).toBeCloseTo(50);
        }
    });

    it("a line joins the two marchers farthest apart", () => {
        expect(newShapeThrough("line", POINTS, FRAME).geometry).toEqual({
            points: [
                [10, 10],
                [20, 40],
            ],
        });
    });

    it("a freehand path goes through every marcher in order", () => {
        expect(newShapeThrough("freehand", POINTS, FRAME).geometry).toEqual({
            points: POINTS,
        });
    });

    it("a circle goes round their middle and through the first", () => {
        const square: XY[] = [
            [10, 0],
            [0, 10],
            [-10, 0],
            [0, -10],
        ];
        const shape = newShapeThrough("circle", square, FRAME);
        expect(shape).toEqual({
            kind: "circle",
            geometry: {
                center: [0, 0],
                radius: 10,
                start_angle: 0,
                clockwise: false,
            },
        });
        // Its first slot is where the first marcher stands
        expect(shapeSlotPoints(shape, 4)[0]).toEqual([10, 0]);
    });

    it("a circle passes through the first marcher, even when the others stand at other distances", () => {
        const uneven: XY[] = [
            [10, 0],
            [0, 2],
            [-4, 0],
            [0, -4],
        ];
        const shape = newShapeThrough("circle", uneven, FRAME);
        if (shape.kind !== "circle") throw new Error("not a circle");
        const { center, radius } = shape.geometry;
        expect(center).toEqual([1.5, -0.5]);
        expect(radius).toBeCloseTo(Math.hypot(8.5, 0.5));
        const [first] = shapeSlotPoints(shape, 4);
        expect(first![0]).toBeCloseTo(10);
        expect(first![1]).toBeCloseTo(0);
    });

    it("a circle uses the mean distance when the first marcher stands on the middle", () => {
        const shape = newShapeThrough(
            "circle",
            [
                [0, 0],
                [4, 0],
                [-4, 0],
            ],
            FRAME,
        );
        expect(shape.geometry).toEqual({
            center: [0, 0],
            radius: 8 / 3,
            start_angle: 0,
            clockwise: false,
        });
    });

    it("a circle and a block through marchers in a line are valid", () => {
        const inLine: XY[] = [
            [0, 10],
            [5, 10],
            [20, 10],
        ];
        const circle = newShapeThrough("circle", inLine, FRAME);
        expectValid(circle);
        if (circle.kind !== "circle") throw new Error("not a circle");
        expect(circle.geometry.radius).toBeGreaterThan(0);
        const block = newShapeThrough("block", inLine, FRAME);
        expectValid(block);
        if (block.kind !== "block") throw new Error("not a block");
        expect(
            block.geometry.rows * block.geometry.cols,
        ).toBeGreaterThanOrEqual(3);
        // Every marcher gets its own place
        expectDistinct(shapeSlotPoints(block, 3));
    });

    it("a freehand path through marchers on one spot falls back to a valid path around them", () => {
        const shape = newShapeThrough(
            "freehand",
            [
                [3, 3],
                [3, 3],
                [3, 3],
            ],
            FRAME,
        );
        expectValid(shape);
        expectDistinct(shapeSlotPoints(shape, 3));
        const b = shapeBounds(shape);
        expect((b.minX + b.maxX) / 2).toBeCloseTo(3);
        expect((b.minY + b.maxY) / 2).toBeCloseTo(3);
    });

    it("a box surrounds them, and a block has a cell for each of them over the same ground", () => {
        expect(newShapeThrough("box", POINTS, FRAME).geometry).toEqual({
            origin: [10, 10],
            width: 20,
            height: 30,
        });
        const block = newShapeThrough("block", POINTS, FRAME);
        expect(block.geometry).toEqual({
            origin: [10, 10],
            rows: 2,
            cols: 2,
            spacing: [20, 30],
        });
    });

    it("marchers on one spot fall back to a shape of the frame's size around them", () => {
        const spot: XY[] = [
            [7, 7],
            [7, 7],
        ];
        for (const kind of SHAPE_KINDS) {
            const shape = newShapeThrough(kind, spot, FRAME);
            expectValid(shape);
            const b = shapeBounds(shape);
            expect((b.minX + b.maxX) / 2).toBeCloseTo(7);
        }
    });

    it("planNewShape plans a create", () => {
        expect(planNewShape("box", POINTS, FRAME)).toEqual({
            fn: "create",
            args: {
                kind: "box",
                geometry: { origin: [10, 10], width: 20, height: 30 },
            },
        });
    });
});

describe("convertShape", () => {
    it("every kind becomes every other as valid geometry", () => {
        for (const shape of ALL)
            for (const kind of SHAPE_KINDS) {
                const converted = convertShape(shape, kind, FRAME, 0);
                expect(converted.kind).toBe(kind);
                expectValid(converted);
            }
    });

    it("keeps the path where it can", () => {
        expect(convertShape(LINE, "freehand", FRAME, 0).geometry).toEqual(
            LINE.geometry,
        );
        expect(convertShape(FREEHAND, "line", FRAME, 0).geometry).toEqual({
            points: [
                [0, 0],
                [10, 0],
            ],
        });
        expect(convertShape(BOX, "freehand", FRAME, 0).geometry).toEqual({
            points: [
                [0, 0],
                [8, 0],
                [8, 4],
                [0, 4],
            ],
        });
        const ring = convertShape(CIRCLE, "freehand", FRAME, 0);
        if (ring.kind !== "freehand") throw new Error("not freehand");
        expect(ring.geometry.points).toHaveLength(16);
        // Open, starting at the start angle (straight up from the centre)
        expect(ring.geometry.points[0]![0]).toBeCloseTo(5);
        expect(ring.geometry.points[0]![1]).toBeCloseTo(9);
        expect(ring.geometry.points[15]).not.toEqual(ring.geometry.points[0]);
        // Clockwise: the angle decreases, toward +x
        expect(ring.geometry.points[1]![0]).toBeGreaterThan(5);
    });

    it("every kind change keeps each user's slot points distinct", () => {
        for (const shape of ALL)
            for (const kind of SHAPE_KINDS)
                for (const slots of [2, 3, 5, 16, 17, 40]) {
                    const converted = convertShape(shape, kind, FRAME, slots);
                    expectDistinct(
                        shapeSlotPoints(converted, slots),
                        `${shape.kind} -> ${kind}, ${slots} slots`,
                    );
                }
    });

    it("covers the same ground", () => {
        expect(convertShape(BOX, "circle", FRAME, 0).geometry).toEqual({
            center: [4, 2],
            radius: 4,
            start_angle: 0,
            clockwise: false,
        });
        expect(convertShape(CIRCLE, "box", FRAME, 0).geometry).toEqual({
            origin: [1, 1],
            width: 8,
            height: 8,
        });
        expect(convertShape(BLOCK, "box", FRAME, 0).geometry).toEqual({
            origin: [0, 0],
            width: 4,
            height: 2,
        });
    });

    it("a new block has a cell for every slot of the transitions using the shape (I-T4)", () => {
        for (const cells of [0, 1, 16, 17, 40, 300]) {
            const block = convertShape(LINE, "block", FRAME, cells);
            if (block.kind !== "block") throw new Error("not a block");
            const capacity = block.geometry.rows * block.geometry.cols;
            expect(capacity).toBeGreaterThanOrEqual(
                Math.max(cells, DEFAULT_BLOCK_CELLS),
            );
            expectValid(block);
        }
    });
});

describe("planShapeEdit", () => {
    it("renames, trimming, and an empty name clears it", () => {
        expect(
            planShapeEdit(
                target(LINE),
                { kind: "rename", name: " Opener " },
                FRAME,
            ),
        ).toEqual({ fn: "update", args: { id: 1, name: "Opener" } });
        expect(
            planShapeEdit(
                target(LINE, { name: "Opener" }),
                { kind: "rename", name: "  " },
                FRAME,
            ),
        ).toEqual({ fn: "update", args: { id: 1, name: null } });
    });

    it("plans nothing for a change that writes nothing", () => {
        const named = target(LINE, { name: "Opener" });
        expect(
            planShapeEdit(named, { kind: "rename", name: "Opener " }, FRAME),
        ).toBeNull();
        expect(
            planShapeEdit(named, { kind: "kind", to: "line" }, FRAME),
        ).toBeNull();
        expect(
            planShapeEdit(
                named,
                {
                    kind: "geometry",
                    geometry: {
                        points: [
                            [0, 0],
                            [10, 0],
                        ],
                    },
                },
                FRAME,
            ),
        ).toBeNull();
    });

    it("a start angle is planned normalized, so a full turn more writes nothing (I-S1)", () => {
        if (CIRCLE.kind !== "circle") throw new Error("not a circle");
        const circle = target(CIRCLE);
        expect(
            planShapeEdit(
                circle,
                {
                    kind: "geometry",
                    geometry: {
                        ...CIRCLE.geometry,
                        start_angle: Math.PI / 2 + 2 * Math.PI,
                    },
                },
                FRAME,
            ),
        ).toBeNull();
        expect(
            planShapeEdit(
                circle,
                {
                    kind: "geometry",
                    geometry: { ...CIRCLE.geometry, start_angle: -Math.PI / 2 },
                },
                FRAME,
            ),
        ).toEqual({
            fn: "update",
            args: {
                id: 1,
                geometry: { ...CIRCLE.geometry, start_angle: 1.5 * Math.PI },
            },
        });
    });

    it("plans geometry as given, so the db-functions and the database decide (E-S1, E-T4)", () => {
        if (BLOCK.kind !== "block") throw new Error("not a block");
        const used = target(BLOCK, {
            usedBy: [{ transitionId: 4, style: "direct", slotCount: 6 }],
            minCells: 6,
        });
        expect(
            planShapeEdit(
                used,
                { kind: "geometry", geometry: { ...BLOCK.geometry, rows: 1 } },
                FRAME,
            ),
        ).toEqual({
            fn: "update",
            args: { id: 1, geometry: { ...BLOCK.geometry, rows: 1 } },
        });
    });

    it("a kind change converts the geometry, with room for the transitions using it", () => {
        const plan = planShapeEdit(
            target(LINE, {
                usedBy: [{ transitionId: 4, style: "direct", slotCount: 20 }],
                minCells: 20,
            }),
            { kind: "kind", to: "block" },
            FRAME,
        );
        expect(plan?.fn).toBe("update");
        if (plan?.fn !== "update") throw new Error("not an update");
        expect(plan.args.kind).toBe("block");
        const geometry = plan.args.geometry as { rows: number; cols: number };
        expect(geometry.rows * geometry.cols).toBeGreaterThanOrEqual(20);
    });

    it("non-whole rows or columns are planned as typed, and the validator refuses them (E-S1)", () => {
        if (BLOCK.kind !== "block") throw new Error("not a block");
        for (const change of [{ rows: 2.5 }, { cols: 1.5 }]) {
            const geometry = { ...BLOCK.geometry, ...change };
            expect(
                planShapeEdit(
                    target(BLOCK),
                    { kind: "geometry", geometry },
                    FRAME,
                ),
            ).toEqual({ fn: "update", args: { id: 1, geometry } });
            const result = validateShapeGeometry("block", geometry);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.errors[0]!.code).toBe("E-S1");
        }
    });

    it("plans a delete", () => {
        expect(planShapeEdit(target(BOX), { kind: "delete" }, FRAME)).toEqual({
            fn: "delete",
            shapeId: 1,
        });
    });
});

describe("shapeFrameFor", () => {
    it("is the field's middle, 16 steps across, with 2 steps between cells", () => {
        expect(
            shapeFrameFor({ width: 800, height: 400, pixelsPerStep: 10 }),
        ).toEqual({ center: [400, 200], size: 160, spacing: 20 });
        expect(shapeFrameFor(null)).toEqual({
            center: [0, 0],
            size: 16,
            spacing: 2,
        });
    });
});
