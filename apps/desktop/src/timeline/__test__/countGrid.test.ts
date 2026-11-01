// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createCountGrid } from "../countGrid";
import { continuedCounts, countContinuation } from "../countsPastEnd";
import { beatAtTime, timeAtBeat } from "../timeMap";
import { calculateTimestamps } from "@/global/classes/Beat";

/** Beats with cumulative timestamps, as the app builds them: beat 0 is the fixed zero-length beat */
const showOf = (durations: readonly number[]) =>
    calculateTimestamps(
        [0, ...durations].map((duration, index) => ({
            id: index + 1,
            position: index,
            duration,
            includeInMeasure: true,
            notes: null,
            index,
            timestamp: 0,
        })),
    );

const close = (a: number, b: number, tolerance = 1e-6) =>
    Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b));

/** A show: count lengths, and measure starts every `meter` counts from count 1 (or none) */
const arbitraryShow = fc
    .record({
        durations: fc.array(
            fc.double({
                min: 0.1,
                max: 2,
                noNaN: true,
                noDefaultInfinity: true,
            }),
            { minLength: 1, maxLength: 40 },
        ),
        meter: fc.option(fc.integer({ min: 1, max: 7 }), { nil: null }),
    })
    .map(({ durations, meter }) => {
        const beats = showOf(durations);
        const measureStarts =
            meter === null
                ? []
                : Array.from(
                      { length: Math.ceil(durations.length / meter) },
                      (_, i) => 1 + i * meter,
                  );
        return { beats, measureStarts, meter };
    });

