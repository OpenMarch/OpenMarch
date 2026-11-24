// @vitest-environment node
import { describe, it, expect } from "vitest";
import FieldPropertiesTemplates from "../../FieldProperties.templates";
import {
    INDOOR_FLOOR_SIZES,
    floorSizeForImage,
    indoorFloorOf,
    indoorFloorTemplate,
} from "../indoorFloors";

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
