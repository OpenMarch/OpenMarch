// @vitest-environment node
import { describe, expect, it } from "vitest";
import { whoHolds, type CueInput } from "@openmarch/core";
import { compileShowCues } from "../showCues";
import {
    editedPerformers,
    planEquipmentCues,
    planCueChange,
    planEquipmentSet,
    equipmentSetIsEmpty,
    withRecent,
} from "../equipment";
import { describePerformers, type LabelMarcher } from "../cueLabel";
import { equipmentIconsAt, type EquipmentIcons } from "../equipmentIcons";
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
/** Each performer's field icon at `count`, as the field draws them with `shown`. */
const iconsAt = (
    show: ReturnType<typeof compileShowCues>,
    count: number,
    shown: EquipmentIcons = "changed",
) =>
    equipmentIconsAt({
        compiled: show.compiled,
        usualValue: show.usualValue,
        sectionOf: (id) => MARCHERS.find((m) => m.id === id)?.section,
        count,
        shown,
    });

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
        expect(iconsAt(show, 0).size).toBe(0);
    });

    it("a rifle from a count: Select Rifles picks them there and not before, and the field shows its icon", () => {
        const cues = [cue(24, "rifle", [7, 8, 13])];
        const show = compileShowCues(MARCHERS, BEATS, cues);
        expect(whoHolds(show.compiled, "rifle", 23)).toEqual(range(1, 6));
        expect(whoHolds(show.compiled, "rifle", 24)).toEqual([
            ...range(1, 6),
            7,
            8,
            13,
        ]);
        // Only the performers off their section's usual get an icon
        expect([...iconsAt(show, 24)]).toEqual([
            [7, "Rifle"],
            [8, "Rifle"],
            [13, "Rifle"],
        ]);
        expect(iconsAt(show, 23).size).toBe(0);
    });

    it("shows a brass item on the guard and a guard item on the brass, and not their own", () => {
        const cues = [
            cue(8, "trumpet", [7]),
            cue(8, "sabre", [13]),
            cue(8, "trumpet", [14]),
        ];
        const show = compileShowCues(MARCHERS, BEATS, cues);
        // A sabre has no icon of its own: Other
        expect([...iconsAt(show, 8)]).toEqual([
            [7, "Trumpet"],
            [13, "Other"],
        ]);
        expect(whoHolds(show.compiled, "winds", 8)).toContain(7);
    });

    it("the field's equipment icons: off, changed only, or everyone with their own instrument", () => {
        const show = compileShowCues(MARCHERS, BEATS, [cue(8, "tuba", [1])]);
        expect(iconsAt(show, 8, "off").size).toBe(0);
        expect([...iconsAt(show, 8, "changed")]).toEqual([[1, "MarchingTuba"]]);
        const everyone = iconsAt(show, 8, "everyone");
        expect(everyone.size).toBe(MARCHERS.length);
        expect(everyone.get(1)).toBe("MarchingTuba");
        expect(everyone.get(2)).toBe("Rifle");
        expect(everyone.get(7)).toBe("ColorGuard");
        expect(everyone.get(13)).toBe("Trumpet");
    });

    it("a momentary sabre goes back to what they held after its counts", () => {
        const cues = [cue(56, "sabre", [10, 11, 12], { length: 8 })];
        const show = compileShowCues(MARCHERS, BEATS, cues);
        expect(whoHolds(show.compiled, "sabre", 63)).toEqual([10, 11, 12]);
        expect(whoHolds(show.compiled, "sabre", 64)).toEqual([]);
        expect(whoHolds(show.compiled, "flag", 64)).toEqual(range(7, 12));
    });

    describe("planEquipmentCues", () => {
        it("makes one lasting cue of the item, for any performer", () => {
            expect(
                planEquipmentCues({
                    choice: "tuba",
                    marcherIds: [7, 13],
                    beatId: 5,
                    label: "x",
                }),
            ).toEqual([
                {
                    type: "equipment",
                    beatId: 5,
                    value: "builtin:equipment.tuba",
                    marcherIds: [7, 13],
                    label: "x",
                },
            ]);
        });

        it("stores their own instrument and nothing as values of their own", () => {
            const value = (choice: string) =>
                planEquipmentCues({
                    choice,
                    marcherIds: [1],
                    beatId: 5,
                    label: null,
                })[0]!.value;
            expect(value("usual")).toBe("builtin:equipment.usual");
            expect(value("none")).toBe("builtin:equipment.none");
        });
    });

    describe("planEquipmentSet (#992: setting replaces, a matching cue is joined)", () => {
        const stored = (
            id: number,
            value: string,
            beatId: number,
            marcherIds: number[],
            length: number | null = null,
        ) => ({
            id,
            type: "equipment",
            beatId,
            value: `builtin:equipment.${value}`,
            settings: {},
            length,
            transition: null,
            marcherIds,
            label: "old",
            notes: null,
            createdAt: "",
            updatedAt: "",
        });
        const labelFor = (ids: readonly number[]) => ids.join("+");

        const none = { modifiedCues: [], deletedCueIds: [], newCues: [] };

        it("joins the cue of the same value, beat and kind, keeping who's in it", () => {
            expect(
                planEquipmentSet({
                    cues: [stored(1, "rifle", 5, [1, 2])],
                    choice: "rifle",
                    marcherIds: [2, 3, 4],
                    beatId: 5,
                    labelFor,
                }),
            ).toEqual({
                ...none,
                modifiedCues: [
                    { id: 1, marcherIds: [1, 2, 3, 4], label: "1+2+3+4" },
                ],
            });
        });

        it("makes a new cue when the value, beat or kind differs", () => {
            for (const cue of [
                stored(1, "sabre", 5, [1]),
                stored(1, "rifle", 6, [1]),
                stored(1, "rifle", 5, [1], 8),
            ]) {
                expect(
                    planEquipmentSet({
                        cues: [cue],
                        choice: "rifle",
                        marcherIds: [3],
                        beatId: 5,
                        labelFor,
                    }),
                ).toEqual({
                    ...none,
                    newCues: [
                        {
                            type: "equipment",
                            beatId: 5,
                            value: "builtin:equipment.rifle",
                            marcherIds: [3],
                            label: "3",
                        },
                    ],
                });
            }
        });

        it("does nothing when everyone holds it already on that beat", () => {
            const plan = planEquipmentSet({
                cues: [stored(1, "rifle", 5, [1, 2])],
                choice: "rifle",
                marcherIds: [2],
                beatId: 5,
                labelFor,
            });
            expect(plan).toEqual(none);
            expect(equipmentSetIsEmpty(plan)).toBe(true);
        });

        // Review of #1041: A and B take rifles at count 5 (cue 1), A takes a flag there (cue 2),
        // then A is set to Rifle again. A must hold the rifle, so A leaves cue 2.
        it("replaces: setting an item takes the performers out of the beat's other cue", () => {
            const cues = [
                stored(1, "rifle", 5, [1, 2]),
                stored(2, "flag", 5, [1]),
            ];
            expect(
                planEquipmentSet({
                    cues,
                    choice: "rifle",
                    marcherIds: [1],
                    beatId: 5,
                    labelFor,
                }),
            ).toEqual({ ...none, deletedCueIds: [2] });
            for (const choice of ["usual", "none"])
                expect(
                    planEquipmentSet({
                        cues,
                        choice,
                        marcherIds: [1],
                        beatId: 5,
                        labelFor,
                    }),
                ).toEqual({
                    ...none,
                    modifiedCues: [{ id: 1, marcherIds: [2], label: "2" }],
                    deletedCueIds: [2],
                    newCues: [
                        expect.objectContaining({
                            beatId: 5,
                            marcherIds: [1],
                            label: "1",
                        }),
                    ],
                });
        });

        it("joins when only some performers are in the cue, moving the others out of theirs", () => {
            const cues = [
                stored(1, "rifle", 5, [1, 2]),
                stored(2, "flag", 5, [3, 4]),
                stored(3, "sabre", 5, [5]),
                // Another beat, and a momentary cue on this one, are left alone
                stored(4, "flag", 6, [2, 3]),
                stored(5, "flag", 5, [2, 3], 8),
            ];
            expect(
                planEquipmentSet({
                    cues,
                    choice: "rifle",
                    marcherIds: [2, 3, 5],
                    beatId: 5,
                    labelFor,
                    relabelFor: (ids) => `now ${ids.join("+")}`,
                }),
            ).toEqual({
                ...none,
                modifiedCues: [
                    { id: 2, marcherIds: [4], label: "now 4" },
                    { id: 1, marcherIds: [1, 2, 3, 5], label: "now 1+2+3+5" },
                ],
                deletedCueIds: [3],
            });
        });

        it("joins the newest cue of that value when there are two", () => {
            const plan = planEquipmentSet({
                cues: [stored(1, "rifle", 5, [1]), stored(2, "rifle", 5, [2])],
                choice: "rifle",
                marcherIds: [1],
                beatId: 5,
                labelFor,
            });
            expect(plan).toEqual({
                ...none,
                modifiedCues: [{ id: 2, marcherIds: [1, 2], label: "1+2" }],
                deletedCueIds: [1],
            });
        });
    });

    describe("planCueChange (#992: a moved cue wins where it lands)", () => {
        const stored = (
            id: number,
            value: string,
            beatId: number,
            marcherIds: number[],
            length: number | null = null,
        ) => ({
            id,
            type: "equipment",
            beatId,
            value: `builtin:equipment.${value}`,
            settings: {},
            length,
            transition: null,
            marcherIds,
            label: "old",
            notes: null,
            createdAt: "",
            updatedAt: "",
        });
        const relabelFor = (ids: readonly number[]) => `now ${ids.join("+")}`;
        const none = { modifiedCues: [], deletedCueIds: [], newCues: [] };

        // The review's case: a Rifle cue (lower id) dragged onto the count where the same
        // performers have a Flag cue (higher id) used to lose to it and vanish
        it("moving a cue (a drag or Move cue to playhead) takes its performers out of the cues on the new count", () => {
            const cues = [
                stored(1, "rifle", 5, [1, 2]),
                stored(2, "flag", 9, [1, 2]),
                stored(3, "sabre", 9, [2, 3]),
                // Another kind on that count is left alone
                stored(4, "tuba", 9, [1], 8),
            ];
            expect(
                planCueChange({
                    cues,
                    cueId: 1,
                    change: { beatId: 9 },
                    relabelFor,
                }),
            ).toEqual({
                ...none,
                modifiedCues: [
                    { id: 3, marcherIds: [3], label: "now 3" },
                    { id: 1, beatId: 9 },
                ],
                deletedCueIds: [2],
            });
        });

        it("merges a cue of the same item on the new count into the moved one", () => {
            const cues = [
                stored(1, "rifle", 5, [1, 2]),
                stored(2, "rifle", 9, [2, 3]),
            ];
            expect(
                planCueChange({
                    cues,
                    cueId: 1,
                    change: { beatId: 9 },
                    relabelFor,
                }),
            ).toEqual({
                ...none,
                deletedCueIds: [2],
                modifiedCues: [
                    {
                        id: 1,
                        beatId: 9,
                        marcherIds: [1, 2, 3],
                        label: "now 1+2+3",
                    },
                ],
            });
        });

        it("a length change makes it the kind it becomes on its count", () => {
            const cues = [
                stored(1, "rifle", 5, [1, 2], 4),
                stored(2, "flag", 5, [1], 8),
                stored(3, "flag", 5, [2]),
            ];
            expect(
                planCueChange({
                    cues,
                    cueId: 1,
                    change: { length: 8 },
                    relabelFor,
                }),
            ).toEqual({
                ...none,
                modifiedCues: [{ id: 1, length: 8 }],
                deletedCueIds: [2],
            });
            // Made lasting, it wins over the lasting Flag cue instead
            expect(
                planCueChange({
                    cues,
                    cueId: 1,
                    change: { length: null },
                    relabelFor,
                }),
            ).toEqual({
                ...none,
                modifiedCues: [{ id: 1, length: null }],
                deletedCueIds: [3],
            });
        });

        it("a start edge moves the start and shortens it in one write, its performers winning there", () => {
            const cues = [
                stored(1, "rifle", 5, [1, 2], 8),
                stored(2, "flag", 7, [1], 6),
            ];
            expect(
                planCueChange({
                    cues,
                    cueId: 1,
                    change: { beatId: 7, length: 6 },
                    relabelFor,
                }),
            ).toEqual({
                ...none,
                modifiedCues: [{ id: 1, beatId: 7, length: 6 }],
                deletedCueIds: [2],
            });
        });

        it("changes nothing when nothing moves, or the cue isn't there", () => {
            const cues = [stored(1, "rifle", 5, [1])];
            for (const [cueId, change] of [
                [1, { beatId: 5 }],
                [1, { length: null }],
                [7, { beatId: 9 }],
            ] as const)
                expect(
                    planCueChange({ cues, cueId, change, relabelFor }),
                ).toEqual(none);
        });
    });

    describe("withRecent", () => {
        it("keeps the last four items picked, newest first, without repeats", () => {
            let recent: string[] = [];
            for (const key of [
                "rifle",
                "tuba",
                "flag",
                "snare",
                "tuba",
                "sabre",
            ])
                recent = withRecent(recent, key);
            expect(recent).toEqual(["sabre", "tuba", "snare", "flag"]);
            expect(withRecent(recent, "usual")).toEqual(recent);
            expect(withRecent(recent, "none")).toEqual(recent);
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
    const words = { performers: (n: number) => `${n} performers` };
    const name = (ids: number[], holders?: { name: string; ids: number[] }[]) =>
        describePerformers({ ids, marchers: MARCHERS, words, holders });

    it("names who holds one item at the playhead first", () => {
        expect(name(range(1, 6), [{ name: "Rifles", ids: range(1, 6) }])).toBe(
            "Rifles",
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
