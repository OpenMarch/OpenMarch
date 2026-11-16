import { describe, expect, it } from "vitest";
import {
    CUE_LIBRARY,
    CUE_TYPES,
    compileCues,
    cueLibraryValue,
    cueValueAt,
    defaultCueValue,
    heldAt,
    isCueType,
    whoHasValue,
    whoHolds,
    type CompileInput,
    type CueInput,
    type CueMarcher,
    type CueSegment,
    type CueType,
} from "../index";

/** 32 counts; beat ids 101.. so ids never equal counts. */
const beats = Array.from({ length: 32 }, (_, i) => ({
    id: 101 + i,
    duration: 0.5,
}));
const beatAt = (c: number) => 101 + c;

const trumpet: CueMarcher = { id: 1, section: "Trumpet", carries: "winds" };
const mello: CueMarcher = { id: 2, section: "Mellophone", carries: "winds" };
const snare: CueMarcher = { id: 3, section: "Snare", carries: "battery" };
const rifle: CueMarcher = { id: 4, section: "Rifle", carries: "rifle" };
const flag: CueMarcher = { id: 5, section: "Flag", carries: "flag" };
const prop: CueMarcher = {
    id: 6,
    section: "Prop",
    carries: "none",
    type: "prop",
};
const band = [trumpet, mello, snare, rifle, flag, prop];

const cue = (
    id: number,
    type: string,
    count: number,
    value: string,
    marcherIds: readonly number[],
    extra: Partial<CueInput> = {},
): CueInput => ({
    id,
    type,
    beatId: beatAt(count),
    value,
    marcherIds,
    ...extra,
});

const compile = (
    cues: readonly CueInput[],
    extra: Partial<CompileInput> = {},
) => compileCues({ beats, marchers: band, cues, ...extra });

/** A performer's segments as `[from, to, kind, value]`. */
const shape = (segments: readonly CueSegment[]) =>
    segments.map((s) => [s.from, s.to, s.kind, s.value]);

const valueAt = (segments: readonly CueSegment[], c: number) =>
    segments.find((s) => s.from <= c && c < s.to)?.value;

describe("the library", () => {
    it("gives every value an id of its own, and a type the build knows", () => {
        const ids = CUE_LIBRARY.map((v) => v.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const value of CUE_LIBRARY)
            expect(isCueType(value.type)).toBe(true);
        expect(cueLibraryValue("builtin:horn.down")?.type).toBe("position");
    });

    it("names a default of each type that is one of its values", () => {
        for (const type of CUE_TYPES)
            for (const holds of ["winds", "flag", "rifle"] as const) {
                const id = defaultCueValue(type, holds);
                expect(cueLibraryValue(id!)?.type).toBe(type);
            }
        // nothing in hand has no position
        expect(defaultCueValue("position", "none")).toBeNull();
    });

    it("locks a toss to momentary", () => {
        expect(cueLibraryValue("builtin:rifle.toss1")).toMatchObject({
            natural: "momentary",
            locked: true,
        });
    });
});

