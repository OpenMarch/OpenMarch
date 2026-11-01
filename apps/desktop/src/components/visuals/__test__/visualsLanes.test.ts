// @vitest-environment node
// cspell:words choreo
import { describe, expect, it } from "vitest";
import { compileCues } from "@openmarch/core";
import type { DatabaseCue } from "@/db-functions/cues";
import {
    copyCues,
    countAtBeatIndex,
    countIndex,
    flagsByCue,
    pastedCues,
    laneCue,
    laneCreate,
    newCueValue,
    resultRow,
    targetKey,
    targetOfWho,
    visualsLanes,
} from "../visualsLanes";

// Beat 0 is the zero-length start; counts are beats 1..16 at 0.5 s each
const beats = [
    { id: 100, position: 0, duration: 0 },
    ...Array.from({ length: 16 }, (_, i) => ({
        id: 101 + i,
        position: i + 1,
        duration: 0.5,
    })),
];
const counts = countIndex(beats);
const beatOf = (count: number) => counts.beatIdOfCount[count]!;

const marchers = [
    { id: 1, section: "Trumpet" },
    { id: 2, section: "Trumpet" },
    { id: 3, section: "Tuba" },
    { id: 4, section: "Color Guard" },
];
const byTag = new Map<number, number[]>([[7, [2, 3]]]);

let nextId = 1;
const cue = (
    over: Partial<DatabaseCue> & Pick<DatabaseCue, "target" | "value">,
): DatabaseCue => ({
    id: nextId++,
    channel: "facing",
    kind: "state",
    beatId: beatOf(4),
    phraseAssetId: null,
    length: null,
    transitionLength: null,
    settings: {},
    ripple: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
    ...over,
});

describe("countIndex", () => {
    it("counts beats with a duration, in order", () => {
        expect(counts.countOfBeatId.get(100)).toBeUndefined();
        expect(counts.countOfBeatId.get(101)).toBe(0);
        expect(counts.beatIdOfCount).toHaveLength(16);
    });
});

describe("laneCue", () => {
    it("ramps a state into its count and spans a phrase's counts", () => {
        const state = laneCue(
            cue({
                target: { kind: "band" },
                value: "builtin:facing.back",
                beatId: beatOf(6),
                transitionLength: 3,
            }),
            counts,
        );
        expect(state).toMatchObject({
            kind: "state",
            count: 6,
            from: 4,
            to: 6,
        });
        const phrase = laneCue(
            cue({
                channel: "body",
                kind: "phrase",
                target: { kind: "band" },
                value: "builtin:body.choreo",
                beatId: beatOf(2),
                length: 8,
            }),
            counts,
        );
        expect(phrase).toMatchObject({
            kind: "phrase",
            count: 2,
            from: 2,
            to: 10,
        });
        // the library's label
        expect(state!.label).not.toMatch(/^builtin:/);
    });

    it("draws a phrase as long as compile plays it, inside its value's range", () => {
        // Choreography is 8 counts, whatever the cue stores
        const choreo = (length: number) =>
            laneCue(
                cue({
                    channel: "body",
                    kind: "phrase",
                    target: { kind: "band" },
                    value: "builtin:body.choreo",
                    beatId: beatOf(2),
                    length,
                }),
                counts,
            );
        expect(choreo(3)).toMatchObject({ from: 2, to: 10, holdTo: 10 });
        expect(choreo(12)).toMatchObject({ from: 2, to: 10, holdTo: 10 });
    });
});

