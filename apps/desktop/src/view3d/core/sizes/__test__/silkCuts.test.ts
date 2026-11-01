// @vitest-environment node
// cspell:words teardrop
import { describe, expect, it } from "vitest";
import { catalogDims, catalogEntries, silkDepthM } from "../catalog";
import {
    boxOutsideCut,
    distanceToPolygonEdge,
    insetPolygon,
    pointInPolygon,
} from "../cutGeometry";
import {
    SILK_CUTS,
    catalogSilkCutPath,
    curveCutPath,
    cutPathBounds,
    cutPathData,
    cutPathHeader,
    recommendedSilkSag,
    sampleCutPath,
    silkCutPath,
    silkCutShape,
    type CutPath,
} from "../silkCuts";
import { enterLength, fromMeters, toMeters } from "../units";

const EPS = 1e-9;
const silks = catalogEntries("silk");
const inches = (n: number) => toMeters(n, "in");

/** Every shape at its catalog size: defaults, alternatives, and sagged curves. */
const SHAPES = silks.flatMap((entry) => {
    const cut = SILK_CUTS[entry.id];
    const dims = catalogDims(entry);
    const out: { label: string; path: CutPath; depth: number }[] = [
        {
            label: entry.id,
            path: catalogSilkCutPath(entry),
            depth: silkDepthM(dims),
        },
    ];
    for (const alt of cut?.alternatives ?? []) {
        const path = catalogSilkCutPath(entry, { variant: alt.id });
        out.push({
            label: `${entry.id}:${alt.id}`,
            path,
            depth: cutPathBounds(path).maxY,
        });
    }
    if (cut?.family === "curve") {
        const sag = recommendedSilkSag(dims.header);
        out.push({
            label: `${entry.id}:sag`,
            path: catalogSilkCutPath(entry, { sag }),
            depth: silkDepthM({ ...dims, sag }),
        });
    }
    return out.map((s) => ({ ...s, entry, dims }));
});

describe("SILK_CUTS", () => {
    it("has exactly one Cut per catalog silk", () => {
        expect(Object.keys(SILK_CUTS).sort()).toEqual(
            silks.map((e) => e.id).sort(),
        );
    });

    it("marks the shapes read from a vendor photo (Q42)", () => {
        const fromPhoto = Object.values(SILK_CUTS)
            .filter((c) => c.fromVendorPhoto)
            .map((c) => c.catalogId)
            .sort();
        expect(fromPhoto).toEqual([
            "silk-arc-45x96",
            "silk-narrow-arc-44x94",
            "silk-super-arc-54x100",
            "silk-swing-44x66",
        ]);
    });

    it("gives the swing a flat bottom, with the sagging bottom only an alternative (Q41)", () => {
        const swing = SILK_CUTS["silk-swing-44x66"];
        expect(swing.family).toBe("swing");
        const path = catalogSilkCutPath(
            silks.find((e) => e.id === swing.catalogId)!,
        );
        expect(cutPathBounds(path).maxY).toBeCloseTo(inches(44), 12);
        expect(swing.alternatives?.map((a) => a.id)).toEqual([
            "sagging-bottom",
        ]);
        expect(swing.alternatives?.[0].aliases?.join(" ")).toMatch(/SA/);
        const sagging = silkCutPath(
            swing.catalogId,
            catalogDims(silks.find((e) => e.id === swing.catalogId)!),
            { variant: "sagging-bottom" },
        );
        expect(fromMeters(cutPathBounds(sagging).maxY, "in")).toBeCloseTo(
            57.5,
            1,
        );
        expect(silkCutShape(swing.catalogId, "nope")).toBeUndefined();
    });
});

describe("outlines", () => {
    it.each(SHAPES.map((s) => [s.label, s] as const))(
        "%s is closed by a straight pole edge",
        (_, { path, dims }) => {
            expect(path.segments.length).toBeGreaterThan(1);
            const last = path.segments[path.segments.length - 1].to;
            expect(last[0]).toBe(0);
            expect(last[1]).toBeCloseTo(dims.header.m, 12);
            expect(cutPathHeader(path)).toBeCloseTo(dims.header.m, 12);
            // Only the start and the end lie on the pole line, so the closing
            // segment (0, header) -> (0, 0) is the whole straight pole edge.
            const poly = sampleCutPath(path);
            expect(poly[0]).toEqual([0, 0]);
            expect(poly[poly.length - 1]).toEqual(last);
            for (const [x] of poly.slice(1, -1)) expect(x).toBeGreaterThan(0);
        },
    );

    it.each(SHAPES.map((s) => [s.label, s] as const))(
        "%s fits its header x fly x depth box",
        (_, { path, dims, depth }) => {
            const b = cutPathBounds(path);
            expect(b.minX).toBeGreaterThanOrEqual(-EPS);
            expect(b.minY).toBeGreaterThanOrEqual(-EPS);
            expect(b.maxX).toBeLessThanOrEqual(dims.fly.m + EPS);
            expect(b.maxY).toBeLessThanOrEqual(depth + EPS);
            // It fills the box: the widest point reaches the fly, the lowest
            // the depth.
            expect(b.maxX).toBeCloseTo(dims.fly.m, 9);
            expect(b.maxY).toBeCloseTo(depth, 9);
            expect(depth).toBeGreaterThanOrEqual(dims.header.m - EPS);
        },
    );

    it("lands each traced Cut on its catalog depth", () => {
        for (const entry of silks) {
            const b = cutPathBounds(catalogSilkCutPath(entry));
            expect(b.maxY, entry.id).toBeCloseTo(
                silkDepthM(catalogDims(entry)),
                9,
            );
        }
        const teardrop = cutPathBounds(
            catalogSilkCutPath(
                silks.find((e) => e.id === "silk-teardrop-44x74")!,
            ),
        );
        expect(fromMeters(teardrop.maxY, "in")).toBeCloseTo(79.625, 6);
    });

    it("agrees with a dense sampling on the bounds", () => {
        for (const { label, path } of SHAPES) {
            const poly = sampleCutPath(path, 2000);
            const b = cutPathBounds(path);
            expect(Math.max(...poly.map((p) => p[0])), label).toBeCloseTo(
                b.maxX,
                6,
            );
            expect(Math.max(...poly.map((p) => p[1])), label).toBeCloseTo(
                b.maxY,
                6,
            );
        }
    });

    it("stretches a traced Cut to a custom size", () => {
        const entry = silks.find((e) => e.id === "silk-teardrop-44x74")!;
        const dims = {
            header: enterLength("40 in")!,
            fly: enterLength("70 in")!,
        };
        const b = cutPathBounds(silkCutPath(entry.id, dims));
        expect(b.maxX).toBeCloseTo(inches(70), 12);
        expect(fromMeters(b.maxY, "in")).toBeCloseTo((79.625 * 40) / 44, 9);
        expect(() => silkCutPath("silk-nope", dims)).toThrow(/no silk Cut/);
    });
});

