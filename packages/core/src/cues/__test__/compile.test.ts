// cspell:words choreo recompiles mellophones
import { describe, expect, it } from "vitest";
import {
    CUE_CHANNELS,
    compileCues,
    traceCue,
    type CompileInput,
    type CueInput,
    type CueMarcher,
} from "../index";

/** 32 counts at 120 bpm, beat ids 101.. so ids never equal counts. */
const beats = Array.from({ length: 32 }, (_, i) => ({
    id: 101 + i,
    duration: 0.5,
}));
/** The beat id of count `c` (0-based, the click at the start of row c). */
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
};

const rifle: CueMarcher = {
    id: 5,
    section: "Rifle",
    tagIds: [],
    drillOrder: 5,
    carries: "rifle",
};

function show(
    cues: CueInput[],
    marchers: CueMarcher[] = [trumpet, flag],
    extra: Partial<CompileInput> = {},
): CompileInput {
    return { beats, marchers, cues, ...extra };
}

describe("compileCues", () => {
    it("gives every channel its built-in default when there are no cues", () => {
        const out = compileCues(show([]));

        expect(out.segments(1, "horn_equipment")).toEqual([
            expect.objectContaining({
                from: 0,
                to: 32,
                kind: "default",
                value: "builtin:horn.up",
                cueId: null,
            }),
        ]);
        expect(out.segments(2, "horn_equipment")[0].value).toBe(
            "builtin:flag.set",
        );
        expect(out.segments(1, "facing")[0].value).toBe("builtin:facing.front");
        expect(out.segments(1, "body")[0].value).toBe("builtin:body.neutral");
        expect(out.segments(1, "feet")[0].value).toBe("builtin:feet.step");
        expect(out.flags).toEqual([]);
    });

    it("lands a state on its count's click, its transition counted inclusively", () => {
        // "Horns down on 8, takes 3 counts": moves from the click of 6 to 8.
        const out = compileCues(
            show([
                {
                    id: 10,
                    channel: "horn_equipment",
                    kind: "state",
                    target: { kind: "band" },
                    beatId: beatAt(8),
                    value: "builtin:horn.down",
                    transitionLength: 3,
                },
            ]),
        );

        expect(
            out
                .segments(1, "horn_equipment")
                .map((s) => [s.from, s.to, s.kind, s.value]),
        ).toEqual([
            [0, 6, "default", "builtin:horn.up"],
            [6, 8, "transition", "builtin:horn.down"],
            [8, 32, "state", "builtin:horn.down"],
        ]);
    });

    it("snaps when the transition is 1 count, the library default for horns", () => {
        const out = compileCues(
            show([
                {
                    id: 10,
                    channel: "horn_equipment",
                    kind: "state",
                    target: { kind: "band" },
                    beatId: beatAt(8),
                    value: "builtin:horn.down",
                },
            ]),
        );

        expect(
            out
                .segments(1, "horn_equipment")
                .map((s) => [s.from, s.to, s.kind, s.snap ?? false]),
        ).toEqual([
            [0, 8, "default", false],
            [8, 8, "transition", true],
            [8, 32, "state", false],
        ]);
        expect(out.segments(1, "horn_equipment")[2]).toMatchObject({
            cueId: 10,
            label: "HD",
        });
    });

    it("applies a cue only to its target, and the latest cue wins whatever its target", () => {
        const tagged: CueMarcher = {
            ...trumpet,
            id: 3,
            tagIds: [7],
            drillOrder: 3,
        };
        const picked: CueMarcher = { ...trumpet, id: 4, drillOrder: 4 };
        const out = compileCues(
            show(
                [
                    // Section cue on 4, then a band-wide cue on 12 overrides it.
                    hornCue(
                        20,
                        { kind: "section", section: "Trumpet" },
                        4,
                        "builtin:horn.down",
                    ),
                    hornCue(21, { kind: "band" }, 12, "builtin:horn.trail"),
                    hornCue(
                        22,
                        { kind: "tag", tagId: 7 },
                        16,
                        "builtin:horn.down",
                    ),
                    hornCue(
                        23,
                        { kind: "set", marcherIds: [4] },
                        20,
                        "builtin:horn.down",
                    ),
                ],
                [trumpet, flag, tagged, picked],
            ),
        );

        const states = (id: number) =>
            out
                .segments(id, "horn_equipment")
                .filter((s) => s.kind !== "transition")
                .map((s) => [s.from, s.value]);
        expect(states(1)).toEqual([
            [0, "builtin:horn.up"],
            [4, "builtin:horn.down"],
            [12, "builtin:horn.trail"],
        ]);
        expect(states(3)).toEqual([
            [0, "builtin:horn.up"],
            [4, "builtin:horn.down"],
            [12, "builtin:horn.trail"],
            [16, "builtin:horn.down"],
        ]);
        expect(states(4)).toEqual([
            [0, "builtin:horn.up"],
            [4, "builtin:horn.down"],
            [12, "builtin:horn.trail"],
            [20, "builtin:horn.down"],
        ]);
        // Horn cues don't fit the guard, even band-wide ones.
        expect(states(2)).toEqual([[0, "builtin:flag.set"]]);
    });

    it("breaks same-count ties by specificity, then by the newest cue with a clash flag", () => {
        const out = compileCues(
            show([
                // The section cue is older but more specific than the band's.
                hornCue(
                    30,
                    { kind: "section", section: "Trumpet" },
                    8,
                    "builtin:horn.trail",
                ),
                hornCue(31, { kind: "band" }, 8, "builtin:horn.down"),
                // Two section cues on one count: the newest wins, flagged.
                hornCue(
                    40,
                    { kind: "section", section: "Trumpet" },
                    16,
                    "builtin:horn.down",
                ),
                hornCue(
                    41,
                    { kind: "section", section: "Trumpet" },
                    16,
                    "builtin:horn.up",
                ),
            ]),
        );

        const states = out
            .segments(1, "horn_equipment")
            .filter((s) => s.kind === "state")
            .map((s) => [s.from, s.cueId]);
        expect(states).toEqual([
            [8, 30],
            [16, 41],
        ]);
        expect(out.flags).toEqual([
            { kind: "clash", cueIds: [40, 41], marcherIds: [1] },
        ]);
    });

    it("plays a phrase over its counts, then shows the state underneath", () => {
        // "A 3-count toss on 4" covers 4, 5, 6; present lands on 5 during it.
        const out = compileCues(
            show(
                [
                    guardCue(50, "phrase", 4, "builtin:rifle.toss1", {
                        length: 3,
                    }),
                    guardCue(51, "state", 5, "builtin:rifle.present"),
                ],
                [rifle],
            ),
        );

        expect(
            out
                .segments(5, "horn_equipment")
                .map((s) => [s.from, s.to, s.kind, s.value]),
        ).toEqual([
            [0, 4, "default", "builtin:rifle.portArms"],
            [4, 7, "phrase", "builtin:rifle.toss1"],
            [7, 32, "state", "builtin:rifle.present"],
        ]);
    });

    it("lets a later phrase take over from an earlier one on its own count, flagged", () => {
        const out = compileCues(
            show(
                [
                    guardCue(60, "phrase", 4, "builtin:rifle.toss1", {
                        length: 3,
                    }),
                    guardCue(61, "phrase", 5, "builtin:rifle.toss2", {
                        length: 4,
                    }),
                ],
                [rifle],
            ),
        );

        expect(
            out
                .segments(5, "horn_equipment")
                .map((s) => [s.from, s.to, s.cueId]),
        ).toEqual([
            [0, 4, null],
            [4, 5, 60],
            [5, 9, 61],
            [9, 32, null],
        ]);
        expect(out.flags).toEqual([
            { kind: "phrase_overlap", cueIds: [60, 61], marcherIds: [5] },
        ]);
    });

    it("lets a kneel take over the feet, flagged where the dot travels", () => {
        const out = compileCues(
            show(
                [
                    bodyCue(70, "state", 8, "builtin:body.kneel"),
                    bodyCue(71, "state", 16, "builtin:body.neutral"),
                ],
                [trumpet],
                { travels: (_id, count) => count === 10 },
            ),
        );

        expect(
            out
                .segments(1, "feet")
                .map((s) => [s.from, s.to, s.value, s.takenOverFrom]),
        ).toEqual([
            [0, 6, "builtin:feet.step", undefined],
            [6, 8, "builtin:body.kneel", "body"],
            [8, 16, "builtin:body.kneel", "body"],
            [16, 32, "builtin:feet.step", undefined],
        ]);
        expect(out.flags).toEqual([
            { kind: "takeover_while_moving", cueIds: [70], marcherIds: [1] },
        ]);
    });

    it("lets the choreography phrase take over horn and equipment while it plays", () => {
        const out = compileCues(
            show(
                [
                    bodyCue(80, "phrase", 0, "builtin:body.choreo", {
                        length: 8,
                    }),
                ],
                [trumpet],
            ),
        );

        expect(
            out
                .segments(1, "horn_equipment")
                .map((s) => [s.from, s.to, s.value, s.takenOverFrom]),
        ).toEqual([
            [0, 8, "builtin:body.choreo", "body"],
            [8, 32, "builtin:horn.up", undefined],
        ]);
    });

    it("flags a cue that fits none of the performers it targets", () => {
        const out = compileCues(
            show([
                hornCue(
                    90,
                    { kind: "section", section: "Color Guard" },
                    4,
                    "builtin:horn.down",
                ),
                // Band-wide horn cues fit the trumpet, so they're fine.
                hornCue(91, { kind: "band" }, 8, "builtin:horn.down"),
            ]),
        );

        expect(out.flags).toEqual([
            { kind: "fits_nobody", cueIds: [90], marcherIds: [2] },
        ]);
    });

    it("spreads a ripple's starts evenly in time over its span, in drill order", () => {
        // Counts 4 and 5 last 1 s, 6 and 7 last 0.5 s: the span 4..8 is 3 s,
        // so the middle marcher lands 1.5 s in, halfway through count 5.
        const slowThenFast = beats.map((b, i) => ({
            ...b,
            duration: i === 4 || i === 5 ? 1 : 0.5,
        }));
        const line = [3, 1, 2].map((order) => ({
            ...trumpet,
            id: 10 + order,
            drillOrder: order,
        }));
        const out = compileCues(
            show(
                [
                    {
                        ...hornCue(
                            95,
                            { kind: "band" },
                            4,
                            "builtin:horn.down",
                        ),
                        ripple: { span: 5, order: "drill" },
                    },
                ],
                line,
                { beats: slowThenFast },
            ),
        );

        const landing = (id: number) =>
            out.segments(id, "horn_equipment").find((s) => s.kind === "state")
                ?.from;
        expect(landing(11)).toBe(4);
        expect(landing(12)).toBeCloseTo(5.5);
        expect(landing(13)).toBe(8);
    });

    it("orders a ripple by where marchers stand on the cue's count", () => {
        // A diagonal line; drill order 1 stands second from the side-1 end.
        const spots: Record<number, { x: number; y: number }> = {
            21: { x: 0, y: 0 },
            22: { x: 10, y: 10 },
            23: { x: 20, y: 20 },
            24: { x: 30, y: 30 },
        };
        const drill: Record<number, number> = { 21: 3, 22: 1, 23: 4, 24: 2 };
        const line = Object.keys(spots).map((id) => ({
            ...trumpet,
            id: Number(id),
            drillOrder: drill[Number(id)]!,
        }));
        const landingOrder = (
            order: "left_right" | "right_left" | "down_form",
        ) => {
            const out = compileCues(
                show(
                    [
                        {
                            ...hornCue(
                                96,
                                { kind: "band" },
                                4,
                                "builtin:horn.down",
                            ),
                            ripple: { span: 4, order },
                        },
                    ],
                    line,
                    {
                        positionAt: (id, count) => {
                            expect(count).toBe(4);
                            return spots[id]!;
                        },
                    },
                ),
            );
            return line
                .map((m) => ({
                    id: m.id,
                    at: out
                        .segments(m.id, "horn_equipment")
                        .find((s) => s.kind === "state")!.from,
                }))
                .sort((a, b) => a.at - b.at)
                .map((m) => m.id);
        };

        expect(landingOrder("left_right")).toEqual([21, 22, 23, 24]);
        expect(landingOrder("right_left")).toEqual([24, 23, 22, 21]);
        // Along the line, from the end nearest the first marcher in drill order.
        expect(landingOrder("down_form")).toEqual([21, 22, 23, 24]);
    });

    it("never ripples feet cues", () => {
        const pair = [trumpet, { ...trumpet, id: 9, drillOrder: 9 }];
        const out = compileCues(
            show(
                [
                    {
                        id: 97,
                        channel: "feet",
                        kind: "state",
                        target: { kind: "band" },
                        beatId: beatAt(4),
                        value: "builtin:feet.step",
                        settings: { pace: "half" },
                        ripple: { span: 8, order: "drill" },
                    },
                ],
                pair,
            ),
        );

        for (const m of pair)
            expect(
                out.segments(m.id, "feet").find((s) => s.kind === "state"),
            ).toMatchObject({
                from: 4,
                settings: { pace: "half" },
            });
    });

    it("plays a show phrase asset with its own label over the channels it lists", () => {
        const out = compileCues(
            show(
                [bodyCue(98, "phrase", 2, "show:3", { length: 4 })],
                [trumpet, flag],
                {
                    phraseAssets: [
                        {
                            id: 3,
                            name: "Opener",
                            label: "Op",
                            channels: ["body", "horn_equipment"],
                        },
                    ],
                },
            ),
        );

        for (const id of [1, 2]) {
            expect(out.segments(id, "body")[1]).toMatchObject({
                from: 2,
                to: 6,
                kind: "phrase",
                label: "Op",
            });
            expect(out.segments(id, "horn_equipment")[1]).toMatchObject({
                from: 2,
                to: 6,
                label: "Op",
                takenOverFrom: "body",
            });
        }
        expect(out.flags).toEqual([]);
    });

    it("keeps a ripple that runs past the show's last count inside the show", () => {
        // Count 30 with a span of 6 would end on 35; the show has 32 counts.
        const line = [1, 2].map((order) => ({
            ...trumpet,
            id: 30 + order,
            drillOrder: order,
        }));
        const out = compileCues(
            show(
                [
                    {
                        ...hornCue(
                            99,
                            { kind: "band" },
                            30,
                            "builtin:horn.down",
                        ),
                        ripple: { span: 6, order: "drill" },
                    },
                ],
                line,
            ),
        );

        for (const m of line)
            for (const s of out.segments(m.id, "horn_equipment")) {
                expect(s.from).toBeLessThanOrEqual(s.to);
                expect(s.to).toBeLessThanOrEqual(32);
            }
    });

    it("holds a phrase's length to the range its library entry allows", () => {
        const out = compileCues(
            show(
                [
                    bodyCue(110, "phrase", 0, "builtin:body.choreo", {
                        length: 3,
                    }),
                ],
                [trumpet],
            ),
        );

        expect(out.segments(1, "body")[0]).toMatchObject({
            from: 0,
            to: 8,
            kind: "phrase",
        });
    });

    it("labels a feet state from its settings", () => {
        const feet = (
            id: number,
            count: number,
            settings: Record<string, unknown>,
        ): CueInput => ({
            id,
            channel: "feet",
            kind: "state",
            target: { kind: "band" },
            beatId: beatAt(count),
            value: "builtin:feet.step",
            settings,
        });
        const out = compileCues(
            show(
                [
                    feet(120, 4, { pace: "half" }),
                    feet(121, 8, { pace: "double" }),
                    feet(122, 12, { onHolds: "markTime" }),
                    feet(123, 16, {}),
                ],
                [trumpet],
            ),
        );

        expect(
            out
                .segments(1, "feet")
                .filter((s) => s.kind === "state")
                .map((s) => s.label),
        ).toEqual(["½", "2×", "MT", "Step"]);
    });

    it("settles same-count ties on the authored count when a cue ripples", () => {
        const trumpets = [1, 2, 3].map((order) => ({
            ...trumpet,
            id: 40 + order,
            drillOrder: order,
        }));
        const mello: CueMarcher = {
            ...trumpet,
            id: 44,
            section: "Mellophone",
            drillOrder: 4,
        };
        const out = compileCues(
            show(
                [
                    hornCue(
                        130,
                        { kind: "section", section: "Trumpet" },
                        4,
                        "builtin:horn.trail",
                    ),
                    {
                        ...hornCue(
                            131,
                            { kind: "band" },
                            4,
                            "builtin:horn.down",
                        ),
                        ripple: { span: 4, order: "drill" },
                    },
                ],
                [...trumpets, mello],
            ),
        );

        // The section cue is more specific on count 4, so every trumpet trails.
        for (const m of trumpets)
            expect(
                out
                    .segments(m.id, "horn_equipment")
                    .filter((s) => s.kind === "state")
                    .map((s) => s.cueId),
            ).toEqual([130]);
        // The mellophone, last in the ripple, still gets the band cue on 7.
        expect(
            out.segments(44, "horn_equipment").find((s) => s.kind === "state"),
        ).toMatchObject({
            from: 7,
            cueId: 131,
        });
    });

    it("lets a later-authored cue beat a rippled cue that lands after it", () => {
        const trumpets = [1, 2].map((order) => ({
            ...trumpet,
            id: 40 + order,
            drillOrder: order,
        }));
        const mellophones = [3, 4].map((order) => ({
            ...trumpet,
            id: 40 + order,
            section: "Mellophone",
            drillOrder: order,
        }));
        const out = compileCues(
            show(
                [
                    {
                        ...hornCue(
                            150,
                            { kind: "band" },
                            8,
                            "builtin:horn.down",
                        ),
                        ripple: { span: 8, order: "drill" },
                    },
                    hornCue(
                        151,
                        { kind: "section", section: "Mellophone" },
                        10,
                        "builtin:horn.trail",
                    ),
                ],
                [...trumpets, ...mellophones],
            ),
        );

        // The band cue on 8 ripples to the mellophones after count 10, but
        // the section cue on 10 is the later cue, so they keep trailing.
        for (const m of mellophones) {
            expect(
                out
                    .segments(m.id, "horn_equipment")
                    .filter((s) => s.kind === "state")
                    .map((s) => s.cueId),
            ).toEqual([151]);
            expect(traceCue(out, m.id, "horn_equipment", 20)).toMatchObject({
                winner: 151,
                beaten: [150],
            });
        }
        expect(
            out.segments(41, "horn_equipment").find((s) => s.kind === "state"),
        ).toMatchObject({ from: 8, cueId: 150 });
    });

    it("fills each value's settings from its defaults and the show's", () => {
        const out = compileCues(
            show(
                [
                    hornCue(140, { kind: "band" }, 4, "builtin:horn.up"),
                    {
                        ...hornCue(141, { kind: "band" }, 8, "builtin:horn.up"),
                        settings: { angle: "plus10" },
                    },
                ],
                [trumpet],
                { showDefaults: { stepOffFoot: "right" } },
            ),
        );

        expect(
            out
                .segments(1, "horn_equipment")
                .filter((s) => s.kind !== "transition")
                .map((s) => s.settings),
        ).toEqual([{ angle: "box" }, { angle: "box" }, { angle: "plus10" }]);
        expect(out.segments(1, "feet")[0].settings).toEqual({
            pace: "single",
            moving: "straightLeg",
            onHolds: "stand",
            stepOffFoot: "right",
        });
        expect(out.segments(1, "body")[0].settings).toEqual({});
    });

    it("ignores and flags a phrase on a channel that takes states only", () => {
        const out = compileCues(
            show(
                [
                    {
                        id: 150,
                        channel: "facing",
                        kind: "phrase",
                        target: { kind: "band" },
                        beatId: beatAt(4),
                        value: "builtin:facing.back",
                        length: 4,
                    },
                ],
                [trumpet],
            ),
        );

        expect(out.segments(1, "facing")).toHaveLength(1);
        expect(out.flags).toEqual([
            { kind: "kind_not_allowed", cueIds: [150], marcherIds: [1] },
        ]);
    });

    it("flags a transition that would start before the cue it follows lands", () => {
        // Down on 8, then trail on 9 taking 4 counts: it can't start before 8.
        const out = compileCues(
            show(
                [
                    hornCue(160, { kind: "band" }, 8, "builtin:horn.down"),
                    {
                        ...hornCue(
                            161,
                            { kind: "band" },
                            9,
                            "builtin:horn.trail",
                        ),
                        transitionLength: 4,
                    },
                ],
                [trumpet],
            ),
        );

        expect(out.flags).toEqual([
            { kind: "transition_cut", cueIds: [160, 161], marcherIds: [1] },
        ]);
    });

    it("recompiles only the channels an edit touched, matching a full compile", () => {
        const body = bodyCue(170, "state", 6, "builtin:body.kneel");
        const choreo = bodyCue(171, "phrase", 12, "builtin:body.choreo", {
            length: 8,
        });
        const before = show([
            body,
            choreo,
            hornCue(172, { kind: "band" }, 4, "builtin:horn.down"),
        ]);
        const after = show([
            body,
            choreo,
            hornCue(172, { kind: "band" }, 10, "builtin:horn.down"),
            hornCue(
                173,
                { kind: "section", section: "Color Guard" },
                2,
                "builtin:horn.trail",
            ),
        ]);

        const previous = compileCues(before);
        const partial = compileCues(after, {
            previous,
            channels: ["horn_equipment"],
        });
        const full = compileCues(after);

        for (const m of after.marchers)
            for (const channel of CUE_CHANNELS)
                expect(partial.segments(m.id, channel)).toEqual(
                    full.segments(m.id, channel),
                );
        expect([...partial.flags].sort(byFlag)).toEqual(
            [...full.flags].sort(byFlag),
        );
        // The body channel wasn't recompiled.
        expect(partial.segments(1, "body")).toBe(previous.segments(1, "body"));
    });
});

function hornCue(
    id: number,
    target: CueInput["target"],
    count: number,
    value: string,
): CueInput {
    return {
        id,
        channel: "horn_equipment",
        kind: "state",
        target,
        beatId: beatAt(count),
        value,
    };
}

function guardCue(
    id: number,
    kind: CueInput["kind"],
    count: number,
    value: string,
    extra: Partial<CueInput> = {},
): CueInput {
    return {
        id,
        channel: "horn_equipment",
        kind,
        target: { kind: "band" },
        beatId: beatAt(count),
        value,
        ...extra,
    };
}

function bodyCue(
    id: number,
    kind: CueInput["kind"],
    count: number,
    value: string,
    extra: Partial<CueInput> = {},
): CueInput {
    return {
        id,
        channel: "body",
        kind,
        target: { kind: "band" },
        beatId: beatAt(count),
        value,
        ...extra,
    };
}

function byFlag(
    a: { kind: string; cueIds: readonly number[] },
    b: typeof a,
): number {
    return (
        a.kind.localeCompare(b.kind) ||
        a.cueIds.join().localeCompare(b.cueIds.join())
    );
}
