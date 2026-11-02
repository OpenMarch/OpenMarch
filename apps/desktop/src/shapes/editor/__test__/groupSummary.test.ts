import { describe, expect, it } from "vitest";
import type { ToolGroup } from "../../tool/toolKind";
import { groupPlaces, groupSummary } from "../groupSummary";

/**
 * How the floating editor sums up two or more interval groups (owner feedback on #526): the
 * compact `numbers` summary, and each group's marchers as the group menu names them.
 */

const group = (
    count: number,
    interval: string,
    more: Partial<ToolGroup> = {},
): ToolGroup => ({
    count: String(count),
    interval,
    rest: false,
    grown: 0,
    dropped: count === 0,
    ...more,
});

describe("the groups summed up", () => {
    it("names each group count · interval, joined by +", () => {
        expect(groupSummary([group(2, "3"), group(4, "2")])).toBe("2·3 + 4·2");
    });

    it("calls the rest the rest, wherever it is", () => {
        expect(
            groupSummary([group(2, "3"), group(6, "4", { rest: true })]),
        ).toBe("2·3 + rest·4");
        expect(
            groupSummary([group(5, "2½", { rest: true }), group(3, "4")]),
        ).toBe("rest·2½ + 3·4");
    });

    it("ends with … past three groups", () => {
        const four = [
            group(2, "3"),
            group(2, "2"),
            group(2, "4"),
            group(2, "1"),
        ];
        expect(groupSummary(four)).toBe("2·3 + 2·2 + 2·4 + …");
        expect(groupSummary(four, 4)).toBe("2·3 + 2·2 + 2·4 + 2·1");
    });

    it("leaves out a group dropped off the end", () => {
        expect(
            groupSummary([group(4, "3"), group(4, "2"), group(0, "4")]),
        ).toBe("4·3 + 4·2");
    });
});

describe("each group's marchers", () => {
    it("names them by where they stand along the shape, not by drill number", () => {
        expect(
            groupPlaces([
                group(2, "3"),
                group(1, "2"),
                group(3, "4"),
                group(5, "4", { rest: true }),
            ]),
        ).toEqual(["First 2", "Next 1", "Next 3", "Last 5"]);
    });

    it("calls the group at the end the last, counted or the rest", () => {
        expect(
            groupPlaces([group(2, "3"), group(6, "2", { grown: 2 })]),
        ).toEqual(["First 2", "Last 6"]);
        expect(
            groupPlaces([
                group(2, "3"),
                group(3, "2", { rest: true }),
                group(3, "4"),
            ]),
        ).toEqual(["First 2", "Next 3", "Last 3"]);
    });

    it("skips a group dropped off the end when finding the last", () => {
        expect(
            groupPlaces([group(4, "3"), group(4, "2"), group(0, "4")]),
        ).toEqual(["First 4", "Last 4", "No marchers left"]);
        expect(groupPlaces([group(8, "3"), group(0, "2")])).toEqual([
            "All 8",
            "No marchers left",
        ]);
    });
});
