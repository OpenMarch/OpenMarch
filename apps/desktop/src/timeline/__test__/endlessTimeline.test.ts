// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calculateTimestamps } from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";
import { createCountGrid } from "../countGrid";
import {
    beatsThrough,
    endlessIdOf,
    measuresThrough,
    metronomeBeats,
    movesPastEnd,
    playbackStopBeat,
} from "../endlessTimeline";

/** Beat 0, then eight counts of 0.5 s in two measures of 4 (from beats 1 and 5) */
const beats = calculateTimestamps(
    [0, ...Array(8).fill(0.5)].map((duration, index) => ({
        id: index + 1,
        position: index,
        duration,
        includeInMeasure: true,
        notes: null,
        index,
        timestamp: 0,
    })),
);
const measure = (id: number, start: number, number: number): Measure => ({
    id,
    startBeat: beats[start]!,
    number,
    rehearsalMark: null,
    notes: null,
    duration: 2,
    counts: 4,
    beats: beats.slice(start, start + 4),
    timestamp: beats[start]!.timestamp,
});
const measures = [measure(1, 1, 1), measure(2, 5, 2)];
const grid = createCountGrid({ beats, measureStarts: [1, 5] });

describe("endless counts on the timeline", () => {
    it("draws endless beats after the stored ones, timed by the grid, with ids nothing stores", () => {
        expect(beatsThrough(grid, beats, 5)).toBe(beats);
        const drawn = beatsThrough(grid, beats, 14);
        expect(drawn.length).toBe(14);
        expect(drawn.slice(0, 9)).toEqual(beats);
        expect(drawn[9]).toMatchObject({
            index: 9,
            timestamp: 4,
            duration: 0.5,
        });
        expect(drawn[13]!.timestamp).toBe(6);
        expect(drawn[12]!.id).toBe(endlessIdOf(12));
        expect(drawn[12]!.id).toBeLessThan(-1);
        expect(new Set(drawn.map((b) => b.position)).size).toBe(14);
    });

    it("clicks the metronome up to the stop point, never on it (EC-6)", () => {
        // Only stored counts: the show ends after the last stored count, so it is the stored beats
        expect(metronomeBeats(grid, beats, beats.length)).toBe(beats);
        // Counting on past the stored counts, the last click is the count before the stop point
        const stop = 13;
        const clicks = metronomeBeats(grid, beats, stop);
        expect(clicks.map((b) => b.index).at(-1)).toBe(stop - 1);
        expect(clicks.every((b) => b.timestamp < grid.timeAtBeat(stop))).toBe(
            true,
        );
        // Stored counts past the stop point (an older file's, after its last page) aren't clicked
        expect(metronomeBeats(grid, beats, 5).map((b) => b.index)).toEqual([
            0, 1, 2, 3, 4,
        ]);
    });

    it("numbers endless measures on, on the meter's downbeats", () => {
        const drawn = beatsThrough(grid, beats, 18);
        const all = measuresThrough(grid, measures, drawn);
        expect(all.slice(0, 2)).toEqual(measures);
        expect(
            all.slice(2).map((m) => [m.number, m.startBeat.index, m.counts]),
        ).toEqual([
            [3, 9, 4],
            [4, 13, 4],
            [5, 17, 1],
        ]);
        expect(all[2]!.id).toBe(endlessIdOf(9));
        expect(measuresThrough(grid, measures, beats)).toBe(measures);
    });

    it("stops playback at the latest of the show's end, the music's end and the last move's end", () => {
        const stop = (
            showEndBeat: number,
            music: number | null,
            move: number,
        ) =>
            playbackStopBeat({
                grid,
                showEndBeat,
                musicEndSeconds: music,
                lastMoveEndBeat: move,
            });
        expect(stop(9, null, 0)).toBe(9);
        // 10.2 s is during beat 21 (from 10 s): the stop is the next whole count
        expect(stop(9, 10.2, 0)).toBe(22);
        expect(stop(9, 10, 0)).toBe(21);
        expect(stop(9, 4, 30)).toBe(30);
    });

    it("counts the moves past the show's end, and where the last one ends", () => {
        expect(movesPastEnd([], 9)).toEqual({ count: 0, lastEndBeat: 9 });
        expect(
            movesPastEnd(
                [
                    { start: 1, end: 9 },
                    { start: 5, end: 12 },
                    { start: 20, end: 31 },
                ],
                9,
            ),
        ).toEqual({ count: 2, lastEndBeat: 31 });
    });
});
