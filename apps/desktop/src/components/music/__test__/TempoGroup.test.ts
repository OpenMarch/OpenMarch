import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    getStrongBeatIndexes,
    newBeatsFromTempoGroup,
    TempoGroupsFromMeasures,
    getNewMeasuresFromCreatedBeats,
    getLastBeatOfTempoGroup,
    tempoGroupFromWorkspaceSettings,
} from "../TempoGroup/TempoGroup";
import type Measure from "../../../global/classes/Measure";
import { measureIsMixedMeter } from "../TempoGroup/TempoGroup";
import type Beat from "../../../global/classes/Beat";
import { measureIsSameTempo } from "../TempoGroup/TempoGroup";
import { measureHasOneTempo } from "../TempoGroup/TempoGroup";
import { NewBeatArgs } from "@/db-functions";
import { WorkspaceSettings } from "@/settings/workspaceSettings";
import { fchmod } from "fs";

describe("TempoGroupsFromMeasures", () => {
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
        number = 1,
        id = Math.random(),
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
        number?: number;
        id?: number;
    }): Measure => ({
        id,
        startBeat: beats[0],
        number,
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
    });

    it("should return empty array for empty input", () => {
        expect(TempoGroupsFromMeasures([])).toEqual([]);
    });

    it("should create single group for measures with same tempo and beats", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                rehearsalMark: "A",
                number: 1,
                id: 1,
            }),
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                number: 2,
                id: 2,
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: "A",
            tempo: 120, // 60/0.5
            bigBeatsPerMeasure: 2,
            numOfRepeats: 2,
            strongBeatIndexes: undefined,
            measureRangeString: "m 1-2",
            measures: measures,
        });
    });

    it("should create new group when rehearsal mark is present", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                number: 1,
                id: 1,
            }),
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                rehearsalMark: "A",
                number: 2,
                id: 2,
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 1",
            measures: [measures[0]],
        });
        expect(result[1]).toEqual({
            name: "A",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 2",
            measures: [measures[1]],
        });
    });

    it("should create new group when number of beats changes", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                number: 1,
                id: 1,
            }),
            createMockMeasure({
                beats: [
                    createMockBeat(0.5),
                    createMockBeat(0.5),
                    createMockBeat(0.5),
                ],
                number: 2,
                id: 2,
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 1",
            measures: [measures[0]],
        });
        expect(result[1]).toEqual({
            name: "",
            tempo: 120,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 2",
            measures: [measures[1]],
        });
    });

    it("should create new group when tempo changes between measures", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                number: 1,
                id: 1,
            }),
            createMockMeasure({
                beats: [createMockBeat(0.4), createMockBeat(0.4)],
                number: 2,
                id: 2,
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 1",
            measures: [measures[0]],
        });
        expect(result[1]).toEqual({
            name: "",
            tempo: 150, // 60/0.4
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 2",
            measures: [measures[1]],
        });
    });

    it("should handle accelerando within a measure", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                number: 1,
                id: 1,
            }),
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.4)],
                number: 2,
                id: 2,
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: "",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 1",
            measures: [measures[0]],
        });
        expect(result[1]).toEqual({
            name: "",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            manualTempos: [120, 150],
            measureRangeString: "m 2",
            measures: [measures[1]],
        });
    });

    it("should handle ritardando within a measure", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.6)],
                number: 1,
                id: 1,
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: "",
            tempo: 120,
            manualTempos: [120, 100],
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 1",
            measures: [measures[0]],
        });
    });

    it("should handle multiple tempo changes and rehearsal marks", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                number: 1,
                id: 1,
            }),
            createMockMeasure({
                beats: [createMockBeat(0.4), createMockBeat(0.4)],
                rehearsalMark: "A",
                number: 2,
                id: 2,
            }),
            createMockMeasure({
                beats: [createMockBeat(0.4), createMockBeat(0.4)],
                number: 3,
                id: 3,
            }),
            createMockMeasure({
                beats: [createMockBeat(0.4), createMockBeat(0.3)],
                number: 4,
                id: 4,
            }),
            createMockMeasure({
                beats: [createMockBeat(0.3), createMockBeat(0.3)],
                rehearsalMark: "B",
                number: 5,
                id: 5,
            }),
            createMockMeasure({
                beats: [createMockBeat(0.3), createMockBeat(0.3)],
                number: 6,
                id: 6,
            }),
            createMockMeasure({
                beats: [createMockBeat(0.3), createMockBeat(0.3)],
                number: 7,
                id: 7,
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({
            name: "",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 1",
            measures: [measures[0]],
        });
        expect(result[1]).toEqual({
            name: "A",
            tempo: 150,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 2,
            strongBeatIndexes: undefined,
            measureRangeString: "m 2-3",
            measures: [measures[1], measures[2]],
        });
        expect(result[2]).toEqual({
            name: "",
            tempo: 150,
            manualTempos: [150, 200],
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 4",
            measures: [measures[3]],
        });
        expect(result[3]).toEqual({
            name: "B",
            tempo: 200,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 3,
            strongBeatIndexes: undefined,
            measureRangeString: "m 5-7",
            measures: [measures[4], measures[5], measures[6]],
        });
    });

    it("should handle gradual tempo changes across multiple beats", () => {
        const measures = [
            createMockMeasure({
                beats: [
                    createMockBeat(0.6),
                    createMockBeat(0.45),
                    createMockBeat(0.36),
                ],
                number: 1,
            }),
            createMockMeasure({
                beats: [
                    createMockBeat(0.3),
                    createMockBeat(0.3),
                    createMockBeat(0.3),
                ],
                number: 2,
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
            name: "",
            tempo: 100,
            manualTempos: [100, 133.33, 166.67].map(
                (t) => Math.round(t * 100) / 100,
            ),
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 1",
            measures: [measures[0]],
        });
        expect(result[1]).toMatchObject({
            name: "",
            tempo: 200,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 2",
            measures: [measures[1]],
        });
    });

    it("should handle gradual tempo changes across multiple beats", () => {
        const measures = [
            createMockMeasure({
                beats: [
                    createMockBeat(0.375), // 160 BPM
                    createMockBeat(0.4), // 150 BPM
                    createMockBeat(0.429), // 140 BPM
                ],
                number: 1,
            }),
            createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                    createMockBeat(0.5),
                ],
                number: 2,
            }),
            createMockMeasure({
                beats: [
                    createMockBeat(0.6), // 100 BPM
                    createMockBeat(0.6),
                    createMockBeat(0.6),
                ],
                number: 3,
            }),
            createMockMeasure({
                beats: [
                    createMockBeat(0.75), // 80 BPM
                    createMockBeat(0.75),
                    createMockBeat(0.75),
                ],
                number: 4,
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(4);
        expect(result[0]).toMatchObject({
            name: "",
            tempo: 160,
            manualTempos: [160, 150, 139.86],
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 1",
            measures: [measures[0]],
        });
        expect(result[1]).toMatchObject({
            name: "",
            tempo: 120,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 2",
            measures: [measures[1]],
        });
        expect(result[2]).toMatchObject({
            name: "",
            tempo: 100,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 3",
            measures: [measures[2]],
        });
        expect(result[3]).toMatchObject({
            name: "",
            tempo: 80,
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
            strongBeatIndexes: undefined,
            measureRangeString: "m 4",
            measures: [measures[3]],
        });
    });

    const beatArraysToMockMeasures = (durations: number[][]) => {
        return durations.map((durations, i) => {
            return createMockMeasure({
                beats: durations.map((duration) => createMockBeat(duration)),
                number: i + 1,
                id: i + 1,
            });
        });
    };

    it.each([
        {
            durations: [
                [0.75, 0.75, 0.5],
                [0.75, 0.75, 0.5],
                [0.5, 0.5, 0.75],
                [0.5, 0.5, 0.75],
            ],
            expected: [
                {
                    name: "",
                    tempo: 120,
                    bigBeatsPerMeasure: 3,
                    numOfRepeats: 2,
                    strongBeatIndexes: [0, 1],
                    measureRangeString: "m 1-2",
                    measures: (measures: Measure[]) => [
                        measures[0],
                        measures[1],
                    ],
                },
                {
                    name: "",
                    tempo: 120,
                    bigBeatsPerMeasure: 3,
                    numOfRepeats: 2,
                    strongBeatIndexes: [2],
                    measureRangeString: "m 3-4",
                    measures: (measures: Measure[]) => [
                        measures[2],
                        measures[3],
                    ],
                },
            ],
        },
        {
            durations: [
                [0.75, 0.75, 0.5],
                [0.75, 0.75, 0.5],
            ],
            expected: [
                {
                    name: "",
                    tempo: 120,
                    bigBeatsPerMeasure: 3,
                    numOfRepeats: 2,
                    strongBeatIndexes: [0, 1],
                    measureRangeString: "m 1-2",
                    measures: (measures: Measure[]) => [
                        measures[0],
                        measures[1],
                    ],
                },
            ],
        },
    ])("should handle tempo changes", ({ durations, expected }) => {
        const measures = beatArraysToMockMeasures(durations);
        const result = TempoGroupsFromMeasures(measures);
        expect(result).toEqual(
            expected.map((exp) => ({
                ...exp,
                measures: exp.measures(measures),
            })),
        );
    });
});

