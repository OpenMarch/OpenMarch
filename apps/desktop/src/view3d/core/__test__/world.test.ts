import { describe, it, expect } from "vitest";
import {
    fieldFootprint,
    pixelsToWorld,
    stepMeters,
    stepsToWorld,
    worldToPixels,
} from "@openmarch/core";
import FieldPropertiesTemplates from "../../../global/classes/FieldProperties.templates";

const T = FieldPropertiesTemplates;
const templates = {
    HS: T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
    college: T.COLLEGE_FOOTBALL_FIELD_WITH_END_ZONES,
    NFL: T.PRO_FOOTBALL_FIELD_WITH_END_ZONES,
    "NFL no end zones": T.PRO_FOOTBALL_FIELD_NO_END_ZONES,
    indoor: T.INDOOR_50x70_8to5,
    soundsport: T.SOUNDSPORT_8to5,
};

describe("world mapping with real templates", () => {
    for (const [name, fp] of Object.entries(templates)) {
        describe(name, () => {
            it("maps the front sideline center to the origin", () => {
                const w = pixelsToWorld(fp, {
                    x: fp.centerFrontPoint.xPixels,
                    y: fp.centerFrontPoint.yPixels,
                });
                expect(w.x).toBeCloseTo(0, 9);
                expect(w.z).toBeCloseTo(0, 9);
            });

            it("round-trips pixels and world", () => {
                const px = { x: 123.4, y: 56.7 };
                const back = worldToPixels(fp, pixelsToWorld(fp, px));
                expect(back.x).toBeCloseTo(px.x, 6);
                expect(back.y).toBeCloseTo(px.y, 6);
            });

            it("agrees between steps and pixels", () => {
                const a = stepsToWorld(fp, { xSteps: 8, ySteps: -4 });
                const b = pixelsToWorld(fp, {
                    x: fp.centerFrontPoint.xPixels + 8 * fp.pixelsPerStep,
                    y: fp.centerFrontPoint.yPixels - 4 * fp.pixelsPerStep,
                });
                expect(a.x).toBeCloseTo(b.x, 9);
                expect(a.z).toBeCloseTo(b.z, 9);
            });

            it("has a footprint that matches the field size and ends at z = 0", () => {
                const f = fieldFootprint(fp);
                const m = stepMeters(fp);
                expect(f.maxZ).toBe(0);
                expect(f.maxX - f.minX).toBeCloseTo(
                    (fp.width / fp.pixelsPerStep) * m,
                    6,
                );
                expect(f.maxZ - f.minZ).toBeCloseTo(
                    (fp.height / fp.pixelsPerStep) * m,
                    6,
                );
                const corner = pixelsToWorld(fp, { x: 0, y: 0 });
                expect(corner.x).toBeCloseTo(f.minX, 6);
                expect(corner.z).toBeCloseTo(f.minZ, 6);
            });
        });
    }

    it("has a football field with end zones footprint of x ±54.86, z -48.77..0", () => {
        for (const fp of [templates.HS, templates.college, templates.NFL]) {
            const f = fieldFootprint(fp);
            expect(f.minX).toBeCloseTo(-54.86, 2);
            expect(f.maxX).toBeCloseTo(54.86, 2);
            expect(f.minZ).toBeCloseTo(-48.77, 2);
            expect(f.maxZ).toBeCloseTo(0, 2);
        }
    });

    it("converts step size to meters", () => {
        expect(stepMeters(templates.HS)).toBeCloseTo(0.5715, 6);
    });
});
