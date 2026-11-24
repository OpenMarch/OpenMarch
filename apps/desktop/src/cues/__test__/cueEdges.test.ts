// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cueEdgeDrag, nextCueStart } from "../cueEdges";

/** A cue on beat 10; the row's next cue starts on beat 30. */
const momentary = { start: 10, length: 8 };
const lasting = { start: 10, length: null };
const until = 30;

describe("dragging a cue's end edge (#992)", () => {
    it("changes a momentary cue's length", () => {
        expect(
            cueEdgeDrag({ edge: "end", cue: momentary, until, delta: 4 }),
        ).toEqual({ start: 10, length: 12, end: 22 });
        expect(
            cueEdgeDrag({ edge: "end", cue: momentary, until, delta: -3 }),
        ).toEqual({ start: 10, length: 5, end: 15 });
    });

    it("makes a lasting cue momentary, ending where it's dropped", () => {
        expect(
            cueEdgeDrag({ edge: "end", cue: lasting, until, delta: -12 }),
        ).toEqual({ start: 10, length: 8, end: 18 });
    });

    it("makes it lasting again on reaching or passing the row's next cue", () => {
        expect(
            cueEdgeDrag({ edge: "end", cue: momentary, until, delta: 12 }),
        ).toEqual({ start: 10, length: null, end: 30 });
        expect(
            cueEdgeDrag({ edge: "end", cue: momentary, until, delta: 40 }),
        ).toEqual({ start: 10, length: null, end: 30 });
        // A lasting cue dragged nowhere, or past its end, stays lasting
        expect(
            cueEdgeDrag({ edge: "end", cue: lasting, until, delta: 0 }),
        ).toEqual({ start: 10, length: null, end: 30 });
    });

    it("never ends before it starts: at least 1 count", () => {
        expect(
            cueEdgeDrag({ edge: "end", cue: momentary, until, delta: -50 }),
        ).toEqual({ start: 10, length: 1, end: 11 });
        expect(
            cueEdgeDrag({ edge: "end", cue: lasting, until, delta: -50 }),
        ).toEqual({ start: 10, length: 1, end: 11 });
    });
});

describe("dragging a cue's start edge (#992)", () => {
    it("moves a momentary cue's start and keeps its end", () => {
        expect(
            cueEdgeDrag({ edge: "start", cue: momentary, until, delta: 3 }),
        ).toEqual({ start: 13, length: 5, end: 18 });
        expect(
            cueEdgeDrag({ edge: "start", cue: momentary, until, delta: -4 }),
        ).toEqual({ start: 6, length: 12, end: 18 });
    });

    it("moves a lasting cue's start; it still lasts until the next cue", () => {
        expect(
            cueEdgeDrag({ edge: "start", cue: lasting, until, delta: 5 }),
        ).toEqual({ start: 15, length: null, end: 30 });
    });

    it("stops a count before the end, and no earlier than the first beat", () => {
        expect(
            cueEdgeDrag({ edge: "start", cue: momentary, until, delta: 20 }),
        ).toEqual({ start: 17, length: 1, end: 18 });
        expect(
            cueEdgeDrag({ edge: "start", cue: lasting, until, delta: 50 }),
        ).toEqual({ start: 29, length: null, end: 30 });
        expect(
            cueEdgeDrag({ edge: "start", cue: momentary, until, delta: -20 }),
        ).toEqual({ start: 1, length: 17, end: 18 });
    });
});

describe("the row's next cue", () => {
    const pieces = [
        { from: 0, to: 10, cueId: null },
        { from: 10, to: 18, cueId: 1 },
        { from: 18, to: 30, cueId: null },
        { from: 30, to: 96, cueId: 2 },
    ];

    it("is where the next piece another cue set starts", () => {
        expect(nextCueStart(pieces, 10, 1)).toBe(30);
    });

    it("is the row's end when no cue follows", () => {
        expect(nextCueStart(pieces, 30, 2)).toBe(96);
    });
});
