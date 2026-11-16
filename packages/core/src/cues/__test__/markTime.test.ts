import { describe, expect, it } from "vitest";
import {
    compileCues,
    holdStyleAt,
    type CompileInput,
    type CueInput,
    type CueMarcher,
    type HoldStyleSpan,
} from "../index";

/** 16 counts; beat ids 201.. so ids never equal counts. */
const beats = Array.from({ length: 16 }, (_, i) => ({
    id: 201 + i,
    duration: 0.5,
}));
const performer = (id: number): CueMarcher => ({
    id,
    section: "Trumpet",
    carries: "winds",
});
const snare = performer(1);
const trumpet = performer(2);
const prop: CueMarcher = { ...performer(3), type: "prop" };

/** The snare holds all show; the trumpet moves on counts 4–7 and 12–13. */
const travels = (id: number, c: number) =>
    id === trumpet.id && ((c >= 4 && c < 8) || c === 12 || c === 13);

const onHoldsAt = (spans: readonly HoldStyleSpan[], c: number) =>
    holdStyleAt(spans, c);

const compile = (extra: Partial<CompileInput> = {}) =>
    compileCues({
        beats,
        marchers: [snare, trumpet, prop],
        cues: [],
        travels,
        ...extra,
    });

/** The show set to mark time on holds (Show settings). */
const markTimeShow = (extra: Partial<CompileInput> = {}) =>
    compile({ showDefaults: { holdWhileBandMoves: "markTime" }, ...extra });

/** A cue for the snare, of a type that has nothing to do with the feet. */
const kneel: CueInput = {
    id: 9,
    type: "posture",
    beatId: 201 + 2,
    value: "builtin:posture.kneel",
    marcherIds: [snare.id],
};

describe("holds stand by default (ADR 0015 D-5)", () => {
    it("stands on every count, whoever travels", () => {
        const feet = compile().holdStyle(snare.id);
        expect(feet).toEqual([{ from: 0, to: 16, style: "stand" }]);
        expect(onHoldsAt(feet, 0)).toBe("stand");
        expect(onHoldsAt(feet, 5)).toBe("stand");
        expect(onHoldsAt(feet, 12)).toBe("stand");
    });

    it("covers a show with no counts", () => {
        expect(compile({ beats: [] }).holdStyle(snare.id)).toEqual([
            { from: 0, to: 0, style: "stand" },
        ]);
    });
});

describe("a hold's own style", () => {
    const styled = (extra: Partial<CompileInput> = {}) =>
        compile({
            holdStyles: [
                { marcherId: snare.id, from: 2, to: 6, style: "markTime" },
            ],
            ...extra,
        });

    it("marks time over its counts only, for its performer only", () => {
        const feet = styled().holdStyle(snare.id);
        expect(feet.map((s) => [s.from, s.to, s.style])).toEqual([
            [0, 2, "stand"],
            [2, 6, "markTime"],
            [6, 16, "stand"],
        ]);
        expect(onHoldsAt(feet, 1)).toBe("stand");
        expect(onHoldsAt(feet, 2)).toBe("markTime");
        expect(onHoldsAt(feet, 5)).toBe("markTime");
        expect(onHoldsAt(feet, 6)).toBe("stand");
        const other = styled().holdStyle(trumpet.id);
        expect(other).toHaveLength(1);
        expect(onHoldsAt(other, 3)).toBe("stand");
    });

    it("wins over the show setting whether or not the band moves", () => {
        const feet = markTimeShow({
            holdStyles: [
                // over counts where the band travels (4-7): stand anyway
                { marcherId: snare.id, from: 4, to: 6, style: "stand" },
                // over counts where the whole band holds (8-11): mark time anyway
                { marcherId: snare.id, from: 9, to: 11, style: "highMarkTime" },
            ],
        }).holdStyle(snare.id);
        expect(onHoldsAt(feet, 3)).toBe("stand");
        expect(onHoldsAt(feet, 4)).toBe("stand");
        expect(onHoldsAt(feet, 5)).toBe("stand");
        // past the hold, the show setting again
        expect(onHoldsAt(feet, 6)).toBe("markTime");
        expect(onHoldsAt(feet, 8)).toBe("stand");
        expect(onHoldsAt(feet, 9)).toBe("highMarkTime");
        expect(onHoldsAt(feet, 10)).toBe("highMarkTime");
        expect(onHoldsAt(feet, 11)).toBe("stand");
        expect(onHoldsAt(feet, 12)).toBe("markTime");
    });

    it("clamps to the show's counts and skips an empty range", () => {
        const feet = compile({
            holdStyles: [
                { marcherId: snare.id, from: -3, to: 2, style: "markTime" },
                { marcherId: snare.id, from: 14, to: 40, style: "markTime" },
                { marcherId: snare.id, from: 8, to: 8, style: "markTime" },
            ],
        }).holdStyle(snare.id);
        expect(onHoldsAt(feet, 0)).toBe("markTime");
        expect(onHoldsAt(feet, 2)).toBe("stand");
        expect(onHoldsAt(feet, 8)).toBe("stand");
        expect(onHoldsAt(feet, 15)).toBe("markTime");
        expect(feet.at(-1)?.to).toBe(16);
    });

    it("gives way to a later hold's style where two overlap", () => {
        const feet = styled({
            holdStyles: [
                { marcherId: snare.id, from: 2, to: 6, style: "markTime" },
                { marcherId: snare.id, from: 4, to: 8, style: "stand" },
            ],
        }).holdStyle(snare.id);
        expect(onHoldsAt(feet, 3)).toBe("markTime");
        expect(onHoldsAt(feet, 4)).toBe("stand");
        expect(onHoldsAt(feet, 7)).toBe("stand");
    });

    it("gives way to nothing else: no cue of any type changes it (ADR 0015 D-1)", () => {
        // There is no Feet cue any more. Only another hold or the show setting
        // decides what the feet do on a hold.
        const feet = styled({ cues: [kneel] }).holdStyle(snare.id);
        expect(feet).toEqual(styled().holdStyle(snare.id));
        expect(onHoldsAt(feet, 3)).toBe("markTime");
    });
});

