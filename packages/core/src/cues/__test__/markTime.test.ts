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

describe("automatic mark time (the Feet show default)", () => {
    it("marks time on counts where anyone travels, and stands while the whole band holds", () => {
        const feet = compile().segments(snare.id, "feet");
        expect(feet.every((s) => s.kind === "default")).toBe(true);
        expect(onHoldsAt(feet, 0)).toBe("stand");
        expect(onHoldsAt(feet, 3)).toBe("stand");
        expect(onHoldsAt(feet, 4)).toBe("markTime");
        expect(onHoldsAt(feet, 7)).toBe("markTime");
        expect(onHoldsAt(feet, 8)).toBe("stand");
        expect(onHoldsAt(feet, 12)).toBe("markTime");
        expect(onHoldsAt(feet, 14)).toBe("stand");
        // every performer gets the same default
        expect(compile().segments(trumpet.id, "feet")).toEqual(feet);
    });

    it("doesn't count a prop's travel as the band moving", () => {
        const feet = compile({
            travels: (id) => id === prop.id,
        }).segments(snare.id, "feet");
        expect(feet).toHaveLength(1);
        expect(onHoldsAt(feet, 5)).toBe("stand");
    });

    it("reads bandTravels when given, over travels", () => {
        const feet = compile({ bandTravels: (c) => c === 2 }).segments(
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
        const feet = compile({ travels: undefined }).segments(snare.id, "feet");
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
        const feet = compile({ cues: [stand] }).segments(snare.id, "feet");
        expect(onHoldsAt(feet, 0)).toBe("stand");
        expect(feet.at(-1)).toMatchObject({ kind: "state", cueId: 9 });
        // the band moving later doesn't bring the default back
        expect(onHoldsAt(feet, 5)).toBe("stand");
        expect(onHoldsAt(feet, 12)).toBe("stand");
    });
});