describe("defaults (ADR 0015 D-2)", () => {
    const compiled = compile([], {
        sections: [
            {
                name: "flag",
                equipment: {
                    id: "builtin:model.swingFlag",
                    name: "Swing flag",
                    label: "Flag",
                    holds: "flag",
                },
                color: "#00ff00",
            },
        ],
        equipmentFallback: {
            SNARE: { id: "app:snare", name: "Snare drum", holds: "battery" },
        },
    });
    const only = (id: number, type: CueType) => {
        const segments = compiled.segments(id, type);
        expect(segments).toHaveLength(1);
        expect(segments[0]).toMatchObject({
            from: 0,
            to: 32,
            kind: "default",
            cueId: null,
        });
        return segments[0]!;
    };

    it("is one default segment per type for a performer with no cues", () => {
        expect(only(1, "equipment").value).toBe("builtin:equipment.winds");
        expect(only(1, "position").value).toBe("builtin:horn.up");
        expect(only(1, "look").value).toBe("builtin:look.band");
        expect(only(1, "facing").value).toBe("builtin:facing.front");
        expect(only(1, "posture").value).toBe("builtin:posture.neutral");
        expect(only(3, "position").value).toBe("builtin:battery.playing");
        expect(only(4, "position").value).toBe("builtin:rifle.portArms");
        expect(only(4, "look").value).toBe("builtin:look.guard");
    });

    it("takes Equipment from the section, then the fallback, then the marcher", () => {
        // the section's usual equipment, matched ignoring case
        expect(only(5, "equipment")).toMatchObject({
            value: "builtin:model.swingFlag",
            label: "Flag",
        });
        expect(only(3, "equipment").value).toBe("app:snare");
        expect(only(4, "equipment").value).toBe("builtin:equipment.rifle");
    });

    it("shows a plain silk in the section's color", () => {
        expect(only(5, "silk")).toMatchObject({
            value: "builtin:silk.plain",
            settings: { color: "#00ff00" },
        });
    });

    it("takes the show's looks", () => {
        const own = compile([], {
            showDefaults: { bandLook: "show:look.2", guardLook: "show:look.3" },
        });
        expect(own.segments(1, "look")[0]!.value).toBe("show:look.2");
        expect(own.segments(4, "look")[0]!.value).toBe("show:look.3");
    });

    it("gives an item no segments", () => {
        for (const type of CUE_TYPES)
            expect(compiled.segments(prop.id, type)).toEqual([]);
    });
});

describe("one parameter per cue type (ADR 0015 D-1, D-3)", () => {
    const compiled = compile([
        cue(10, "position", 8, "builtin:horn.down", [1]),
    ]);

    it("changes its own type from its count", () => {
        expect(shape(compiled.segments(1, "position"))).toEqual([
            [0, 8, "default", "builtin:horn.up"],
            [8, 8, "transition", "builtin:horn.down"],
            [8, 32, "lasting", "builtin:horn.down"],
        ]);
    });

    it("leaves every other type alone", () => {
        const plain = compile([]);
        for (const type of CUE_TYPES.filter((t) => t !== "position"))
            expect(compiled.segments(1, type)).toEqual(plain.segments(1, type));
    });

    it("leaves every other performer alone", () => {
        expect(compiled.segments(2, "position")).toEqual(
            compile([]).segments(2, "position"),
        );
    });
});

describe("who a cue applies to (ADR 0015 D-4)", () => {
    it("reaches the performers it stores, whatever their section", () => {
        const compiled = compile([
            cue(10, "facing", 4, "builtin:facing.back", [1, 3]),
        ]);
        expect(valueAt(compiled.segments(1, "facing"), 6)).toBe(
            "builtin:facing.back",
        );
        expect(valueAt(compiled.segments(3, "facing"), 6)).toBe(
            "builtin:facing.back",
        );
        expect(valueAt(compiled.segments(2, "facing"), 6)).toBe(
            "builtin:facing.front",
        );
    });

    it("never reaches an item, even one it names", () => {
        const compiled = compile([
            cue(10, "facing", 4, "builtin:facing.back", [prop.id]),
        ]);
        expect(compiled.segments(prop.id, "facing")).toEqual([]);
        expect(compiled.flags).toEqual([
            { kind: "fits_nobody", cueIds: [10], marcherIds: [prop.id] },
        ]);
    });

    it("skips a marcher the show no longer has", () => {
        const compiled = compile([
            cue(10, "facing", 4, "builtin:facing.back", [1, 99]),
        ]);
        expect(valueAt(compiled.segments(1, "facing"), 6)).toBe(
            "builtin:facing.back",
        );
        expect(compiled.flags).toEqual([]);
    });

    it("drops a cue on a beat the show doesn't have", () => {
        const compiled = compile([
            { ...cue(10, "facing", 4, "builtin:facing.back", [1]), beatId: 9 },
        ]);
        expect(compiled.segments(1, "facing")).toHaveLength(1);
    });
});

