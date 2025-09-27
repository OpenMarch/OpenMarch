import { describe, it, expect } from "vitest";
import { findSurroundingTimestamps } from "../../Keyframes";

describe("findSurroundingTimestamps", () => {
    it("should handle empty array", () => {
        const result = findSurroundingTimestamps({
            sortedTimestamps: [],
            targetTimestamp: 100,
        });

        expect(result).toEqual({
            current: null,
            next: null,
        });
    });

    it("should handle target before first element", () => {
        const sortedTimestamps = [100, 200, 300, 400, 500];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 50,
        });

        expect(result).toEqual({
            current: null,
            next: 100,
        });
    });

    it("should handle target after last element", () => {
        const sortedTimestamps = [100, 200, 300, 400, 500];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 600,
        });

        expect(result).toEqual({
            current: 500,
            next: null,
        });
    });

    it("should handle target at last element", () => {
        const sortedTimestamps = [100, 200, 300, 400, 500];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 500,
        });

        expect(result).toEqual({
            current: 500,
            next: null,
        });
    });

    it("should handle target at exact match in middle", () => {
        const sortedTimestamps = [100, 200, 300, 400, 500];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 300,
        });

        expect(result).toEqual({
            current: 300,
            next: 400,
        });
    });

    it("should handle target at exact match at beginning", () => {
        const sortedTimestamps = [100, 200, 300, 400, 500];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 100,
        });

        expect(result).toEqual({
            current: 100,
            next: 200,
        });
    });

    it("should handle target between two elements", () => {
        const sortedTimestamps = [100, 200, 300, 400, 500];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 250,
        });

        expect(result).toEqual({
            current: 200,
            next: 300,
        });
    });

    it("should handle single element array with target before", () => {
        const sortedTimestamps = [100];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 50,
        });

        expect(result).toEqual({
            current: null,
            next: 100,
        });
    });

    it("should handle single element array with target after", () => {
        const sortedTimestamps = [100];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 150,
        });

        expect(result).toEqual({
            current: 100,
            next: null,
        });
    });

    it("should handle single element array with target at element", () => {
        const sortedTimestamps = [100];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 100,
        });

        expect(result).toEqual({
            current: 100,
            next: null,
        });
    });

    it("should handle two element array with target between", () => {
        const sortedTimestamps = [100, 200];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 150,
        });

        expect(result).toEqual({
            current: 100,
            next: 200,
        });
    });

    it("should handle two element array with target at first", () => {
        const sortedTimestamps = [100, 200];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 100,
        });

        expect(result).toEqual({
            current: 100,
            next: 200,
        });
    });

    it("should handle two element array with target at second", () => {
        const sortedTimestamps = [100, 200];
        const result = findSurroundingTimestamps({
            sortedTimestamps,
            targetTimestamp: 200,
        });

        expect(result).toEqual({
            current: 200,
            next: null,
        });
    });

    it("should handle large array with multiple scenarios", () => {
        const sortedTimestamps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

        // Test various positions
        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 5,
            }),
        ).toEqual({ current: null, next: 10 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 15,
            }),
        ).toEqual({ current: 10, next: 20 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 25,
            }),
        ).toEqual({ current: 20, next: 30 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 35,
            }),
        ).toEqual({ current: 30, next: 40 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 45,
            }),
        ).toEqual({ current: 40, next: 50 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 55,
            }),
        ).toEqual({ current: 50, next: 60 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 65,
            }),
        ).toEqual({ current: 60, next: 70 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 75,
            }),
        ).toEqual({ current: 70, next: 80 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 85,
            }),
        ).toEqual({ current: 80, next: 90 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 95,
            }),
        ).toEqual({ current: 90, next: 100 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 105,
            }),
        ).toEqual({ current: 100, next: null });
    });

    it("should handle array with duplicate timestamps", () => {
        const sortedTimestamps = [100, 200, 200, 300, 400];

        // Target at duplicate - binary search finds the middle occurrence
        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 200,
            }),
        ).toEqual({ current: 200, next: 300 });

        // Target between duplicates
        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 150,
            }),
        ).toEqual({ current: 100, next: 200 });

        // Target after duplicates
        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 250,
            }),
        ).toEqual({ current: 200, next: 300 });
    });

    it("should handle array with negative timestamps", () => {
        const sortedTimestamps = [-100, -50, 0, 50, 100];

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: -150,
            }),
        ).toEqual({ current: null, next: -100 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: -75,
            }),
        ).toEqual({ current: -100, next: -50 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: -25,
            }),
        ).toEqual({ current: -50, next: 0 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 25,
            }),
        ).toEqual({ current: 0, next: 50 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 75,
            }),
        ).toEqual({ current: 50, next: 100 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 150,
            }),
        ).toEqual({ current: 100, next: null });
    });

    it("should handle array with decimal timestamps", () => {
        const sortedTimestamps = [1.5, 2.3, 3.7, 4.1, 5.9];

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 1.0,
            }),
        ).toEqual({ current: null, next: 1.5 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 2.0,
            }),
        ).toEqual({ current: 1.5, next: 2.3 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 3.0,
            }),
        ).toEqual({ current: 2.3, next: 3.7 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 4.0,
            }),
        ).toEqual({ current: 3.7, next: 4.1 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 5.0,
            }),
        ).toEqual({ current: 4.1, next: 5.9 });

        expect(
            findSurroundingTimestamps({
                sortedTimestamps,
                targetTimestamp: 6.0,
            }),
        ).toEqual({ current: 5.9, next: null });
    });
});
