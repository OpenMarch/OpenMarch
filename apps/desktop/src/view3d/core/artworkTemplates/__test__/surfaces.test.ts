import { describe, expect, it } from "vitest";
import { catalogDims, catalogEntries, silkDepthM } from "../../sizes/catalog";
import { enterLength, toMeters } from "../../sizes/units";
import {
    DPI_GUIDE,
    FIXED_BLEED,
    TEMPLATE_SURFACES,
    cutFamilyOf,
    floorPropSurface,
    propSurface,
    silkSurface,
    templateSurface,
    uniformPanelSurface,
    UNIFORM_WRAP_NOTE,
} from "../surfaces";

describe("TEMPLATE_SURFACES", () => {
    it("has unique ids", () => {
        const ids = TEMPLATE_SURFACES.map((s) => s.id);
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

    it("has a Base floor template for every catalog floor", () => {
        for (const entry of catalogEntries("floor")) {
            const surface = templateSurface(`base-${entry.id}`)!;
            const dims = catalogDims(entry);
            expect(surface.width.m).toBe(dims.width.m);
            expect(surface.height.m).toBe(dims.depth.m);
            expect(surface.orientation).toBe("audienceBottom");
            expect(surface.dpi).toEqual(DPI_GUIDE.floor);
        }
    });

    it("has front and back templates for every catalog flat prop", () => {
        for (const entry of catalogEntries("flatProp"))
            for (const face of ["front", "back"]) {
                const surface = templateSurface(`${entry.id}-${face}`)!;
                expect(surface.width.m).toBe(catalogDims(entry).width.m);
                expect(surface.height.m).toBe(catalogDims(entry).height.m);
                expect(surface.dpi).toEqual(DPI_GUIDE.standard);
            }
    });

    it("has uniform part panels with the wrap note", () => {
        for (const [part, side] of [
            ["top", "front"],
            ["top", "back"],
            ["bottoms", "front"],
            ["bottoms", "back"],
            ["overlay", "back"],
        ] as const) {
            const surface = uniformPanelSurface(part, side)!;
            expect(surface.process).toBe("sublimation");
            expect(surface.unit).toBe("mm");
            expect(surface.notes).toContain(UNIFORM_WRAP_NOTE);
            expect(TEMPLATE_SURFACES).toContainEqual(surface);
        }
        expect(uniformPanelSurface("overlay", "front")).toBeUndefined();
    });

    it("gives silks, props and uniforms 150/300 DPI and floors 30/60", () => {
        for (const s of TEMPLATE_SURFACES)
            expect(s.dpi).toEqual(
                s.kind === "baseFloor" || s.kind === "floorProp"
                    ? { minimum: 30, recommended: 60 }
                    : { minimum: 150, recommended: 300 },
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

describe("custom-size surfaces", () => {
    it("makes a Floor prop at any size, in the unit typed", () => {
        const s = floorPropSurface(
            enterLength("12 ft")!,
            enterLength("8'6\"")!,
        );
        expect(s.width.m).toBe(toMeters(12, "ft"));
        expect(s.height.m).toBe(toMeters(102, "in"));
        expect(s.unit).toBe("in");
        expect(s.dpi).toEqual(DPI_GUIDE.floor);
    });

    it("makes prop faces, metric when typed in meters", () => {
        const top = propSurface(
            "top",
            enterLength("1.2 m")!,
            enterLength("0.6 m")!,
        );
        expect(top.kind).toBe("propTop");
        expect(top.orientation).toBe("frontBottom");
        expect(top.unit).toBe("mm");
        expect(propSurface("front", top.width, top.height).orientation).toBe(
            "upTop",
        );
    });
});