describe("getStrongBeatIndexes", () => {
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
        expect(getStrongBeatIndexes(measure)).toEqual([2]);
    });

    it("should return correct indexes for 7/8 time (3+2+2 pattern)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.6), // long (1.5x)
                createMockBeat(0.4), // short
                createMockBeat(0.4), // short
            ],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([0]);
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
        expect(getStrongBeatIndexes(measure)).toEqual([0, 2]);
    });

    it("should return correct indexes for 8/8 time (3+3+2 pattern)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.6), // long
                createMockBeat(0.6), // long
                createMockBeat(0.4), // short
            ],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([0, 1]);
    });

    it("should return empty array and log error for non-mixed meter (all same duration)", () => {
        const measure = createMockMeasure({
            beats: [
                createMockBeat(0.5),
                createMockBeat(0.5),
                createMockBeat(0.5),
            ],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([]);
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
        expect(getStrongBeatIndexes(measure)).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Measure is not a mixed meter",
            measure,
        );
    });

    it("should return empty array and log error for empty measure", () => {
        const measure = createMockMeasure({
            beats: [],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Measure is not a mixed meter",
            measure,
        );
    });

    it("should return empty array and log error for single beat measure", () => {
        const measure = createMockMeasure({
            beats: [createMockBeat(0.5)],
        });
        expect(getStrongBeatIndexes(measure)).toEqual([]);
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
        number = 1,
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
        number?: number;
    }): Measure => ({
        id: Math.random(),
        startBeat: beats[0],
        number,
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
    });

    describe("Regular tempo measures", () => {
        it("should return true when both measures have the same tempo", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should return false when measures have different tempos", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.4), // 150 BPM
                    createMockBeat(0.4),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });

        it("should return false when first measure has varying tempos", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.4), // 150 BPM
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });

        it("should return false when second measure has varying tempos", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.4), // 150 BPM
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });
    });

    describe("Mixed meter measures", () => {
        it("should return true for identical 7/8 measures (2+2+3 pattern)", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should return true for identical 7/8 measures (3+2+2 pattern)", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should return false for different mixed meter patterns with same total duration", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long (2+2+3)
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short (3+2+2)
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });

        it("should return true for 10/8 measures with same pattern (3+2+3+2)", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should return false when comparing mixed meter to regular meter", () => {
            const mixedMeter = createMockMeasure({
                beats: [
                    createMockBeat(0.6), // long
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                ],
                number: 1,
            });
            const regularMeter = createMockMeasure({
                beats: [
                    createMockBeat(0.5),
                    createMockBeat(0.5),
                    createMockBeat(0.5),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(mixedMeter, regularMeter)).toBe(false);
        });

        it("should return false for mixed meter measures with different base tempos", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.4), // short
                    createMockBeat(0.4), // short
                    createMockBeat(0.6), // long
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.3), // short (faster tempo)
                    createMockBeat(0.3), // short
                    createMockBeat(0.45), // long
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });
    });

    describe("Edge cases", () => {
        it("should return false when first measure is empty", () => {
            const measure1 = createMockMeasure({
                beats: [],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });

        it("should return false when second measure is empty", () => {
            const measure1 = createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(false);
        });

        it("should handle floating point precision in regular tempo calculations", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.5),
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.500001), // Should be considered same
                    createMockBeat(0.500001),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should handle floating point precision in mixed meter calculations", () => {
            const measure1 = createMockMeasure({
                beats: [
                    createMockBeat(0.4),
                    createMockBeat(0.4),
                    createMockBeat(0.6),
                ],
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [
                    createMockBeat(0.400001),
                    createMockBeat(0.400001),
                    createMockBeat(0.600001),
                ],
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });

        it("should return true for single beat measures with same tempo", () => {
            const measure1 = createMockMeasure({
                beats: [createMockBeat(0.5)], // 120 BPM
                number: 1,
            });
            const measure2 = createMockMeasure({
                beats: [createMockBeat(0.5)], // 120 BPM
                number: 2,
            });
            expect(measureIsSameTempo(measure1, measure2)).toBe(true);
        });
    });
});
describe("newBeatsFromTempoGroup", () => {
    it("should create beats with constant tempo when no ", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 1,
            bigBeatsPerMeasure: 4,
        });
        expect(result).toHaveLength(4); // 1 repeat * 4 beats
        result.forEach((beat: NewBeatArgs) => {
            expect(beat.duration).toBe(0.5); // 60/120 = 0.5
            expect(beat.include_in_measure).toBe(true);
        });
    });

    it("should create beats with constant tempo when ", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 1,
            bigBeatsPerMeasure: 4,
        });
        expect(result).toHaveLength(4);
        result.forEach((beat: NewBeatArgs) => {
            expect(beat.duration).toBe(0.5); // 60/120 = 0.5
            expect(beat.include_in_measure).toBe(true);
        });
    });

    it("should create beats with changing tempo when ", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 1,
            bigBeatsPerMeasure: 4,
            endTempo: 80,
        });
        expect(result).toHaveLength(4);

        const expectedDurations = [
            60 / 120, //
            60 / 110,
            60 / 100,
            60 / 90,
        ].map((d) => Number(d.toFixed(6)));

        result.forEach((beat: NewBeatArgs, index: number) => {
            expect(Number(beat.duration.toFixed(6))).toBe(
                expectedDurations[index],
            );
            expect(beat.include_in_measure).toBe(true);
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
            expect(beat.include_in_measure).toBe(true);
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
        const tempoDelta = (100 - 70) / 6;
        const expectedTempos = Array.from(
            { length: 6 },
            (_, i) => 100 - tempoDelta * i,
        );

        const expectedDurations = expectedTempos
            .map((tempo) => 60 / tempo)
            .map((d) => Number(d.toFixed(6)));

        result.forEach((beat: NewBeatArgs, index: number) => {
            expect(Number(beat.duration.toFixed(6))).toBe(
                expectedDurations[index],
            );
            expect(beat.include_in_measure).toBe(true);
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
        expect(result[0].include_in_measure).toBe(true);
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
            expect(beat.include_in_measure).toBe(true);
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
            expect(beat.include_in_measure).toBe(true);
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

        // With 3 beats going from 180 to 120, the tempo delta is -20
        // Since tempo changes AFTER each repeat (not each beat):
        // All beats in first repeat: 180
        const expectedDurations = [
            60 / 180, //
            60 / 160,
            60 / 140,
        ].map((d) => Number(d.toFixed(6)));

        result.forEach((beat: NewBeatArgs, index: number) => {
            expect(Number(beat.duration.toFixed(6))).toBe(
                expectedDurations[index],
            );
            expect(beat.include_in_measure).toBe(true);
        });
    });
    it.each([
        {
            bigBeatsPerMeasure: 4,
            strongBeatIndexes: [1],
            expectedDurations: [0.5, 0.75, 0.5, 0.5],
        },
        {
            bigBeatsPerMeasure: 4,
            strongBeatIndexes: [1, 3],
            expectedDurations: [0.5, 0.75, 0.5, 0.75],
        },
        {
            bigBeatsPerMeasure: 3,
            strongBeatIndexes: [0, 1],
            expectedDurations: [0.75, 0.75, 0.5],
        },
    ])(
        "should handle mixed meter",
        ({ strongBeatIndexes, expectedDurations, bigBeatsPerMeasure }) => {
            const result = newBeatsFromTempoGroup({
                tempo: 120,
                numRepeats: 1,
                bigBeatsPerMeasure,
                strongBeatIndexes,
            });
            expect(result).toHaveLength(bigBeatsPerMeasure); // 1 repeat * 4 beats
            result.forEach((beat: NewBeatArgs, index: number) => {
                expect(beat.duration).toBe(expectedDurations[index]);
                expect(beat.include_in_measure).toBe(true);
            });
        },
    );
    it("should handle mixed meter with two long beats", () => {
        const result = newBeatsFromTempoGroup({
            tempo: 120,
            numRepeats: 1,
            bigBeatsPerMeasure: 4,
            strongBeatIndexes: [1],
        });
        expect(result).toHaveLength(4); // 1 repeat * 4 beats
        const expectedDurations = [0.5, 0.75, 0.5, 0.5];
        result.forEach((beat: NewBeatArgs, index: number) => {
            expect(beat.duration).toBe(expectedDurations[index]);
            expect(beat.include_in_measure).toBe(true);
        });
    });
});