describe("the latest cue per performer wins", () => {
    it("runs each lasting cue until the performer's next one of the type", () => {
        const compiled = compile([
            cue(10, "look", 4, "builtin:look.guard", [1, 2]),
            cue(11, "look", 12, "builtin:look.band", [1]),
        ]);
        expect(shape(compiled.segments(1, "look"))).toEqual([
            [0, 4, "default", "builtin:look.band"],
            [4, 12, "lasting", "builtin:look.guard"],
            [12, 32, "lasting", "builtin:look.band"],
        ]);
        // the mello isn't in the second cue, so the first still holds
        expect(shape(compiled.segments(2, "look"))).toEqual([
            [0, 4, "default", "builtin:look.band"],
            [4, 32, "lasting", "builtin:look.guard"],
        ]);
    });

    it("goes by count, not by the order cues were made in", () => {
        const compiled = compile([
            cue(20, "look", 4, "builtin:look.guard", [1]),
            cue(10, "look", 12, "builtin:look.band", [1]),
        ]);
        expect(valueAt(compiled.segments(1, "look"), 20)).toBe(
            "builtin:look.band",
        );
    });

    it("gives two cues on one count to the newer, and flags the tie", () => {
        const compiled = compile([
            cue(10, "look", 4, "builtin:look.guard", [1, 2]),
            cue(11, "look", 4, "builtin:look.band", [1]),
        ]);
        expect(valueAt(compiled.segments(1, "look"), 6)).toBe(
            "builtin:look.band",
        );
        expect(valueAt(compiled.segments(2, "look"), 6)).toBe(
            "builtin:look.guard",
        );
        expect(compiled.flags).toEqual([
            { kind: "clash", cueIds: [10, 11], marcherIds: [1] },
        ]);
    });
});

describe("lasting and momentary cues (ADR 0015 D-2)", () => {
    it("shows a momentary cue for its length, then the lasting value again", () => {
        const compiled = compile([
            cue(10, "equipment", 8, "builtin:equipment.sabre", [4], {
                length: 8,
            }),
        ]);
        expect(shape(compiled.segments(4, "equipment"))).toEqual([
            [0, 8, "default", "builtin:equipment.rifle"],
            [8, 16, "momentary", "builtin:equipment.sabre"],
            [16, 32, "default", "builtin:equipment.rifle"],
        ]);
    });

    it("can last one count", () => {
        const compiled = compile([
            cue(10, "look", 8, "builtin:look.guard", [1], { length: 1 }),
        ]);
        expect(shape(compiled.segments(1, "look"))).toEqual([
            [0, 8, "default", "builtin:look.band"],
            [8, 9, "momentary", "builtin:look.guard"],
            [9, 32, "default", "builtin:look.band"],
        ]);
    });

    it("never changes the lasting value: a lasting cue under it shows when it ends", () => {
        const compiled = compile(
            [
                cue(10, "look", 4, "builtin:look.guard", [1]),
                cue(11, "look", 8, "show:look.cape", [1], { length: 8 }),
                cue(12, "look", 12, "builtin:look.band", [1]),
            ],
            {
                values: [
                    {
                        id: "show:look.cape",
                        type: "look",
                        name: "Cape",
                        label: "Cape",
                        fits: ["winds"],
                    },
                ],
            },
        );
        expect(shape(compiled.segments(1, "look"))).toEqual([
            [0, 4, "default", "builtin:look.band"],
            [4, 8, "lasting", "builtin:look.guard"],
            [8, 16, "momentary", "show:look.cape"],
            [16, 32, "lasting", "builtin:look.band"],
        ]);
    });

    it("lets a later momentary cue take over on its count, and flags the overlap", () => {
        const compiled = compile([
            cue(10, "look", 8, "builtin:look.guard", [1], { length: 8 }),
            cue(11, "look", 10, "builtin:look.band", [1], { length: 2 }),
        ]);
        expect(shape(compiled.segments(1, "look"))).toEqual([
            [0, 8, "default", "builtin:look.band"],
            [8, 10, "momentary", "builtin:look.guard"],
            [10, 12, "momentary", "builtin:look.band"],
            [12, 32, "default", "builtin:look.band"],
        ]);
        expect(compiled.flags).toEqual([
            { kind: "momentary_overlap", cueIds: [10, 11], marcherIds: [1] },
        ]);
    });

    it("puts a lasting and a momentary cue on one count without a clash", () => {
        const compiled = compile([
            cue(10, "look", 8, "builtin:look.guard", [1]),
            cue(11, "look", 8, "builtin:look.band", [1], { length: 2 }),
        ]);
        expect(shape(compiled.segments(1, "look"))).toEqual([
            [0, 8, "default", "builtin:look.band"],
            [8, 10, "momentary", "builtin:look.band"],
            [10, 32, "lasting", "builtin:look.guard"],
        ]);
        expect(compiled.flags).toEqual([]);
    });

    it("ends a momentary cue with the show", () => {
        const compiled = compile([
            cue(10, "look", 30, "builtin:look.guard", [1], { length: 8 }),
        ]);
        expect(compiled.segments(1, "look").at(-1)).toMatchObject({
            from: 30,
            to: 32,
            kind: "momentary",
        });
    });

    it("ignores a lasting toss, and says so", () => {
        const compiled = compile([
            cue(10, "position", 8, "builtin:rifle.toss1", [4]),
            cue(11, "position", 16, "builtin:rifle.toss1", [4], { length: 4 }),
        ]);
        expect(shape(compiled.segments(4, "position"))).toEqual([
            [0, 16, "default", "builtin:rifle.portArms"],
            [16, 20, "momentary", "builtin:rifle.toss1"],
            [20, 32, "default", "builtin:rifle.portArms"],
        ]);
        expect(compiled.flags).toEqual([
            { kind: "kind_not_allowed", cueIds: [10], marcherIds: [4] },
        ]);
    });
});

