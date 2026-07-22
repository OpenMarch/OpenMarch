import { describe, expect, it } from "vitest";
import { generatePageNames, getLastPageNumber } from "../PageNaming";

describe("generatePageNames", () => {
    it("returns the offset for empty input", () => {
        expect(generatePageNames([])).toEqual(["0"]);
        expect(generatePageNames([], 5)).toEqual(["5"]);
    });

    it("generates sequential page names", () => {
        expect(generatePageNames([false, false, false, false])).toEqual([
            "0",
            "1",
            "2",
            "3",
        ]);
    });

    it("generates subset page names", () => {
        expect(
            generatePageNames([false, false, true, false, true, true]),
        ).toEqual(["0", "1", "1A", "2", "2A", "2B"]);
    });

    it("generates multi-letter subset names", () => {
        expect(
            generatePageNames(Array.from({ length: 29 }, () => true)),
        ).toEqual([
            "0",
            "0A",
            "0B",
            "0C",
            "0D",
            "0E",
            "0F",
            "0G",
            "0H",
            "0I",
            "0J",
            "0K",
            "0L",
            "0M",
            "0N",
            "0O",
            "0P",
            "0Q",
            "0R",
            "0S",
            "0T",
            "0U",
            "0V",
            "0W",
            "0X",
            "0Y",
            "0Z",
            "0AA",
            "0AB",
        ]);
    });

    it("applies page number offsets", () => {
        expect(generatePageNames([false, false, true, false], 8)).toEqual([
            "8",
            "9",
            "9A",
            "10",
        ]);
    });

    it("ignores the first subset flag", () => {
        expect(generatePageNames([true, false, false], 20)).toEqual([
            "20",
            "21",
            "22",
        ]);
    });
});

describe("getLastPageNumber", () => {
    it("returns the offset for empty input", () => {
        expect(getLastPageNumber([])).toBe(0);
        expect(getLastPageNumber([], 5)).toBe(5);
    });

    it("returns the last numeric page number", () => {
        expect(getLastPageNumber([false, false, false, false])).toBe(3);
        expect(getLastPageNumber([false, false, true, true])).toBe(1);
        expect(getLastPageNumber([false, false, true, true], 10)).toBe(11);
    });
});
