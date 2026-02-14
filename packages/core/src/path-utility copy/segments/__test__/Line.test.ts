import { describe, it, expect } from "vitest";
import { Line, type NewSegment } from "../Line";
import type { Point } from "../../interfaces";

describe("getNewSegmentPointsForTypeChange", () => {
    it("Segment with two points", () => {
        const line = new Line([
            [20, 20],
            [30, 30],
        ]);
        const newSegments = line.getNewSegmentPointsForTypeChange(0);
        expect(newSegments).toEqual([
            {
                points: [
                    [20, 20],
                    [30, 30],
                ],
                useOldType: false,
            },
        ]);
    });

    it.for<
        [
            splitPointIndex: number,
            expected: { useOldType: boolean; points: Point[] }[],
        ]
    >([
        [
            0,
            [
                {
                    points: [
                        [20, 20],
                        [30, 30],
                    ],
                    useOldType: false,
                },
                {
                    points: [
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: true,
                },
            ],
        ],
        [
            1,
            [
                {
                    points: [
                        [20, 20],
                        [30, 30],
                    ],
                    useOldType: true,
                },
                {
                    points: [
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: false,
                },
            ],
        ],
    ])("%# - Segment with three points", ([splitPointIndex, expected]) => {
        const line = new Line([
            [20, 20],
            [30, 30],
            [40, 40],
        ]);
        const newSegments =
            line.getNewSegmentPointsForTypeChange(splitPointIndex);
        expect(newSegments).toEqual(expected);
    });
    it.for<
        [
            splitPointIndex: number,
            expected: { useOldType: boolean; points: Point[] }[],
        ]
    >([
        [
            0,
            [
                {
                    points: [
                        [20, 20],
                        [30, 30],
                    ],
                    useOldType: false,
                },
                {
                    points: [
                        [30, 30],
                        [40, 40],
                        [50, 50],
                    ],
                    useOldType: true,
                },
            ],
        ],
        [
            1,
            [
                {
                    points: [
                        [20, 20],
                        [30, 30],
                    ],
                    useOldType: true,
                },
                {
                    points: [
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: false,
                },
                {
                    points: [
                        [40, 40],
                        [50, 50],
                    ],
                    useOldType: true,
                },
            ],
        ],
        [
            2,
            [
                {
                    points: [
                        [20, 20],
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: true,
                },
                {
                    points: [
                        [40, 40],
                        [50, 50],
                    ],
                    useOldType: false,
                },
            ],
        ],
    ])("%# - Segment with four points", ([splitPointIndex, expected]) => {
        const line = new Line([
            [20, 20],
            [30, 30],
            [40, 40],
            [50, 50],
        ]);
        const newSegments =
            line.getNewSegmentPointsForTypeChange(splitPointIndex);
        expect(newSegments).toEqual(expected);
    });

    it.for<[number, NewSegment[]]>([
        [
            0,
            [
                {
                    points: [
                        [0, 0],
                        [10, 10],
                    ],
                    useOldType: false,
                },
                {
                    points: [
                        [10, 10],
                        [20, 20],
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: true,
                },
            ],
        ],
        [
            1,
            [
                {
                    points: [
                        [0, 0],
                        [10, 10],
                    ],
                    useOldType: true,
                },
                {
                    points: [
                        [10, 10],
                        [20, 20],
                    ],
                    useOldType: false,
                },
                {
                    points: [
                        [20, 20],
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: true,
                },
            ],
        ],
        [
            2,
            [
                {
                    points: [
                        [0, 0],
                        [10, 10],
                        [20, 20],
                    ],
                    useOldType: true,
                },
                {
                    points: [
                        [20, 20],
                        [30, 30],
                    ],
                    useOldType: false,
                },
                {
                    points: [
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: true,
                },
            ],
        ],
        [
            3,
            [
                {
                    points: [
                        [0, 0],
                        [10, 10],
                        [20, 20],
                        [30, 30],
                    ],
                    useOldType: true,
                },
                {
                    points: [
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: false,
                },
            ],
        ],
    ])("%# - Segment with five points", ([splitPointIndex, expected]) => {
        const line = new Line([
            [0, 0],
            [10, 10],
            [20, 20],
            [30, 30],
            [40, 40],
        ]);
        const newSegments =
            line.getNewSegmentPointsForTypeChange(splitPointIndex);
        expect(newSegments).toEqual(expected);
    });
    it.for<[number, NewSegment[]]>([
        [
            0,
            [
                {
                    points: [
                        [0, 0],
                        [10, 10],
                    ],
                    useOldType: false,
                },
                {
                    points: [
                        [10, 10],
                        [20, 20],
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: true,
                },
            ],
        ],
        [
            1,
            [
                {
                    points: [
                        [0, 0],
                        [10, 10],
                    ],
                    useOldType: true,
                },
                {
                    points: [
                        [10, 10],
                        [20, 20],
                    ],
                    useOldType: false,
                },
                {
                    points: [
                        [20, 20],
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: true,
                },
            ],
        ],
        [
            2,
            [
                {
                    points: [
                        [0, 0],
                        [10, 10],
                        [20, 20],
                    ],
                    useOldType: true,
                },
                {
                    points: [
                        [20, 20],
                        [30, 30],
                    ],
                    useOldType: false,
                },
                {
                    points: [
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: true,
                },
            ],
        ],
        [
            3,
            [
                {
                    points: [
                        [0, 0],
                        [10, 10],
                        [20, 20],
                        [30, 30],
                    ],
                    useOldType: true,
                },
                {
                    points: [
                        [30, 30],
                        [40, 40],
                    ],
                    useOldType: false,
                },
            ],
        ],
    ])("%# - Segment with five points", ([splitPointIndex, expected]) => {
        const line = new Line([
            [0, 0],
            [10, 10],
            [20, 20],
            [30, 30],
            [40, 40],
        ]);
        const newSegments =
            line.getNewSegmentPointsForTypeChange(splitPointIndex);
        expect(newSegments).toEqual(expected);
    });

    it("throws an error with a bad split point index", () => {
        const line = new Line([
            [0, 0],
            [10, 10],
            [20, 20],
            [30, 30],
            [40, 40],
        ]);
        expect(() => line.getNewSegmentPointsForTypeChange(-1)).toThrow();
        expect(() =>
            line.getNewSegmentPointsForTypeChange(line.controlPoints.length),
        ).toThrow();
        expect(() =>
            line.getNewSegmentPointsForTypeChange(
                line.controlPoints.length - 1,
            ),
        ).toThrow();
        expect(() => line.getNewSegmentPointsForTypeChange(0)).not.toThrow();
        expect(() =>
            line.getNewSegmentPointsForTypeChange(
                line.controlPoints.length - 2,
            ),
        ).not.toThrow();
    });
});