describe("transitions (ADR 0015 D-2)", () => {
    it("takes the value's default: a snap for horns, 2 counts for a facing", () => {
        const compiled = compile([
            cue(10, "position", 8, "builtin:horn.down", [1]),
            cue(11, "facing", 8, "builtin:facing.back", [1]),
        ]);
        expect(compiled.segments(1, "position")[1]).toMatchObject({
            from: 8,
            to: 8,
            kind: "transition",
            snap: true,
            cueId: 10,
        });
        // 2 counts, counted inclusively: it starts on count 7's click
        expect(shape(compiled.segments(1, "facing"))).toEqual([
            [0, 7, "default", "builtin:facing.front"],
            [7, 8, "transition", "builtin:facing.back"],
            [8, 32, "lasting", "builtin:facing.back"],
        ]);
    });

    it("takes the cue's own length: horns down over 2, a turn over 4", () => {
        const compiled = compile([
            cue(10, "position", 8, "builtin:horn.down", [1], { transition: 2 }),
            cue(11, "facing", 8, "builtin:facing.back", [1], { transition: 4 }),
        ]);
        expect(shape(compiled.segments(1, "position"))).toEqual([
            [0, 7, "default", "builtin:horn.up"],
            [7, 8, "transition", "builtin:horn.down"],
            [8, 32, "lasting", "builtin:horn.down"],
        ]);
        expect(shape(compiled.segments(1, "facing"))).toEqual([
            [0, 5, "default", "builtin:facing.front"],
            [5, 8, "transition", "builtin:facing.back"],
            [8, 32, "lasting", "builtin:facing.back"],
        ]);
    });

    it("cuts a value that has no transition, whatever the cue says", () => {
        const compiled = compile([
            cue(10, "equipment", 8, "builtin:equipment.sabre", [4], {
                transition: 4,
            }),
        ]);
        expect(shape(compiled.segments(4, "equipment"))).toEqual([
            [0, 8, "default", "builtin:equipment.rifle"],
            [8, 32, "lasting", "builtin:equipment.sabre"],
        ]);
    });

    it("starts no earlier than the cue before it, and flags the cut", () => {
        const compiled = compile([
            cue(10, "facing", 8, "builtin:facing.back", [1]),
            cue(11, "facing", 10, "builtin:facing.side1", [1], {
                transition: 8,
            }),
        ]);
        expect(shape(compiled.segments(1, "facing"))).toEqual([
            [0, 7, "default", "builtin:facing.front"],
            [7, 8, "transition", "builtin:facing.back"],
            [8, 10, "transition", "builtin:facing.side1"],
            [10, 32, "lasting", "builtin:facing.side1"],
        ]);
        expect(compiled.flags).toEqual([
            { kind: "transition_cut", cueIds: [10, 11], marcherIds: [1] },
        ]);
    });

    it("leads a momentary cue in, and cuts back when it ends", () => {
        const compiled = compile([
            cue(10, "facing", 8, "builtin:facing.back", [1], {
                length: 4,
                transition: 3,
            }),
        ]);
        expect(shape(compiled.segments(1, "facing"))).toEqual([
            [0, 6, "default", "builtin:facing.front"],
            [6, 8, "transition", "builtin:facing.back"],
            [8, 12, "momentary", "builtin:facing.back"],
            [12, 32, "default", "builtin:facing.front"],
        ]);
    });

    it("carries the cue's settings over the value's defaults", () => {
        const compiled = compile([
            cue(10, "facing", 8, "builtin:facing.angle", [1], {
                settings: { degrees: 45 },
            }),
            cue(11, "position", 8, "builtin:horn.up", [1]),
        ]);
        expect(compiled.segments(1, "facing").at(-1)!.settings).toEqual({
            degrees: 45,
        });
        expect(compiled.segments(1, "position").at(-1)!.settings).toEqual({
            angle: "box",
        });
    });
});

