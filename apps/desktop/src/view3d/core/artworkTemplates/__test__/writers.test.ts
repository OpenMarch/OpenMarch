// @vitest-environment node
// cspell:words startxref ihdr plte idat iend
import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { lengthOf, toMeters } from "../../sizes/units";
import {
    artworkTemplateFiles,
    DEFAULT_TEMPLATE_POLICY,
    floorPropSurface,
    layoutTemplate,
    lineSegments,
    pixelsAt,
    pngSize,
    propSurface,
    resolveTemplate,
    TEMPLATE_COLORS,
    TEMPLATE_DOWNLOADS,
    TEMPLATE_SURFACES,
    templatePdf,
    templatePng,
    templateSurface,
    templateSvg,
    type TemplateDrawing,
    type TemplatePolicy,
    type TemplateSurface,
} from "..";
import { TEST_POLICY } from "./testPolicy";

const deflate = (data: Uint8Array) => deflateSync(data);
const drawingOf = (s: TemplateSurface, policy = TEST_POLICY) =>
    layoutTemplate(resolveTemplate(s, policy));

/** The page size each surface should have, in meters. */
function expectedPage(s: TemplateSurface): { w: number; h: number; b: number } {
    const b =
        s.process === "flag"
            ? toMeters(0.125, "in")
            : s.process === "sublimation"
              ? toMeters(0.5, "in")
              : toMeters(0.25, "in"); // TEST_POLICY
    return { w: s.width.m + 2 * b, h: s.height.m + 2 * b, b };
}

const CUSTOM: TemplateSurface[] = [
    floorPropSurface(lengthOf(12, "ft"), lengthOf(8, "ft")),
    propSurface("top", lengthOf(48, "in"), lengthOf(24, "in")),
    propSurface("front", lengthOf(1.2, "m"), lengthOf(2.4, "m")),
];
const ALL = [...TEMPLATE_SURFACES, ...CUSTOM];

// ---------------------------------------------------------------- layout

describe("resolveTemplate", () => {
    it("uses the fixed bleed, not the policy's, for flags and sublimation", () => {
        const silk = resolveTemplate(
            templateSurface("silk-6ft-36x54")!,
            TEST_POLICY,
        );
        expect(silk.bleedM).toBe(toMeters(0.125, "in"));
        const top = resolveTemplate(
            templateSurface("uniform-top-front")!,
            TEST_POLICY,
        );
        expect(top.bleedM).toBe(toMeters(0.5, "in"));
        const floor = resolveTemplate(
            templateSurface("base-floor-wgi-minimum-60x90ft")!,
            TEST_POLICY,
        );
        expect(floor.bleedM).toBe(toMeters(0.25, "in"));
    });

    it("asks for a cut outline only for masked cuts", () => {
        let asked = 0;
        const policy: TemplatePolicy = {
            ...TEST_POLICY,
            cutOutline: (s) => {
                asked++;
                return TEST_POLICY.cutOutline(s);
            },
        };
        expect(
            resolveTemplate(templateSurface("silk-6ft-36x54")!, policy)
                .outlineM,
        ).toBeUndefined();
        expect(
            resolveTemplate(templateSurface("silk-arc-45x96")!, policy)
                .outlineM,
        ).toHaveLength(4);
        expect(asked).toBe(1);
    });

    it("rejects an outline outside the trim or missing", () => {
        const arc = templateSurface("silk-arc-45x96")!;
        expect(() =>
            resolveTemplate(arc, {
                ...TEST_POLICY,
                cutOutline: () => [
                    [0, 0],
                    [9, 0],
                    [0, 1],
                ],
            }),
        ).toThrow(/leaves the trim/);
        expect(() =>
            resolveTemplate(arc, {
                ...TEST_POLICY,
                cutOutline: () => undefined,
            }),
        ).toThrow(/no cut outline/);
    });

    it("shrinks a safe area that doesn't fit to a quarter of the shorter side (Q38)", () => {
        const huge = lengthOf(100, "in");
        const policy: TemplatePolicy = {
            ...TEST_POLICY,
            safeArea: () => ({
                top: huge,
                right: huge,
                bottom: huge,
                left: huge,
            }),
        };
        const six = resolveTemplate(templateSurface("silk-6ft-36x54")!, policy);
        const q = toMeters(36, "in") / 4;
        expect(six.safeM).toEqual({ top: q, right: q, bottom: q, left: q });
        expect(six.safeShrunk).toBe(true);
        const arc = resolveTemplate(templateSurface("silk-arc-45x96")!, policy);
        expect(arc.safeShrunk).toBe(true);
        expect(arc.safeRingM?.length).toBeGreaterThan(2);
    });
});

