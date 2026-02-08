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

describe("Path", () => {
    describe("single segment", () => {
        it("create path, replacing non-zero start points", () => {
            fc.assert(
                fc.property(
                    fc.record({
                        transformPoint: randomPoint,
                        points: fc.array(randomPoint, { minLength: 2 }),
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

        it("properly reports coordinates after control point updates", () => {});
    });
});
