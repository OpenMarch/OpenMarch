// @vitest-environment node
import { describe, expect, it } from "vitest";
import { whoHolds, type CueInput } from "@openmarch/core";
import { compileShowCues } from "../showCues";
import {
    editedPerformers,
    equipmentTagsAt,
    planEquipmentCues,
} from "../equipment";
import { describePerformers, type LabelMarcher } from "../cueLabel";
import { equipmentLane, countToSpecBeat } from "../equipmentLane";

/**
 * The show from the lane prototype (fork #991): a guard of 12 over 96 counts, a Rifle section
 * (G1–G6) and a Color Guard section (G7–G12), with three trumpets beside them.
 */
const GUARD: LabelMarcher[] = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    section: i < 6 ? "Rifle" : "Color Guard",
    drill_prefix: "G",
    drill_order: i + 1,
}));
const TRUMPETS: LabelMarcher[] = [13, 14, 15].map((id, i) => ({
    id,
    section: "Trumpet",
    drill_prefix: "T",
    drill_order: i + 1,
}));
const MARCHERS = [...GUARD, ...TRUMPETS];
/** Beat 0 is the fixed zero-length first beat; beats 1–96 are the counts (ids 100–195). */
const BEATS = [
    { id: 1, position: 0, duration: 0 },
    ...Array.from({ length: 96 }, (_, c) => ({
        id: 100 + c,
        position: c + 1,
        duration: 0.5,
    })),
];
const beatOf = (count: number) => 100 + count;
const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

let nextId = 1;
const cue = (
    count: number,
    value: string,
    marcherIds: number[],
    extra: Partial<CueInput> = {},
): CueInput & { label: string | null } => ({
    id: nextId++,
    type: "equipment",
    beatId: beatOf(count),
    value: `builtin:equipment.${value}`,
    marcherIds,
    label: null,
    ...extra,
});

describe("equipment cues (#992)", () => {
    it("holds each section's usual before any cue: flags, rifles, horns", () => {
        const show = compileShowCues(MARCHERS, BEATS, []);
        expect(whoHolds(show.compiled, "rifle", 0)).toEqual(range(1, 6));
        expect(whoHolds(show.compiled, "flag", 0)).toEqual(range(7, 12));
        expect(whoHolds(show.compiled, "winds", 0)).toEqual([13, 14, 15]);
        expect(equipmentTagsAt(show.compiled, show.usual, 0).size).toBe(0);
    });

    it("a rifle from a count: Select Rifles picks them there and not before, and the field tags them", () => {
        const cues = [cue(24, "rifle", [7, 8, 13])];
        const show = compileShowCues(MARCHERS, BEATS, cues);
        expect(whoHolds(show.compiled, "rifle", 23)).toEqual(range(1, 6));
        expect(whoHolds(show.compiled, "rifle", 24)).toEqual([
            ...range(1, 6),
            7,
            8,
            13,
        ]);
        // Only the performers off their section's usual get a tag
        expect([...equipmentTagsAt(show.compiled, show.usual, 24)]).toEqual([
            [7, "R"],
            [8, "R"],
            [13, "R"],
        ]);
        expect(equipmentTagsAt(show.compiled, show.usual, 23).size).toBe(0);
    });

    it("a momentary sabre goes back to what they held after its counts", () => {
        const cues = [cue(56, "sabre", [10, 11, 12], { length: 8 })];
        const show = compileShowCues(MARCHERS, BEATS, cues);
        expect(whoHolds(show.compiled, "sabre", 63)).toEqual([10, 11, 12]);
        expect(whoHolds(show.compiled, "sabre", 64)).toEqual([]);
        expect(whoHolds(show.compiled, "flag", 64)).toEqual(range(7, 12));
    });

    describe("planEquipmentCues", () => {
        const usualOf = (id: number) =>
            compileShowCues(MARCHERS, BEATS, []).usual.get(id)!;

        it("makes one lasting cue for a guard choice", () => {
            expect(
                planEquipmentCues({
                    choice: "rifle",
                    marcherIds: [7, 13],
                    beatId: 5,
                    usualOf,
                    label: "x",
                }),
            ).toEqual([
                {
                    type: "equipment",
                    beatId: 5,
                    value: "builtin:equipment.rifle",
                    marcherIds: [7, 13],
                    label: "x",
                },
            ]);
        });

        it("hands each performer their own instrument, and skips the guard", () => {
            const cues = planEquipmentCues({
                choice: "instrument",
                marcherIds: [1, 13, 14],
                beatId: 5,
                usualOf,
                label: null,
            });
            expect(cues.map((c) => [c.value, c.marcherIds])).toEqual([
                ["builtin:equipment.winds", [13, 14]],
            ]);
            expect(
                planEquipmentCues({
                    choice: "instrument",
                    marcherIds: [1, 2],
                    beatId: 5,
                    usualOf,
                    label: null,
                }),
            ).toEqual([]);
        });
    });

    describe("editedPerformers", () => {
        it("adds and removes the selection, sorted, and says when nothing changes", () => {
            const c = { marcherIds: [3, 5] };
            expect(editedPerformers(c, [4, 3], "add")).toEqual([3, 4, 5]);
            expect(editedPerformers(c, [5], "remove")).toEqual([3]);
            expect(editedPerformers(c, [3], "add")).toBeNull();
            expect(editedPerformers(c, [9], "remove")).toBeNull();
            expect(editedPerformers(c, [3, 5], "remove")).toEqual([]);
        });
    });
});