describe("visualsLanes", () => {
    const band = cue({
        target: { kind: "band" },
        value: "builtin:facing.back",
    });
    const trumpets = cue({
        target: { kind: "section", section: " trumpet" },
        value: "builtin:facing.side1",
        beatId: beatOf(8),
    });
    const tuba = cue({
        target: { kind: "section", section: "Tuba" },
        value: "builtin:facing.side2",
    });
    const tag = cue({
        target: { kind: "tag", tagId: 7 },
        value: "builtin:facing.front",
        beatId: beatOf(10),
    });
    const otherChannel = cue({
        channel: "body",
        target: { kind: "section", section: "Trumpet" },
        value: "builtin:body.kneel",
    });
    const cues = [band, trumpets, tuba, tag, otherChannel];

    it("puts the focused who's cues on its lane, broader rows above and exceptions below", () => {
        const target = targetOfWho({ kind: "section", section: "Trumpet" }, []);
        const lanes = visualsLanes({
            cues,
            channel: "facing",
            target,
            focusIds: new Set([1, 2]),
            marchers,
            marcherIdsByTagId: byTag,
            counts,
        });
        expect(lanes.own.map((c) => c.id)).toEqual([trumpets.id]);
        // a state holds to the show's end with nothing after it on its row
        expect(lanes.own[0]!.holdTo).toBe(16);
        expect(lanes.broader.map((r) => r.key)).toEqual(["band"]);
        // the tag reaches trumpet 2; the tubas' cue reaches no trumpet
        expect(lanes.exceptions.map((r) => r.key)).toEqual(["tag:7"]);
    });

    it("gives the selection a set of exactly those marchers", () => {
        expect(targetOfWho({ kind: "selection" }, [3, 1])).toEqual({
            kind: "set",
            marcherIds: [1, 3],
        });
        expect(targetOfWho({ kind: "selection" }, [])).toBeNull();
        expect(targetKey({ kind: "set", marcherIds: [3, 1] })).toBe(
            targetKey({ kind: "set", marcherIds: [1, 3] }),
        );
    });

    it("reads the result from compile: where it came from, and mixed where the who differs", () => {
        const target = targetOfWho({ kind: "section", section: "Trumpet" }, []);
        const focusIds = new Set([1, 2]);
        const lanes = visualsLanes({
            cues,
            channel: "facing",
            target,
            focusIds,
            marchers,
            marcherIdsByTagId: byTag,
            counts,
        });
        const compiled = compileCues({
            beats: beats
                .filter((b) => b.duration > 0)
                .map((b) => ({ id: b.id, duration: b.duration })),
            marchers: marchers.map((m, i) => ({
                id: m.id,
                section: m.section,
                tagIds: [...byTag.entries()]
                    .filter(([, ids]) => ids.includes(m.id))
                    .map(([tagId]) => tagId),
                drillOrder: i,
                carries: m.section === "Color Guard" ? "flag" : "winds",
            })),
            cues,
        });
        const spans = resultRow({
            compiled,
            channel: "facing",
            focusIds,
            countCount: 16,
            lanes,
        });
        const at = (k: number) => spans.find((s) => s.from <= k && k < s.to)!;
        expect(at(0)).toMatchObject({ source: "default", mixed: false });
        expect(at(5)).toMatchObject({ source: "broader", mixed: false });
        expect(at(8)).toMatchObject({ source: "own", mixed: false });
        // trumpet 2 ramps into the tag's cue from 9 (Facing's two-count
        // transition into 10), and trumpet 1 doesn't
        expect(at(12)).toMatchObject({ mixed: true, label: null });
        expect(spans[spans.length - 1]!.to).toBe(16);

        // a flagged cue flags the counts it sets for the who (section 7.2)
        const flagged = resultRow({
            compiled,
            channel: "facing",
            focusIds,
            countCount: 16,
            lanes,
            flagged: new Set([trumpets.id]),
        });
        const flaggedAt = (k: number) =>
            flagged.find((s) => s.from <= k && k < s.to)!;
        expect(flaggedAt(8)).toMatchObject({ source: "own", flagged: true });
        expect(flaggedAt(0)).toMatchObject({ flagged: false });
        expect(flaggedAt(5)).toMatchObject({ flagged: false });
    });
});

describe("newCueValue", () => {
    it("adds a state that isn't the default, and a phrase only where the channel has one", () => {
        expect(newCueValue("facing", "state", ["winds"])).toBe(
            "builtin:facing.back",
        );
        expect(newCueValue("horn_equipment", "state", ["winds"])).toBe(
            "builtin:horn.down",
        );
        expect(newCueValue("facing", "phrase", ["winds"])).toBeNull();
        expect(newCueValue("horn_equipment", "phrase", ["flag"])).toBe(
            "builtin:flag.dropSpin",
        );
        // winds and guard together share no horn state
        expect(
            newCueValue("horn_equipment", "state", ["winds", "flag"]),
        ).toBeNull();
    });
});

