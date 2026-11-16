import { describe, expect, it } from "vitest";
import type { CueInput } from "@openmarch/core";
import {
    hornEventAt,
    sectionCueCarry,
} from "@/view3d/core/marchers/hornChannel";
import { compileWindowCues } from "../marchers/marcherMotion";
import { windowHornEvents } from "../windowHorn";
import { hornRowsOf } from "../marchers/hornRows";

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
    it("plays horns up for the whole show when no cues are stored", () => {
        const compiled = compileWindowCues(
            [{ id: 1, section: "Trumpet" }],
            beats,
            "left",
            { carries: () => "winds" },
        );
        const events = windowHornEvents(
            compiled.compiled.segments(1, "position"),
            options,
        );
        expect(events.map((e) => e.state)).toEqual(["up"]);
    });

    const hornsDown = (extra: Partial<CueInput> = {}): CueInput => ({
        id: 2,
        type: "position",
        beatId: 58,
        value: "builtin:horn.down",
        marcherIds: [1],
        ...extra,
    });
    const eventsOf = (cues: CueInput[]) =>
        windowHornEvents(
            compileWindowCues([{ id: 1, section: "Trumpet" }], beats, "left", {
                cues,
                carries: () => "winds",
            }).compiled.segments(1, "position"),
            options,
        );

    it("follows the show's stored Position cues from horns up", () => {
        const events = eventsOf([hornsDown()]);
        expect(hornAt(events, 0)).toBe("up");
        expect(hornAt(events, 12)).toBe("carry");
    });

    it("brings the horns back up when a momentary cue ends", () => {
        // horns down for counts 8-11
        const events = eventsOf([hornsDown({ length: 4 })]);
        expect(hornAt(events, 7)).toBe("up");
        expect(hornAt(events, 8)).toBe("carry");
        expect(hornAt(events, 11)).toBe("carry");
        expect(hornAt(events, 12)).toBe("up");
    });

    it("bakes each event's rows in the family it names, and none for empty hands", () => {
        const up = { to: 0, state: "up" as const, fromState: null };
        expect(
            hornRowsOf(
                [
                    { ...up, from: 0 },
                    { from: 2, to: 4, state: "carry", fromState: "up" },
                    { ...up, from: 8, family: "rifle" },
                    { ...up, from: 12, family: null },
                ],
                "trumpet",
            ).sort(),
        ).toEqual([
            "hold:rifle:up",
            "hold:trumpet:carry",
            "hold:trumpet:up",
            "trans:trumpet:up>carry",
        ]);
    });

    it("fits cues by each section's own equipment", () => {
        expect(sectionCueCarry("Trumpet")).toBe("winds");
        expect(sectionCueCarry("Flag")).toBe("flag");
        expect(sectionCueCarry("Rifle")).toBe("rifle");
        expect(sectionCueCarry("Mystery")).toBe("none");
    });
});