describe("describePerformers", () => {
    const words = {
        holding: (c: string) => `${c}s`,
        performers: (n: number) => `${n} performers`,
    };
    const name = (ids: number[], holders?: Map<"rifle", number[]>) =>
        describePerformers({ ids, marchers: MARCHERS, words, holders });

    it("names who holds one thing at the playhead first", () => {
        expect(name(range(1, 6), new Map([["rifle", range(1, 6)]]))).toBe(
            "rifles",
        );
    });
    it("names whole sections", () => {
        expect(name(range(7, 12))).toBe("Color Guard");
        expect(name([...range(7, 12), 13, 14, 15])).toBe(
            "Color Guard, Trumpet",
        );
    });
    it("names a run of drill numbers, a few drill numbers, or a count", () => {
        expect(name([7, 8, 9])).toBe("G7–G9");
        expect(name([1, 4, 9])).toBe("G1, G4, G9");
        expect(name([1, 4, 9, 11])).toBe("4 performers");
    });
});

describe("equipmentLane (fork #991 option E)", () => {
    const prototypeCues = () => [
        cue(24, "rifle", range(1, 6), { label: "Rifles" }),
        cue(40, "sabre", [7, 8, 9]),
        cue(56, "sabre", [10, 11, 12], { length: 8 }),
        cue(72, "flag", range(1, 12), { label: "Guard" }),
    ];
    const laneOf = (cues: ReturnType<typeof prototypeCues>) => {
        const show = compileShowCues(MARCHERS, BEATS, cues);
        return equipmentLane({
            compiled: show.compiled,
            cues: cues.map((c) => ({
                ...c,
                settings: {},
                length: c.length ?? null,
                transition: null,
                marcherIds: [...c.marcherIds],
                notes: null,
                createdAt: "",
                updatedAt: "",
            })),
            usual: show.usual,
        });
    };

    it("has a row per group with the same history, only for performers with a cue", () => {
        const lane = laneOf(prototypeCues());
        expect(lane.rows.map((r) => [r.marcherIds, r.label])).toEqual([
            [range(1, 6), "Rifles"],
            [[7, 8, 9], null],
            [[10, 11, 12], null],
        ]);
        expect(lane.marcherIds).toEqual(range(1, 12));
        const rifles = lane.rows[0].pieces;
        expect(rifles.map((p) => [p.from, p.to, p.kind, p.holds])).toEqual([
            [0, 24, "default", "rifle"],
            [24, 72, "lasting", "rifle"],
            [72, 96, "lasting", "flag"],
        ]);
        const momentary = lane.rows[2].pieces.find(
            (p) => p.kind === "momentary",
        );
        expect(momentary).toMatchObject({ from: 56, to: 64, holds: "sabre" });
    });

    it("re-forms the rows when a performer is added to a cue", () => {
        const cues = prototypeCues();
        cues[1] = { ...cues[1], marcherIds: [7, 8, 9, 10] };
        const lane = laneOf(cues);
        expect(lane.rows.map((r) => r.marcherIds)).toEqual([
            range(1, 6),
            [7, 8, 9],
            [10],
            [11, 12],
        ]);
    });

    it("folds into a summary of how many hold each thing", () => {
        const lane = laneOf(prototypeCues());
        const at = (count: number) =>
            lane.summary.find((s) => s.from <= count && count < s.to)?.counts;
        expect(at(60)).toEqual([
            { holds: "rifle", count: 6 },
            { holds: "sabre", count: 6 },
        ]);
        expect(at(80)).toEqual([{ holds: "flag", count: 12 }]);
        expect(lane.marks.map((m) => m.count)).toEqual([24, 40, 56, 72]);
    });

    it("turns counts into spec beats", () => {
        const ids = BEATS.slice(1).map((b) => b.id);
        const specOf = new Map(BEATS.map((b, i) => [b.id, i]));
        expect(countToSpecBeat(0, ids, specOf)).toBe(1);
        expect(countToSpecBeat(24, ids, specOf)).toBe(25);
        expect(countToSpecBeat(96, ids, specOf)).toBe(97);
    });
});
