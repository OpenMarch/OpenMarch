// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dotModesPerCount } from "../dotModes";

describe("dotModesPerCount", () => {
    // Counts 0-5 on beats 10-15: page 1 is the move of beats 10-12, page 2 of 13-15
    const pages = [
        { id: 1, beats: [{ id: 10 }, { id: 11 }, { id: 12 }] },
        { id: 2, beats: [{ id: 13 }, { id: 14 }, { id: 15 }] },
    ];
    const countBeatIds = [10, 11, 12, 13, 14, 15];

    it("uses the show default where no set stores a mode", () => {
        expect(dotModesPerCount(pages, countBeatIds, [], "body")).toEqual(
            new Array(6).fill("body"),
        );
    });

    it("gives a set's mode to the counts of the move into it, then reverts", () => {
        expect(
            dotModesPerCount(
                pages,
                countBeatIds,
                [{ pageId: 1, dotMode: "body" }],
                "foot",
            ),
        ).toEqual(["body", "body", "body", "foot", "foot", "foot"]);
    });

    it("skips beats that aren't counts (no duration)", () => {
        expect(
            dotModesPerCount(
                [{ id: 1, beats: [{ id: 9 }, { id: 10 }] }],
                [10, 11],
                [{ pageId: 1, dotMode: "body" }],
                "foot",
            ),
        ).toEqual(["body", "foot"]);
    });
});
