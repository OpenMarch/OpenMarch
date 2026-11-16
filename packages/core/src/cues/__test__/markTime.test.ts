import { describe, expect, it } from "vitest";
import {
    compileCues,
    type CompileInput,
    type CueInput,
    type CueMarcher,
    type CueSegment,
} from "../index";

/** 16 counts; beat ids 201.. so ids never equal counts. */
const beats = Array.from({ length: 16 }, (_, i) => ({
    id: 201 + i,
    duration: 0.5,
}));
const performer = (id: number): CueMarcher => ({
    id,
    section: "Trumpet",
    tagIds: [],
    drillOrder: id,
    carries: "winds",
});
const snare = performer(1);
const trumpet = performer(2);
const prop: CueMarcher = { ...performer(3), type: "prop" };

/** The snare holds all show; the trumpet moves on counts 4–7 and 12–13. */
const travels = (id: number, c: number) =>
    id === trumpet.id && ((c >= 4 && c < 8) || c === 12 || c === 13);

const onHoldsAt = (segments: readonly CueSegment[], c: number) =>
    segments.find((s) => s.from <= c && c < s.to)?.settings.onHolds;

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

describe("holds stand by default (ADR 0015 D-5)", () => {
    it("stands on every count, whoever travels", () => {
        const feet = compile().segments(snare.id, "feet");
        expect(feet).toHaveLength(1);
        expect(feet[0]).toMatchObject({ kind: "default", from: 0, to: 16 });
        expect(onHoldsAt(feet, 0)).toBe("stand");
        expect(onHoldsAt(feet, 5)).toBe("stand");
        expect(onHoldsAt(feet, 12)).toBe("stand");
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
        const feet = styled().segments(snare.id, "feet");
        expect(feet.every((s) => s.kind === "default")).toBe(true);
        expect(onHoldsAt(feet, 1)).toBe("stand");
        expect(onHoldsAt(feet, 2)).toBe("markTime");
        expect(onHoldsAt(feet, 5)).toBe("markTime");
        expect(onHoldsAt(feet, 6)).toBe("stand");
        const other = styled().segments(trumpet.id, "feet");
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
        }).segments(snare.id, "feet");
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
        }).segments(snare.id, "feet");
        expect(onHoldsAt(feet, 0)).toBe("markTime");
        expect(onHoldsAt(feet, 2)).toBe("stand");
        expect(onHoldsAt(feet, 8)).toBe("stand");
        expect(onHoldsAt(feet, 15)).toBe("markTime");
        expect(feet.at(-1)?.to).toBe(16);
    });

    it("gives way to a Feet cue, as the show default does", () => {
        const stand: CueInput = {
            id: 9,
            channel: "feet",
            kind: "state",
            target: { kind: "band" },
            beatId: 201 + 1,
            value: "builtin:feet.step",
            settings: { onHolds: "stand" },
        };
        const feet = styled({ cues: [stand] }).segments(snare.id, "feet");
        expect(onHoldsAt(feet, 3)).toBe("stand");
        expect(feet.at(-1)).toMatchObject({ kind: "state", cueId: 9 });
    });
});

describe("the show set to mark time (the Feet show default)", () => {
    it("marks time on counts where anyone travels, and stands while the whole band holds", () => {
        const feet = markTimeShow().segments(snare.id, "feet");
        expect(feet.every((s) => s.kind === "default")).toBe(true);
        expect(onHoldsAt(feet, 0)).toBe("stand");
        expect(onHoldsAt(feet, 3)).toBe("stand");
        expect(onHoldsAt(feet, 4)).toBe("markTime");
        expect(onHoldsAt(feet, 7)).toBe("markTime");
        expect(onHoldsAt(feet, 8)).toBe("stand");
        expect(onHoldsAt(feet, 12)).toBe("markTime");
        expect(onHoldsAt(feet, 14)).toBe("stand");
        // every performer gets the same default
        expect(markTimeShow().segments(trumpet.id, "feet")).toEqual(feet);
    });

    it("doesn't count a prop's travel as the band moving", () => {
        const feet = markTimeShow({
            travels: (id) => id === prop.id,
        }).segments(snare.id, "feet");
        expect(feet).toHaveLength(1);
        expect(onHoldsAt(feet, 5)).toBe("stand");
    });

    it("reads bandTravels when given, over travels", () => {
        const feet = markTimeShow({ bandTravels: (c) => c === 2 }).segments(
            snare.id,
            "feet",
        );
        expect(onHoldsAt(feet, 2)).toBe("markTime");
        expect(onHoldsAt(feet, 5)).toBe("stand");
    });

    it("takes the show's own hold technique, or stands throughout", () => {
        const high = compile({
            showDefaults: { holdWhileBandMoves: "highMarkTime" },
        }).segments(snare.id, "feet");
        expect(onHoldsAt(high, 5)).toBe("highMarkTime");
        const stand = compile({
            showDefaults: { holdWhileBandMoves: "stand" },
        }).segments(snare.id, "feet");
        expect(stand).toHaveLength(1);
        expect(onHoldsAt(stand, 5)).toBe("stand");
    });

    it("stands everywhere without travel information", () => {
        const feet = markTimeShow({ travels: undefined }).segments(
            snare.id,
            "feet",
        );
        expect(feet).toHaveLength(1);
        expect(onHoldsAt(feet, 5)).toBe("stand");
    });

    it("gives way to a Feet cue from its count on", () => {
        const stand: CueInput = {
            id: 9,
            channel: "feet",
            kind: "state",
            target: { kind: "band" },
            beatId: 201 + 2,
            value: "builtin:feet.step",
            settings: { onHolds: "stand" },
        };
        const feet = markTimeShow({ cues: [stand] }).segments(snare.id, "feet");
        expect(onHoldsAt(feet, 0)).toBe("stand");
        expect(feet.at(-1)).toMatchObject({ kind: "state", cueId: 9 });
        // the band moving later doesn't bring the default back
        expect(onHoldsAt(feet, 5)).toBe("stand");
        expect(onHoldsAt(feet, 12)).toBe("stand");
    });
});
