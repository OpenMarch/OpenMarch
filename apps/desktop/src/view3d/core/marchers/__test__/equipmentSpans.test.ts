// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compileCues, heldAt, type CueInput } from "@openmarch/core";
import {
    carryForModel,
    carryForSection,
    guardCarry,
} from "../../instruments/catalog";
import {
    carryForValue,
    heldHornEvents,
    slotEquipment,
} from "../equipmentSpans";
import { hornEventAt, planHornChannel, sectionCueCarry } from "../hornChannel";

const COUNTS = 24;
const GUARD = {
    name: "Color Guard",
    equipment: {
        id: "builtin:equipment.flag",
        name: "Flag",
        label: "Flag",
        holds: "flag" as const,
    },
};

/** A cue for marcher 1 on show count `count`. */
const cue = (
    id: number,
    type: string,
    count: number,
    value: string,
    extra: Partial<CueInput> = {},
): CueInput => ({
    id,
    type,
    beatId: 100 + count,
    value,
    marcherIds: [1],
    ...extra,
});
const equipment = (
    id: number,
    count: number,
    holds: string,
    extra: Partial<CueInput> = {},
) => cue(id, "equipment", count, `builtin:equipment.${holds}`, extra);

/** Marcher 1 of `section` over the show's cues: their pieces, and the compile. */
function compile(section: string, cues: CueInput[] = []) {
    const compiled = compileCues({
        beats: Array.from({ length: COUNTS }, (_, i) => ({
            id: 100 + i,
            duration: 0.5,
        })),
        marchers: [{ id: 1, section, carries: sectionCueCarry(section) }],
        cues,
        sections: [GUARD],
    });
    return {
        compiled,
        held: slotEquipment(
            compiled.segments(1, "equipment"),
            (c) => heldAt(compiled, 1, c),
            carryForSection(section),
        ),
    };
}

describe("carryForValue", () => {
    const flag6 = carryForSection("Color Guard");
    const trumpet = carryForSection("Trumpet");
    const v = (key: string) => `builtin:equipment.${key}`;

    it("keeps the performer's own piece when the item is it", () => {
        expect(carryForValue(v("flag"), "flag", flag6)).toBe(flag6);
        expect(carryForValue(v("trumpet"), "winds", trumpet)).toBe(trumpet);
        // a section without a catalog item: the fallback keeps its own piece
        expect(carryForValue(v("winds"), "winds", trumpet)).toBe(trumpet);
    });

    it("draws the item's own model for anyone, and nothing for Nothing", () => {
        expect(carryForValue(v("flag"), "flag", trumpet)).toEqual(
            guardCarry("flag6"),
        );
        expect(carryForValue(v("rifle"), "rifle", flag6)).toEqual(
            guardCarry("rifle"),
        );
        expect(carryForValue(v("sabre"), "sabre", null)).toEqual(
            guardCarry("sabre"),
        );
        expect(carryForValue(v("tuba"), "winds", flag6)).toEqual(
            carryForModel("contra"),
        );
        expect(carryForValue(v("altoSax"), "winds", trumpet)).toEqual({
            model: "altoSax",
            family: "sax",
        });
        expect(carryForValue(v("snare"), "battery", null)).toEqual({
            model: "snare",
            family: "snare",
        });
        expect(carryForValue(v("none"), "none", trumpet)).toBeNull();
        expect(carryForValue(v("winds"), "winds", flag6)).toBeNull();
    });
});

describe("slotEquipment", () => {
    it("is null for a performer who holds their section's piece all show", () => {
        expect(compile("Color Guard").held).toBeNull();
        expect(compile("Trumpet").held).toBeNull();
        expect(compile("Drum Major").held).toBeNull();
        // a cue for their own piece changes nothing either
        expect(
            compile("Color Guard", [equipment(1, 8, "flag")]).held,
        ).toBeNull();
    });

    it("swaps a guard's flag for a rifle on its count, and back on the next cue", () => {
        const { held } = compile("Color Guard", [
            equipment(1, 8, "rifle"),
            equipment(2, 16, "flag"),
        ]);
        expect(held).toEqual({
            carries: [carryForSection("Color Guard"), guardCarry("rifle")],
            spans: [
                { from: 0, held: 0 },
                { from: 8, held: 1 },
                { from: 16, held: 0 },
            ],
        });
    });

    it("empties the hands for a momentary Nothing, then gives the piece back", () => {
        const { held } = compile("Trumpet", [
            equipment(1, 8, "none", { length: 4 }),
        ]);
        expect(held).toEqual({
            carries: [carryForSection("Trumpet"), null],
            spans: [
                { from: 0, held: 0 },
                { from: 8, held: 1 },
                { from: 12, held: 0 },
            ],
        });
    });

    it("gives a performer who carries nothing a sabre", () => {
        const { held } = compile("Drum Major", [equipment(1, 4, "sabre")]);
        expect(held).toEqual({
            carries: [null, guardCarry("sabre")],
            spans: [
                { from: 0, held: 0 },
                { from: 4, held: 1 },
            ],
        });
    });
});

describe("heldHornEvents", () => {
    const eventsOf = (section: string, cues: CueInput[]) => {
        const { compiled, held } = compile(section, cues);
        const events = planHornChannel(compiled.segments(1, "position"), {
            defaultState: "up",
            secondsPerCount: () => 0.5,
        });
        return heldHornEvents(events, held!, "up");
    };
    const at = (events: ReturnType<typeof eventsOf>, c: number) => {
        const e = events[hornEventAt(events, c)];
        return [e.family, e.state, e.held];
    };

    it("plays each event on the piece in hand, and empty hands on Nothing", () => {
        const events = eventsOf("Trumpet", [
            cue(1, "position", 4, "builtin:horn.down"),
            equipment(2, 8, "none", { length: 4 }),
        ]);
        expect(at(events, 0)).toEqual(["trumpet", "up", 0]);
        expect(at(events, 5)).toEqual(["trumpet", "carry", 0]);
        expect(at(events, 8)).toEqual([null, "up", 1]);
        expect(at(events, 11)).toEqual([null, "up", 1]);
        // the horn comes back to its default hold, not horns down
        expect(at(events, 12)).toEqual(["trumpet", "up", 0]);
        expect(at(events, 20)).toEqual(["trumpet", "up", 0]);
    });

    it("switches a guard to the rifle's hold and back to the flag's", () => {
        const events = eventsOf("Color Guard", [
            equipment(1, 8, "rifle"),
            equipment(2, 16, "flag"),
        ]);
        expect(at(events, 7)).toEqual(["flag", "up", 0]);
        expect(at(events, 8)).toEqual(["rifle", "up", 1]);
        expect(at(events, 16)).toEqual(["flag", "up", 0]);
        expect(events.map((e) => e.from)).toEqual([0, 8, 16]);
    });

    it("lets a Position cue on the swap's count win over the default hold", () => {
        const events = eventsOf("Trumpet", [
            equipment(1, 8, "none", { length: 4 }),
            cue(2, "position", 12, "builtin:horn.down", { transition: 1 }),
        ]);
        expect(at(events, 12)).toEqual(["trumpet", "carry", 0]);
        // nothing starts before the horn is back in hand
        for (const e of events) if (e.from < 12) expect(e.to).toBeLessThan(12);
    });
});
