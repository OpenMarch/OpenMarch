import { describe, expect, it } from "vitest";
import type { MarcherTimeline } from "../types";
import {
    getCoordinateAtTime,
    _getTimestampIndex,
    _getTimestampIndexAndProgress,
    _tweenCoordinates,
} from "../calculation";

const timeline = (
    timestamps: number[],
    coordinates: number[],
): MarcherTimeline => ({
    timestamps: new Float32Array(timestamps),
    coordinates: new Float32Array(coordinates),
});

describe("_tweenCoordinates", () => {
    describe("happy paths", () => {
        it("returns the start coordinate when progress is 0", () => {
            expect(_tweenCoordinates(0, 0, 10, 20, 0)).toEqual([0, 0]);
        });

        it("returns the end coordinate when progress is 1", () => {
            expect(_tweenCoordinates(0, 0, 10, 20, 1)).toEqual([10, 20]);
        });

        it("returns the midpoint when progress is 0.5", () => {
            expect(_tweenCoordinates(0, 0, 10, 20, 0.5)).toEqual([5, 10]);
        });

        it("interpolates both axes at fractional progress", () => {
            const [x, y] = _tweenCoordinates(0, 0, 8, 12, 0.25);
            expect(x).toBeCloseTo(2);
            expect(y).toBeCloseTo(3);
        });

        it("returns the same point when start and end are identical", () => {
            expect(_tweenCoordinates(5, -3, 5, -3, 0.5)).toEqual([5, -3]);
        });

        it("handles negative and mixed-sign coordinates", () => {
            const [x, y] = _tweenCoordinates(-10, 4, 10, -4, 0.5);
            expect(x).toBeCloseTo(0);
            expect(y).toBeCloseTo(0);
        });
    });

    describe("edge cases", () => {
        it("throws when progress is less than 0", () => {
            expect(() => _tweenCoordinates(0, 0, 1, 1, -0.01)).toThrow(
                "progress must be between 0 and 1",
            );
        });

        it("throws when progress is greater than 1", () => {
            expect(() => _tweenCoordinates(0, 0, 1, 1, 1.01)).toThrow(
                "progress must be between 0 and 1",
            );
        });
    });
});

describe("_getTimestampIndex", () => {
    const timestamps = new Float32Array([0, 1000, 2000, 3000]);

    describe("happy paths", () => {
        it("returns the first index for an exact first timestamp", () => {
            expect(_getTimestampIndex(timestamps, 0)).toBe(0);
        });

        it("returns a middle index for an exact middle timestamp", () => {
            expect(_getTimestampIndex(timestamps, 2000)).toBe(2);
        });

        it("returns the last index for an exact last timestamp", () => {
            expect(_getTimestampIndex(timestamps, 3000)).toBe(3);
        });

        it("floors to the earlier index between timestamps", () => {
            expect(_getTimestampIndex(timestamps, 1500)).toBe(1);
        });

        it("returns the last index when timeMs is after the last timestamp", () => {
            expect(_getTimestampIndex(timestamps, 9999)).toBe(3);
        });

        it("handles a single-element timestamps array", () => {
            expect(_getTimestampIndex(new Float32Array([500]), 500)).toBe(0);
            expect(_getTimestampIndex(new Float32Array([500]), 1000)).toBe(0);
        });

        it("returns 0 when timeMs is 0 and the first stamp is 0", () => {
            expect(_getTimestampIndex(new Float32Array([0]), 0)).toBe(0);
        });
    });

    describe("edge cases", () => {
        it("throws when timeMs is negative", () => {
            expect(() => _getTimestampIndex(timestamps, -1)).toThrow(
                "timeMs must be non-negative",
            );
        });

        it("throws when timestamps is empty", () => {
            expect(() => _getTimestampIndex(new Float32Array([]), 0)).toThrow(
                "timestamps must not be empty",
            );
        });

        it("throws when timeMs is before the first timestamp", () => {
            expect(() =>
                _getTimestampIndex(new Float32Array([100, 200]), 50),
            ).toThrow(
                "No timestamp found that was less than or equal to timeMs: 50",
            );
        });
    });
});

