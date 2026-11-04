import { describe, expect, it } from "vitest";
import { compileCues, type CueInput } from "@openmarch/core";
import {
    hornEventAt,
    sectionCueCarry,
} from "@/view3d/core/marchers/hornChannel";
import { compileWindowCues } from "../marchers/marcherMotion";
import { windowHornEvents } from "../windowHorn";

// 16 counts; beat 58 is count 8
const beats = Array.from({ length: 16 }, (_, k) => ({
    id: 50 + k,
    timestamp: k * 0.5,
    duration: 0.5,
}));
const options = { secondsPerCount: () => 0.5 };
const hornAt = (events: ReturnType<typeof windowHornEvents>, c: number) =>
    events[hornEventAt(events, c)].state;

describe("the window's horn channel", () => {
    it("plays horns up for the whole show (no cues are stored)", () => {
        const compiled = compileWindowCues(
            [{ id: 1, section: "Trumpet" }],
            beats,
            "left",
            {},
            () => "winds",
        );
        const events = windowHornEvents(
            compiled.segments(1, "horn_equipment"),
            options,
        );
        expect(events.map((e) => e.state)).toEqual(["up"]);
    });

    it("follows compiled Horn cues from horns up", () => {
        const hornsDown: CueInput = {
            id: 2,
            channel: "horn_equipment",
            kind: "state",
            target: { kind: "band" },
            beatId: 58,
            value: "builtin:horn.down",
        };
        const compiled = compileCues({
            beats: beats.map((b) => ({ id: b.id, duration: b.duration })),
            marchers: [
                {
                    id: 1,
                    section: "Trumpet",
                    tagIds: [],
                    drillOrder: 0,
                    carries: "winds",
                },
            ],
            cues: [hornsDown],
        });
        const events = windowHornEvents(
            compiled.segments(1, "horn_equipment"),
            options,
        );
        expect(hornAt(events, 0)).toBe("up");
        expect(hornAt(events, 12)).toBe("carry");
    });

    it("fits cues by each section's own equipment", () => {
        expect(sectionCueCarry("Trumpet")).toBe("winds");
        expect(sectionCueCarry("Flag")).toBe("flag");
        expect(sectionCueCarry("Rifle")).toBe("rifle");
        expect(sectionCueCarry("Mystery")).toBe("none");
    });
});
