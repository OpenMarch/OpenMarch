import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModifiedBeats } from "../EditableTimingMarkersPlugin";
import type Beat from "@/global/classes/Beat";

describe("getModifiedBeats", () => {
    // Mock console functions to prevent test output pollution
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleLog = console.log;

    beforeEach(() => {
        console.error = vi.fn();
        console.warn = vi.fn();
        console.log = vi.fn();
    });

    afterEach(() => {
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
        console.log = originalConsoleLog;
    });

    // Test data
    const mockBeats: Beat[] = [
        {
            id: 1,
            position: 0,
            duration: 1.0,
            includeInMeasure: true,
            notes: null,
            index: 0,
            timestamp: 0,
        },
        {
            id: 2,
            position: 1,
            duration: 1.0,
            includeInMeasure: true,
            notes: null,
            index: 1,
            timestamp: 1,
        },
        {
            id: 3,
            position: 2,
            duration: 2,
            includeInMeasure: true,
            notes: null,
            index: 2,
            timestamp: 2.5,
        },
        {
            id: 4,
            position: 4,
            duration: 2,
            includeInMeasure: true,
            notes: null,
            index: 3,
            timestamp: 4,
        },
    ];

    it("should return undefined when duration hasn't changed", () => {
        // Create a region with the same duration as the beat
        const beatRegions = new Map([
            [1, { start: 0 }],
            [2, { start: 1 }],
            [3, { start: 2 }],
            [4, { start: 4 }],
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: mockBeats[1],
            beatRegions,
        });

        // Should return undefined since duration hasn't changed
        expect(result).toBeUndefined();
        // Should not log an error
    });

    it("should return modified beat with new duration when decreased (dragged right)", () => {
        // Create a region with increased duration
        const beatRegions = new Map([
            [1, { start: 0 }],
            [2, { start: 1.5 }], // Current beat ends at 2.5
            [3, { start: 8 }], // Next beat starts at 2.5
            [4, { start: 11 }],
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: mockBeats[2],
            beatRegions,
        });

        // Should return an array with the modified beat
        expect(result).toEqual([
            {
                id: 3,
                duration: 3,
            },
            {
                id: 2,
                duration: 6.5,
            },
        ]);
    });

    it("should return modified beat with new duration when increased (dragged left)", () => {
        // Create a region with decreased duration
        const beatRegions = new Map([
            [1, { start: 0 }],
            [2, { start: 0.5 }],
            [3, { start: 5 }],
            [4, { start: 9.1 }],
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: mockBeats[2],
            beatRegions,
        });

        // Should return an array with the modified beat
        expect(result).toEqual([
            {
                id: 3,
                duration: 4.1,
            },
            {
                id: 2,
                duration: 4.5,
            },
        ]);
    });
    it("should return undefined when duration of previous beat goes to 0", () => {
        // Create a region with decreased duration
        const beatRegions = new Map([
            [1, { start: 0 }],
            [2, { start: 0.5 }],
            [3, { start: 0.5 }],
            [4, { start: 4 }],
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: mockBeats[2],
            beatRegions,
        });

        // Should return an array with the modified beat
        expect(result).toBe(undefined);
    });

    it("should modify previous beat when current beat's duration is increased", () => {
        // Create a region with increased duration for the second beat

        const beatRegions = new Map([
            [1, { start: 0 }],
            [2, { start: 1 }], // Current beat ends at 1.5
            [3, { start: 1.5 }], // Next beat starts at 1.5
            [4, { start: 4 }],
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: mockBeats[2],
            beatRegions,
        });

        // Should return an array with both the modified beat and the previous beat
        expect(result).toEqual([
            {
                id: 3,
                duration: 2.5, // Increased by 0.5
            },
            {
                id: 2,
                duration: 0.5, // Decreased by 0.5
            },
        ]);
    });

    it("should handle edge case with no previous beats", () => {
        // Create a region for the first beat
        const beatRegions = new Map([
            [1, { start: 0 }],
            [2, { start: 2 }],
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: mockBeats[0],
            beatRegions,
        });

        // Should only modify the current beat since there's no previous beat
        expect(result).toEqual([
            {
                id: 1,
                duration: 2.0,
            },
        ]);
    });

    it("should handle edge case with previous beat having insufficient duration", () => {
        // Create a region with a large increase in duration
        const beatRegions = new Map([
            [1, { start: 0 }],
            [2, { start: 0.8 }],
        ]);

        // The previous beat (id: 1) has duration 1.0, which is equal to the increase
        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: mockBeats[1],
            beatRegions: beatRegions,
        });

        // Should only modify the current beat since the previous beat doesn't have enough duration
        expect(result).toBe(undefined);
    });

    it("should handle the case when the beat is the last beat in the array", () => {
        const beatRegions = new Map([
            [1, { start: 0 }],
            [2, { start: 2 }],
            [3, { start: 5 }],
            [4, { start: 6 }],
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: mockBeats[3], // Last beat
            beatRegions,
        });

        // Should only modify the previous beat since it's the last one
        expect(result).toEqual([
            {
                id: 3,
                duration: 1.0,
            },
        ]);
    });

    it("should return undefined when previous region is not found", () => {
        // Create a beat with index > 1 to trigger the previous beat check
        const testBeat = {
            ...mockBeats[1],
            index: 2, // Set index > 1 to trigger previous beat check
        };

        // Use an incomplete beat regions map that's missing the previous beat
        const incompleteRegions = new Map([
            [2, { start: 1 }],
            [3, { start: 2 }],
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: testBeat,
            beatRegions: incompleteRegions,
        });

        // Should return undefined and log a warning
        expect(result).toBeUndefined();
    });

    it("should return undefined when next region is not found", () => {
        // Create a beat with index < allBeats.length - 1 to trigger the next beat check
        const testBeat = {
            ...mockBeats[0],
            index: 0, // First beat
        };

        // Use an incomplete beat regions map that's missing the next beat
        const incompleteRegions = new Map([
            [1, { start: 0 }],
            // Missing beat 2
            [3, { start: 2 }],
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: testBeat,
            beatRegions: incompleteRegions,
        });

        // Should return undefined and log a warning
        expect(result).toBeUndefined();
    });

    it("should return undefined when beat overlaps with previous beat", () => {
        // Setup regions where the previous beat would be overlapped
        const overlappingRegions = new Map([
            [1, { start: 0 }], // Previous beat ends at 1
            [2, { start: 0.5 }], // Current beat starts at 0.5 (overlaps)
            [3, { start: 0.3 }],
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: mockBeats[2],
            beatRegions: overlappingRegions,
        });

        // Should return undefined and log a warning
        expect(result).toBeUndefined();
    });

    it("should return undefined when beat overlaps with next beat", () => {
        // Setup regions where the next beat would be overlapped
        const overlappingRegions = new Map([
            [1, { start: 0 }],
            [2, { start: 2 }], // Current beat ends at 2.5
            [3, { start: 1.5 }], // Next beat starts at 1.5 (overlaps)
        ]);

        const result = getModifiedBeats({
            allBeats: mockBeats,
            beat: mockBeats[1],
            beatRegions: overlappingRegions,
        });

        // Should return undefined and log a warning
        expect(result).toBeUndefined();
        expect(console.log).toHaveBeenCalledWith(
            "Beat cannot overlap with next beat",
            expect.anything(),
            expect.anything(),
        );
    });
});
