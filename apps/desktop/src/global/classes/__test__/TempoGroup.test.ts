import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    getLongBeatIndexes,
    newBeatsFromTempoGroup,
    TempoGroupsFromMeasures,
} from "../TempoGroup";
import type Measure from "../Measure";
import { measureIsMixedMeter } from "../TempoGroup";
import type Beat from "../Beat";
import { measureIsSameTempo } from "../TempoGroup";
import { measureHasOneTempo } from "../TempoGroup";
import type { NewBeatArgs } from "electron/database/tables/BeatTable";

// Minimal type for test measures that only includes properties used by TempoGroupsFromMeasures
type TestMeasure = {
    beats: { duration: number; include_in_measure: 1 | 0 }[];
    rehearsalMark?: string | null;
};

describe("TempoGroupsFromMeasures", () => {
    it("should return empty array for empty input", () => {
        expect(TempoGroupsFromMeasures([])).toEqual([]);
    });

    it("should create single group for measures with same tempo and beats", () => {
        const measures = [
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                ],
            },
        ] as TestMeasure[];

        const result = TempoGroupsFromMeasures(measures as any);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: "Group 1",
            tempo: 120, // 60/0.5
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should create new group when rehearsal mark is present", () => {
        const measures = [
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                rehearsalMark: "A",
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                ],
            },
        ] as TestMeasure[];

        const result = TempoGroupsFromMeasures(measures as any);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "Group 1",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "A",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should create new group when number of beats changes", () => {
        const measures = [
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                ],
            },
        ] as TestMeasure[];

        const result = TempoGroupsFromMeasures(measures as any);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "Group 1",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "Group 2",
            tempo: 120,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
    });

    it("should create new group when tempo changes between measures", () => {
        const measures = [
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                beats: [
                    { duration: 0.4, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.4, include_in_measure: 1 as 1 | 0 },
                ],
            },
        ] as TestMeasure[];

        const result = TempoGroupsFromMeasures(measures as any);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "Group 1",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "Group 2",
            tempo: 150, // 60/0.4
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should handle accelerando within a measure", () => {
        const measures = [
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.4, include_in_measure: 1 as 1 | 0 },
                ],
            },
        ] as TestMeasure[];

        const result = TempoGroupsFromMeasures(measures as any);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "Group 1",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "Group 2",
            tempo: 120,
            endTempo: 150,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should handle ritardando within a measure", () => {
        const measures = [
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.6, include_in_measure: 1 as 1 | 0 },
                ],
            },
        ] as TestMeasure[];

        const result = TempoGroupsFromMeasures(measures as any);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: "Group 1",
            tempo: 120,
            endTempo: 100, // 60/0.6
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should handle multiple tempo changes and rehearsal marks", () => {
        const measures = [
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                rehearsalMark: "A",
                beats: [
                    { duration: 0.4, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.4, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                beats: [
                    { duration: 0.4, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.3, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                rehearsalMark: "B",
                beats: [
                    { duration: 0.3, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.3, include_in_measure: 1 as 1 | 0 },
                ],
            },
        ] as TestMeasure[];

        const result = TempoGroupsFromMeasures(measures as any);

        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({
            name: "Group 1",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "A",
            tempo: 150,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[2]).toEqual({
            name: "Group 3",
            tempo: 150,
            manualTempos: [150, 200],
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[3]).toEqual({
            name: "B",
            tempo: 200,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should handle gradual tempo changes across multiple beats", () => {
        const measures = [
            {
                beats: [
                    { duration: 0.6, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.45, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.36, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                beats: [
                    { duration: 0.3, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.3, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.3, include_in_measure: 1 as 1 | 0 },
                ],
            },
        ] as TestMeasure[];

        const result = TempoGroupsFromMeasures(measures as any);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "Group 1",
            tempo: 100,
            manualTempos: [100, 133.33, 166.67],
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "Group 2",
            tempo: 200,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
    });

    it("should handle gradual tempo changes across multiple beats", () => {
        const measures = [
            {
                beats: [
                    { duration: 0.375, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.4, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.428571, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                beats: [
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.5, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                beats: [
                    { duration: 0.6, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.6, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.6, include_in_measure: 1 as 1 | 0 },
                ],
            },
            {
                beats: [
                    { duration: 0.75, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.75, include_in_measure: 1 as 1 | 0 },
                    { duration: 0.75, include_in_measure: 1 as 1 | 0 },
                ],
            },
        ] as TestMeasure[];

        const result = TempoGroupsFromMeasures(measures as any);

        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({
            name: "Group 1",
            tempo: 160,
            manualTempos: [160, 150, 140],
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "Group 2",
            tempo: 120,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
        expect(result[2]).toEqual({
            name: "Group 3",
            tempo: 100,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
        expect(result[3]).toEqual({
            name: "Group 4",
            tempo: 80,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
    });
});

describe("getLongBeatIndexes", () => {
    // Helper function to create a mock beat (reusing from other tests)
    const createMockBeat = (duration: number): Beat => ({
        id: Math.random(),
        position: Math.random(),
        duration,
        includeInMeasure: true,
        notes: null,
        index: Math.random(),
        timestamp: Math.random(),
    });

    // Helper function to create a mock measure (reusing from other tests)
    const createMockMeasure = ({
        beats,
        rehearsalMark = null,
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
    }): Measure => ({
        id: Math.random(),
        startBeat: beats[0],
        number: Math.random(),
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
    });
    // Spy on console.error
    const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

    // Clear mock calls between tests
    beforeEach(() => {
        consoleErrorSpy.mockClear();
    });

    it("should return correct indexes for 7/8 time (2+2+3 pattern)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4), // short
                createMockBeat(0.4), // short
                createMockBeat(0.6), // long (1.5x)
            ],
        });
        expect(getLongBeatIndexes(measure)).toEqual([2]);
    });

    it("should return correct indexes for 7/8 time (3+2+2 pattern)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.6), // long (1.5x)
                createMockBeat(0.4), // short
                createMockBeat(0.4), // short
            ],
        });
        expect(getLongBeatIndexes(measure)).toEqual([0]);
    });

    it("should return correct indexes for 10/8 time (3+2+3+2 pattern)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.6), // long
                createMockBeat(0.4), // short
                createMockBeat(0.6), // long
                createMockBeat(0.4), // short
            ],
        });
        expect(getLongBeatIndexes(measure)).toEqual([0, 2]);
    });

    it("should return correct indexes for 8/8 time (3+3+2 pattern)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.6), // long
                createMockBeat(0.6), // long
                createMockBeat(0.4), // short
            ],
        });
        expect(getLongBeatIndexes(measure)).toEqual([0, 1]);
    });

    it("should return empty array and log error for non-mixed meter (all same duration)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.5),
                createMockBeat(0.5),
            ],
        });
        expect(getLongBeatIndexes(measure)).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Measure is not a mixed meter",
            measure,
        );
    });

    it("should return empty array and log error for measure with three different durations", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4),
                createMockBeat(0.5),
                createMockBeat(0.6),
            ],
        });
        expect(getLongBeatIndexes(measure)).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Measure is not a mixed meter",
            measure,
        );
    });

    it("should return empty array and log error for empty measure", () => {
        const measure = createMockMeasure({
            beats: [],
        });
        expect(getLongBeatIndexes(measure)).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Measure is not a mixed meter",
            measure,
        );
    });

    it("should return empty array and log error for single beat measure", () => {
        const measure = createMockMeasure({
            beats: [createMockBeat(0.5)],
        });
        expect(getLongBeatIndexes(measure)).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Measure is not a mixed meter",
            measure,
        );
    });
});