describe("layoutTemplate", () => {
    it("makes the page the trim plus the bleed on every side", () => {
        for (const s of ALL) {
            const d = drawingOf(s);
            const { w, h, b } = expectedPage(s);
            expect(d.widthM, s.id).toBeCloseTo(w, 12);
            expect(d.heightM, s.id).toBeCloseTo(h, 12);
            expect(d.trim).toEqual({
                x: b,
                y: b,
                width: s.width.m,
                height: s.height.m,
            });
        }
    });

    it("draws a mask only for masked cuts", () => {
        for (const s of ALL) {
            const masked = drawingOf(s).shapes.some(
                (shape) => shape.type === "area" && shape.fill === "mask",
            );
            expect(masked, s.id).toBe(s.cut !== "rectangle");
        }
    });

    it("labels size, bleed, DPI and orientation", () => {
        const d = drawingOf(templateSurface("silk-6ft-36x54")!);
        const text = d.shapes.flatMap((s) =>
            s.type === "text" ? [s.text] : [],
        );
        expect(text).toContain("Trim: 54 in fly x 36 in header");
        expect(text).toContain("POLE SIDE (HEADER)");
        expect(text.join("\n")).toMatch(/Bleed: 1\/8"/);
        expect(text.join("\n")).toContain(
            "150 DPI minimum (8100 x 5400 px), 300 DPI recommended (16200 x 10800 px)",
        );
        expect(
            drawingOf(templateSurface("base-floor-wgi-minimum-60x90ft")!)
                .shapes,
        ).toContainEqual(
            expect.objectContaining({ type: "text", text: "AUDIENCE SIDE" }),
        );
    });

    it("ends every info line inside the trim", () => {
        // Helvetica digits, which these lines are full of, are 0.556 em wide.
        for (const { surface } of TEMPLATE_DOWNLOADS) {
            const d = drawingOf(surface, DEFAULT_TEMPLATE_POLICY);
            for (const shape of d.shapes)
                if (shape.type === "text" && shape.fill === "text")
                    expect(
                        shape.x + shape.text.length * shape.sizeM * 0.556,
                        `${surface.id}: ${shape.text}`,
                    ).toBeLessThan(d.trim.x + d.trim.width);
        }
    });

    it("keeps OpenMarch's name out of the CC0 templates", () => {
        for (const s of ALL)
            for (const shape of drawingOf(s).shapes)
                if (shape.type === "text")
                    expect(shape.text).not.toMatch(/openmarch/i);
    });
});

describe("lineSegments", () => {
    it("splits a line into dashes", () => {
        const segments = lineSegments(
            [
                [0, 0],
                [10, 0],
            ],
            false,
            1,
        );
        expect(segments).toHaveLength(5);
        expect(segments[1]).toEqual([
            [2, 0],
            [3, 0],
        ]);
    });
});

describe("pixelsAt", () => {
    it("counts pixels at a DPI", () => {
        expect(pixelsAt(toMeters(54, "in"), 150)).toBe(8100);
    });
});

// ---------------------------------------------------------------- SVG

function svgSize(svg: string): {
    w: number;
    h: number;
    unit: string;
    viewBox: number[];
} {
    const m =
        /<svg [^>]*width="([\d.]+)(in|mm)" height="([\d.]+)(in|mm)" viewBox="([^"]+)"/.exec(
            svg,
        )!;
    return {
        w: Number(m[1]),
        unit: m[2],
        h: Number(m[3]),
        viewBox: m[5].split(" ").map(Number),
    };
}

