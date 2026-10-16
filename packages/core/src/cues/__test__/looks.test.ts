// Carry, Silk and Uniform channels (ADR 0004 amendment of 2026-10-11).
import { describe, expect, it } from "vitest";
import {
    CUE_CHANNELS,
    compileCues,
    traceCue,
    type CompileInput,
    type CueChannel,
    type CueInput,
    type CueLibraryItem,
    type CueMarcher,
} from "../index";

/** 32 counts at 120 bpm, beat ids 101.. so ids never equal counts. */
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
const flag: CueMarcher = {
    id: 2,
    section: "Color Guard",
    tagIds: [],
    drillOrder: 2,
    carries: "flag",
    isGuard: true,
};
const flag2: CueMarcher = { ...flag, id: 3, drillOrder: 3 };
const flag3: CueMarcher = { ...flag, id: 4, drillOrder: 4 };
/** A prop row in the guard's section: an item, never a performer. */
const prop: CueMarcher = {
    id: 9,
    section: "Color Guard",
    tagIds: [],
    drillOrder: 9,
    carries: "none",
    type: "prop",
};

const RIFLE_MODEL = "library:7f1c2a90-0000-4000-8000-000000000001@a1b2c3";
const SABRE_MODEL = "library:7f1c2a90-0000-4000-8000-000000000002@d4e5f6";
const SUN_SILK = "library:7f1c2a90-0000-4000-8000-000000000003@0a0b0c";
const MOON_SILK = "library:7f1c2a90-0000-4000-8000-000000000004@0d0e0f";
const GALA = "library:7f1c2a90-0000-4000-8000-000000000005@101112";
const HATS_OFF = "library:7f1c2a90-0000-4000-8000-000000000006@131415";

const libraryItems: CueLibraryItem[] = [
    {
        id: RIFLE_MODEL,
        channel: "carry",
        name: "Wood rifle",
        label: "Rifle",
        holds: "rifle",
    },
    { id: SABRE_MODEL, channel: "carry", name: "Sabre", holds: "sabre" },
    { id: SUN_SILK, channel: "silk", name: "Sun", label: "Sun" },
    { id: MOON_SILK, channel: "silk", name: "Moon", label: "Moon" },
    { id: GALA, channel: "uniform", name: "Gala", label: "Gala" },
    { id: HATS_OFF, channel: "uniform", name: "Band, hats off" },
];

function show(
    cues: CueInput[],
    marchers: CueMarcher[] = [trumpet, flag],
    extra: Partial<CompileInput> = {},
): CompileInput {
    return {
        beats,
        marchers,
        cues,
        libraryItems,
        sections: [
            {
                name: "Trumpet",
                color: "#c03030",
                equipment: {
                    id: "builtin:model.trumpet",
                    name: "Trumpet",
                    holds: "winds",
                },
            },
            { name: "Color Guard", color: "#2050d0" },
        ],
        equipmentFallback: {
            "color guard": {
                id: "builtin:model.flag6",
                name: "6 ft flag",
                label: "Flag",
                holds: "flag",
            },
        },
        ...extra,
    };
}

function cue(
    id: number,
    channel: CueChannel,
    count: number,
    value: string,
    extra: Partial<CueInput> = {},
): CueInput {
    return {
        id,
        channel,
        kind: "state",
        target: { kind: "band" },
        beatId: beatAt(count),
        value,
        ...extra,
    };
}

const spans = (
    out: ReturnType<typeof compileCues>,
    id: number,
    ch: CueChannel,
) => out.segments(id, ch).map((s) => [s.from, s.to, s.kind, s.value]);

