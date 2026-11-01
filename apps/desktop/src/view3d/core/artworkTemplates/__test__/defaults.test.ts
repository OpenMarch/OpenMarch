// @vitest-environment node
// cspell:words teardrop demoulin styleplus ihdr plte idat
import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { lengthOf, toMeters } from "../../sizes/units";
import { catalogEntries } from "../../sizes/catalog";
import { distanceToPolygonEdge, pointInPolygon } from "../../sizes/cutGeometry";
import { catalogSilkCutPath, sampleCutPath } from "../../sizes/silkCuts";
import {
    artworkTemplateFiles,
    DEFAULT_TEMPLATE_POLICY,
    DPI_GUIDE,
    FLOOR_PNG_MAX_PX,
    FLOOR_PRINT_MASTER_NOTE,
    floorPropSurface,
    OUTLINE_SAMPLES_PER_CURVE,
    sleeveGuide,
    TEMPLATE_COLORS,
    layoutTemplate,
    pngSize,
    propSurface,
    resolveTemplate,
    TEMPLATE_SURFACES,
    templateInfoLines,
    templatePng,
    templatePngDpi,
    templateSurface,
    type TemplateSurface,
} from "..";

const deflate = (data: Uint8Array) => deflateSync(data);
const resolved = (s: TemplateSurface) =>
    resolveTemplate(s, DEFAULT_TEMPLATE_POLICY);
const drawingOf = (s: TemplateSurface) => layoutTemplate(resolved(s));
const inches = (n: number) => toMeters(n, "in");

const floorProp = floorPropSurface(lengthOf(12, "ft"), lengthOf(8, "ft"));
const propTop = propSurface("top", lengthOf(48, "in"), lengthOf(24, "in"));
const propFront = propSurface("front", lengthOf(1.2, "m"), lengthOf(2.4, "m"));
const ALL = [...TEMPLATE_SURFACES, floorProp, propTop, propFront];

const byProcess = (process: TemplateSurface["process"]) =>
    ALL.filter((s) => s.process === process);

/** An indexed PNG's pixels as RGB (the writer's 8-bit palette format). */
function decodePalettePng(png: Uint8Array) {
    const buf = Buffer.from(png);
    const chunks: Record<string, Buffer[]> = {};
    for (let at = 8; at < buf.length; ) {
        const len = buf.readUInt32BE(at);
        const type = buf.toString("latin1", at + 4, at + 8);
        (chunks[type] ??= []).push(buf.subarray(at + 8, at + 8 + len));
        at += 12 + len;
    }
    const width = chunks.IHDR[0].readUInt32BE(0);
    const plte = chunks.PLTE[0];
    const raw = inflateSync(Buffer.concat(chunks.IDAT));
    return {
        pixel: (x: number, y: number) => {
            const i = raw[y * (width + 1) + 1 + x];
            return [...plte.subarray(i * 3, i * 3 + 3)];
        },
    };
}

/** The `tEXt` chunks of a PNG, as keyword to text. */
function pngText(png: Uint8Array): Record<string, string> {
    const buf = Buffer.from(png);
    const out: Record<string, string> = {};
    for (let at = 8; at < buf.length; ) {
        const length = buf.readUInt32BE(at);
        const type = buf.toString("latin1", at + 4, at + 8);
        if (type === "tEXt") {
            const data = buf.toString("latin1", at + 8, at + 8 + length);
            const nul = data.indexOf("\0");
            out[data.slice(0, nul)] = data.slice(nul + 1);
        }
        at += 12 + length;
    }
    return out;
}

