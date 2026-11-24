// @vitest-environment node
import { describe, it, expect } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "../../FieldProperties.templates";
import GridFieldTemplates from "../GridFields";
import {
    INDOOR_FLOOR_SIZES,
    floorFitsImage,
    floorShapedLikeImage,
    floorSizeForImage,
    indoorFloorOf,
    indoorFloorTemplate,
} from "../indoorFloors";

const toFeet = (pixels: number) =>
    pixels / FieldProperties.PIXELS_PER_INCH / 12;

const size = (depthFeet: number, widthFeet: number) => ({
    depthFeet,
    widthFeet,
});

describe("indoorFloorTemplate and indoorFloorOf", () => {
    it.each(INDOOR_FLOOR_SIZES)(
        "round-trips $depthFeet x $widthFeet at both step sizes",
        (floor) => {
            for (const stepInches of [24, 30] as const) {
                const template = indoorFloorTemplate(floor, stepInches);
                expect(template.stepSizeInches).toBe(stepInches);
                expect(indoorFloorOf(template)).toEqual({
                    size: floor,
                    stepInches,
                });
            }
        },
    );

    it("is null for fields that aren't indoor floors", () => {
        expect(
            indoorFloorOf(
                FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
            ),
        ).toBeNull();
        expect(
            indoorFloorOf(FieldPropertiesTemplates.SOUNDSPORT_8to5),
        ).toBeNull();
    });
});

describe("custom indoor floors", () => {
    it("uses the stock template when there is one", () => {
        expect(indoorFloorTemplate(size(60, 90), 24)).toBe(
            GridFieldTemplates.INDOOR_60x90_8to5,
        );
    });

    it.each([
        { floor: size(48, 72), stepInches: 24 },
        { floor: size(50, 85), stepInches: 30 },
        { floor: size(60, 90), stepInches: 22.5 },
        { floor: size(52.5, 77), stepInches: 27 },
    ])(
        "builds a $floor.depthFeet x $floor.widthFeet floor at $stepInches in and reads it back",
        ({ floor, stepInches }) => {
            const template = indoorFloorTemplate(floor, stepInches);
            expect(template.isCustom).toBe(true);
            expect(template.stepSizeInches).toBe(stepInches);
            expect(toFeet(template.height)).toBeCloseTo(floor.depthFeet);
            expect(toFeet(template.width)).toBeCloseTo(floor.widthFeet);
            expect(indoorFloorOf(template)).toEqual({
                size: floor,
                stepInches,
            });
            // A copy, as the step size warning threshold makes, is still the same floor
            expect(
                indoorFloorOf(
                    new FieldProperties({
                        ...template,
                        stepSizeWarningThresholdInches: 40,
                    }),
                ),
            ).toEqual({ size: floor, stepInches });
        },
    );

    it("labels lines every 4 steps, so a 22.5-inch step puts them 7.5 ft apart", () => {
        const template = indoorFloorTemplate(size(60, 90), 22.5);
        const lines = template.xCheckpoints
            .filter((c) => c.visible)
            .map((c) => c.stepsFromCenterFront)
            .sort((a, b) => a - b);
        expect(lines).toContain(4);
        expect(lines).toContain(-4);
        expect(lines.every((steps) => steps % 4 === 0)).toBe(true);
    });

    it("isn't fooled by a custom field that only has an indoor floor's name", () => {
        const template = indoorFloorTemplate(size(48, 72), 24);
        expect(
            indoorFloorOf(
                new FieldProperties({ ...template, stepSizeInches: 30 }),
            ),
        ).toBeNull();
    });
});

describe("floorShapedLikeImage and floorFitsImage", () => {
    it("keeps the depth and makes the width the image's shape", () => {
        expect(floorShapedLikeImage(1200, 1000, size(60, 90))).toEqual(
            size(60, 72),
        );
        expect(floorFitsImage(1200, 1000, size(60, 72))).toBe(true);
        expect(floorFitsImage(1200, 1000, size(60, 90))).toBe(false);
    });

    it("gives up on a width the picker wouldn't take", () => {
        expect(floorShapedLikeImage(5000, 1000, size(60, 90))).toBeNull();
    });
});

describe("floorSizeForImage", () => {
    it("picks the floor with the image's shape", () => {
        expect(floorSizeForImage(1400, 1000)).toEqual(size(50, 70));
        expect(floorSizeForImage(1600, 1000)).toEqual(size(50, 80));
        expect(floorSizeForImage(1800, 1000)).toEqual(size(50, 90));
        expect(floorSizeForImage(2000, 1000)).toEqual(size(45, 90));
        // A floor maker's 1024 × 704 mockup is a 55 × 80 floor
        expect(floorSizeForImage(1024, 704)).toEqual(size(55, 80));
    });

    it("reads a portrait image turned on its side", () => {
        expect(floorSizeForImage(1000, 1600)).toEqual(size(50, 80));
    });

    it("gives 40 × 60 and 60 × 90, the same shape, to the one already picked, else the full-size floor", () => {
        expect(floorSizeForImage(1500, 1000)).toEqual(size(60, 90));
        expect(floorSizeForImage(1500, 1000, size(40, 60))).toEqual(
            size(40, 60),
        );
        expect(floorSizeForImage(1500, 1000, size(50, 80))).toEqual(
            size(60, 90),
        );
    });

    it("allows a little slack for cropping, but not a different floor", () => {
        expect(floorSizeForImage(1610, 1000)).toEqual(size(50, 80));
        // Square and very wide images match no floor
        expect(floorSizeForImage(1000, 1000)).toBeNull();
        expect(floorSizeForImage(3000, 1000)).toBeNull();
    });

    it("is null for an image with no size", () => {
        expect(floorSizeForImage(0, 100)).toBeNull();
    });
});
