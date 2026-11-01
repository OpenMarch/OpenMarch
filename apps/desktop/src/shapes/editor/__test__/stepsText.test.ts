// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatSteps, parseSteps } from "../format";

const close = (a: number | null, b: number) =>
    expect(Math.abs((a ?? NaN) - b)).toBeLessThan(1e-12);

describe("parseSteps", () => {
    it("reads whole numbers and decimals", () => {
        expect(parseSteps("2")).toBe(2);
        expect(parseSteps("2.5")).toBe(2.5);
        expect(parseSteps(".5")).toBe(0.5);
        expect(parseSteps("1.37")).toBe(1.37);
    });

    it("reads fraction glyphs, alone or after a whole number", () => {
        expect(parseSteps("2½")).toBe(2.5);
        expect(parseSteps("½")).toBe(0.5);
        close(parseSteps("1⅔"), 5 / 3);
        close(parseSteps("⅔"), 2 / 3);
        expect(parseSteps("2 ¾")).toBe(2.75);
    });

    it("reads mixed numbers with a space or a dash, and plain fractions", () => {
        close(parseSteps("1 2/3"), 5 / 3);
        close(parseSteps("1-2/3"), 5 / 3);
        expect(parseSteps("2 1/2")).toBe(2.5);
        close(parseSteps("5/3"), 5 / 3);
        close(parseSteps("16/6"), 8 / 3);
        expect(parseSteps("1/2")).toBe(0.5);
    });

    it("takes an optional step or steps after the number", () => {
        close(parseSteps("1⅔ steps"), 5 / 3);
        expect(parseSteps("2 step")).toBe(2);
        expect(parseSteps("4Steps")).toBe(4);
    });

    it("refuses 0, a zero denominator and junk", () => {
        for (const text of [
            "0",
            "0/3",
            "1/0",
            "abc",
            "",
            "steps",
            "2/",
            "1 2",
            "-2",
            "2½½",
        ])
            expect(parseSteps(text), text).toBeNull();
    });
});

describe("formatSteps", () => {
    it("shows whole and half steps as drill writers say them", () => {
        expect(formatSteps(3)).toBe("3");
        expect(formatSteps(2.5)).toBe("2½");
        expect(formatSteps(0.5)).toBe("½");
    });

    it("shows thirds and quarters as glyphs", () => {
        expect(formatSteps(5 / 3)).toBe("1⅔");
        expect(formatSteps(8 / 3)).toBe("2⅔");
        expect(formatSteps(1 / 3)).toBe("⅓");
        expect(formatSteps(2.75)).toBe("2¾");
        expect(formatSteps(1.25)).toBe("1¼");
    });

    it("shows anything else to two decimals", () => {
        expect(formatSteps(1.6)).toBe("1.6");
        expect(formatSteps(8 / 7)).toBe("1.14");
        expect(formatSteps(1.67)).toBe("1.67");
        expect(formatSteps(1.37)).toBe("1.37");
    });

    it("reads back what it shows", () => {
        for (const steps of [0.5, 2, 2.5, 5 / 3, 8 / 3, 2.75, 1.6])
            close(parseSteps(formatSteps(steps)), steps);
    });
});