describe("where a value applies (ADR 0015 D-3)", () => {
    it("fits a Position value only to the equipment it names", () => {
        const compiled = compile([
            cue(10, "position", 8, "builtin:horn.down", [1, 3, 4]),
        ]);
        expect(valueAt(compiled.segments(1, "position"), 10)).toBe(
            "builtin:horn.down",
        );
        // horns down skips the snare and the rifle
        expect(compiled.segments(3, "position")).toHaveLength(1);
        expect(compiled.segments(4, "position")).toHaveLength(1);
        expect(compiled.flags).toEqual([]);
    });

    it("flags a cue that fits none of its performers", () => {
        const compiled = compile([
            cue(10, "position", 8, "builtin:horn.down", [3, 4]),
        ]);
        expect(compiled.flags).toEqual([
            { kind: "fits_nobody", cueIds: [10], marcherIds: [3, 4] },
        ]);
    });

    it("checks the fit against what Equipment gives on the cue's count", () => {
        const compiled = compile([
            cue(10, "equipment", 8, "builtin:equipment.sabre", [4]),
            cue(11, "position", 4, "builtin:sabre.toss1", [4], { length: 2 }),
            cue(12, "position", 12, "builtin:sabre.toss1", [4], { length: 2 }),
            cue(13, "position", 16, "builtin:rifle.present", [4]),
        ]);
        expect(shape(compiled.segments(4, "position"))).toEqual([
            [0, 8, "default", "builtin:rifle.portArms"],
            [8, 12, "default", "builtin:sabre.set"],
            [12, 14, "momentary", "builtin:sabre.toss1"],
            [14, 32, "default", "builtin:sabre.set"],
        ]);
        // both are skipped for what Equipment gives then: a quiet note each
        expect(compiled.notes).toEqual([
            { kind: "equipment_mismatch", cueIds: [11], marcherIds: [4] },
            { kind: "equipment_mismatch", cueIds: [13], marcherIds: [4] },
        ]);
        expect(compiled.flags).toEqual([
            { kind: "fits_nobody", cueIds: [11], marcherIds: [4] },
            { kind: "fits_nobody", cueIds: [13], marcherIds: [4] },
        ]);
    });

    it("returns Position to the new equipment's default when Equipment changes", () => {
        const compiled = compile([
            cue(10, "position", 4, "builtin:rifle.present", [4]),
            cue(11, "equipment", 8, "builtin:equipment.flag", [4], {
                length: 8,
            }),
            cue(12, "position", 20, "builtin:rifle.present", [4]),
        ]);
        expect(shape(compiled.segments(4, "position"))).toEqual([
            [0, 4, "default", "builtin:rifle.portArms"],
            [4, 4, "transition", "builtin:rifle.present"],
            [4, 8, "lasting", "builtin:rifle.present"],
            // the flag's default, then the rifle's again: until the next cue
            [8, 16, "default", "builtin:flag.set"],
            [16, 20, "default", "builtin:rifle.portArms"],
            [20, 20, "transition", "builtin:rifle.present"],
            [20, 32, "lasting", "builtin:rifle.present"],
        ]);
    });

    it("ends a momentary Position cue when Equipment changes under it", () => {
        const compiled = compile([
            cue(10, "position", 6, "builtin:rifle.toss2", [4], { length: 8 }),
            cue(11, "equipment", 8, "builtin:equipment.flag", [4]),
        ]);
        expect(shape(compiled.segments(4, "position"))).toEqual([
            [0, 6, "default", "builtin:rifle.portArms"],
            [6, 8, "momentary", "builtin:rifle.toss2"],
            [8, 32, "default", "builtin:flag.set"],
        ]);
    });

    it("fits Silk only to a performer holding a flag", () => {
        const compiled = compile([
            cue(10, "silk", 4, "builtin:silk.plain", [4, 5], {
                settings: { color: "#123456" },
            }),
        ]);
        expect(compiled.segments(5, "silk").at(-1)).toMatchObject({
            kind: "lasting",
            settings: { color: "#123456" },
        });
        expect(compiled.segments(4, "silk")).toHaveLength(1);
    });

    it("shows a kneel only while the dot holds, and flags the travel", () => {
        const compiled = compile(
            [cue(10, "posture", 4, "builtin:posture.kneel", [1])],
            { travels: (id, c) => id === 1 && c >= 12 && c < 16 },
        );
        const posture = compiled.segments(1, "posture");
        expect(shape(posture)).toEqual([
            [0, 2, "default", "builtin:posture.neutral"],
            [2, 4, "transition", "builtin:posture.kneel"],
            [4, 12, "lasting", "builtin:posture.kneel"],
            [12, 16, "default", "builtin:posture.neutral"],
            [16, 32, "lasting", "builtin:posture.kneel"],
        ]);
        expect(posture[3]).toMatchObject({ cueId: null, hiddenCueId: 10 });
        expect(compiled.flags).toEqual([
            {
                kind: "standing_only_while_moving",
                cueIds: [10],
                marcherIds: [1],
            },
        ]);
    });
});