describe("getNewMeasuresFromCreatedBeats", () => {
    // Helper function to create a mock beat
    const createMockBeat = (id: number): Beat => ({
        id,
        position: Math.random(),
        duration: 0.5,
        includeInMeasure: true,
        notes: null,
        index: Math.random(),
        timestamp: Math.random(),
    });

    it("should create one measure for single repeat", () => {
        const beats = [
            createMockBeat(1),
            createMockBeat(2),
            createMockBeat(3),
            createMockBeat(4),
        ];

        const result = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 1,
            bigBeatsPerMeasure: 4,
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            start_beat: 1,
        });
    });

    it("should create multiple measures for multiple repeats", () => {
        const beats = [
            createMockBeat(1),
            createMockBeat(2),
            createMockBeat(3),
            createMockBeat(4),
            createMockBeat(5),
            createMockBeat(6),
            createMockBeat(7),
            createMockBeat(8),
        ];

        const result = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 2,
            bigBeatsPerMeasure: 4,
        });

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            start_beat: 1,
        });
        expect(result[1]).toEqual({
            start_beat: 5,
        });
    });

    it("should handle single beat per measure", () => {
        const beats = [createMockBeat(1), createMockBeat(2), createMockBeat(3)];

        const result = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 3,
            bigBeatsPerMeasure: 1,
        });

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ start_beat: 1 });
        expect(result[1]).toEqual({ start_beat: 2 });
        expect(result[2]).toEqual({ start_beat: 3 });
    });

    it("should handle large number of beats per measure", () => {
        const beats = Array.from({ length: 16 }, (_, i) =>
            createMockBeat(i + 1),
        );

        const result = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 2,
            bigBeatsPerMeasure: 8,
        });

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ start_beat: 1 });
        expect(result[1]).toEqual({ start_beat: 9 });
    });

    it("should handle edge case with single repeat and single beat", () => {
        const beats = [createMockBeat(1)];

        const result = getNewMeasuresFromCreatedBeats({
            createdBeats: beats,
            numOfRepeats: 1,
            bigBeatsPerMeasure: 1,
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ start_beat: 1 });
    });
});

