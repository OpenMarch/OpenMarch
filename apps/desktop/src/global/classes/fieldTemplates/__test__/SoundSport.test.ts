import { describe, it, expect } from "vitest";
import { FieldProperties } from "@openmarch/core";
import SoundSportTemplates from "../SoundSport";

// The SoundSport performance area is 30 yards wide by 20 yards deep.
// 30 yards = 90 ft = 1080 in ; 20 yards = 60 ft = 720 in.
const EXPECTED_WIDTH_INCHES = 1080;
const EXPECTED_HEIGHT_INCHES = 720;

/** Convert a FieldProperties' pixel dimension back to real-world inches. */
function toInches(pixels: number): number {
    return pixels / FieldProperties.PIXELS_PER_INCH;
}

describe("SoundSport templates", () => {
    const templates = Object.values(SoundSportTemplates);

    it("exposes exactly the 8-to-5 and 6-to-5 variants", () => {
        expect(templates).toHaveLength(2);
        expect(templates.map((t) => t.name)).toEqual([
            "SoundSport (8 to 5 steps)",
            "SoundSport (6 to 5 steps)",
        ]);
    });

    it("marks every template as a non-custom preset", () => {
        for (const template of templates) {
            expect(template.isCustom).toBe(false);
        }
    });

    it("uses the correct step sizes", () => {
        expect(SoundSportTemplates.SOUNDSPORT_8to5.stepSizeInches).toBe(22.5);
        expect(SoundSportTemplates.SOUNDSPORT_6to5.stepSizeInches).toBe(30);
    });

    it.each(templates)(
        "$name describes the same 30x20 yard performance area",
        (template) => {
            expect(toInches(template.width)).toBeCloseTo(EXPECTED_WIDTH_INCHES);
            expect(toInches(template.height)).toBeCloseTo(
                EXPECTED_HEIGHT_INCHES,
            );
        },
    );

    it("produces identical physical dimensions regardless of step size", () => {
        const [eightToFive, sixToFive] = templates;
        expect(eightToFive.width).toBeCloseTo(sixToFive.width);
        expect(eightToFive.height).toBeCloseTo(sixToFive.height);
    });
});