describe("cues this build can't read (ADR 0015 D-9)", () => {
    it("ignores a cue of a type it doesn't know, with no flag", () => {
        const compiled = compile([
            cue(10, "lights", 4, "builtin:lights.on", [1]),
        ]);
        expect(compiled.flags).toEqual([]);
        for (const type of CUE_TYPES)
            expect(compiled.segments(1, type)).toEqual(
                compile([]).segments(1, type),
            );
    });

    it("ignores a value it doesn't know for the type, and flags it", () => {
        const compiled = compile([
            cue(10, "facing", 4, "builtin:facing.upsideDown", [1]),
            // a value of another type
            cue(11, "posture", 4, "builtin:facing.back", [1, 2]),
        ]);
        expect(compiled.segments(1, "facing")).toHaveLength(1);
        expect(compiled.segments(1, "posture")).toHaveLength(1);
        expect(compiled.flags).toEqual([
            { kind: "unknown_value", cueIds: [10], marcherIds: [1] },
            { kind: "unknown_value", cueIds: [11], marcherIds: [1, 2] },
        ]);
    });
});

describe("who has a value on a count (ADR 0015 D-10)", () => {
    const compiled = compile([
        cue(10, "equipment", 8, "builtin:equipment.rifle", [1, 5]),
        cue(11, "equipment", 16, "builtin:equipment.sabre", [4], { length: 4 }),
        cue(12, "facing", 8, "builtin:facing.back", [1, 2], { transition: 4 }),
    ]);

    it("answers who holds what, whatever their section", () => {
        expect(whoHolds(compiled, "rifle", 0)).toEqual([4]);
        expect(whoHolds(compiled, "rifle", 8)).toEqual([1, 4, 5]);
        // the rifle section's performer holds a sabre for 4 counts
        expect(whoHolds(compiled, "rifle", 17)).toEqual([1, 5]);
        expect(whoHolds(compiled, "sabre", 17)).toEqual([4]);
        expect(whoHolds(compiled, "rifle", 20)).toEqual([1, 4, 5]);
        expect(whoHolds(compiled, "winds", 20)).toEqual([2]);
        expect(heldAt(compiled, 1, 7)).toBe("winds");
        expect(heldAt(compiled, 1, 8)).toBe("rifle");
    });

    it("answers who has a value of any type", () => {
        expect(
            whoHasValue(compiled, "equipment", "builtin:equipment.rifle", 8),
        ).toEqual([1, 4, 5]);
        expect(
            whoHasValue(compiled, "facing", "builtin:facing.back", 8),
        ).toEqual([1, 2]);
        expect(
            whoHasValue(compiled, "facing", "builtin:facing.front", 8),
        ).toEqual([3, 4, 5]);
    });

    it("counts a value from its count's click, not from its transition", () => {
        expect(cueValueAt(compiled, 1, "facing", 6)).toBe(
            "builtin:facing.front",
        );
        expect(
            whoHasValue(compiled, "facing", "builtin:facing.back", 6),
        ).toEqual([]);
        expect(cueValueAt(compiled, 1, "facing", 8)).toBe(
            "builtin:facing.back",
        );
    });

    it("never names an item", () => {
        expect(whoHolds(compiled, "none", 0)).toEqual([]);
    });
});

