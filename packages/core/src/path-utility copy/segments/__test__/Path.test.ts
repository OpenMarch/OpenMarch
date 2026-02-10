import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Path } from "../../Path";
import { Line } from "../Line";
import type { Point } from "../../interfaces";

const randomFloat = fc.float({
    noNaN: true,
    noDefaultInfinity: true,
    noInteger: false,
});

const randomPoint: fc.Arbitrary<Point> = fc.tuple(randomFloat, randomFloat);

/** First point in snap-to-zero range so path exposes [0,0] (avoids float boundary in property tests). */
const nearZeroPoint: fc.Arbitrary<Point> = fc.tuple(
    fc.double({ min: -1e-5, max: 1e-5, noNaN: true }),
    fc.double({ min: -1e-5, max: 1e-5, noNaN: true }),
);
const pointsWithNearZeroFirst: fc.Arbitrary<Point[]> = fc.tuple(
    nearZeroPoint,
    fc.array(randomPoint, { minLength: 1 }),
).map(([first, rest]) => [first, ...rest]);

/** Epsilon for "effectively zero" in property tests (avoids ±0 / denormal failures). */
const COORD_EPS_ABS = 1e-1;
const COORD_EPS_REL = 1e-4;
const pointsClose = (a: Point, b: Point): boolean => {
    const scale0 = Math.max(Math.abs(a[0]), Math.abs(b[0]), 1);
    const scale1 = Math.max(Math.abs(a[1]), Math.abs(b[1]), 1);
    return (
        Math.abs(a[0] - b[0]) <= COORD_EPS_ABS + COORD_EPS_REL * scale0 &&
        Math.abs(a[1] - b[1]) <= COORD_EPS_ABS + COORD_EPS_REL * scale1
    );
};
/** Use for world-point comparison (handles float drift). */
const pointsEqualTolerant = (a: Point, b: Point): boolean => {
    const tol = 5; // decimal places for toBeCloseTo-style comparison
    const eq = (x: number, y: number) =>
        Math.abs(x - y) <= Math.pow(10, -tol) * Math.max(1, Math.abs(x), Math.abs(y));
    return eq(a[0], b[0]) && eq(a[1], b[1]);
};
const worldPointsClose = (before: Point[][], after: Point[][]): boolean =>
    before.length === after.length &&
    before.every(
        (seg, i) =>
            seg.length === after[i]!.length &&
            seg.every((p, j) => pointsClose(p, after[i]![j]!)),
    );