// Import the function we're testing

describe("measureIsMixedMeter", () => {
    // Helper function to create a mock beat (reusing from TempoGroup.test.ts)
    const createMockBeat = (duration: number): Beat => ({
        id: Math.random(),
        position: Math.random(),
        duration,
        includeInMeasure: true,
        notes: null,
        index: Math.random(),
        timestamp: Math.random(),
    });

    // Helper function to create a mock measure (reusing from TempoGroup.test.ts)
    const createMockMeasure = ({
        beats,
        rehearsalMark = null,
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
    }): Measure => ({
        id: Math.random(),
        startBeat: beats[0],
        number: Math.random(),
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
    });
    it("should return false for measure with single duration", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.5),
                createMockBeat(0.5),
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(false);
    });

    it("should return true for 3:2 ratio (exact values)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4), // shorter duration
                createMockBeat(0.6), // longer duration (1.5x)
                createMockBeat(0.4),
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(true);
    });

    it("should return true for 3:2 ratio with floating point imprecision", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4),
                createMockBeat(0.6000000001), // slightly over 1.5x
                createMockBeat(0.4),
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(true);
    });

    it("should return false for ratio close to but not 3:2", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4),
                createMockBeat(0.65), // ratio > 1.5
                createMockBeat(0.4),
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(false);
    });

    it("should return false for more than two different durations", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.4),
                createMockBeat(0.6),
                createMockBeat(0.5), // third different duration
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(false);
    });

    it("should return false for empty measure", () => {
        const measure = createMockMeasure({
            beats: [],
        });
        expect(measureIsMixedMeter(measure)).toBe(false);
    });

    it("should return false for single beat measure", () => {
        const measure = createMockMeasure({
            beats: [createMockBeat(0.5)],
        });
        expect(measureIsMixedMeter(measure)).toBe(false);
    });

    it("should handle reversed order of durations", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.6), // longer duration first
                createMockBeat(0.4), // shorter duration second
                createMockBeat(0.6),
            ],
        });
        expect(measureIsMixedMeter(measure)).toBe(true);
    });
});