describe("Carry, Silk and Uniform defaults", () => {
    it("carries the section's usual equipment, then the fallback, then what the marcher carries", () => {
        const loose: CueMarcher = {
            ...trumpet,
            id: 5,
            section: "Rifle Line",
            carries: "rifle",
        };
        const empty: CueMarcher = { ...trumpet, id: 6, section: "Pit" };
        const out = compileCues(
            show([], [trumpet, flag, loose, empty], {
                sections: [
                    {
                        name: "trumpet ",
                        equipment: {
                            id: "builtin:model.trumpet",
                            name: "Trumpet",
                            holds: "winds",
                        },
                    },
                    { name: "Pit", equipment: null },
                ],
            }),
        );

        expect(out.segments(1, "carry")).toEqual([
            expect.objectContaining({
                kind: "default",
                value: "builtin:model.trumpet",
                label: "Trumpet",
                cueId: null,
            }),
        ]);
        expect(out.segments(2, "carry")[0]).toMatchObject({
            value: "builtin:model.flag6",
            label: "Flag",
        });
        expect(out.segments(5, "carry")[0]).toMatchObject({
            value: "builtin:carry.rifle",
            label: "Rifle",
        });
        expect(out.segments(6, "carry")[0]).toMatchObject({
            value: "none",
            label: "None",
        });
        expect(out.flags).toEqual([]);
        expect(out.notes).toEqual([]);
    });

    it("shows a plain silk in the section's 2D color", () => {
        const out = compileCues(show([]));

        expect(out.segments(2, "silk")).toEqual([
            expect.objectContaining({
                from: 0,
                to: 32,
                kind: "default",
                value: "builtin:silk.plain",
                label: "Plain",
                settings: { color: "#2050d0" },
            }),
        ]);
    });

    it("dresses the band in the band default and the guard in the guard default", () => {
        const dancer: CueMarcher = {
            ...trumpet,
            id: 7,
            section: "Dancer",
            carries: "none",
            isGuard: true,
        };
        // Without isGuard, a marcher carrying guard equipment counts as guard.
        const rifle: CueMarcher = {
            ...trumpet,
            id: 8,
            section: "Rifle",
            carries: "rifle",
        };
        const marchers = [trumpet, dancer, rifle];

        const builtIn = compileCues(show([], marchers));
        expect(builtIn.segments(1, "uniform")[0]!.value).toBe(
            "builtin:uniform.band",
        );
        expect(builtIn.segments(7, "uniform")[0]!.value).toBe(
            "builtin:uniform.guard",
        );
        expect(builtIn.segments(8, "uniform")[0]!.value).toBe(
            "builtin:uniform.guard",
        );

        const shows = compileCues(
            show([], marchers, {
                showDefaults: { bandUniform: GALA, guardUniform: HATS_OFF },
            }),
        );
        expect(shows.segments(1, "uniform")[0]).toMatchObject({
            value: GALA,
            label: "Gala",
        });
        expect(shows.segments(7, "uniform")[0]!.value).toBe(HATS_OFF);
    });

    it("explains each default in the trace", () => {
        const out = compileCues(show([cue(10, "carry", 8, RIFLE_MODEL)]));

        expect(traceCue(out, 2, "carry", 2)).toEqual({
            winner: null,
            default: {
                source: "equipment_fallback",
                value: "builtin:model.flag6",
                section: "Color Guard",
            },
            beaten: [],
        });
        expect(traceCue(out, 1, "carry", 2).default).toEqual({
            source: "section_equipment",
            value: "builtin:model.trumpet",
            section: "Trumpet",
        });
        expect(traceCue(out, 2, "silk", 2).default).toEqual({
            source: "section_color",
            value: "builtin:silk.plain",
            section: "Color Guard",
            color: "#2050d0",
        });
        expect(traceCue(out, 2, "uniform", 2).default).toEqual({
            source: "guard_uniform",
            value: "builtin:uniform.guard",
        });
        expect(traceCue(out, 1, "uniform", 2).default).toEqual({
            source: "band_uniform",
            value: "builtin:uniform.band",
        });
        // Horn/Equipment's default follows what Carry gives.
        expect(traceCue(out, 2, "horn_equipment", 4).default).toEqual({
            source: "carry",
            value: "builtin:flag.set",
            carries: "flag",
        });
        expect(traceCue(out, 2, "horn_equipment", 12).default).toEqual({
            source: "carry",
            value: "builtin:rifle.portArms",
            carries: "rifle",
        });
        expect(traceCue(out, 1, "facing", 2).default).toEqual({
            source: "library",
            value: "builtin:facing.front",
        });
        // A cue in effect has no default to explain.
        expect(traceCue(out, 2, "carry", 12)).toEqual({
            winner: 10,
            beaten: [],
        });
    });
});