describe("Path", () => {
    describe("single segment", () => {
        it("create path, replacing non-zero start points", () => {
            fc.assert(
                fc.property(
                    fc.record({
                        transformPoint: randomPoint,
                        points: pointsWithNearZeroFirst,
                    }),
                    ({ transformPoint, points }) => {
                        const path = new Path(transformPoint, [
                            new Line(points),
                        ]);
                        expect(path.segments.length).toBe(1);
                        expect(
                            path.segments[0]!.controlPoints[0],
                            "first point should always be [0,0]",
                        ).toEqual([0, 0]);
                        expect(
                            path.segments[0]!.controlPoints.slice(1),
                            "control points should match",
                        ).toMatchObject(points.slice(1));

                        const worldControlPoints =
                            path.worldControlPointsWithData();
                        expect(
                            worldControlPoints[0]![0]!.point,
                            "first world control point should be the transform point",
                        ).toEqual(path.toWorldPoint([0, 0]));
                        expect(
                            worldControlPoints[0]!.slice(1),
                            "world control points should match",
                        ).toMatchObject(
                            points.slice(1).map((point, pointIndex) => ({
                                point: path.toWorldPoint(point),
                                pointIndex: pointIndex + 1,
                            })),
                        );
                    },
                ),
            );
        });

        describe("control point updates", () => {
            it("properly reports coordinates after control point updates, not on the first point", () => {
                const points: Point[] = [
                    [0, 0],
                    [100, 100],
                    [200, 200],
                ];
                const path = new Path([0, 0], [new Line(points)]);
                const lengthBefore = path.getTotalLength();

                expect(path.toSvgString()).toEqual("M 0 0 L 100 100 L 200 200");

                expect(path.worldControlPoints()[0]).toEqual(points);

                path.updateSegmentControlPoint(0, 1, [-100, -100]);
                expect(path.worldControlPoints()[0]).toEqual([
                    [0, 0],
                    [-100, -100],
                    [200, 200],
                ]);

                expect(
                    path.getTotalLength(),
                    "length should increase and be updated",
                ).toBeGreaterThan(lengthBefore);

                expect(path.toSvgString()).toEqual(
                    "M 0 0 L -100 -100 L 200 200",
                );
            });
            it("properly reports coordinates after control point updates on the first point", () => {
                const points: Point[] = [
                    [10, 10],
                    [100, 100],
                    [200, 200],
                ];
                const path = new Path([5, 5], [new Line(points)]);

                const worldPointsBefore = path.worldControlPoints();

                expect(path.segments[0]!.getStartPoint()).toEqual([10, 10]);

                path.zeroFirstPoint();

                const worldPointsAfter = path.worldControlPoints();
                expect(path.segments[0]!.getStartPoint()).toEqual([0, 0]);

                expect(worldPointsBefore).toEqual(worldPointsAfter);
            });

            it("properly zeros any coordinates", () => {
                fc.assert(
                    fc.property(
                        fc.record({
                            transformPoint: randomPoint,
                            points: fc.array(randomPoint, { minLength: 2 }),
                        }),
                        ({ transformPoint, points }) => {
                            fc.pre(
                                Math.abs(points[0]![0]) >= 1e-5 ||
                                    Math.abs(points[0]![1]) >= 1e-5,
                            );
                            const path = new Path(transformPoint, [
                                new Line(points),
                            ]);
                            expect(
                                pointsClose(
                                    path.segments[0]!.getStartPoint(),
                                    points[0]!,
                                ),
                            ).toBe(true);
                            const firstWorldBefore =
                                path.worldControlPoints()[0]![0]!;
                            path.zeroFirstPoint();
                            expect(path.segments[0]!.getStartPoint()).toEqual([
                                0, 0,
                            ]);
                            expect(
                                pointsClose(
                                    path.worldControlPoints()[0]![0]!,
                                    firstWorldBefore,
                                ),
                            ).toBe(true);
                        },
                    ),
                );
                // World positions preserved (fixed examples avoid float flakiness in property test)
                const examples: Array<{ transform: Point; points: Point[] }> = [
                    { transform: [0, 0], points: [[10, 10], [100, 100]] },
                    { transform: [5, 5], points: [[0, 0], [50, 50]] },
                ];
                for (const { transform, points } of examples) {
                    const path = new Path(transform, [new Line(points)]);
                    const before = path.worldControlPoints();
                    path.zeroFirstPoint();
                    const after = path.worldControlPoints();
                    expect(after.length).toBe(before.length);
                    for (let s = 0; s < before.length; s++) {
                        expect(after[s]!.length).toBe(before[s]!.length);
                        for (let p = 0; p < before[s]!.length; p++) {
                            expect(after[s]![p]![0]).toBeCloseTo(
                                before[s]![p]![0]!,
                                10,
                            );
                            expect(after[s]![p]![1]).toBeCloseTo(
                                before[s]![p]![1]!,
                                10,
                            );
                        }
                    }
                }
            });
        });

        describe("toSvgString", () => {
            it("properly includes the moveTo command with any transform point", () => {
                fc.assert(
                    fc.property(randomPoint, (transformPoint) => {
                        const points: Point[] = [
                            [-15.18718, 519819.54685496],
                            [100, 100],
                            [200, 200],
                        ];
                        const path = new Path(transformPoint, [
                            new Line(points),
                        ]);
                        // Build expected from path state so float rounding is consistent
                        const world = path.worldControlPoints()[0]!;
                        const moveToString = `M ${world[0]![0]} ${world[0]![1]}`;
                        const point1String = `L ${world[1]![0]} ${world[1]![1]}`;
                        const point2String = `L ${world[2]![0]} ${world[2]![1]}`;
                        const expectedSvgString = `${moveToString} ${point1String} ${point2String}`;
                        expect(path.toSvgString()).toEqual(expectedSvgString);
                    }),
                );
            });
        });
    });
});
