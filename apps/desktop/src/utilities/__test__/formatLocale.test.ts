import { describe, expect, it } from "vitest";
import { formatFixed, formatLocale } from "../formatLocale";

describe("formatLocale", () => {
    it("leaves English to the system's regional format", () => {
        expect(formatLocale("en")).toBeUndefined();
        expect(formatLocale("en-GB")).toBeUndefined();
    });

    it("uses any other app language", () => {
        expect(formatLocale("fr")).toBe("fr");
        expect(formatLocale("pt-BR")).toBe("pt-BR");
        expect(formatLocale("ja")).toBe("ja");
    });
});

describe("formatFixed", () => {
    it("writes the app language's decimal mark", () => {
        expect(formatFixed(1.5, 2, "fr")).toBe("1,50");
        expect(formatFixed(12345.678, 1, "pt-BR")).toBe("12345,7");
    });

    it("is toFixed in English, whatever the system's format", () => {
        expect(formatFixed(1.5, 2, "en")).toBe("1.50");
        expect(formatFixed(12345.678, 1, "en")).toBe("12345.7");
    });

    it("never writes negative zero", () => {
        expect(formatFixed(-0, 2, "fr")).toBe("0,00");
    });
});