describe("Carry, Silk and Uniform cues", () => {
    it.each([
        ["carry", RIFLE_MODEL, SABRE_MODEL],
        ["silk", SUN_SILK, MOON_SILK],
        ["uniform", GALA, HATS_OFF],
    ] as const)(
        "lets the latest %s cue win, and specificity settle a count",
        (channel, first, second) => {
            const guard = { kind: "section", section: "Color Guard" } as const;
            const out = compileCues(
                show(
                    [
                        cue(20, channel, 4, first, { target: guard }),
                        // A broader cue later still wins.
                        cue(21, channel, 8, second),
                        // On one count the hand-picked set beats the band.
                        cue(22, channel, 16, first),
                        cue(23, channel, 16, second, {
                            target: { kind: "set", marcherIds: [3] },
                        }),
                    ],
                    [flag, flag2],
                ),
            );

            expect(spans(out, 2, channel).slice(1)).toEqual([
                [4, 8, "state", first],
                [8, 16, "state", second],
                [16, 32, "state", first],
            ]);
            expect(spans(out, 3, channel).slice(1)).toEqual([
                [4, 8, "state", first],
                [8, 16, "state", second],
                [16, 32, "state", second],
            ]);
            expect(out.flags).toEqual([]);
        },
    );

    it.each(["carry", "silk", "uniform"] as const)(
        "flags two %s cues of one specificity on one count, the newest winning",
        (channel) => {
            const value =
                channel === "carry"
                    ? RIFLE_MODEL
                    : channel === "silk"
                      ? SUN_SILK
                      : GALA;
            const out = compileCues(
                show(
                    [cue(30, channel, 4, value), cue(31, channel, 4, value)],
                    [flag],
                ),
            );

            expect(out.segments(2, channel)[1]!.cueId).toBe(31);
            expect(out.flags).toEqual([
                { kind: "clash", cueIds: [30, 31], marcherIds: [2] },
            ]);
        },
    );

    it.each([
        ["carry", RIFLE_MODEL],
        ["silk", SUN_SILK],
        ["uniform", GALA],
    ] as const)(
        "cuts %s on the cue's count, ignoring its transition length",
        (channel, value) => {
            const out = compileCues(
                show(
                    [cue(40, channel, 8, value, { transitionLength: 4 })],
                    [flag],
                ),
            );

            expect(out.segments(2, channel)).toEqual([
                expect.objectContaining({ from: 0, to: 8, kind: "default" }),
                expect.objectContaining({
                    from: 8,
                    to: 32,
                    kind: "state",
                    value,
                    cueId: 40,
                }),
            ]);
            expect(out.flags).toEqual([]);
        },
    );

    it.each([
        ["carry", RIFLE_MODEL],
        ["silk", SUN_SILK],
        ["uniform", GALA],
    ] as const)("ignores and flags a phrase on %s", (channel, value) => {
        const out = compileCues(
            show(
                [cue(50, channel, 4, value, { kind: "phrase", length: 4 })],
                [flag],
            ),
        );

        expect(out.segments(2, channel)).toHaveLength(1);
        expect(out.flags).toEqual([
            { kind: "kind_not_allowed", cueIds: [50], marcherIds: [2] },
        ]);
    });

    it.each([
        ["carry", RIFLE_MODEL],
        ["silk", SUN_SILK],
        ["uniform", GALA],
    ] as const)(
        "ripples a %s cue, each performer cutting on their own start",
        (channel, value) => {
            const out = compileCues(
                show(
                    [
                        cue(60, channel, 8, value, {
                            ripple: { span: 5, order: "drill" },
                        }),
                    ],
                    [flag, flag2, flag3],
                ),
            );

            // Three performers over counts 8 to 12: starts at 8, 10 and 12.
            expect(
                [2, 3, 4].map((id) => out.segments(id, channel)[1]!.from),
            ).toEqual([8, 10, 12]);
            expect(
                out.segments(4, channel).map((s) => [s.from, s.to, s.kind]),
            ).toEqual([
                [0, 12, "default"],
                [12, 32, "state"],
            ]);
        },
    );

    it("puts Carry's none on a performer", () => {
        const out = compileCues(
            show(
                [
                    cue(70, "carry", 8, "none", {
                        target: { kind: "set", marcherIds: [2] },
                    }),
                ],
                [flag],
            ),
        );

        expect(out.segments(2, "carry")[1]).toMatchObject({
            value: "none",
            label: "None",
        });
        // Holding nothing, the equipment channel has nothing to show.
        expect(spans(out, 2, "horn_equipment")).toEqual([
            [0, 8, "default", "builtin:flag.set"],
            [8, 32, "default", null],
        ]);
    });
});