describe("createCountGrid", () => {
    it("agrees with timeMap inside the stored counts", () => {
        fc.assert(
            fc.property(
                arbitraryShow,
                fc.double({ min: 0, max: 1, noNaN: true }),
                ({ beats, measureStarts }, at) => {
                    const grid = createCountGrid({ beats, measureStarts });
                    const beat = at * beats.length * 0.999;
                    expect(grid.timeAtBeat(beat)).toBe(timeAtBeat(beats, beat));
                    const seconds = grid.storedEndSeconds * at * 0.999;
                    expect(grid.beatAtTime(seconds)).toBe(
                        beatAtTime(beats, seconds),
                    );
                },
            ),
        );
    });

    it("goes on past the stored end, increasing", () => {
        fc.assert(
            fc.property(
                arbitraryShow,
                fc.array(fc.double({ min: 0, max: 5000, noNaN: true }), {
                    minLength: 2,
                    maxLength: 10,
                }),
                ({ beats, measureStarts }, beatList) => {
                    const grid = createCountGrid({ beats, measureStarts });
                    const sorted = [...beatList].sort((a, b) => a - b);
                    for (let i = 1; i < sorted.length; i++) {
                        const a = grid.timeAtBeat(sorted[i - 1]!);
                        const b = grid.timeAtBeat(sorted[i]!);
                        expect(b).toBeGreaterThanOrEqual(a);
                    }
                    expect(grid.timeAtBeat(beats.length)).toBe(
                        grid.storedEndSeconds,
                    );
                    expect(grid.timeAtBeat(beats.length + 1)).toBeGreaterThan(
                        grid.storedEndSeconds,
                    );
                },
            ),
        );
    });

    it("round-trips beatAtTime(timeAtBeat(b)) past the end", () => {
        fc.assert(
            fc.property(
                arbitraryShow,
                fc.integer({ min: 0, max: 5000 }),
                fc.double({ min: 0, max: 0.999, noNaN: true }),
                ({ beats, measureStarts }, k, fraction) => {
                    const grid = createCountGrid({ beats, measureStarts });
                    const whole = beats.length + k;
                    expect(grid.beatAtTime(grid.timeAtBeat(whole))).toBe(whole);
                    const beat = whole + fraction;
                    expect(
                        close(grid.beatAtTime(grid.timeAtBeat(beat)), beat),
                    ).toBe(true);
                },
            ),
        );
    });

    it("steps by the continuation's count lengths", () => {
        fc.assert(
            fc.property(
                arbitraryShow,
                fc.integer({ min: 0, max: 300 }),
                ({ beats, measureStarts }, k) => {
                    const grid = createCountGrid({ beats, measureStarts });
                    const b = beats.length + k;
                    expect(
                        close(
                            grid.timeAtBeat(b + 1) - grid.timeAtBeat(b),
                            grid.durationAt(b),
                        ),
                    ).toBe(true);
                },
            ),
        );
    });

    it("carries the last measure's meter on past the end", () => {
        fc.assert(
            fc.property(arbitraryShow, ({ beats, measureStarts, meter }) => {
                const grid = createCountGrid({ beats, measureStarts });
                const counts = grid.countsIn(beats.length, beats.length + 40);
                const downbeats = counts
                    .filter((c) => c.downbeat)
                    .map((c) => c.beat);
                if (meter === null) {
                    expect(downbeats).toEqual([]);
                    return;
                }
                // With one measure, that measure sets the meter itself (`countContinuation`)
                if (measureStarts.length < 2) return;
                // Measures every `meter` counts from count 1, stored or not
                for (const beat of downbeats)
                    expect((beat - 1) % meter).toBe(0);
                expect(downbeats.length).toBeGreaterThanOrEqual(
                    Math.floor(40 / meter),
                );
            }),
        );
    });

    it("repeats the last measure as it sounds, rit. included", () => {
        // 4/4, the last measure slows down: 0.5, 0.6, 0.7, 0.8
        const beats = showOf([0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.7, 0.8]);
        const grid = createCountGrid({ beats, measureStarts: [1, 5] });
        const past = grid.countsIn(9, 16);
        expect(past.map((c) => c.duration)).toEqual([
            0.5, 0.6, 0.7, 0.8, 0.5, 0.6, 0.7, 0.8,
        ]);
        expect(past.map((c) => c.downbeat)).toEqual([
            true,
            false,
            false,
            false,
            true,
            false,
            false,
            false,
        ]);
        expect(past.every((c) => !c.stored)).toBe(true);
        expect(close(grid.timeAtBeat(17), 4.6 + 2 * 2.6)).toBe(true);
    });

    it("finishes a short last measure first", () => {
        // 3/4 with the last measure two counts long: the first endless count ends it
        const beats = showOf([0.5, 0.5, 0.5, 0.5, 0.5]);
        const grid = createCountGrid({ beats, measureStarts: [1, 4] });
        expect(grid.isDownbeat(6)).toBe(false);
        expect(grid.isDownbeat(7)).toBe(true);
        expect(grid.isDownbeat(10)).toBe(true);
    });

    it("agrees with the stored continuation when the last meter is longer than 4096 counts", () => {
        // A 5000-count measure of uneven counts, then a last measure three counts long
        const meter = 5000;
        const durations = [
            ...Array.from({ length: meter }, (_, i) => 0.4 + (i % 7) * 0.05),
            0.5,
            0.5,
            0.5,
        ];
        const beats = showOf(durations);
        const measureStarts = [1, 1 + meter];
        const grid = createCountGrid({ beats, measureStarts });
        const appended = continuedCounts(
            countContinuation({ beats, measureStarts }),
            2 * meter + 10,
        );
        let seconds = grid.storedEndSeconds;
        appended.forEach(({ duration, downbeat }, k) => {
            const beat = beats.length + k;
            if (!close(grid.timeAtBeat(beat), seconds))
                expect(grid.timeAtBeat(beat)).toBeCloseTo(seconds, 6);
            if (grid.durationAt(beat) !== duration)
                expect(grid.durationAt(beat)).toBe(duration);
            if (grid.isDownbeat(beat) !== downbeat)
                expect(grid.isDownbeat(beat)).toBe(downbeat);
            if (k % 997 === 0)
                expect(grid.beatAtTime(seconds)).toBeCloseTo(beat, 6);
            seconds += duration;
        });
    });

    it("answers far past the end without walking there", () => {
        const beats = showOf([0.5, 0.5, 0.5, 0.5]);
        const grid = createCountGrid({ beats, measureStarts: [1] });
        const far = 10_000_000;
        expect(grid.timeAtBeat(far)).toBeCloseTo(2 + (far - 5) * 0.5, 3);
        expect(grid.beatAtTime(grid.timeAtBeat(far))).toBe(far);
    });

    it("tells stored counts from endless ones", () => {
        const beats = showOf([0.5, 0.5]);
        const grid = createCountGrid({ beats, measureStarts: [] });
        expect(grid.storedCount).toBe(3);
        expect(grid.isStored(2)).toBe(true);
        expect(grid.isStored(3)).toBe(false);
        expect(grid.isStored(1.5)).toBe(false);
    });

    it("gives zero for a show still loading", () => {
        const grid = createCountGrid({ beats: [], measureStarts: [] });
        expect(grid.timeAtBeat(12)).toBe(0);
        expect(grid.beatAtTime(12)).toBe(0);
        expect(grid.countsIn(0, 10)).toEqual([]);
    });

    it("continues a show of beat 0 alone at the fallback tempo", () => {
        const grid = createCountGrid({ beats: showOf([]), measureStarts: [] });
        expect(grid.timeAtBeat(3)).toBe(1);
        expect(grid.beatAtTime(1)).toBe(3);
    });
});
