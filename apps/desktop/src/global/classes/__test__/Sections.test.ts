import { SECTIONS, FAMILIES } from "../Sections";
import { describe, expect, it } from "vitest";

describe("Section", () => {
    describe("compareTo", () => {
        it("should return a negative number if the scoreOrder of the first section is greater than the second section", () => {
            expect(SECTIONS.Snare.compareTo(SECTIONS.Trumpet)).toBeGreaterThan(
                0,
            );
            expect(
                SECTIONS.Trumpet.compareTo(SECTIONS.Piccolo),
            ).toBeGreaterThan(0);
            expect(SECTIONS.Tuba.compareTo(SECTIONS.Trumpet)).toBeGreaterThan(
                0,
            );
            // Even though DrumMajor is a higher scoreOrder than Marimba, the "Other" family is higher than "Pit"
            expect(
                SECTIONS.Marimba.compareTo(SECTIONS.DrumMajor),
            ).toBeGreaterThan(0);
        });
        it("should return a positive number if the scoreOrder of the first section is greater than the second section", () => {
            expect(SECTIONS.Flute.compareTo(SECTIONS.Trumpet)).toBeLessThan(0);
            expect(SECTIONS.Trumpet.compareTo(SECTIONS.Tuba)).toBeLessThan(0);
        });
        it("should return 0 if the scoreOrder of two sections is the same", () => {
            expect(SECTIONS.Trumpet.compareTo(SECTIONS.Trumpet)).toBe(0);
            expect(SECTIONS.AltoSax.compareTo(SECTIONS.AltoSax)).toBe(0);
        });
    });

    describe("toString", () => {
        it("should return the name of the section", () => {
            expect(SECTIONS.Tuba.toString()).toBe("Tuba");
            expect(SECTIONS.Flute.toString()).toBe("Flute");
        });
    });

    describe("family", () => {
        it("should return the family of the section", () => {
            expect(SECTIONS.Tuba.family.toString()).toBe("Brass");
            expect(SECTIONS.Flute.family.toString()).toBe("Woodwind");
        });
    });
});

describe("SectionFamily colors", () => {
    it("gives every family a valid rgba color", () => {
        for (const family of Object.values(FAMILIES)) {
            const { r, g, b, a } = family.color;
            for (const channel of [r, g, b]) {
                expect(channel).toBeGreaterThanOrEqual(0);
                expect(channel).toBeLessThanOrEqual(255);
            }
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThanOrEqual(1);
        }
    });

    it("assigns distinct colors across families", () => {
        const keys = Object.values(FAMILIES).map(
            (f) => `${f.color.r},${f.color.g},${f.color.b}`,
        );
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("exposes a section's family color through the section", () => {
        expect(SECTIONS.Trumpet.family.color).toEqual(FAMILIES.Brass.color);
    });
});
