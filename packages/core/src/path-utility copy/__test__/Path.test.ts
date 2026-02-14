import { describe, expect, it } from "vitest";
import { Line } from "../segments/Line";
import { Path } from "../Path";
import { Spline } from "../segments/Spline";

describe("flattenSegmentsOfSameType", () => {
    it("should flatten segments of the same type that are sequential - linear", () => {
        const path = new Path(
            [0, 0],
            [
                new Line([
                    [0, 0],
                    [15, 15],
                ]),
                new Line([
                    [15, 15],
                    [20, 20],
                ]),
                new Spline([
                    [20, 20],
                    [60, 60],
                    [100, 100],
                ]),
            ],
        );
        path._flattenSegmentsOfSameType();
        expect(path.toSimpleObject()).toEqual([
            {
                type: "linear",
                points: [
                    [0, 0],
                    [15, 15],
                    [20, 20],
                ],
            },
            {
                type: "curved",
                points: [
                    [20, 20],
                    [60, 60],
                    [100, 100],
                ],
            },
        ]);
    });

    it("should flatten segments of the same type that are sequential - curved", () => {
        const path = new Path(
            [0, 0],
            [
                new Spline([
                    [0, 0],
                    [15, 15],
                    [20, 20],
                ]),
                new Spline([
                    [20, 20],
                    [60, 60],
                    [100, 100],
                ]),
                new Spline([
                    [100, 100],
                    [140, 140],
                    [180, 180],
                ]),
                new Line([
                    [180, 180],
                    [220, 220],
                ]),
                new Spline([
                    [220, 220],
                    [260, 260],
                    [300, 300],
                ]),
            ],
        );
        path._flattenSegmentsOfSameType();
        expect(path.toSimpleObject()).toEqual([
            {
                type: "curved",
                points: [
                    [0, 0],
                    [15, 15],
                    [20, 20],
                    [60, 60],
                    [100, 100],
                    [140, 140],
                    [180, 180],
                ],
            },
            {
                type: "linear",
                points: [
                    [180, 180],
                    [220, 220],
                ],
            },
            {
                type: "curved",
                points: [
                    [220, 220],
                    [260, 260],
                    [300, 300],
                ],
            },
        ]);
    });

    it("should not flatten segments of different types that are sequential", () => {
        const path = new Path(
            [0, 0],
            [
                new Line([
                    [0, 0],
                    [15, 15],
                ]),
                new Spline([
                    [15, 15],
                    [60, 60],
                    [100, 100],
                ]),
            ],
        );
        path._flattenSegmentsOfSameType();
        expect(path.toSimpleObject()).toEqual([
            {
                type: "linear",
                points: [
                    [0, 0],
                    [15, 15],
                ],
            },
            {
                type: "curved",
                points: [
                    [15, 15],
                    [60, 60],
                    [100, 100],
                ],
            },
        ]);
    });
});