describe("DEFAULT_TEMPLATE_POLICY (owner, 2026-10-11)", () => {
    it("resolves every surface", () => {
        for (const s of ALL) expect(() => resolved(s), s.id).not.toThrow();
    });

    it("shrinks the safe area of a small item to a quarter of its shorter side, with a note (Q38)", () => {
        const tiny = propSurface(
            "front",
            lengthOf(3, "in"),
            lengthOf(1.5, "in"),
        );
        const t = resolved(tiny);
        const q = inches(1.5) / 4;
        expect(t.safeM).toEqual({ top: q, right: q, bottom: q, left: q });
        expect(t.safeShrunk).toBe(true);
        expect(templateInfoLines(t)).toContain(
            'Safe area reduced to 3/8" from the trim for this small size.',
        );
        const mm = resolved(
            propSurface("top", lengthOf(40, "mm"), lengthOf(30, "mm")),
        );
        expect(mm.safeM.top).toBeCloseTo(0.0075, 12);
        expect(templateInfoLines(mm)).toContain(
            "Safe area reduced to 7.5 mm from the trim for this small size.",
        );
        // Normal sizes are unchanged and carry no note.
        for (const s of ALL) {
            expect(resolved(s).safeShrunk, s.id).toBeUndefined();
            expect(templateInfoLines(resolved(s)).join(" ")).not.toContain(
                "reduced",
            );
        }
        expect(() => drawingOf(tiny)).not.toThrow();
    });

    it("puts the safe area 1 in inside the trim on silks, props and uniform panels (Q29)", () => {
        const standard = ALL.filter((s) => s.process !== "floor");
        expect(standard.some((s) => s.kind === "silk")).toBe(true);
        expect(standard.some((s) => s.kind === "propTop")).toBe(true);
        expect(standard.some((s) => s.kind === "uniformFront")).toBe(true);
        for (const s of standard)
            expect(resolved(s).safeM, s.id).toEqual({
                top: inches(1),
                right: inches(1),
                bottom: inches(1),
                left: inches(1),
            });
    });

    it("puts the safe area 6 in inside the trim on floors and Floor props (Q29)", () => {
        const floors = byProcess("floor");
        expect(floors.map((s) => s.kind)).toContain("baseFloor");
        expect(floors.map((s) => s.kind)).toContain("floorProp");
        for (const s of floors)
            expect(resolved(s).safeM, s.id).toEqual({
                top: inches(6),
                right: inches(6),
                bottom: inches(6),
                left: inches(6),
            });
    });

    it("bleeds 2 in on floors, 1/2 in on props, and keeps the spec's flag and sublimation bleed (Q30)", () => {
        const expected = {
            floor: inches(2),
            prop: inches(0.5),
            flag: inches(0.125),
            sublimation: inches(0.5),
        };
        for (const s of ALL)
            expect(resolved(s).bleedM, s.id).toBe(expected[s.process]);
        expect(byProcess("prop").length).toBeGreaterThan(0);
    });

    it("draws every shaped Cut's own outline as its mask (Q42)", () => {
        const masked = ALL.filter((s) => s.cut !== "rectangle");
        expect(new Set(masked.map((s) => s.cut))).toEqual(
            new Set(["arc", "teardrop", "swing", "superSwing", "hangingSwing"]),
        );
        for (const s of masked) {
            const t = resolved(s);
            const entry = catalogEntries("silk").find(
                (e) => e.id === s.catalogId,
            )!;
            const expected = sampleCutPath(
                catalogSilkCutPath(entry),
                OUTLINE_SAMPLES_PER_CURVE,
            );
            expect(t.outlineM, s.id).toEqual(expected);
            const mask = drawingOf(s).shapes.find(
                (shape) => shape.type === "area" && shape.fill === "mask",
            );
            expect(mask, s.id).toBeDefined();
        }
        for (const s of ALL.filter((s) => s.cut === "rectangle"))
            expect(resolved(s).outlineM, s.id).toBeUndefined();
    });

    it("clips to the cut: the mask covers the trim outside the outline only", () => {
        for (const s of ALL.filter((s) => s.cut !== "rectangle")) {
            const d = drawingOf(s);
            const t = resolved(s);
            const mask = d.shapes.find(
                (shape) => shape.type === "area" && shape.fill === "mask",
            );
            if (mask?.type !== "area") throw new Error(s.id);
            // Trim plus outline, filled even-odd: masked means inside the
            // trim and outside the cut.
            const masked = (p: readonly [number, number]) =>
                mask.rings.filter((ring) => pointInPolygon(ring, p)).length %
                    2 ===
                1;
            const outline = t.outlineM!;
            const b = d.bleedM;
            let inside = 0;
            let outside = 0;
            const n = 40;
            for (let i = 0; i < n; i++)
                for (let j = 0; j < n; j++) {
                    const p: [number, number] = [
                        ((i + 0.5) / n) * t.trimM.width,
                        ((j + 0.5) / n) * t.trimM.height,
                    ];
                    const inCut = pointInPolygon(outline, p);
                    expect(masked([p[0] + b, p[1] + b]), `${s.id} ${p}`).toBe(
                        !inCut,
                    );
                    if (inCut) inside++;
                    else outside++;
                }
            expect(inside, s.id).toBeGreaterThan(0);
            expect(outside, s.id).toBeGreaterThan(0);
        }
    });

    it("paints the mask outside the teardrop and paper inside it", () => {
        const s = templateSurface("silk-teardrop-44x74")!;
        const png = decodePalettePng(
            templatePng(drawingOf(s), { dpi: 8, deflate }),
        );
        const px = (xIn: number, yIn: number) =>
            png.pixel(
                Math.round((xIn + 0.125) * 8),
                Math.round((yIn + 0.125) * 8),
            );
        // Below the pole end, near the pole: outside the cut.
        expect(px(4, 75)).toEqual([...TEMPLATE_COLORS.mask]);
        // Top right corner: outside the cut.
        expect(px(73, 1)).toEqual([...TEMPLATE_COLORS.mask]);
        // Well inside, clear of lines and text.
        expect(px(55, 35)).toEqual([...TEMPLATE_COLORS.paper]);
    });

    it("draws the safe area inside the cut on shaped Cuts", () => {
        for (const s of ALL.filter((s) => s.cut !== "rectangle")) {
            const t = resolved(s);
            expect(t.safeRingM, s.id).toBeDefined();
            for (const p of t.safeRingM!) {
                expect(pointInPolygon(t.outlineM!, p), s.id).toBe(true);
                expect(
                    distanceToPolygonEdge(t.outlineM!, p),
                    s.id,
                ).toBeGreaterThanOrEqual(inches(1) * (1 - 1e-6));
            }
            expect(templateInfoLines(t), s.id).toContain(
                'Keep important content inside the dashed safe area, 1" inside the cut.',
            );
        }
    });

    it("says which shapes come from a vendor photo (Q42)", () => {
        const fromPhoto = [
            "silk-swing-44x66",
            "silk-arc-45x96",
            "silk-narrow-arc-44x94",
            "silk-super-arc-54x100",
        ];
        for (const s of ALL.filter((s) => s.kind === "silk")) {
            const text = templateInfoLines(resolved(s)).join(" ");
            if (fromPhoto.includes(s.id))
                expect(text, s.id).toContain("Shape from vendor photo");
            else expect(text, s.id).not.toContain("vendor photo");
        }
    });

    it("keeps vendor names off templates (Q44)", () => {
        for (const s of ALL.filter((s) => s.kind === "silk"))
            for (const shape of drawingOf(s).shapes)
                if (shape.type === "text")
                    expect(shape.text, s.id).not.toMatch(
                        /miller|demoulin|band shoppe|field & floor|mccormick|drill company|styleplus|fjm/i,
                    );
    });

    it("marks the pole sleeve with a dashed guide 3 in from the pole edge (Q43)", () => {
        for (const s of ALL) {
            const d = drawingOf(s);
            const guides = d.shapes.filter(
                (shape) => shape.type === "line" && shape.stroke === "guide",
            );
            if (s.kind !== "silk") {
                expect(guides, s.id).toHaveLength(0);
                continue;
            }
            expect(guides, s.id).toHaveLength(1);
            const g = guides[0];
            if (g.type !== "line") throw new Error(s.id);
            expect(g.dashM, s.id).toBeGreaterThan(0);
            const [[x0, y0], [x1, y1]] = g.points;
            const b = d.bleedM;
            expect(x0 - b).toBeCloseTo(inches(3), 12);
            expect(x1 - b).toBeCloseTo(inches(3), 12);
            const header = s.header?.m ?? s.height.m;
            expect(y0 - b, s.id).toBeGreaterThanOrEqual(-1e-9);
            expect(y0 - b, s.id).toBeLessThan(inches(1));
            // Down the header, or to where the cut's edge crosses first.
            expect(y1 - b, s.id).toBeLessThanOrEqual(header + 1e-9);
            expect(y1 - b, s.id).toBeGreaterThan(header - inches(0.5));
            expect(templateInfoLines(resolved(s)).join(" ")).toContain(
                "hidden on the pole",
            );
        }
        expect(
            sleeveGuide(
                resolved(templateSurface("silk-6ft-36x54")!),
                inches(36),
            ),
        ).toEqual([
            [inches(3), 0],
            [inches(3), inches(36)],
        ]);
    });

    it("puts a hanging Cut's pole marker halfway down its header", () => {
        const s = templateSurface("silk-oversized-swing-56x84")!;
        const d = drawingOf(s);
        const tri = d.shapes.find(
            (shape) => shape.type === "area" && shape.fill === "marker",
        );
        if (tri?.type !== "area") throw new Error("no marker");
        expect(tri.rings[0][0][1] - d.bleedM).toBeCloseTo(inches(21), 12);
        expect(templateInfoLines(resolved(s))).toContain(
            "Trim: 56 in fly x 84 in deep, 42 in header",
        );
    });

    it("names the safe-area inset in the template", () => {
        const silk = templateInfoLines(
            resolved(templateSurface("silk-6ft-36x54")!),
        );
        expect(silk).toContain(
            'Keep important content inside the dashed safe area, 1" from the trim.',
        );
        const floor = templateInfoLines(
            resolved(templateSurface("base-floor-wgi-minimum-60x90ft")!),
        );
        expect(floor).toContain(
            'Keep important content inside the dashed safe area, 6" from the trim.',
        );
        const top = templateInfoLines(
            resolved(templateSurface("uniform-top-front")!),
        );
        expect(top).toContain(
            "Keep important content inside the dashed safe area, 25.4 mm from the trim.",
        );
    });
});

