import { describe, expect, it } from "vitest";
import {
    BEAT_BOUNDARY_EPSILON_SECONDS,
    beatAtTime,
    beatIndexAtTime,
    BeatTiming,
    showEndTime,
    timeAtBeat,
} from "../timeMap";
import Beat, { calculateTimestamps } from "@/global/classes/Beat";

/** Beats with cumulative timestamps, built the way the app builds them. */
function beatsFromDurations(durations: number[]): Beat[] {
    return calculateTimestamps(
        durations.map((duration, index) => ({
            id: index + 1,
            position: index,
            duration,
            includeInMeasure: true,
            notes: null,
            index,
            timestamp: 0,
        })),
    );
}

describe("timeMap", () => {
    // 120 bpm for four beats, then 60 bpm for two, then 240 bpm for two.
    // Starts: 0, 0.5, 1, 1.5, 2, 3, 4, 4.25; the show ends at 4.5.
    const uneven = beatsFromDurations([0.5, 0.5, 0.5, 0.5, 1, 1, 0.25, 0.25]);

    describe("beatAtTime", () => {
        it("returns the integer beat at each beat's timestamp", () => {
            uneven.forEach((beat, index) => {
                expect(beatAtTime(uneven, beat.timestamp)).toBe(index);
            });
        });

        it("gives a shared boundary to the later beat (half-open ranges)", () => {
            // 2.0 is both the end of beat 3 and the start of beat 4.
            expect(beatAtTime(uneven, 2)).toBe(4);
            expect(Math.floor(beatAtTime(uneven, 2 - 1e-6))).toBe(3);
        });

        it("interpolates fractional positions within the containing beat", () => {
            expect(beatAtTime(uneven, 0.25)).toBeCloseTo(0.5, 12);
            expect(beatAtTime(uneven, 1.125)).toBeCloseTo(2.25, 12);
            // 60 bpm section: half a second is half a beat.
            expect(beatAtTime(uneven, 2.5)).toBeCloseTo(4.5, 12);
            expect(beatAtTime(uneven, 3.75)).toBeCloseTo(5.75, 12);
            // 240 bpm section: an eighth of a second is half a beat.
            expect(beatAtTime(uneven, 4.125)).toBeCloseTo(6.5, 12);
        });

        it("clamps before 0 to beat 0", () => {
            expect(beatAtTime(uneven, -1)).toBe(0);
            expect(beatAtTime(uneven, -Infinity)).toBe(0);
        });

        it("clamps at and past the end to beats.length", () => {
            expect(showEndTime(uneven)).toBe(4.5);
            expect(beatAtTime(uneven, 4.5)).toBe(uneven.length);
            expect(beatAtTime(uneven, 100)).toBe(uneven.length);
            expect(beatAtTime(uneven, Infinity)).toBe(uneven.length);
            expect(beatAtTime(uneven, 4.4999)).toBeLessThan(uneven.length);
        });

        it("snaps a time a few ULPs below a boundary onto the boundary", () => {
            // 0.1 + 0.2 !== 0.3: timestamps built by summing drift from times computed directly.
            const drifting = beatsFromDurations([0.1, 0.2, 0.3, 0.4]);
            const boundary = drifting[2].timestamp; // 0.30000000000000004
            expect(beatAtTime(drifting, 0.3)).toBe(2);
            expect(beatAtTime(drifting, boundary)).toBe(2);
            expect(
                beatAtTime(
                    drifting,
                    boundary - BEAT_BOUNDARY_EPSILON_SECONDS / 2,
                ),
            ).toBe(2);
            // `currentTimeMs / 1000` is how the frame clock's time reaches this function.
            expect(beatAtTime(drifting, 300 / 1000)).toBe(2);
        });

        it("never reaches the next beat from inside a beat", () => {
            for (let index = 0; index < uneven.length - 1; index++) {
                const justBefore =
                    uneven[index + 1].timestamp -
                    2 * BEAT_BOUNDARY_EPSILON_SECONDS;
                const beat = beatAtTime(uneven, justBefore);
                expect(beat).toBeGreaterThanOrEqual(index);
                expect(beat).toBeLessThan(index + 1);
            }
        });

        it("skips a zero-duration beat, whose range is empty", () => {
            const withEmpty = beatsFromDurations([1, 0, 1]);
            // Beats 1 and 2 both start at 1; the later beat owns the instant.
            expect(beatAtTime(withEmpty, 1)).toBe(2);
            expect(beatAtTime(withEmpty, 0.5)).toBeCloseTo(0.5, 12);
            expect(beatAtTime(withEmpty, 1.5)).toBeCloseTo(2.5, 12);
        });

        it("handles no beats and NaN", () => {
            expect(beatAtTime([], 3)).toBe(0);
            expect(beatAtTime(uneven, NaN)).toBeNaN();
        });

        it("binary search agrees with a linear scan on a long uneven show", () => {
            const durations = Array.from(
                { length: 1000 },
                (_, index) => 0.3 + ((index * 7919) % 13) / 20,
            );
            const beats = beatsFromDurations(durations);
            for (let step = 0; step < 500; step++) {
                const seconds = (step * showEndTime(beats)) / 500 + 0.0123;
                let expected = 0;
                for (let index = 0; index < beats.length; index++) {
                    if (beats[index].timestamp <= seconds) expected = index;
                }
                expect(Math.floor(beatAtTime(beats, seconds))).toBe(expected);
            }
        });
    });

    describe("timeAtBeat", () => {
        it("returns each beat's timestamp exactly at integer beats", () => {
            uneven.forEach((beat, index) => {
                expect(timeAtBeat(uneven, index)).toBe(beat.timestamp);
            });
        });

        it("interpolates fractional beats with that beat's duration", () => {
            expect(timeAtBeat(uneven, 0.5)).toBeCloseTo(0.25, 12);
            expect(timeAtBeat(uneven, 4.5)).toBeCloseTo(2.5, 12);
            expect(timeAtBeat(uneven, 6.5)).toBeCloseTo(4.125, 12);
            expect(timeAtBeat(uneven, 7.5)).toBeCloseTo(4.375, 12);
        });

        it("clamps before 0 and at or past the end", () => {
            expect(timeAtBeat(uneven, -2)).toBe(0);
            expect(timeAtBeat(uneven, uneven.length)).toBe(4.5);
            expect(timeAtBeat(uneven, uneven.length + 10)).toBe(4.5);
        });

        it("handles no beats and NaN", () => {
            expect(timeAtBeat([], 3)).toBe(0);
            expect(timeAtBeat(uneven, NaN)).toBeNaN();
        });

        it("round-trips with beatAtTime inside the show", () => {
            for (let beat = 0; beat < uneven.length; beat += 0.125) {
                expect(
                    beatAtTime(uneven, timeAtBeat(uneven, beat)),
                ).toBeCloseTo(beat, 9);
            }
            for (let seconds = 0; seconds < 4.5; seconds += 0.07) {
                expect(
                    timeAtBeat(uneven, beatAtTime(uneven, seconds)),
                ).toBeCloseTo(seconds, 9);
            }
        });
    });

    describe("beatIndexAtTime", () => {
        it("returns the containing beat, clamped to an existing beat", () => {
            expect(beatIndexAtTime(uneven, -1)).toBe(0);
            expect(beatIndexAtTime(uneven, 0)).toBe(0);
            expect(beatIndexAtTime(uneven, 1.99)).toBe(3);
            expect(beatIndexAtTime(uneven, 2)).toBe(4);
            expect(beatIndexAtTime(uneven, 4.3)).toBe(7);
            expect(beatIndexAtTime(uneven, 4.5)).toBe(7);
            expect(beatIndexAtTime(uneven, 99)).toBe(7);
        });

        it("returns -1 with no beats", () => {
            const none: BeatTiming[] = [];
            expect(beatIndexAtTime(none, 1)).toBe(-1);
        });
    });

    describe("the fixed zero-length beat 0 every show starts with", () => {
        // Position 0 has duration 0 (migration 0000), so beat 1 also starts at time 0.
        const show = beatsFromDurations([0, 0.5, 0.5, 0.5]);

        it("gives time 0 to beat 1, the later beat at the shared boundary", () => {
            expect(beatAtTime(show, 0)).toBe(1);
            expect(beatIndexAtTime(show, 0)).toBe(1);
        });

        it("maps times before the show to beat 0", () => {
            expect(beatAtTime(show, -0.1)).toBe(0);
        });

        it("maps a position inside beat 0 to time 0, which reads back as beat 1", () => {
            expect(timeAtBeat(show, 0.5)).toBe(0);
            expect(beatAtTime(show, timeAtBeat(show, 0.5))).toBe(1);
        });
    });
});