describe("templateSvg", () => {
    it("is sized exactly, in the surface's unit", () => {
        for (const s of ALL) {
            const svg = templateSvg(drawingOf(s));
            const { w, h, unit, viewBox } = svgSize(svg);
            const page = expectedPage(s);
            const toUnit = (m: number) =>
                unit === "in" ? m / 0.0254 : m * 1000;
            expect(unit, s.id).toBe(s.unit);
            expect(w, s.id).toBeCloseTo(toUnit(page.w), 6);
            expect(h, s.id).toBeCloseTo(toUnit(page.h), 6);
            expect(viewBox).toEqual([0, 0, w, h]);
        }
    });

    it("writes a 36 x 54 in silk as 54.25 x 36.25 in with its bleed", () => {
        const { w, h } = svgSize(
            templateSvg(drawingOf(templateSurface("silk-6ft-36x54")!)),
        );
        expect([w, h]).toEqual([54.25, 36.25]);
    });

    it("writes a uniform top front as 489.4 x 593.4 mm with its bleed", () => {
        const { w, h } = svgSize(
            templateSvg(drawingOf(templateSurface("uniform-top-front")!)),
        );
        expect([w, h]).toEqual([464 + 25.4, 568 + 25.4]);
    });

    it("is well-formed enough to escape text", () => {
        const s = {
            ...templateSurface("silk-6ft-36x54")!,
            name: 'A <b> & "c"',
        };
        const svg = templateSvg(drawingOf(s));
        expect(svg).toContain("A &lt;b&gt; &amp; &quot;c&quot;");
        expect(svg).not.toContain("<b>");
    });
});

// ---------------------------------------------------------------- PDF

function pdfText(bytes: Uint8Array): string {
    return String.fromCharCode(...bytes);
}

function box(pdf: string, name: string): number[] {
    return new RegExp(`/${name} \\[([^\\]]+)\\]`)
        .exec(pdf)![1]
        .split(" ")
        .map(Number);
}

describe("templatePdf", () => {
    it("is sized exactly, with TrimBox and BleedBox", () => {
        for (const s of ALL) {
            const pdf = pdfText(templatePdf(drawingOf(s)));
            const unit = Number(/\/UserUnit (\d+)/.exec(pdf)?.[1] ?? 1);
            const inches = (v: number) => (v * unit) / 72;
            const media = box(pdf, "MediaBox");
            const trim = box(pdf, "TrimBox");
            const page = expectedPage(s);
            const tol = 1e-4 * unit; // four decimals of a PDF unit
            expect(inches(media[2]), s.id).toBeCloseTo(page.w / 0.0254, 3);
            expect(inches(media[3]), s.id).toBeCloseTo(page.h / 0.0254, 3);
            expect(
                Math.abs(inches(trim[2] - trim[0]) - s.width.m / 0.0254),
            ).toBeLessThan(tol);
            expect(
                Math.abs(inches(trim[3] - trim[1]) - s.height.m / 0.0254),
            ).toBeLessThan(tol);
            expect(box(pdf, "BleedBox")).toEqual(media);
            expect(Math.max(media[2], media[3])).toBeLessThanOrEqual(14400);
        }
    });

    it("sets UserUnit only for pages past 200 in", () => {
        const silk = pdfText(
            templatePdf(drawingOf(templateSurface("silk-6ft-36x54")!)),
        );
        expect(silk).not.toContain("/UserUnit");
        expect(box(silk, "MediaBox")).toEqual([0, 0, 54.25 * 72, 36.25 * 72]);
        const floor = pdfText(
            templatePdf(
                drawingOf(templateSurface("base-floor-wgi-maximum-78x106ft")!),
            ),
        );
        expect(floor).toMatch(/\/UserUnit 7\b/);
    });

    it("has a valid cross-reference table", () => {
        const pdf = pdfText(
            templatePdf(drawingOf(templateSurface("silk-arc-45x96")!)),
        );
        expect(pdf.startsWith("%PDF-1.6\n")).toBe(true);
        const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)![1]);
        expect(pdf.slice(xrefAt, xrefAt + 4)).toBe("xref");
        const offsets = [
            ...pdf.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm),
        ].map((m) => Number(m[1]));
        expect(offsets).toHaveLength(6);
        offsets.forEach((offset, i) =>
            expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true),
        );
        const length = Number(/\/Length (\d+) >>\nstream\n/.exec(pdf)![1]);
        const start = pdf.indexOf("stream\n") + 7;
        expect(pdf.slice(start + length, start + length + 10)).toBe(
            "\nendstream",
        );
    });

    it("is ASCII only", () => {
        for (const s of ALL)
            expect(templatePdf(drawingOf(s)).every((b) => b < 0x80)).toBe(true);
    });
});

// ---------------------------------------------------------------- PNG

interface DecodedPng {
    width: number;
    height: number;
    ppm: number;
    pixel(x: number, y: number): readonly number[];
}

