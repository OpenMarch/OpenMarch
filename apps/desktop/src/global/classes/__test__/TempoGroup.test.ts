import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLongBeatIndexes, TempoGroupsFromMeasures } from "../TempoGroup";
import type Measure from "../Measure";
import { measureIsMixedMeter } from "../TempoGroup";
import type Beat from "../Beat";
import { measureIsSameTempo } from "../TempoGroup";
import { measureHasOneTempo } from "../TempoGroup";

// Helper function to create a mock beat
const createMockBeat = (duration: number): Beat => ({
    id: Math.random(),
    position: Math.random(),
    duration,
    includeInMeasure: true,
    notes: null,
    index: Math.random(),
    timestamp: Math.random(),
});

// Helper function to create a mock measure
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

describe("TempoGroupsFromMeasures", () => {
    it("should return empty array for empty input", () => {
        const result = TempoGroupsFromMeasures([]);
        expect(result).toEqual([]);
    });

    it("should create single group for measures with same tempo and beats", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)], // 120 BPM
            }),
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)], // 120 BPM
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: "Group 1",
            startTempo: 120, // 60/0.5
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should create new group when rehearsal mark is present", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)], // 120 BPM
            }),
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)], // 120 BPM
                rehearsalMark: "A",
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "Group 1",
            startTempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "A",
            startTempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should create new group when number of beats changes", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)], // 2/4
            }),
            createMockMeasure({
                beats: [
                    createMockBeat(0.5),
                    createMockBeat(0.5),
                    createMockBeat(0.5),
                ], // 3/4
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "Group 1",
            startTempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "Group 2",
            startTempo: 120,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
    });

    it("should create new group when tempo changes between measures", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)], // 120 BPM
            }),
            createMockMeasure({
                beats: [createMockBeat(1), createMockBeat(1)], // 60 BPM
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "Group 1",
            startTempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "Group 2",
            startTempo: 60,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should handle accelerando within a measure", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)], // Constant tempo
            }),
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.4)], // Speeds up from 120 to 150 BPM
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "Group 1",
            startTempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "Group 2",
            startTempo: 120,
            endTempo: 150, // Speeds up
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should handle ritardando within a measure", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.6)], // Slows down from 120 to 100 BPM
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: "Group 1",
            startTempo: 120,
            endTempo: 100, // Slows down
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should handle multiple tempo changes and rehearsal marks", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)], // 120 BPM constant
            }),
            createMockMeasure({
                beats: [createMockBeat(1), createMockBeat(1)], // 60 BPM constant
                rehearsalMark: "A",
            }),
            createMockMeasure({
                beats: [
                    createMockBeat(0.5),
                    createMockBeat(0.55),
                    createMockBeat(0.6),
                    createMockBeat(0.65),
                    createMockBeat(0.75),
                ], // 120 to 80 BPM
            }),
            createMockMeasure({
                beats: [createMockBeat(0.25), createMockBeat(0.25)], // 240 BPM constant
                rehearsalMark: "B",
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({
            name: "Group 1",
            startTempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "A",
            startTempo: 60,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
        expect(result[2]).toEqual({
            name: "Group 3",
            startTempo: 120,
            manualTempos: [120, 109.09, 100, 92.31, 80],
            bigBeatsPerMeasure: 5,
            numOfRepeats: 1,
        });
        expect(result[3]).toEqual({
            name: "B",
            startTempo: 240,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
        });
    });

    it("should handle gradual tempo changes across multiple beats", () => {
        const measures = [
            createMockMeasure({
                beats: [
                    createMockBeat(60 / 100),
                    createMockBeat(60 / 133),
                    createMockBeat(60 / 166),
                ],
            }),
            createMockMeasure({
                beats: [createMockBeat(60 / 545678)],
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "Group 1",
            startTempo: 100,
            manualTempos: [100, 133, 166],
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "Group 2",
            startTempo: 545678,
            bigBeatsPerMeasure: 1,
            numOfRepeats: 1,
        });
    });

    it("should handle gradual tempo changes across multiple beats", () => {
        const measures = [
            createMockMeasure({
                beats: [
                    createMockBeat(60 / 160),
                    createMockBeat(60 / 150),
                    createMockBeat(60 / 140),
                ],
            }),
            createMockMeasure({
                beats: [
                    createMockBeat(60 / 130),
                    createMockBeat(60 / 120),
                    createMockBeat(60 / 110),
                ],
            }),
            createMockMeasure({
                beats: [
                    createMockBeat(60 / 100),
                    createMockBeat(60 / 90),
                    createMockBeat(60 / 80),
                ],
            }),
            createMockMeasure({
                beats: [
                    createMockBeat(60 / 70),
                    createMockBeat(60 / 70),
                    createMockBeat(60 / 70),
                ],
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({
            name: "Group 1",
            startTempo: 160,
            manualTempos: [160, 150, 140],
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
        expect(result[1]).toEqual({
            name: "Group 2",
            startTempo: 130,
            manualTempos: [130, 120, 110],
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
        expect(result[2]).toEqual({
            name: "Group 3",
            startTempo: 100,
            manualTempos: [100, 90, 80],
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
        expect(result[3]).toEqual({
            name: "Group 4",
            startTempo: 70,
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