describe("getLastBeatOfTempoGroup", () => {
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
        number = 1,
        id = Math.random(),
    }: {
        beats: Beat[];
        rehearsalMark?: string | null;
        number?: number;
        id?: number;
    }): Measure => ({
        id,
        startBeat: beats[0],
        number,
        rehearsalMark,
        notes: null,
        duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
        counts: beats.length,
        beats,
        timestamp: Math.random(),
    });

    it("should return undefined for tempo group with no measures", () => {
        const tempoGroup = {
            name: "Test",
            tempo: 120,
            bigBeatsPerMeasure: 4,
            numOfRepeats: 1,
            measures: [],
            measureRangeString: "",
        };

        expect(getLastBeatOfTempoGroup(tempoGroup)).toBeUndefined();
    });

    it("should return undefined for tempo group with undefined measures", () => {
        const tempoGroup = {
            name: "Test",
            tempo: 120,
            bigBeatsPerMeasure: 4,
            numOfRepeats: 1,
            measureRangeString: "",
        };

        expect(getLastBeatOfTempoGroup(tempoGroup as any)).toBeUndefined();
    });

    it("should return the last beat of the last measure in the tempo group", () => {
        const beats1 = [createMockBeat(0.5), createMockBeat(0.5)];
        const beats2 = [
            createMockBeat(0.5),
            createMockBeat(0.5),
            createMockBeat(0.5),
        ];

        const measures = [
            createMockMeasure({ beats: beats1 }),
            createMockMeasure({ beats: beats2 }),
        ];

        const tempoGroup = {
            name: "Test",
            tempo: 120,
            bigBeatsPerMeasure: 4,
            numOfRepeats: 1,
            measures,
            measureRangeString: "m 1-2",
        };

        const result = getLastBeatOfTempoGroup(tempoGroup);
        expect(result).toBeDefined();
        expect(result).toBe(beats2[beats2.length - 1]);
    });

    it("should return the last beat of a single measure tempo group", () => {
        const beats = [createMockBeat(0.5), createMockBeat(0.5)];
        const measure = createMockMeasure({ beats });

        const tempoGroup = {
            name: "Test",
            tempo: 120,
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            measures: [measure],
            measureRangeString: "m 1",
        };

        const result = getLastBeatOfTempoGroup(tempoGroup);
        expect(result).toBeDefined();
        expect(result).toBe(beats[beats.length - 1]);
    });
});

