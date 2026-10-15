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

const trumpet: CueMarcher = {
    id: 1,
    section: "Trumpet",
    tagIds: [],
    drillOrder: 1,
    carries: "winds",
};

const horn = (
    id: number,
    target: CueInput["target"],
    count: number,
    value: string,
): CueInput => ({
    id,
    channel: "horn_equipment",
    kind: "state",
    target,
    beatId: beatAt(count),
    value,
});

describe("traceCue", () => {
    const compiled = compileCues({
        beats,
        marchers: [trumpet],
        cues: [
            horn(100, { kind: "band" }, 4, "builtin:horn.down"),
            horn(
                101,
                { kind: "section", section: "Trumpet" },
                8,
                "builtin:horn.trail",
            ),
            horn(102, { kind: "set", marcherIds: [1] }, 8, "builtin:horn.up"),
        ],
    });

    it("names the cue in effect and the cues it beat, latest and most specific first", () => {
        expect(traceCue(compiled, 1, "horn_equipment", 10)).toEqual({
            winner: 102,
            beaten: [101, 100],
        });
    });

    it("reports the default before any cue applies, and where it comes from", () => {
        expect(traceCue(compiled, 1, "horn_equipment", 2)).toEqual({
            winner: null,
            default: {
                source: "carry",
                value: "builtin:horn.up",
                carries: "winds",
            },
            beaten: [],
        });
    });

    it("names a phrase over the state it covers", () => {
        const withToss = compileCues({
            beats,
            marchers: [{ ...trumpet, carries: "rifle", section: "Rifle" }],
            cues: [
                {
                    id: 200,
                    channel: "horn_equipment",
                    kind: "state",
                    target: { kind: "band" },
                    beatId: beatAt(2),
                    value: "builtin:rifle.present",
                },
                {
                    id: 201,
                    channel: "horn_equipment",
                    kind: "phrase",
                    target: { kind: "band" },
                    beatId: beatAt(4),
                    value: "builtin:rifle.toss1",
                    length: 3,
                },
            ],
        });

        expect(traceCue(withToss, 1, "horn_equipment", 5)).toEqual({
            winner: 201,
            beaten: [200],
        });
        // Once the toss is caught, the state is back in effect.
        expect(traceCue(withToss, 1, "horn_equipment", 7)).toEqual({
            winner: 200,
            beaten: [],
        });
    });

    it("says when the cue in effect is another channel's take-over", () => {
        const kneeling = compileCues({
            beats,
            marchers: [trumpet],
            cues: [
                {
                    id: 300,
                    channel: "body",
                    kind: "state",
                    target: { kind: "band" },
                    beatId: beatAt(4),
                    value: "builtin:body.kneel",
                },
            ],
        });

        expect(traceCue(kneeling, 1, "feet", 6)).toEqual({
            winner: 300,
            takenOverFrom: "body",
            beaten: [],
        });
    });
});
