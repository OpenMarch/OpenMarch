import { describe, expect, it } from "vitest";
import { abcToNewBeatsAndMeasures } from "../AbcUtils";

describe("abcToNewBeatsAndMeasures", () => {
    it("returns empty arrays for empty input", () => {
        const [beats, measures] = abcToNewBeatsAndMeasures("");
        expect(beats).toEqual([]);
        expect(measures).toEqual([]);
    });

    it("returns empty arrays when no V:1 voice is found", () => {
        const [beats, measures] = abcToNewBeatsAndMeasures(
            "X:1\nT:Test\nM:4/4\nL:1/4\nK:C",
        );
        expect(beats).toEqual([]);
        expect(measures).toEqual([]);
    });

    it("correctly parses a simple 4/4 measure with default tempo of 120bpm", () => {
        const abcString = "X:1\nM:4/4\nL:1/4\nK:C\nV:1\nz |";
        const [beats, measures] = abcToNewBeatsAndMeasures(abcString);

        expect(beats.length).toBe(4);
        expect(measures.length).toBe(1);
        expect(beats[0].duration).toBe(0.5);
        expect(measures[0].beatIndex).toBe(0);
    });

    it("handles tempo changes within measures", () => {
        const abcString =
            "X:1\nM:4/4\nL:1/4\nK:C\nV:1\nQ:1/4=120 z |Q:1/4=60 z |";
        const [beats, measures] = abcToNewBeatsAndMeasures(abcString);

        expect(measures.length).toBe(2);
        expect(beats.length).toBe(8);
        expect(beats[0].duration).toBe(0.5);
        expect(beats[4].duration).toBe(1);
    });

    it("handles different time signatures", () => {
        const abcString = "X:1\nM:3/4\nL:1/4\nK:C\nV:1\nCDE|M:4/4 z |";
        const [beats, measures] = abcToNewBeatsAndMeasures(abcString);

        expect(measures.length).toBe(2);
        expect(beats.length).toBe(7);
    });

    it("ignores comments and empty lines", () => {
        const abcString =
            "X:1\nM:4/4\nL:1/4\nK:C\nV:1\n% Comment\nz |\n\n% Another comment\nz |";
        const [beats, measures] = abcToNewBeatsAndMeasures(abcString);

        expect(measures.length).toBe(2);
        expect(beats.length).toBe(8);
    });

    it("handles multiple barline types", () => {
        const abcString =
            "X:1\nM:4/4\nL:1/4\nK:C\nV:1\nz || z |: z :| z [| z |]";
        const [beats, measures] = abcToNewBeatsAndMeasures(abcString);

        expect(measures.length).toBe(5);
        expect(beats.length).toBe(20);
    });

    it("uses default values when time signature and tempo are missing", () => {
        const abcString = "X:1\nK:C\nV:1\nz |";
        const [beats, measures] = abcToNewBeatsAndMeasures(abcString);

        expect(beats[0].duration).toBe(0.5);
        expect(beats.length).toBe(4);
        expect(measures.length).toBe(1);
    });
});
