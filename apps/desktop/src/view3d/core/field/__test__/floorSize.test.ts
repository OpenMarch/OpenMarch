// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FieldProperties, fieldFootprint } from "@openmarch/core";
import FieldPropertiesTemplates from "../../../../global/classes/FieldProperties.templates";
import { fieldFloorSize, floorSizeForImage } from "../floorSize";
import { planImage } from "../imagePlan";

const gym = FieldPropertiesTemplates.INDOOR_50x80_8to5;

const extent = (fp: FieldProperties) => {
    const f = fieldFootprint(fp);
    return { width: f.maxX - f.minX, depth: f.maxZ - f.minZ };
};

describe("floorSizeForImage (D-23 convert on open)", () => {
    it("fits the image inside the field and keeps its shape", () => {
        const footprint = extent(gym);
        // A square image on a wide floor: as tall as the field, narrower than it
        const size = floorSizeForImage(gym, { width: 1000, height: 1000 });
        expect(size.heightM).toBeCloseTo(footprint.depth, 6);
        expect(size.widthM).toBeCloseTo(size.heightM, 6);
        expect(size.widthM).toBeLessThan(footprint.width);
    });

    it("covers the field when the image fills it", () => {
        const fill = new FieldProperties({ ...gym, imageFillOrFit: "fill" });
        const footprint = extent(fill);
        const size = floorSizeForImage(fill, { width: 1000, height: 1000 });
        expect(size.widthM).toBeCloseTo(footprint.width, 6);
        expect(size.heightM).toBeCloseTo(size.widthM, 6);
        expect(size.heightM).toBeGreaterThan(footprint.depth);
    });

    it("matches the field exactly for an image of the field's shape", () => {
        const footprint = extent(gym);
        const size = floorSizeForImage(gym, {
            width: gym.width,
            height: gym.height,
        });
        expect(size.widthM).toBeCloseTo(footprint.width, 6);
        expect(size.heightM).toBeCloseTo(footprint.depth, 6);
    });
});

describe("fieldFloorSize (Upload floor…)", () => {
    it("is the field's own size", () => {
        const footprint = extent(gym);
        expect(fieldFloorSize(gym)).toEqual({
            widthM: footprint.width,
            heightM: footprint.depth,
        });
    });
});

describe("planImage with a floor's physical size (D-23)", () => {
    it("lands a floor sized from its placement exactly where the image was", () => {
        const image = { width: 1000, height: 1000 };
        const placed = planImage({ fieldProperties: gym }, image, 1);
        const size = floorSizeForImage(gym, image);
        const floor = planImage(
            { fieldProperties: gym },
            { ...image, sizeM: size },
            1,
        );
        expect(floor.minX).toBeCloseTo(placed.minX, 6);
        expect(floor.maxX).toBeCloseTo(placed.maxX, 6);
        expect(floor.minZ).toBeCloseTo(placed.minZ, 6);
        expect(floor.maxZ).toBeCloseTo(placed.maxZ, 6);
    });

    it("draws a smaller floor at its size, centered, not stretched over the field", () => {
        const floor = planImage(
            { fieldProperties: gym },
            { width: 4000, height: 3000, sizeM: { widthM: 8, heightM: 6 } },
            1,
        );
        expect(floor.maxX - floor.minX).toBeCloseTo(8, 6);
        expect(floor.maxZ - floor.minZ).toBeCloseTo(6, 6);
        const f = fieldFootprint(gym);
        expect((floor.minX + floor.maxX) / 2).toBeCloseTo(
            (f.minX + f.maxX) / 2,
            6,
        );
        expect((floor.minZ + floor.maxZ) / 2).toBeCloseTo(
            (f.minZ + f.maxZ) / 2,
            6,
        );
    });
});