describe("tempoGroupFromWorkspaceSettings", () => {
    type wsPick = Pick<
        WorkspaceSettings,
        "defaultTempo" | "defaultBeatsPerMeasure" | "defaultNewPageCounts"
    >;
    describe("Simple cases", () => {
        it.for([
            {
                wsSettings: {
                    defaultTempo: 120,
                    defaultBeatsPerMeasure: 4,
                    defaultNewPageCounts: 16,
                },
                expected: {
                    name: "",
                    tempo: 120,
                    bigBeatsPerMeasure: 4,
                    numOfRepeats: 4,
                },
            },
            {
                wsSettings: {
                    defaultTempo: 120,
                    defaultBeatsPerMeasure: 4,
                    defaultNewPageCounts: 16,
                },
                expected: {
                    name: "Test",
                    tempo: 120,
                    bigBeatsPerMeasure: 4,
                    numOfRepeats: 4,
                },
                name: "Test",
            },
            // Case where there are not an exact number of beats per measure
            {
                wsSettings: {
                    defaultTempo: 120,
                    defaultBeatsPerMeasure: 4,
                    defaultNewPageCounts: 17,
                },
                expected: {
                    name: "",
                    tempo: 120,
                    bigBeatsPerMeasure: 4,
                    numOfRepeats: 5,
                },
                name: "",
            },
            {
                wsSettings: {
                    defaultTempo: 120,
                    defaultBeatsPerMeasure: 4,
                    defaultNewPageCounts: 14,
                },
                expected: {
                    name: "",
                    tempo: 120,
                    bigBeatsPerMeasure: 4,
                    numOfRepeats: 4,
                },
                name: "",
            },
        ])(
            "%# - {wsSettings: $wsSettings, name: $name}",
            ({ wsSettings, expected, name }) => {
                const result = tempoGroupFromWorkspaceSettings(
                    wsSettings,
                    name,
                );
                expect(result).toMatchObject(expected);
            },
        );
    });
});
