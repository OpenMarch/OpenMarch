// @vitest-environment node
import { describe, expect, it } from "vitest";
import { catalogDims, catalogEntries, silkDepthM } from "../../sizes/catalog";
import { enterLength, toMeters } from "../../sizes/units";
import {
    CUT_FROM_SHAPE_CHART_NOTE,
    CUT_FROM_VENDOR_PHOTO_NOTE,
} from "../../sizes/silkCuts";
import { SILK_SHAPE_IDS, silkShape } from "../../sizes/silkShapes";
import {
    FIXED_BLEED,
    cutFamilyOf,
    silkShapeSurface,
    silkSurface,
} from "../surfaces";
import { SILK_SURFACES, templateSurface } from "./testSurfaces";

describe("silk surfaces", () => {
    it("has unique ids", () => {
        const ids = catalogEntries("silk").map((e) => silkSurface(e).id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("has a template for every silk Cut, fly wide and as tall as its depth", () => {
        for (const entry of catalogEntries("silk")) {
            const surface = templateSurface(entry.id);
            expect(surface, entry.id).toBeDefined();
            const dims = catalogDims(entry);
            expect(surface!.width.m).toBe(dims.fly.m);
            expect(surface!.height.m).toBe(silkDepthM(dims));
            expect(surface!.height).toEqual(dims.depth ?? dims.header);
            // The header is named separately only where the Cut hangs lower.
            expect(surface!.header?.m).toBe(
                dims.depth ? dims.header.m : undefined,
            );
            expect(surface!.orientation).toBe("poleLeft");
            expect(surface!.process).toBe("flag");
            expect(surface!.catalogId).toBe(entry.id);
        }
    });

    it("keeps a 36 x 54 in silk exact", () => {
        const silk = templateSurface("silk-6ft-36x54")!;
        expect(silk.width).toEqual({ m: toMeters(54, "in"), typed: "54 in" });
        expect(silk.height).toEqual({ m: toMeters(36, "in"), typed: "36 in" });
    });

    it("gives silks 150/300 DPI", () => {
        for (const s of SILK_SURFACES)
            expect(s.dpi).toEqual({ minimum: 150, recommended: 300 });
    });
});

describe("silk shapes (fork #973)", () => {
    it("has a template for every picker shape, its Cut at the shape's size", () => {
        for (const id of SILK_SHAPE_IDS) {
            const shape = silkShape(id);
            const s = silkShapeSurface(shape);
            expect(s.width.m, id).toBe(shape.fly.m);
            expect(s.catalogId, id).toBe(shape.entry.id);
            expect(s.cut === "rectangle", id).toBe(id === "rectangle");
        }
        // the chart's Standard is the curve family, sagged by a quarter header
        expect(silkShapeSurface(silkShape("standard")).id).toBe(
            "silk-standard-36x56-sag-9in",
        );
    });

    it("warns that the chart's shapes are traced and sized by estimate", () => {
        for (const id of ["curvedTail", "wings", "snake"] as const)
            expect(silkShapeSurface(silkShape(id)).notes, id).toContain(
                CUT_FROM_SHAPE_CHART_NOTE,
            );
        expect(silkShapeSurface(silkShape("arc")).notes).toContain(
            CUT_FROM_VENDOR_PHOTO_NOTE,
        );
        expect(silkShapeSurface(silkShape("rectangle")).notes).not.toContain(
            CUT_FROM_SHAPE_CHART_NOTE,
        );
    });
});

describe("bleed", () => {
    it("is 1/8 in for flags and 1/2 in for sublimation", () => {
        expect(FIXED_BLEED.flag!.m).toBe(toMeters(0.125, "in"));
        expect(FIXED_BLEED.sublimation!.m).toBe(toMeters(0.5, "in"));
        expect(FIXED_BLEED.floor).toBeUndefined();
        expect(FIXED_BLEED.prop).toBeUndefined();
    });
});

describe("cutFamilyOf", () => {
    it("masks every Cut but the pole silks, which are rectangles until sagged", () => {
        const families = Object.fromEntries(
            catalogEntries("silk").map((e) => [e.id, cutFamilyOf(e)]),
        );
        expect(families).toEqual({
            "silk-5ft-30x46": "rectangle",
            "silk-5.5ft-33x50": "rectangle",
            "silk-6ft-36x54": "rectangle",
            "silk-7ft-42x60": "rectangle",
            "silk-standard-36x56": "rectangle",
            "silk-oversized-42x67": "rectangle",
            "silk-teardrop-44x74": "teardrop",
            "silk-swing-44x66": "swing",
            "silk-super-swing-44x84": "superSwing",
            "silk-oversized-swing-56x84": "hangingSwing",
            "silk-arc-45x96": "arc",
            "silk-narrow-arc-44x94": "arc",
            "silk-super-arc-54x100": "arc",
            "silk-curved-tail-36x62": "curvedTail",
            "silk-rainbow-36x56": "rainbow",
            "silk-distressed-36x56": "distressed",
            "silk-rounded-36x54": "rounded",
            "silk-oversized-curved-angle-34x88": "curvedAngle",
            "silk-wings-72x36": "wings",
            "silk-snake-36x117": "snake",
        });
        const six = catalogEntries("silk").find(
            (e) => e.id === "silk-6ft-36x54",
        )!;
        expect(cutFamilyOf(six, { sag: enterLength("9 in")! })).toBe("curve");
        expect(cutFamilyOf(six, { sag: { m: 0 } })).toBe("rectangle");
    });

    it("reads the oversized swing as a 42 in header hanging to 84 in", () => {
        const s = templateSurface("silk-oversized-swing-56x84")!;
        expect(s.sleeve).toBeUndefined();
        expect(s.header?.m).toBe(toMeters(42, "in"));
        expect(s.width.m).toBe(toMeters(56, "in"));
        expect(s.height.m).toBe(toMeters(84, "in"));
    });

    it("makes a sagged pole silk template, deeper by the sag", () => {
        const six = catalogEntries("silk").find(
            (e) => e.id === "silk-6ft-36x54",
        )!;
        const s = silkSurface(six, { sag: enterLength("9 in")! });
        expect(s.id).toBe("silk-6ft-36x54-sag-9in");
        expect(s.cut).toBe("curve");
        expect(s.height).toEqual(enterLength("45 in"));
        expect(s.header).toEqual(catalogDims(six).header);
        expect(s.cutPath).toBeDefined();
    });

    it("makes the swing's sagging-bottom alternative on request only", () => {
        const swing = catalogEntries("silk").find(
            (e) => e.id === "silk-swing-44x66",
        )!;
        expect(
            templateSurface("silk-swing-44x66-sagging-bottom"),
        ).toBeUndefined();
        const s = silkSurface(swing, { variant: "sagging-bottom" });
        expect(s.id).toBe("silk-swing-44x66-sagging-bottom");
        expect(s.height.m).toBeGreaterThan(toMeters(57, "in"));
        expect(s.header?.m).toBe(toMeters(44, "in"));
    });
});