// Import the function we're testing

describe("measureHasOneTempo", () => {
    // Helper function to create a mock beat (reusing from other tests)
    const createMockBeat = (duration: number): Beat => ({
        id: Math.random(),
        position: Math.random(),
        duration,
        includeInMeasure: true,
        notes: null,
        index: Math.random(),
        timestamp: Math.random(),
    });

    // Helper function to create a mock measure (reusing from other tests)
    const createMockMeasure = ({
        beats,
        rehearsalMark = null,
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
    }): Measure => ({
        id: Math.random(),
        startBeat: beats[0],
        number: Math.random(),
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
    });

    it("should return true for measure with all beats having same duration", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.5),
                createMockBeat(0.5),
            ],
        });
        expect(measureHasOneTempo(measure)).toBe(true);
    });

    it("should return false for measure with different beat durations", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.6),
                createMockBeat(0.5),
            ],
        });
        expect(measureHasOneTempo(measure)).toBe(false);
    });

    it("should return true for measure with single beat", () => {
        const measure = createMockMeasure({
            beats: [createMockBeat(0.5)],
        });
        expect(measureHasOneTempo(measure)).toBe(true);
    });

    it("should return true for empty measure", () => {
        const measure = createMockMeasure({
            beats: [],
        });
        expect(measureHasOneTempo(measure)).toBe(true);
    });

    it("should return false for measure with very small duration differences", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.5000001), // Tiny difference
                createMockBeat(0.5),
            ],
        });
        expect(measureHasOneTempo(measure)).toBe(false);
    });

    it("should return true for measure with same durations but different other properties", () => {
        const measure = createMockMeasure({
            beats: [
                { ...createMockBeat(0.5), notes: "note1" },
                { ...createMockBeat(0.5), notes: "note2" },
                { ...createMockBeat(0.5), notes: "note3" },
            ],
        });
        expect(measureHasOneTempo(measure)).toBe(true);
    });
});

// Import the function we're testing

