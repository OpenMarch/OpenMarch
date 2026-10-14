import { describe, expect, it } from "vitest";
import {
    enterLength,
    formatFeetInches,
    formatLength,
    formatMeters,
    fromMeters,
    lengthOf,
    parseLength,
    toMeters,
} from "../units";

describe("toMeters", () => {
    it("converts feet and inches exactly at 0.3048 m/ft", () => {
        expect(toMeters(1, "ft")).toBe(0.3048);
        expect(toMeters(1, "in")).toBe(0.0254);
        expect(toMeters(6, "ft")).toBe(1.8288);
        expect(toMeters(36, "in")).toBe(0.9144);
        expect(toMeters(90, "ft")).toBe(27.432);
    });

    it("gives the same bits for the same length in feet or inches", () => {
        // 4.5 * 0.3048 is 1.3716000000000002 in doubles
        expect(toMeters(4.5, "ft")).toBe(1.3716);
        expect(toMeters(4.5, "ft")).toBe(toMeters(54, "in"));
        expect(toMeters(5.5, "ft")).toBe(toMeters(66, "in"));
    });

    it("converts metric units", () => {
        expect(toMeters(183, "cm")).toBe(1.83);
        expect(toMeters(25, "mm")).toBe(0.025);
        expect(toMeters(1.5, "m")).toBe(1.5);
    });

    it("round-trips through fromMeters", () => {
        expect(fromMeters(toMeters(36, "in"), "in")).toBeCloseTo(36, 12);
        expect(fromMeters(toMeters(6, "ft"), "ft")).toBeCloseTo(6, 12);
        expect(fromMeters(1.83, "cm")).toBeCloseTo(183, 12);
    });
});

describe("parseLength", () => {
    const m = (text: string, opts = {}) => parseLength(text, opts)?.m;

    it.each([
        [`4'6"`, 54],
        [`4' 6"`, 54],
        [`4 ft 6 in`, 54],
        [`4ft6in`, 54],
        [`4'6`, 54],
        [`4.5 ft`, 54],
        [`4.5'`, 54],
        [`4.5 feet`, 54],
        [`54 in`, 54],
        [`54"`, 54],
        [`54 inches`, 54],
        [`54''`, 54],
        [`4′ 6″`, 54],
        [`6 ft`, 72],
        [`1 foot`, 12],
        [`36 1/2 in`, 36.5],
        [`36½"`, 36.5],
        [`4' 6 1/8"`, 54.125],
        [`4' 6⅛"`, 54.125],
        [`1/2 in`, 0.5],
        [`0.5"`, 0.5],
        [`.5 in`, 0.5],
        [`  4'   6"  `, 54],
        [`4 FT 6 IN`, 54],
    ])("parses %s as %d in", (text, inches) => {
        expect(m(text)).toBe(toMeters(inches, "in"));
    });

    it("parses metric lengths", () => {
        expect(m("1.83 m")).toBe(1.83);
        expect(m("1.83m")).toBe(1.83);
        expect(m("183 cm")).toBe(1.83);
        expect(m("25 mm")).toBe(0.025);
        expect(m("2 meters")).toBe(2);
        expect(m("2 metres")).toBe(2);
        expect(m("50 centimeters")).toBe(0.5);
    });

    it("reports the unit typed", () => {
        expect(parseLength(`4'6"`)?.unit).toBe("in");
        expect(parseLength(`6 ft`)?.unit).toBe("ft");
        expect(parseLength(`183 cm`)?.unit).toBe("cm");
    });

    it("keeps the typed text with spaces collapsed", () => {
        expect(parseLength(`  4'   6"  `)?.typed).toBe(`4' 6"`);
    });

    it("needs a default unit for a bare number", () => {
        expect(parseLength("36")).toBeNull();
        expect(m("36", { defaultUnit: "in" })).toBe(0.9144);
        expect(m("6", { defaultUnit: "ft" })).toBe(1.8288);
        expect(m("1.83", { defaultUnit: "m" })).toBe(1.83);
    });

    it.each([
        "",
        "   ",
        "abc",
        "-4 ft",
        "4 yards",
        "4 6",
        `6" 4'`,
        "1/0 in",
        "4 ft 6 in 2",
        "m",
        "ft",
    ])("rejects %j", (text) => {
        expect(parseLength(text, { defaultUnit: "in" })).toBeNull();
    });
});