describe("laneCreate (what a press on the lane adds, and draws while held)", () => {
    it("makes a drag a phrase of that length where the channel has one", () => {
        expect(laneCreate("horn_equipment", ["flag"], 6, 3)).toEqual({
            kind: "phrase",
            value: "builtin:flag.dropSpin",
            count: 3,
            length: 4,
        });
    });

    it("on a states-only channel, puts one state where the drag is let go", () => {
        // Facing, Feet and the winds' Horn have no phrases (performer-behavior.md 3)
        for (const [channel, carries] of [
            ["facing", ["winds"]],
            ["feet", ["winds"]],
            ["horn_equipment", ["winds"]],
        ] as const) {
            const made = laneCreate(channel, carries, 20, 27);
            expect(made, channel).toMatchObject({
                kind: "state",
                count: 27,
                length: 1,
            });
        }
    });

    it("makes a click on Feet mark time on holds, not the default Step", () => {
        expect(laneCreate("feet", ["winds", "flag"], 4, 4)).toEqual({
            kind: "state",
            value: "builtin:feet.step",
            settings: { onHolds: "markTime" },
            count: 4,
            length: 1,
        });
        // and its block says so
        expect(
            laneCue(
                cue({
                    target: { kind: "band" },
                    channel: "feet",
                    value: "builtin:feet.step",
                    settings: { onHolds: "markTime" },
                }),
                counts,
            )?.label,
        ).toBe("MT");
    });

    it("adds nothing where nothing fits everyone", () => {
        expect(
            laneCreate("horn_equipment", ["winds", "flag"], 2, 2),
        ).toBeNull();
    });
});

describe("copy and paste", () => {
    it("keeps the cues' spacing and settings, and drops what lands past the end", () => {
        const a = cue({
            target: { kind: "band" },
            value: "builtin:facing.back",
            beatId: beatOf(3),
            transitionLength: 2,
            notes: "first",
        });
        const b = cue({
            target: { kind: "band" },
            value: "builtin:facing.side1",
            beatId: beatOf(7),
            ripple: { span: 4, order: "drill" },
        });
        const clipboard = copyCues([b, a], [a.id, b.id], counts)!;
        expect(clipboard.channel).toBe("facing");
        expect(clipboard.cues.map((c) => c.offset)).toEqual([0, 4]);

        const target = { kind: "section", section: "Tuba" } as const;
        const pasted = pastedCues(clipboard, 10, target, counts);
        expect(pasted).toEqual([
            expect.objectContaining({
                target,
                beatId: beatOf(10),
                value: "builtin:facing.back",
                transitionLength: 2,
                notes: "first",
            }),
            expect.objectContaining({
                beatId: beatOf(14),
                ripple: { span: 4, order: "drill" },
            }),
        ]);
        // from count 13 the second would land on count 17, past the show
        expect(pastedCues(clipboard, 13, target, counts)).toHaveLength(1);
    });
});

describe("flagsByCue", () => {
    it("keeps the flags that reach a focused marcher", () => {
        const byCue = flagsByCue(
            [
                { kind: "clash", cueIds: [1, 2], marcherIds: [3] },
                { kind: "fits_nobody", cueIds: [2], marcherIds: [9] },
                { kind: "phrase_overlap", cueIds: [2], marcherIds: [3, 4] },
            ],
            new Set([3]),
        );
        expect(byCue.get(1)).toEqual(["clash"]);
        expect(byCue.get(2)).toEqual(["clash", "phrase_overlap"]);
    });
});

describe("countAtBeatIndex", () => {
    it("reads the zero-length start as count 0 and a beat as its count", () => {
        expect(countAtBeatIndex(beats, 0, counts)).toBe(0);
        expect(countAtBeatIndex(beats, 5, counts)).toBe(4);
        expect(countAtBeatIndex(beats, 99, counts)).toBe(15);
    });
});
