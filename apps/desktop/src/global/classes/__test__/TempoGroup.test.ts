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
            tempo: 120, // 60/0.5
            bigBeatsPerMeasure: 2,
            numOfRepeats: 1,
            measures,
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
        expect(result[0].name).toBe("Group 1");
        expect(result[1].name).toBe("A");
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
        expect(result[0].bigBeatsPerMeasure).toBe(2);
        expect(result[1].bigBeatsPerMeasure).toBe(3);
    });

    it("should create new group when tempo changes", () => {
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
        expect(result[0].tempo).toBe(120);
        expect(result[1].tempo).toBe(60);
    });

    it("should handle measures with varying beat durations (accelerando/ritardando)", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)], // Constant tempo
            }),
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.6)], // Varying tempo
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(2);
        expect(result[0].tempo).toBe(120);
        expect(result[1].tempo).toBeUndefined();
    });

    it("should handle single measure with varying beat durations", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.6)], // Varying tempo
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(1);
        expect(result[0].tempo).toBeUndefined();
    });

    it("should handle multiple tempo changes and rehearsal marks", () => {
        const measures = [
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.5)], // 120 BPM
            }),
            createMockMeasure({
                beats: [createMockBeat(1), createMockBeat(1)], // 60 BPM
                rehearsalMark: "A",
            }),
            createMockMeasure({
                beats: [createMockBeat(0.5), createMockBeat(0.6)], // Varying tempo
            }),
            createMockMeasure({
                beats: [createMockBeat(0.25), createMockBeat(0.25)], // 240 BPM
                rehearsalMark: "B",
            }),
        ];

        const result = TempoGroupsFromMeasures(measures);

        expect(result).toHaveLength(4);
        expect(result[0].tempo).toBe(120);
        expect(result[1].tempo).toBe(60);
        expect(result[1].name).toBe("A");
        expect(result[2].tempo).toBeUndefined();
        expect(result[3].tempo).toBe(240);
        expect(result[3].name).toBe("B");
    });
});