describe("recompile", () => {
    const base = [
        cue(10, "equipment", 8, "builtin:equipment.flag", [4]),
        cue(11, "position", 12, "builtin:flag.port", [4]),
        cue(12, "facing", 4, "builtin:facing.back", [1]),
    ];
    const first = compile(base);

    it("reuses the types nobody edited", () => {
        const next = compileCues(
            {
                beats,
                marchers: band,
                cues: [...base, cue(13, "look", 4, "builtin:look.guard", [1])],
            },
            { previous: first, types: ["look"] },
        );
        expect(next.segments(1, "facing")).toBe(first.segments(1, "facing"));
        expect(next.segments(4, "position")).toBe(
            first.segments(4, "position"),
        );
        expect(valueAt(next.segments(1, "look"), 6)).toBe("builtin:look.guard");
    });

    it("resolves Position and Silk again after an Equipment edit", () => {
        const edited = base.map((c) =>
            c.id === 10 ? { ...c, beatId: beatAt(20) } : c,
        );
        const next = compileCues(
            { beats, marchers: band, cues: edited },
            { previous: first, types: ["equipment"] },
        );
        // the flag arrives after the port cue now, so it no longer fits
        expect(shape(next.segments(4, "position"))).toEqual([
            [0, 20, "default", "builtin:rifle.portArms"],
            [20, 32, "default", "builtin:flag.set"],
        ]);
        expect(next.segments(1, "facing")).toBe(first.segments(1, "facing"));
        expect(next).toEqual(
            expect.objectContaining({
                flags: compile(edited).flags,
                notes: compile(edited).notes,
            }),
        );
    });
});