describe("the show set to mark time (the show's hold style)", () => {
    it("marks time on counts where anyone travels, and stands while the whole band holds", () => {
        const feet = markTimeShow().holdStyle(snare.id);
        expect(onHoldsAt(feet, 0)).toBe("stand");
        expect(onHoldsAt(feet, 3)).toBe("stand");
        expect(onHoldsAt(feet, 4)).toBe("markTime");
        expect(onHoldsAt(feet, 7)).toBe("markTime");
        expect(onHoldsAt(feet, 8)).toBe("stand");
        expect(onHoldsAt(feet, 12)).toBe("markTime");
        expect(onHoldsAt(feet, 14)).toBe("stand");
        // the spans cover the show, one per change
        expect(feet.map((s) => [s.from, s.to])).toEqual([
            [0, 4],
            [4, 8],
            [8, 12],
            [12, 14],
            [14, 16],
        ]);
        // every performer gets the same style
        expect(markTimeShow().holdStyle(trumpet.id)).toEqual(feet);
    });

    it("doesn't count a prop's travel as the band moving", () => {
        const feet = markTimeShow({
            travels: (id) => id === prop.id,
        }).holdStyle(snare.id);
        expect(feet).toHaveLength(1);
        expect(onHoldsAt(feet, 5)).toBe("stand");
    });

    it("reads bandTravels when given, over travels", () => {
        const feet = markTimeShow({ bandTravels: (c) => c === 2 }).holdStyle(
            snare.id,
        );
        expect(onHoldsAt(feet, 2)).toBe("markTime");
        expect(onHoldsAt(feet, 5)).toBe("stand");
    });

    it("takes the show's own hold technique, or stands throughout", () => {
        const high = compile({
            showDefaults: { holdWhileBandMoves: "highMarkTime" },
        }).holdStyle(snare.id);
        expect(onHoldsAt(high, 5)).toBe("highMarkTime");
        const stand = compile({
            showDefaults: { holdWhileBandMoves: "stand" },
        }).holdStyle(snare.id);
        expect(stand).toHaveLength(1);
        expect(onHoldsAt(stand, 5)).toBe("stand");
    });

    it("stands everywhere without travel information", () => {
        const feet = markTimeShow({ travels: undefined }).holdStyle(snare.id);
        expect(feet).toHaveLength(1);
        expect(onHoldsAt(feet, 5)).toBe("stand");
    });

    it("is no cue's business: a cue of any type leaves it alone (ADR 0015 D-1)", () => {
        const feet = markTimeShow({ cues: [kneel] }).holdStyle(snare.id);
        expect(feet).toEqual(markTimeShow().holdStyle(snare.id));
        // the band moving later still brings mark time
        expect(onHoldsAt(feet, 5)).toBe("markTime");
        expect(onHoldsAt(feet, 12)).toBe("markTime");
    });

    it("stays stood under a Held hold set to Stand, however the band moves later", () => {
        // What a band-wide "stand" Feet cue used to do: the hold's own style
        // keeps the show's mark time away for its counts.
        const feet = markTimeShow({
            holdStyles: [
                { marcherId: snare.id, from: 1, to: 16, style: "stand" },
            ],
        }).holdStyle(snare.id);
        expect(feet).toEqual([{ from: 0, to: 16, style: "stand" }]);
        expect(onHoldsAt(feet, 5)).toBe("stand");
        expect(onHoldsAt(feet, 12)).toBe("stand");
        // the other performers keep the show setting
        expect(onHoldsAt(markTimeShow().holdStyle(trumpet.id), 5)).toBe(
            "markTime",
        );
    });
});