describe("_getTimestampIndexAndProgress", () => {
    const timestamps = new Float32Array([0, 1000, 2000]);

    describe("happy paths", () => {
        it("returns index and progress for a mid-interval time (doc example)", () => {
            expect(_getTimestampIndexAndProgress(timestamps, 1500)).toEqual({
                index: 1,
                progress: 0.5,
            });
        });

        it("returns progress 0 at an exact middle timestamp", () => {
            expect(_getTimestampIndexAndProgress(timestamps, 1000)).toEqual({
                index: 1,
                progress: 0,
            });
        });

        it("returns progress 0 at the last timestamp", () => {
            expect(_getTimestampIndexAndProgress(timestamps, 2000)).toEqual({
                index: 2,
                progress: 0,
            });
        });

        it("returns progress 0 past the last timestamp", () => {
            expect(_getTimestampIndexAndProgress(timestamps, 2500)).toEqual({
                index: 2,
                progress: 0,
            });
        });

        it("returns progress 0 at the start of an interval", () => {
            expect(_getTimestampIndexAndProgress(timestamps, 0)).toEqual({
                index: 0,
                progress: 0,
            });
        });

        it("returns progress close to 1 near the end of an interval", () => {
            const { index, progress } = _getTimestampIndexAndProgress(
                timestamps,
                1999,
            );
            expect(index).toBe(1);
            expect(progress).toBeCloseTo(0.999);
        });
    });

    describe("edge cases", () => {
        it("resolves duplicate timestamps to the last matching index with progress 0", () => {
            // Binary search returns the rightmost stamp ≤ timeMs, so equal
            // consecutive values land on the last duplicate (no next equal stamp).
            expect(
                _getTimestampIndexAndProgress(
                    new Float32Array([0, 1000, 1000]),
                    1000,
                ),
            ).toEqual({ index: 2, progress: 0 });
        });

        it("propagates negative timeMs errors from _getTimestampIndex", () => {
            expect(() => _getTimestampIndexAndProgress(timestamps, -1)).toThrow(
                "timeMs must be non-negative",
            );
        });

        it("propagates empty timestamps errors from _getTimestampIndex", () => {
            expect(() =>
                _getTimestampIndexAndProgress(new Float32Array([]), 0),
            ).toThrow("timestamps must not be empty");
        });
    });
});

describe("getCoordinateAtTime", () => {
    const marcherTimeline = timeline([0, 1000, 2000], [0, 0, 10, 20, 40, 60]);

    describe("happy paths", () => {
        it("returns the first coordinate at the first timestamp", () => {
            expect(getCoordinateAtTime(marcherTimeline, 0)).toEqual([0, 0]);
        });

        it("tween mid-interval between the first and second points", () => {
            const [x, y] = getCoordinateAtTime(marcherTimeline, 500);
            expect(x).toBeCloseTo(5);
            expect(y).toBeCloseTo(10);
        });

        it("returns the second coordinate at the second timestamp", () => {
            expect(getCoordinateAtTime(marcherTimeline, 1000)).toEqual([
                10, 20,
            ]);
        });

        it("tween mid-interval between the second and third points", () => {
            const [x, y] = getCoordinateAtTime(marcherTimeline, 1500);
            expect(x).toBeCloseTo(25);
            expect(y).toBeCloseTo(40);
        });

        it("returns the last coordinate at the last timestamp", () => {
            expect(getCoordinateAtTime(marcherTimeline, 2000)).toEqual([
                40, 60,
            ]);
        });

        it("holds the last coordinate after the last timestamp", () => {
            expect(getCoordinateAtTime(marcherTimeline, 3000)).toEqual([
                40, 60,
            ]);
        });

        it("returns the only point for a single-point timeline", () => {
            const single = timeline([100], [7, 9]);
            expect(getCoordinateAtTime(single, 100)).toEqual([7, 9]);
            expect(getCoordinateAtTime(single, 500)).toEqual([7, 9]);
        });
    });

    describe("edge cases", () => {
        it("throws when timeMs is negative", () => {
            expect(() => getCoordinateAtTime(marcherTimeline, -1)).toThrow(
                "timeMs must be non-negative",
            );
        });

        it("throws when timestamps is empty", () => {
            expect(() => getCoordinateAtTime(timeline([], []), 0)).toThrow(
                "timestamps must not be empty",
            );
        });

        it("holds the last duplicate-timestamp coordinate", () => {
            // See _getTimestampIndexAndProgress: rightmost duplicate wins.
            expect(
                getCoordinateAtTime(
                    timeline([0, 1000, 1000], [0, 0, 1, 1, 2, 2]),
                    1000,
                ),
            ).toEqual([2, 2]);
        });
    });
});