describe("measureIsSameTempo", () => {
    // Helper function to create a mock beat (reusing from other tests)
    const createMockBeat = (duration: number): Beat => ({
        id: Math.random(),
        position: Math.random(),
        duration,
        includeInMeasure: true,
        notes: null,
        index: Math.random(),
        timestamp: Math.random(),
    });

    // Helper function to create a mock measure (reusing from other tests)
    const createMockMeasure = ({
        beats,
        rehearsalMark = null,
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
    }): Measure => ({
        id: Math.random(),
        startBeat: beats[0],
        number: Math.random(),
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
    });

    it("should return true when measure matches expected start tempo only", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5), // 120 BPM
                createMockBeat(0.5),
            ],
        });
        expect(measureIsSameTempo(measure, 120, undefined)).toBe(true);
    });

    it("should return true when measure matches both start and end tempo", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5), // 120 BPM
                createMockBeat(0.5),
            ],
        });
        expect(measureIsSameTempo(measure, 120, 120)).toBe(true);
    });

    it("should return false when measure doesn't match start tempo", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5), // 120 BPM
                createMockBeat(0.5),
            ],
        });
        expect(measureIsSameTempo(measure, 140, undefined)).toBe(false);
    });

    it("should return false when measure matches start but not end tempo", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5), // 120 BPM
                createMockBeat(0.5),
            ],
        });
        expect(measureIsSameTempo(measure, 120, 140)).toBe(false);
    });

    it("should return false for measure with varying tempos", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5), // 120 BPM
                createMockBeat(0.4), // 150 BPM
            ],
        });
        expect(measureIsSameTempo(measure, 120, undefined)).toBe(false);
    });

    it("should return false for empty measure", () => {
        const measure = createMockMeasure({
            beats: [],
        });
        expect(measureIsSameTempo(measure, 120, undefined)).toBe(false);
    });

    it("should handle floating point precision in tempo calculations", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5), // Should be exactly 120 BPM
                createMockBeat(0.5),
            ],
        });
        // Test with a very small difference that should still be considered equal
        expect(measureIsSameTempo(measure, 120.000001, undefined)).toBe(false);
    });

    it("should return true for single beat measure matching tempo", () => {
        const measure = createMockMeasure({
            beats: [createMockBeat(0.5)], // 120 BPM
        });
        expect(measureIsSameTempo(measure, 120, undefined)).toBe(true);
    });
});
describe("newBeatsFromTempoGroup", () => {
    it("should create beats with constant tempo when no endTempo is provided", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 1,
            bigBeatsPerMeasure: 4,
        });
        expect(result).toHaveLength(4); // 1 repeat * 4 beats
        result.forEach((beat: NewBeatArgs) => {
            expect(beat.duration).toBe(0.5); // 60/120 = 0.5
            expect(beat.include_in_measure).toBe(1);
        });
    });

    it("should create beats with constant tempo when endTempo equals tempo", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 1,
            bigBeatsPerMeasure: 4,
            endTempo: 120,
        });
        expect(result).toHaveLength(4);
        result.forEach((beat: NewBeatArgs) => {
            expect(beat.duration).toBe(0.5); // 60/120 = 0.5
            expect(beat.include_in_measure).toBe(1);
        });
    });

    it("should create beats with changing tempo when endTempo is provided", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 1,
            bigBeatsPerMeasure: 4,
            endTempo: 80,
        });
        expect(result).toHaveLength(4);

        const expectedDurations = [60 / 120, 60 / 110, 60 / 100, 60 / 90].map(
            (d) => Number(d.toFixed(6)),
        );

        result.forEach((beat: NewBeatArgs, index: number) => {
            expect(Number(beat.duration.toFixed(6))).toBe(
                expectedDurations[index],
            );
            expect(beat.include_in_measure).toBe(1);
        });
    });

    it("should handle multiple repeats with constant tempo", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 3,
            bigBeatsPerMeasure: 2,
        });
        expect(result).toHaveLength(6); // 3 repeats * 2 beats
        result.forEach((beat: NewBeatArgs) => {
            expect(beat.duration).toBe(0.5);
            expect(beat.include_in_measure).toBe(1);
        });
    });

    it("should handle multiple repeats with changing tempo", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 100,
            numRepeats: 2,
            bigBeatsPerMeasure: 3,
            endTempo: 70,
        });
        expect(result).toHaveLength(6); // 2 repeats * 3 beats
        const tempoDelta = (70 - 100) / (3 * 2);
        const tempos = Array.from(
            { length: 6 },
            (_, i) => 100 + i * tempoDelta,
        );

        // With 3 beats going from 100 to 70, the tempo delta is -10
        // Since tempo changes AFTER each repeat (not each beat):
        // First repeat: all beats at 100
        // Second repeat: all beats at 90 (100 - 10)
        const expectedDurations = [
            60 / tempos[0],
            60 / tempos[1],
            60 / tempos[2],
            60 / tempos[3],
            60 / tempos[4],
            60 / tempos[5],
        ].map((d) => Number(d.toFixed(6)));

        result.forEach((beat: NewBeatArgs, index: number) => {
            expect(Number(beat.duration.toFixed(6))).toBe(
                expectedDurations[index],
            );
            expect(beat.include_in_measure).toBe(1);
        });
    });

    it("should handle edge case with single beat per measure", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 1,
            bigBeatsPerMeasure: 1,
        });
        expect(result).toHaveLength(1);
        expect(result[0].duration).toBe(0.5);
        expect(result[0].include_in_measure).toBe(1);
    });

    it("should handle edge case with very fast tempo", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 240,
            numRepeats: 1,
            bigBeatsPerMeasure: 2,
        });
        expect(result).toHaveLength(2);
        result.forEach((beat: NewBeatArgs) => {
            expect(beat.duration).toBe(0.25); // 60/240 = 0.25
            expect(beat.include_in_measure).toBe(1);
        });
    });

    it("should handle edge case with very slow tempo", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 30,
            numRepeats: 1,
            bigBeatsPerMeasure: 2,
        });
        expect(result).toHaveLength(2);
        result.forEach((beat: NewBeatArgs) => {
            expect(beat.duration).toBe(2); // 60/30 = 2
            expect(beat.include_in_measure).toBe(1);
        });
    });

    it("should handle tempo decrease with beats approaching but not reaching target", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 180,
            numRepeats: 1,
            bigBeatsPerMeasure: 3,
            endTempo: 120,
        });
        expect(result).toHaveLength(3);

        const expectedDurations = [60 / 180, 60 / 160, 60 / 140].map((d) =>
            Number(d.toFixed(6)),
        );

        result.forEach((beat: NewBeatArgs, index: number) => {
            expect(Number(beat.duration.toFixed(6))).toBe(
                expectedDurations[index],
            );
            expect(beat.include_in_measure).toBe(1);
        });
    });
});