describe("templatePngDpi (Q31)", () => {
    it("writes silks, props and uniform panels at their minimum print DPI", () => {
        for (const s of ALL.filter((s) => s.process !== "floor"))
            expect(templatePngDpi(drawingOf(s)), s.id).toBe(s.dpi.minimum);
    });

    it("caps floors at 8192 px on the long edge", () => {
        const floors = byProcess("floor");
        for (const s of floors) {
            const d = drawingOf(s);
            const dpi = templatePngDpi(d);
            const size = pngSize(d, dpi);
            expect(dpi, s.id).toBeLessThanOrEqual(s.dpi.minimum);
            expect(Math.max(size.width, size.height), s.id).toBeLessThanOrEqual(
                FLOOR_PNG_MAX_PX,
            );
        }
        // 90 ft + 2 x 2 in bleed = 1084 in on the long edge.
        const wgi = drawingOf(
            templateSurface("base-floor-wgi-minimum-60x90ft")!,
        );
        expect(templatePngDpi(wgi)).toBeCloseTo(FLOOR_PNG_MAX_PX / 1084, 9);
        expect(pngSize(wgi, templatePngDpi(wgi)).width).toBe(FLOOR_PNG_MAX_PX);
    });

    it("keeps a small floor prop at its minimum DPI", () => {
        // 12 ft + 4 in = 148 in at 30 DPI = 4440 px, under the cap.
        expect(templatePngDpi(drawingOf(floorProp))).toBe(30);
    });

    it("says on every floor template that the PDF or SVG is the print master", () => {
        for (const s of byProcess("floor")) {
            expect(s.notes, s.id).toContain(FLOOR_PRINT_MASTER_NOTE);
            const lines = templateInfoLines(resolved(s)).join(" ");
            expect(lines, s.id).toContain("print master");
        }
        for (const s of ALL.filter((s) => s.process !== "floor"))
            expect(s.notes, s.id).not.toContain(FLOOR_PRINT_MASTER_NOTE);
    });

    it("writes the print-master note into a floor PNG's metadata", () => {
        const [, , floorPng] = artworkTemplateFiles(floorProp, {
            deflate,
            pngDpi: 1,
        });
        expect(pngText(floorPng.data as Uint8Array)).toEqual({
            Comment: FLOOR_PRINT_MASTER_NOTE,
        });
        const [, , silkPng] = artworkTemplateFiles(
            templateSurface("silk-6ft-36x54")!,
            { deflate, pngDpi: 4 },
        );
        expect(pngText(silkPng.data as Uint8Array)).toEqual({});
    });

    it("rejects a PNG comment that isn't printable ASCII", () => {
        expect(() =>
            templatePng(drawingOf(floorProp), {
                dpi: 1,
                deflate,
                comment: "café",
            }),
        ).toThrow(/printable ASCII/);
    });
});

describe("as built (Q32)", () => {
    it("lays silks fly wide by header tall, pole side on the left", () => {
        const silk = templateSurface("silk-6ft-36x54")!;
        expect(silk.width.m).toBe(inches(54));
        expect(silk.height.m).toBe(inches(36));
        expect(silk.orientation).toBe("poleLeft");
    });

    it("gives Floor props the floor DPI guide (30/60)", () => {
        expect(floorProp.dpi).toEqual(DPI_GUIDE.floor);
        expect(DPI_GUIDE.floor).toEqual({ minimum: 30, recommended: 60 });
    });

    it("makes default downloads with the default policy and PNG DPI", () => {
        const s = templateSurface("uniform-top-front")!;
        const files = artworkTemplateFiles(s, { deflate });
        const png = Buffer.from(files[2].data as Uint8Array);
        const d = drawingOf(s);
        const size = pngSize(d, s.dpi.minimum);
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
            size.width,
            size.height,
        ]);
    });
});
