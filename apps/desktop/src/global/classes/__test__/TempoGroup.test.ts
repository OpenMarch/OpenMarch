import { describe, expect, it } from "vitest";
import { TempoGroupsFromMeasures } from "../TempoGroup";
import type Measure from "../Measure";
import type Beat from "../Beat";

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
                beats: [createMockBeat(0.5), createMockBeat(0.6)], // 120 to 100 BPM
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
            endTempo: 100, // Slows down
            bigBeatsPerMeasure: 2,
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
                    createMockBeat(0.5), // 120 BPM
                    createMockBeat(0.55), // ~109 BPM
                    createMockBeat(0.6), // 100 BPM
                ],
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: "Group 1",
            startTempo: 120,
            endTempo: 100, // Gradually slows down
            bigBeatsPerMeasure: 3,
            numOfRepeats: 1,
        });
    });
});