describe("Carry decides what is held", () => {
    it("ignores a Horn/Equipment cue that doesn't match what Carry gives, with a quiet note", () => {
        const out = compileCues(
            show(
                [
                    cue(80, "horn_equipment", 4, "builtin:flag.port"),
                    // The guard trades flags for rifles on 8.
                    cue(81, "carry", 8, RIFLE_MODEL, {
                        target: { kind: "section", section: "Color Guard" },
                    }),
                    // Flag work after the trade doesn't fit: ignored, noted.
                    cue(82, "horn_equipment", 12, "builtin:flag.set"),
                    // Rifle work fits from 8 on.
                    cue(83, "horn_equipment", 16, "builtin:rifle.present"),
                    // Rifle work while still holding the flag: noted too.
                    cue(84, "horn_equipment", 2, "builtin:rifle.present"),
                ],
                [trumpet, flag],
            ),
        );

        expect(spans(out, 2, "horn_equipment")).toEqual([
            [0, 4, "default", "builtin:flag.set"],
            [4, 4, "transition", "builtin:flag.port"],
            // Flag port gives way to the rifle's set position on 8.
            [4, 8, "state", "builtin:flag.port"],
            [8, 16, "default", "builtin:rifle.portArms"],
            [16, 16, "transition", "builtin:rifle.present"],
            [16, 32, "state", "builtin:rifle.present"],
        ]);
        expect(
            [...out.notes].sort((a, b) => a.cueIds[0]! - b.cueIds[0]!),
        ).toEqual([
            { kind: "carry_mismatch", cueIds: [82], marcherIds: [2] },
            { kind: "carry_mismatch", cueIds: [84], marcherIds: [2] },
        ]);
        // Every one of those cues fits nobody it targets, so it's flagged.
        expect(out.flags).toEqual([
            { kind: "fits_nobody", cueIds: [84], marcherIds: [1, 2] },
            { kind: "fits_nobody", cueIds: [82], marcherIds: [1, 2] },
        ]);
        // The horn line is skipped without a note: guard work never fits it.
        expect(spans(out, 1, "horn_equipment")).toEqual([
            [0, 32, "default", "builtin:horn.up"],
        ]);
    });

    it("keeps equipment work through a trade for the same kind of equipment", () => {
        const out = compileCues(
            show(
                [
                    cue(90, "carry", 4, RIFLE_MODEL),
                    cue(91, "horn_equipment", 6, "builtin:rifle.present"),
                    // Another rifle model: still a rifle, so Present holds.
                    cue(
                        92,
                        "carry",
                        10,
                        "library:7f1c2a90-0000-4000-8000-0000000000aa@ffffff",
                        {
                            target: { kind: "set", marcherIds: [2] },
                        },
                    ),
                ],
                [flag],
                {
                    libraryItems: [
                        ...libraryItems,
                        {
                            id: "library:7f1c2a90-0000-4000-8000-0000000000aa@ffffff",
                            channel: "carry",
                            name: "Chrome rifle",
                            holds: "rifle",
                        },
                    ],
                },
            ),
        );

        expect(spans(out, 2, "horn_equipment")).toEqual([
            [0, 4, "default", "builtin:flag.set"],
            [4, 6, "default", "builtin:rifle.portArms"],
            [6, 6, "transition", "builtin:rifle.present"],
            [6, 32, "state", "builtin:rifle.present"],
        ]);
        expect(out.notes).toEqual([]);
    });

    it("notes horn work on a horn player whose Carry took the horn away", () => {
        const out = compileCues(
            show(
                [
                    cue(100, "carry", 4, "none", {
                        target: { kind: "section", section: "Trumpet" },
                    }),
                    cue(101, "horn_equipment", 8, "builtin:horn.down"),
                ],
                [trumpet],
            ),
        );

        expect(spans(out, 1, "horn_equipment")).toEqual([
            [0, 4, "default", "builtin:horn.up"],
            [4, 32, "default", null],
        ]);
        expect(out.notes).toEqual([
            { kind: "carry_mismatch", cueIds: [101], marcherIds: [1] },
        ]);
    });
});

