import { SECTIONS } from "../Sections";
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