describe("display", () => {
    it("rounds ft-in to the nearest eighth inch", () => {
        expect(formatFeetInches(toMeters(54, "in"))).toBe(`4' 6"`);
        expect(formatFeetInches(toMeters(54.125, "in"))).toBe(`4' 6 1/8"`);
        expect(formatFeetInches(toMeters(54.5, "in"))).toBe(`4' 6 1/2"`);
        expect(formatFeetInches(toMeters(54.06, "in"))).toBe(`4' 6"`);
        expect(formatFeetInches(toMeters(54.07, "in"))).toBe(`4' 6 1/8"`);
        expect(formatFeetInches(toMeters(11.99, "in"))).toBe(`1' 0"`);
        expect(formatFeetInches(toMeters(6, "ft"))).toBe(`6' 0"`);
        expect(formatFeetInches(toMeters(0.375, "in"))).toBe(`3/8"`);
        expect(formatFeetInches(toMeters(11.5, "in"))).toBe(`11 1/2"`);
        expect(formatFeetInches(0)).toBe(`0"`);
    });

    it("rounds meters to the nearest cm", () => {
        expect(formatMeters(1.8288)).toBe("1.83 m");
        expect(formatMeters(0.9144)).toBe("0.91 m");
        expect(formatMeters(27.432)).toBe("27.43 m");
        expect(formatMeters(0.004)).toBe("0.00 m");
    });

    it("rounds per the measurement system", () => {
        expect(formatLength(1.8288, "imperial")).toBe(`6' 0"`);
        expect(formatLength(1.8288, "metric")).toBe("1.83 m");
    });

    it("re-displays a length typed in feet or inches as typed", () => {
        for (const text of [`4.5 ft`, `54 in`, `4'6"`, `4' 6 1/8"`]) {
            const length = enterLength(text)!;
            expect(formatLength(length, "imperial")).toBe(text);
            expect(formatLength(length, "metric")).toBe(text);
        }
    });

    it("rounds a typed length once its meters change", () => {
        const length = { ...enterLength("4.5 ft")!, m: 1.4 };
        expect(formatLength(length, "imperial")).toBe(`4' 7 1/8"`);
    });

    it("rounds metric input per the setting", () => {
        const length = enterLength("1.234 m")!;
        expect(length).toEqual({ m: 1.234 });
        expect(formatLength(length, "metric")).toBe("1.23 m");
    });

    it("keeps a bare number's unit so it re-displays", () => {
        const length = enterLength("36", { defaultUnit: "in" })!;
        expect(length).toEqual({ m: 0.9144, typed: "36 in" });
        expect(formatLength(length, "metric")).toBe("36 in");
    });
});

describe("storage", () => {
    it("never rounds meters on write", () => {
        const length = enterLength(`4' 6 1/8"`)!;
        expect(length.m).toBe((54.125 * 254) / 10000);
        expect(enterLength("1.23456789 m")!.m).toBe(1.23456789);
    });

    it("is stable through repeated display and re-entry", () => {
        let length = lengthOf(36, "in");
        const first = length.m;
        for (let i = 0; i < 10; i++) {
            length = enterLength(formatLength(length.m, "imperial"))!;
        }
        expect(length.m).toBe(first);
    });

    it("re-enters every eighth inch up to 10 ft to the same meters", () => {
        for (let eighths = 0; eighths <= 960; eighths++) {
            const m = toMeters(eighths / 8, "in");
            expect(parseLength(formatFeetInches(m))!.m).toBe(m);
        }
    });
});
