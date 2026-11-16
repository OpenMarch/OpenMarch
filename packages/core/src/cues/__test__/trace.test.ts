import { describe, expect, it } from "vitest";
import {
    compileCues,
    traceCue,
    type CueInput,
    type CueMarcher,
} from "../index";

const beats = Array.from({ length: 32 }, (_, i) => ({
    id: 101 + i,
    duration: 0.5,
}));
const beatAt = (c: number) => 101 + c;

const trumpet: CueMarcher = { id: 1, section: "Trumpet", carries: "winds" };
const flag: CueMarcher = { id: 2, section: "Flag", carries: "flag" };

const position = (
    id: number,
    count: number,
    value: string,
    extra: Partial<CueInput> = {},
): CueInput => ({
    id,
    type: "position",
    beatId: beatAt(count),
    value,
    marcherIds: [1],
    ...extra,
});

describe("traceCue", () => {
    const compiled = compileCues({
        beats,
        marchers: [trumpet, flag],
        cues: [
            position(100, 4, "builtin:horn.down"),
            position(101, 8, "builtin:horn.trail"),
            position(102, 8, "builtin:horn.up"),
            position(103, 16, "builtin:horn.down", { length: 4 }),
        ],
        sections: [{ name: "Flag", color: "#ff0000" }],
    });

    it("names the cue in effect and the cues it beat, latest first", () => {
        expect(traceCue(compiled, 1, "position", 10)).toEqual({
            winner: 102,
            beaten: [101, 100],
        });
    });

    it("names a momentary cue while it lasts, over the lasting cue under it", () => {
        expect(traceCue(compiled, 1, "position", 17)).toEqual({
            winner: 103,
            beaten: [102, 101, 100],
        });
        // once it ends the lasting cue is back, and the momentary one no longer applies
        expect(traceCue(compiled, 1, "position", 20)).toEqual({
            winner: 102,
            beaten: [101, 100],
        });
    });

    it("reports the default before any cue applies, and where it comes from", () => {
        expect(traceCue(compiled, 1, "position", 2)).toEqual({
            winner: null,
            default: {
                source: "equipment",
                value: "builtin:horn.up",
                holds: "winds",
            },
            beaten: [],
        });
        expect(traceCue(compiled, 1, "facing", 2)).toEqual({
            winner: null,
            default: { source: "library", value: "builtin:facing.front" },
            beaten: [],
        });
        expect(traceCue(compiled, 1, "equipment", 2)).toEqual({
            winner: null,
            default: {
                source: "marcher_carries",
                value: "builtin:equipment.winds",
            },
            beaten: [],
        });
        expect(traceCue(compiled, 2, "silk", 2)).toEqual({
            winner: null,
            default: {
                source: "section_color",
                value: "builtin:silk.plain",
                section: "Flag",
                color: "#ff0000",
            },
            beaten: [],
        });
        expect(traceCue(compiled, 2, "look", 2)).toEqual({
            winner: null,
            default: { source: "guard_look", value: "builtin:look.guard" },
            beaten: [],
        });
    });

    it("names the cue a transition is heading to", () => {
        const turning = compileCues({
            beats,
            marchers: [trumpet],
            cues: [
                {
                    id: 7,
                    type: "facing",
                    beatId: beatAt(8),
                    value: "builtin:facing.back",
                    transition: 4,
                    marcherIds: [1],
                },
            ],
        });
        expect(traceCue(turning, 1, "facing", 6).winner).toBe(7);
        expect(traceCue(turning, 1, "facing", 4).winner).toBeNull();
    });

    it("says which cue is in effect but hidden (a kneel while the dot travels)", () => {
        const kneeling = compileCues({
            beats,
            marchers: [trumpet],
            cues: [
                {
                    id: 7,
                    type: "posture",
                    beatId: beatAt(4),
                    value: "builtin:posture.kneel",
                    marcherIds: [1],
                },
            ],
            travels: (_id, c) => c >= 10,
        });
        expect(traceCue(kneeling, 1, "posture", 6)).toEqual({
            winner: 7,
            beaten: [],
        });
        expect(traceCue(kneeling, 1, "posture", 12)).toEqual({
            winner: null,
            default: { source: "library", value: "builtin:posture.neutral" },
            hidden: 7,
            beaten: [],
        });
    });
});
