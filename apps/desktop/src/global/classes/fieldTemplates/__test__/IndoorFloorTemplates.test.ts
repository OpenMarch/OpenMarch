// @vitest-environment node
import { describe, it, expect } from "vitest";
import { FieldProperties } from "@openmarch/core";
import GridFieldTemplates from "../GridFields";

const INCHES_PER_FOOT = 12;

const indoorTemplates = Object.entries(GridFieldTemplates).filter(([key]) =>
    key.startsWith("INDOOR_"),
);

function toFeet(pixels: number): number {
    return pixels / FieldProperties.PIXELS_PER_INCH / INCHES_PER_FOOT;
}

describe("Indoor floor templates", () => {
    it("offers every stock floor size in both step sizes", () => {
        const sizes = ["40x60", "45x90", "50x70", "50x80", "50x90", "55x80"];
        const expected = [...sizes, "60x90"].flatMap((size) => [
            `INDOOR_${size}_8to5`,
            `INDOOR_${size}_6to5`,
        ]);
        expect(indoorTemplates.map(([key]) => key).sort()).toEqual(
            expected.sort(),
        );
    });

    it.each(indoorTemplates)(
        "%s is as deep and wide as its name says",
        (key, template) => {
            const [, depth, width] = /^INDOOR_(\d+)x(\d+)_/.exec(key)!;
            expect(template.name).toContain(`${depth}x${width}`);
            expect(toFeet(template.height)).toBeCloseTo(Number(depth));
            expect(toFeet(template.width)).toBeCloseTo(Number(width));
            expect(template.isCustom).toBe(false);
        },
    );

    it.each(indoorTemplates)("%s uses its named step size", (key, template) => {
        expect(template.stepSizeInches).toBe(key.endsWith("_8to5") ? 24 : 30);
    });
});
