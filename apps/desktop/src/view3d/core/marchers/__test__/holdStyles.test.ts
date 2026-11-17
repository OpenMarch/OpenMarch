import { describe, expect, it } from "vitest";
import { buildCountClock } from "../countClock";
import { holdStyleSpans } from "../holdStyles";

/**
 * Hold styles for the compile (ADR 0015 D-5): a Held hold's spec beats to the count clock's
 * counts. The show: the fixed zero-length beat 0, then 16 counts of half a second, so spec beat
 * `b` starts count `b - 1`.
 */
const beats = [
    { timestamp: 0, duration: 0 },
    ...Array.from({ length: 16 }, (_, k) => ({
        timestamp: k * 0.5,
        duration: 0.5,
    })),
];
const clock = buildCountClock(beats);
/** Show time at a spec beat, running on past the stored counts at the last tempo. */
const secondsAtBeat = (beat: number) => Math.max(beat - 1, 0) * 0.5;

describe("holdStyleSpans", () => {
    it("covers the counts the marcher stands on: from the arrival's count up to the hold's end", () => {
        // Held over [9, 13): arrives on beat 9, the start of count 8, and may move from beat 13
        expect(
            holdStyleSpans(
                [{ marcherId: 4, start: 9, end: 13, style: "markTime" }],
                secondsAtBeat,
                clock,
            ),
        ).toEqual([{ marcherId: 4, from: 8, to: 12, style: "markTime" }]);
    });

    it("starts a hold from the starting spot on the first count", () => {
        expect(
            holdStyleSpans(
                [
                    { marcherId: 1, start: 0, end: 5, style: "stand" },
                    { marcherId: 2, start: 1, end: 5, style: "stand" },
                ],
                secondsAtBeat,
                clock,
            ),
        ).toEqual([
            { marcherId: 1, from: 0, to: 4, style: "stand" },
            { marcherId: 2, from: 0, to: 4, style: "stand" },
        ]);
    });

    it("stops a hold that runs past the stored counts at the last one, and drops one wholly past them", () => {
        expect(
            holdStyleSpans(
                [
                    { marcherId: 1, start: 13, end: 40, style: "highMarkTime" },
                    { marcherId: 1, start: 20, end: 24, style: "markTime" },
                ],
                secondsAtBeat,
                clock,
            ),
        ).toEqual([{ marcherId: 1, from: 12, to: 16, style: "highMarkTime" }]);
    });

    it("lists them by marcher, then by count", () => {
        expect(
            holdStyleSpans(
                [
                    { marcherId: 2, start: 9, end: 11, style: "stand" },
                    { marcherId: 1, start: 9, end: 11, style: "markTime" },
                    { marcherId: 1, start: 3, end: 5, style: "stand" },
                ],
                secondsAtBeat,
                clock,
            ).map((s) => [s.marcherId, s.from]),
        ).toEqual([
            [1, 2],
            [1, 8],
            [2, 8],
        ]);
    });
});