function decodePng(png: Uint8Array): DecodedPng {
    const buf = Buffer.from(png);
    expect([...buf.subarray(0, 8)]).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    let at = 8;
    const chunks: Record<string, Buffer[]> = {};
    while (at < buf.length) {
        const len = buf.readUInt32BE(at);
        const type = buf.subarray(at + 4, at + 8).toString("latin1");
        (chunks[type] ??= []).push(buf.subarray(at + 8, at + 8 + len));
        at += 12 + len;
    }
    const ihdr = chunks.IHDR[0];
    const width = ihdr.readUInt32BE(0);
    const height = ihdr.readUInt32BE(4);
    expect([...ihdr.subarray(8)]).toEqual([8, 3, 0, 0, 0]);
    const phys = chunks.pHYs[0];
    expect(phys[8]).toBe(1);
    const plte = chunks.PLTE[0];
    const raw = inflateSync(Buffer.concat(chunks.IDAT));
    expect(raw.length).toBe((width + 1) * height);
    expect(chunks.IEND).toHaveLength(1);
    return {
        width,
        height,
        ppm: phys.readUInt32BE(0),
        pixel: (x, y) => {
            const i = raw[y * (width + 1) + 1 + x];
            return [...plte.subarray(i * 3, i * 3 + 3)];
        },
    };
}

/** A low DPI per surface, so the test stays fast. */
const testDpi = (s: TemplateSurface) => (s.dpi.minimum === 30 ? 1 : 16);

describe("templatePng", () => {
    it("is sized at the DPI with pHYs set, for every surface", () => {
        for (const s of ALL) {
            const dpi = testDpi(s);
            const d = drawingOf(s);
            const png = decodePng(templatePng(d, { dpi, deflate }));
            const page = expectedPage(s);
            expect(png.width, s.id).toBe(Math.round((page.w / 0.0254) * dpi));
            expect(png.height, s.id).toBe(Math.round((page.h / 0.0254) * dpi));
            expect(png.ppm).toBe(Math.round(dpi / 0.0254));
            expect({ width: png.width, height: png.height }).toEqual(
                pngSize(d, dpi),
            );
        }
    });

    it("is exact for imperial sizes at a DPI that makes whole pixels", () => {
        // 36.25 x 54.25 in at 8 DPI: 290 x 434 px.
        const png = decodePng(
            templatePng(drawingOf(templateSurface("silk-6ft-36x54")!), {
                dpi: 8,
                deflate,
            }),
        );
        expect([png.width, png.height]).toEqual([434, 290]);
    });

    it("paints the bleed band, the paper and the cut mask", () => {
        const s = templateSurface("silk-arc-45x96")!; // fly 96 x header 45
        const png = decodePng(templatePng(drawingOf(s), { dpi: 16, deflate }));
        expect(png.pixel(0, png.height >> 1)).toEqual([
            ...TEMPLATE_COLORS.bleed,
        ]);
        // Near the top right corner of the trim, outside TEST_POLICY's outline.
        expect(png.pixel(png.width - 8, 6)).toEqual([...TEMPLATE_COLORS.mask]);
        // The middle: inside the outline, away from lines (PNGs carry no text).
        expect(png.pixel(png.width >> 1, png.height >> 1)).toEqual([
            ...TEMPLATE_COLORS.paper,
        ]);
    });

    it("rejects a DPI that isn't positive", () => {
        const d = drawingOf(templateSurface("silk-6ft-36x54")!);
        expect(() => templatePng(d, { dpi: 0, deflate })).toThrow();
    });
});

// ---------------------------------------------------------------- all

describe("artworkTemplateFiles", () => {
    it("makes all three formats for every surface", () => {
        for (const s of TEMPLATE_SURFACES) {
            const files = artworkTemplateFiles(s, {
                policy: TEST_POLICY,
                pngDpi: testDpi(s),
                deflate,
            });
            expect(files.map((f) => f.name)).toEqual([
                `${s.id}.svg`,
                `${s.id}.pdf`,
                `${s.id}.png`,
            ]);
            expect(files.map((f) => f.mimeType)).toEqual([
                "image/svg+xml",
                "application/pdf",
                "image/png",
            ]);
            for (const f of files) expect(f.data.length).toBeGreaterThan(0);
        }
    });
});

export type { TemplateDrawing };