describe("Silk", () => {
    it("skips performers not carrying a flag, silently", () => {
        const out = compileCues(
            show(
                [
                    cue(110, "silk", 4, SUN_SILK),
                    // Performer 3 trades the flag for a rifle on 2.
                    cue(111, "carry", 2, RIFLE_MODEL, {
                        target: { kind: "set", marcherIds: [3] },
                    }),
                ],
                [trumpet, flag, flag2],
            ),
        );

        expect(spans(out, 2, "silk")).toEqual([
            [0, 4, "default", "builtin:silk.plain"],
            [4, 32, "state", SUN_SILK],
        ]);
        expect(spans(out, 1, "silk")).toEqual([
            [0, 32, "default", "builtin:silk.plain"],
        ]);
        expect(spans(out, 3, "silk")).toEqual([
            [0, 32, "default", "builtin:silk.plain"],
        ]);
        expect(out.flags).toEqual([]);
        expect(out.notes).toEqual([]);
    });

    it("flags a Silk cue when none of its targets carry a flag", () => {
        const out = compileCues(
            show([
                cue(120, "silk", 4, SUN_SILK, {
                    target: { kind: "section", section: "Trumpet" },
                }),
            ]),
        );

        expect(out.flags).toEqual([
            { kind: "fits_nobody", cueIds: [120], marcherIds: [1] },
        ]);
    });
});

describe("items", () => {
    it("are never reached by any target", () => {
        const out = compileCues(
            show(
                [
                    cue(130, "carry", 4, RIFLE_MODEL),
                    cue(131, "uniform", 4, GALA, {
                        target: { kind: "section", section: "Color Guard" },
                    }),
                    cue(132, "facing", 4, "builtin:facing.back", {
                        ripple: { span: 4, order: "drill" },
                    }),
                ],
                [flag, flag2, prop],
            ),
        );

        for (const channel of CUE_CHANNELS)
            expect(
                out.segments(9, channel).every((s) => s.kind === "default"),
            ).toBe(true);
        // The ripple spreads over the two performers only: 4, then 7.
        expect(
            [2, 3].map(
                (id) =>
                    out.segments(id, "facing").find((s) => s.kind === "state")!
                        .from,
            ),
        ).toEqual([4, 7]);
        expect(out.flags).toEqual([]);
    });

    it("are skipped by tag and set targets that also name performers", () => {
        const tagged = (m: CueMarcher): CueMarcher => ({ ...m, tagIds: [7] });
        const out = compileCues(
            show(
                [
                    cue(133, "uniform", 4, GALA, {
                        target: { kind: "tag", tagId: 7 },
                    }),
                    cue(134, "facing", 8, "builtin:facing.back", {
                        target: { kind: "set", marcherIds: [2, 9] },
                    }),
                ],
                [tagged(flag), tagged(prop)],
            ),
        );

        for (const channel of CUE_CHANNELS)
            expect(
                out.segments(9, channel).every((s) => s.kind === "default"),
            ).toBe(true);
        expect(out.segments(2, "uniform").some((s) => s.kind === "state")).toBe(
            true,
        );
        expect(out.segments(2, "facing").some((s) => s.kind === "state")).toBe(
            true,
        );
        expect(out.flags).toEqual([]);
    });

    it("make a tag or set cue naming only items fit nobody", () => {
        const out = compileCues(
            show(
                [
                    cue(135, "uniform", 4, GALA, {
                        target: { kind: "tag", tagId: 7 },
                    }),
                    cue(136, "facing", 8, "builtin:facing.back", {
                        target: { kind: "set", marcherIds: [9] },
                    }),
                ],
                [flag, { ...prop, tagIds: [7] }],
            ),
        );

        for (const channel of CUE_CHANNELS)
            expect(
                out.segments(9, channel).every((s) => s.kind === "default"),
            ).toBe(true);
        expect(out.flags).toEqual([
            { kind: "fits_nobody", cueIds: [135], marcherIds: [9] },
            { kind: "fits_nobody", cueIds: [136], marcherIds: [9] },
        ]);
    });

    it("don't make a section cue fit nobody", () => {
        const out = compileCues(
            show(
                [
                    cue(140, "horn_equipment", 4, "builtin:flag.port", {
                        target: { kind: "section", section: "Color Guard" },
                    }),
                ],
                [flag, prop],
            ),
        );

        expect(out.flags).toEqual([]);
    });
});

