import { describe, expect, it } from "vitest";
import {
    deriveMarcherFromDrillLabel,
    resolveSectionForDrillPrefix,
} from "../drillLabel";

describe("resolveSectionForDrillPrefix", () => {
    it("maps standard OpenMarch prefixes", () => {
        expect(resolveSectionForDrillPrefix("T")).toBe("Trumpet");
        expect(resolveSectionForDrillPrefix("G")).toBe("Color Guard");
    });

    it("maps interchange-only prefixes via aliases", () => {
        expect(resolveSectionForDrillPrefix("TS")).toBe("Tenor Sax");
        expect(resolveSectionForDrillPrefix("BS")).toBe("Bass Drum");
    });
});

describe("deriveMarcherFromDrillLabel", () => {
    it("preserves the source dot number and section", () => {
        expect(deriveMarcherFromDrillLabel("T3")).toEqual({
            section: "Trumpet",
            drill_prefix: "T",
            drill_order: 3,
        });
    });

    it("maps TS labels to tenor sax, not trumpet", () => {
        expect(deriveMarcherFromDrillLabel("TS2")).toEqual({
            section: "Tenor Sax",
            drill_prefix: "TS",
            drill_order: 2,
        });
    });

    it("maps BS labels to bass drum, not baritone", () => {
        expect(deriveMarcherFromDrillLabel("BS1")).toEqual({
            section: "Bass Drum",
            drill_prefix: "BS",
            drill_order: 1,
        });
    });

    it("maps guard labels with two-digit orders", () => {
        expect(deriveMarcherFromDrillLabel("G10")).toEqual({
            section: "Color Guard",
            drill_prefix: "G",
            drill_order: 10,
        });
    });
});
