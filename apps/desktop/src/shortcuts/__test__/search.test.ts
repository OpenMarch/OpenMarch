import { describe, expect, it } from "vitest";
import { searchItems, searchScore } from "../search";

describe("searchScore", () => {
    it("requires every word, in any order", () => {
        expect(
            searchScore("move up", ["Move selected marcher(s) up"]),
        ).toBeDefined();
        expect(
            searchScore("up move", ["Move selected marcher(s) up"]),
        ).toBeDefined();
        expect(
            searchScore("move left", ["Move selected marcher(s) up"]),
        ).toBeUndefined();
    });

    it("matches words across fields", () => {
        expect(
            searchScore("print sheets", [
                "Export coordinate sheets",
                "File",
                "print",
                "pdf",
            ]),
        ).toBeDefined();
    });
});

describe("searchItems", () => {
    const items = ["Export video", "Play video", "Video export settings"];

    it("ranks prefix, then word start, then substring", () => {
        expect(
            searchItems(
                ["Export video", "Import portfolio", "Port settings"],
                "port",
                (i) => [i],
            ),
        ).toEqual(["Port settings", "Import portfolio", "Export video"]);
    });

    it("returns everything for an empty query", () => {
        expect(searchItems(items, "  ", (i) => [i])).toEqual(items);
    });
});
