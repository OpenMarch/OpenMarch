// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compileCues, type CueInput } from "@openmarch/core";
import { whyAt } from "../visualsWhy";

const beats = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    duration: 0.5,
}));
const marchers = [
    {
        id: 1,
        section: "Trumpet",
        tagIds: [] as number[],
        drillOrder: 0,
        carries: "winds" as const,
    },
    {
        id: 2,
        section: "Trumpet",
        tagIds: [7],
        drillOrder: 1,
        carries: "winds" as const,
    },
    {
        id: 3,
        section: "Trumpet",
        tagIds: [7],
        drillOrder: 2,
        carries: "winds" as const,
    },
];
const cue = (
    over: Partial<CueInput> &
        Pick<CueInput, "id" | "target" | "value" | "beatId">,
): CueInput => ({
    channel: "facing",
    kind: "state",
    phraseAssetId: null,
    length: null,
    transitionLength: 1,
    settings: {},
    ripple: null,
    ...over,
});
const cues = [
    cue({
        id: 10,
        target: { kind: "band" },
        value: "builtin:facing.back",
        beatId: 3,
    }),
    cue({
        id: 11,
        target: { kind: "section", section: "Trumpet" },
        value: "builtin:facing.side1",
        beatId: 5,
    }),
    cue({
        id: 12,
        target: { kind: "tag", tagId: 7 },
        value: "builtin:facing.side2",
        beatId: 5,
    }),
];
const compiled = compileCues({ beats, marchers, cues });

describe("whyAt", () => {
    it("names the default before any cue", () => {
        const [group] = whyAt({
            compiled,
            channel: "facing",
            focusIds: [1, 2, 3],
            count: 0,
        });
        expect(group).toMatchObject({ count: 3, trace: { winner: null } });
        expect(group!.trace.default).toBeDefined();
    });

    it("groups the who by value, most common first, with the winning and beaten cues", () => {
        const groups = whyAt({
            compiled,
            channel: "facing",
            focusIds: [1, 2, 3],
            count: 6,
        });
        expect(groups.map((g) => [g.count, g.trace.winner])).toEqual([
            [2, 12],
            [1, 11],
        ]);
        // the tag's cue beat the section's on the same count, and the band's before
        expect(groups[0]!.trace.beaten).toEqual(
            expect.arrayContaining([11, 10]),
        );
    });
});