describe("recompiling after a Carry edit", () => {
    it("resolves Horn/Equipment and Silk again, matching a full compile", () => {
        const before = show(
            [
                cue(150, "horn_equipment", 12, "builtin:rifle.present"),
                cue(151, "silk", 6, SUN_SILK),
            ],
            [trumpet, flag, flag2],
        );
        const after = show(
            [...before.cues, cue(152, "carry", 8, RIFLE_MODEL)],
            [trumpet, flag, flag2],
        );

        const previous = compileCues(before);
        const partial = compileCues(after, { previous, channels: ["carry"] });
        const full = compileCues(after);

        for (const m of after.marchers)
            for (const channel of CUE_CHANNELS)
                expect(partial.segments(m.id, channel)).toEqual(
                    full.segments(m.id, channel),
                );
        expect(partial.flags).toEqual(full.flags);
        expect(partial.notes).toEqual(full.notes);
        expect(partial.segments(2, "horn_equipment").at(-1)!.value).toBe(
            "builtin:rifle.present",
        );
    });
});

describe("owner answers on #118 (ADR 0004 amendment of 2026-10-15)", () => {
    it("checks a rippled cue's fit where it lands for each performer", () => {
        const out = compileCues(
            show(
                [
                    // Flag work rippled over the guard: 4 for the first, 8 for the second.
                    cue(140, "horn_equipment", 4, "builtin:flag.port", {
                        ripple: { span: 5, order: "drill" },
                    }),
                    // The second trades the flag for a rifle on 6, before it lands.
                    cue(141, "carry", 6, RIFLE_MODEL, {
                        target: { kind: "set", marcherIds: [3] },
                    }),
                ],
                [flag, flag2],
            ),
        );

        expect(
            out
                .segments(2, "horn_equipment")
                .some((s) => s.kind === "state" && s.cueId === 140),
        ).toBe(true);
        // On 8 the second holds a rifle: the flag work doesn't fit there.
        expect(spans(out, 3, "horn_equipment")).toEqual([
            [0, 6, "default", "builtin:flag.set"],
            [6, 32, "default", "builtin:rifle.portArms"],
        ]);
        expect(out.notes).toEqual([
            { kind: "carry_mismatch", cueIds: [140], marcherIds: [3] },
        ]);
        expect(out.flags).toEqual([]);
    });

    it("matches section targets ignoring case and outer spaces", () => {
        const out = compileCues(
            show([
                cue(150, "facing", 4, "builtin:facing.back", {
                    target: { kind: "section", section: " color guard " },
                }),
                cue(151, "facing", 8, "builtin:facing.side1", {
                    target: { kind: "section", section: "TRUMPET" },
                }),
            ]),
        );

        expect(
            out.segments(2, "facing").find((s) => s.kind === "state")?.cueId,
        ).toBe(150);
        expect(
            out.segments(1, "facing").find((s) => s.kind === "state")?.cueId,
        ).toBe(151);
        expect(out.flags).toEqual([]);
    });
});