describe("sag (Q40)", () => {
    const six = silks.find((e) => e.id === "silk-6ft-36x54")!;

    it("defaults pole silks to a true rectangle", () => {
        for (const entry of silks.filter(
            (e) => SILK_CUTS[e.id].family === "curve",
        )) {
            expect(catalogDims(entry).sag, entry.id).toBeUndefined();
            const path = catalogSilkCutPath(entry);
            expect(path.segments.every((s) => s.type === "line")).toBe(true);
            expect(path.segments.map((s) => s.to)).toEqual([
                [catalogDims(entry).fly.m, 0],
                [catalogDims(entry).fly.m, catalogDims(entry).header.m],
                [0, catalogDims(entry).header.m],
            ]);
        }
        expect(cutPathData(curveCutPath(36, 54))).toBe(
            "M 0 0 L 54 0 L 54 36 L 0 36 Z",
        );
    });

    it("droops the top and bottom by the sag toward the fly", () => {
        expect(cutPathData(curveCutPath(36, 54, 9))).toBe(
            "M 0 0 C 18 0 36 3 54 9 L 54 45 C 36 39 18 36 0 36 Z",
        );
        const sag = enterLength("6 in")!;
        const path = catalogSilkCutPath(six, { sag });
        const b = cutPathBounds(path);
        expect(b.maxY).toBeCloseTo(inches(42), 12);
        // The top edge is the parabola y = sag (x / fly)^2.
        const poly = sampleCutPath(path, 4);
        expect(poly[2][0]).toBeCloseTo(inches(27), 12);
        expect(poly[2][1]).toBeCloseTo(inches(6) / 4, 12);
        // The dims' own sag applies when the options give none.
        const own = silkCutPath(six.id, { ...catalogDims(six), sag });
        expect(own).toEqual(path);
    });

    it("recommends a quarter of the header as a preset, not the default", () => {
        expect(recommendedSilkSag(enterLength("36 in")!)).toEqual(
            enterLength("9 in"),
        );
        expect(recommendedSilkSag({ m: 1 })).toEqual({ m: 0.25 });
    });
});

describe("cut geometry", () => {
    const teardrop = sampleCutPath(
        catalogSilkCutPath(silks.find((e) => e.id === "silk-teardrop-44x74")!),
    );

    it("tells inside from outside", () => {
        expect(pointInPolygon(teardrop, [inches(20), inches(20)])).toBe(true);
        expect(pointInPolygon(teardrop, [inches(5), inches(70)])).toBe(false);
        expect(pointInPolygon(teardrop, [inches(73), inches(2)])).toBe(false);
    });

    it("insets an outline by the safe area, dropping the narrow tip", () => {
        const inset = inches(1);
        const ring = insetPolygon(teardrop, inset);
        expect(ring.length).toBeGreaterThan(20);
        for (const p of ring) {
            expect(pointInPolygon(teardrop, p)).toBe(true);
            expect(distanceToPolygonEdge(teardrop, p)).toBeGreaterThanOrEqual(
                inset * (1 - 1e-6),
            );
        }
        expect(insetPolygon(teardrop, inches(200))).toEqual([]);
        expect(insetPolygon(teardrop, 0)).toEqual(teardrop);
    });

    it("flags a box that leaves the cut", () => {
        const box = (x: number, y: number, w: number, h: number) => ({
            x: inches(x),
            y: inches(y),
            width: inches(w),
            height: inches(h),
        });
        expect(boxOutsideCut(teardrop, box(5, 5, 20, 20))).toBe(false);
        // Crosses the bottom edge below the pole end.
        expect(boxOutsideCut(teardrop, box(2, 30, 20, 20))).toBe(true);
        // The whole trim: the corners are outside the teardrop.
        expect(boxOutsideCut(teardrop, box(0, 0, 74, 79.625))).toBe(true);
        // Touching the pole edge is still inside.
        expect(boxOutsideCut(teardrop, box(0, 10, 10, 10))).toBe(false);
    });
});
