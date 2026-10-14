// @vitest-environment node
// cspell:words Colourspace EXIF
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lengthOf, toMeters } from "../../../../src/view3d/core/sizes";
import { sha256Hex } from "../../library/hash";
import { openLibraryStore, type LibraryStore } from "../../library/store";
import { readPngPhys, sniffArtworkFormat } from "../formats";
import type { PdfRenderer } from "../pdf";
import {
    ArtworkImportCancelled,
    groupByAspect,
    importArtwork,
    inspectArtwork,
    isArtworkImportCancelled,
    renderArtworkPreview,
    type ArtworkFile,
    type ArtworkSizeChoice,
} from "../pipeline";
import { decodeArtworkSidecar } from "../sidecar";

let dir: string;
let store: LibraryStore;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "om-artwork-"));
    store = await openLibraryStore({ root: path.join(dir, "library") });
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------ fixtures

const solid = (width: number, height: number, alpha = false) =>
    sharp({
        create: {
            width,
            height,
            channels: alpha ? 4 : 3,
            background: alpha
                ? { r: 192, g: 64, b: 32, alpha: 0.5 }
                : { r: 192, g: 64, b: 32 },
        },
    });

async function png(
    name: string,
    width: number,
    height: number,
    options: { density?: number; alpha?: boolean } = {},
): Promise<ArtworkFile> {
    let image = solid(width, height, options.alpha);
    if (options.density)
        image = image.withMetadata({ density: options.density });
    return {
        filename: name,
        bytes: new Uint8Array(await image.png().toBuffer()),
    };
}

async function jpeg(
    name: string,
    width: number,
    height: number,
    options: { cmyk?: boolean; orientation?: number; density?: number } = {},
): Promise<ArtworkFile> {
    let image = solid(width, height);
    if (options.cmyk) image = image.toColourspace("cmyk");
    if (options.orientation || options.density) {
        image = image.withMetadata({
            orientation: options.orientation,
            density: options.density,
        });
    }
    return {
        filename: name,
        bytes: new Uint8Array(await image.jpeg().toBuffer()),
    };
}

function svg(name: string, attributes: string): ArtworkFile {
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<!-- a test silk -->
<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>
  <rect x="0" y="0" width="100%" height="100%" fill="#2d4f9e"/>
  <circle cx="50%" cy="50%" r="25%" fill="#ffffff"/>
</svg>`;
    return { filename: name, bytes: new TextEncoder().encode(text) };
}

/** A real two-page PDF: letter portrait, then 11 × 17 in landscape. */
async function twoPagePdf(): Promise<ArtworkFile> {
    const doc = new PDFDocument({ size: "LETTER", autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve) => doc.on("end", resolve));
    doc.rect(72, 72, 200, 200).fill("#2d4f9e");
    doc.addPage({ size: [17 * 72, 11 * 72] });
    doc.circle(300, 300, 100).fill("#c04020");
    doc.end();
    await done;
    return {
        filename: "front-back.pdf",
        bytes: new Uint8Array(Buffer.concat(chunks)),
    };
}

/**
 * Stands in for the PDF renderer the app doesn't have yet (see `pdf.ts`):
 * it knows the fixture's page sizes and renders a flat color per page.
 */
const fakePdfRenderer: PdfRenderer = {
    async open(bytes) {
        expect(sniffArtworkFormat(bytes)).toBe("pdf");
        return {
            pages: [
                { widthPt: 8.5 * 72, heightPt: 11 * 72 },
                { widthPt: 17 * 72, heightPt: 11 * 72 },
            ],
            async renderPage(_index, size) {
                return new Uint8Array(
                    await solid(size.width, size.height, true).png().toBuffer(),
                );
            },
        };
    },
};

const silk36x54: ArtworkSizeChoice = {
    width: lengthOf(36, "in"),
    height: lengthOf(54, "in"),
    source: "template",
    templateId: "silk-6ft-36x54",
};

async function displayOf(itemId: string, versionHash: string) {
    const parts = await store.readVersionParts(itemId, versionHash);
    const meta = await sharp(parts.display).metadata();
    return { parts, meta, sidecar: decodeArtworkSidecar(parts.sidecar) };
}

// ------------------------------------------------------------ formats

describe("format detection", () => {
    it("reads magic bytes, never the extension", async () => {
        const p = await png("x.jpg", 4, 4);
        expect(sniffArtworkFormat(p.bytes)).toBe("png");
        expect(sniffArtworkFormat((await jpeg("x.png", 4, 4)).bytes)).toBe(
            "jpeg",
        );
        expect(
            sniffArtworkFormat(svg("a.txt", 'width="1in" height="1in"').bytes),
        ).toBe("svg");
        expect(sniffArtworkFormat((await twoPagePdf()).bytes)).toBe("pdf");
        const gif = new Uint8Array(await solid(4, 4).gif().toBuffer());
        expect(sniffArtworkFormat(gif)).toBeNull();
    });

    it("reads pHYs in pixels per meter", async () => {
        const p = await png("a.png", 10, 10, { density: 254 });
        expect(readPngPhys(p.bytes)).toEqual({ x: 10000, y: 10000 });
    });
});

// ------------------------------------------------------------ PNG

describe("PNG", () => {
    it("trusts pHYs other than 72/96 DPI as the physical size", async () => {
        const file = await png("silk.png", 1000, 1500, { density: 254 });
        const inspection = await inspectArtwork(file);
        expect(inspection.ok).toBe(true);
        if (!inspection.ok) return;
        expect(inspection.format).toBe("png");
        expect(inspection.notes).toEqual([]);
        const [page] = inspection.pages;
        expect(page.fileSize?.from).toBe("png-phys");
        expect(page.fileSize?.width.m).toBeCloseTo(0.1, 12);
        expect(page.fileSize?.height.m).toBeCloseTo(0.15, 12);

        const report = await importArtwork(store, { file, surface: "silk" });
        expect(report.notImported).toEqual([]);
        expect(report.imported).toHaveLength(1);
        const [result] = report.imported;
        expect(result.outcome).toBe("created");
        expect(result.item.kind).toBe("artwork");
        expect(result.item.name).toBe("silk");
        expect(result.item.originalFilename).toBe("silk.png");
        expect(result.sidecar.size.source).toBe("file");
        expect(result.sidecar.nativeDpi).toBeCloseTo(254, 9);
        expect(result.sidecar.badges).toEqual([]);
        // Fits the silk cap already: kept at its size, no downsize note.
        expect(result.sidecar.display).toEqual({
            width: 1000,
            height: 1500,
            format: "jpeg",
        });
        expect(result.sidecar.importNotes).toEqual([]);

        const { parts, meta, sidecar } = await displayOf(
            result.item.id,
            result.version.hash,
        );
        expect(Object.keys(parts).sort()).toEqual([
            "display",
            "original",
            "sidecar",
        ]);
        expect(sha256Hex(parts.original)).toBe(sha256Hex(file.bytes));
        expect(meta).toMatchObject({
            format: "jpeg",
            width: 1000,
            height: 1500,
        });
        expect(sidecar).toEqual(result.sidecar);
        expect(
            await store.readSource(result.item.id, result.version.hash),
        ).toEqual({
            filename: "silk.png",
            bytes: file.bytes,
        });
    });

    it("treats 72 DPI as unknown and asks for a size", async () => {
        const file = await png("flag.png", 2000, 3000, { density: 72 });
        const inspection = await inspectArtwork(file);
        expect(inspection.ok && inspection.pages[0].fileSize).toBeNull();
        expect(inspection.notes.map((n) => [n.group, n.code])).toEqual([
            ["needs-choice", "size"],
        ]);

        const unsized = await importArtwork(store, { file, surface: "silk" });
        expect(unsized.imported).toEqual([]);
        expect(unsized.notImported).toEqual([
            { page: 0, notes: [expect.objectContaining({ code: "size" })] },
        ]);
        expect(await store.listItems()).toEqual([]);
    });

    it("downsizes to the cap, keeps the original and writes no badge at low DPI", async () => {
        const file = await png("flag.png", 2000, 3000, { density: 96 });
        const report = await importArtwork(store, {
            file,
            surface: "silk",
            size: silk36x54,
        });
        const [result] = report.imported;
        expect(result.sidecar.size).toEqual({
            width: { m: toMeters(36, "in"), typed: "36 in" },
            height: { m: toMeters(54, "in"), typed: "54 in" },
            source: "template",
            templateId: "silk-6ft-36x54",
        });
        expect(result.sidecar.nativeDpi).toBeCloseTo(2000 / 36, 9);
        // No print-readiness check (Q75): 55 DPI on a silk is no badge.
        expect(result.sidecar.badges).toEqual([]);
        expect(result.sidecar.importNotes.map((n) => n.code)).toEqual([
            "display-downsized",
        ]);
        const { parts, meta } = await displayOf(
            result.item.id,
            result.version.hash,
        );
        expect(meta).toMatchObject({ width: 1024, height: 1536 });
        expect(sha256Hex(parts.original)).toBe(sha256Hex(file.bytes));
    });

    it("keeps alpha in a PNG display texture", async () => {
        const file = await png("logo.png", 3000, 1000, { alpha: true });
        const report = await importArtwork(store, {
            file,
            surface: "propSlot",
            size: {
                width: lengthOf(6, "ft"),
                height: lengthOf(2, "ft"),
                source: "user",
            },
        });
        const [result] = report.imported;
        expect(result.sidecar.display).toEqual({
            width: 1024,
            height: 341,
            format: "png",
        });
        const { meta } = await displayOf(result.item.id, result.version.hash);
        expect(meta.hasAlpha).toBe(true);
    });

    it("never stretches: a size with another shape is refused", async () => {
        const file = await png("flag.png", 2000, 3000);
        const report = await importArtwork(store, {
            file,
            surface: "silk",
            size: { ...silk36x54, height: lengthOf(56, "in") },
        });
        expect(report.imported).toEqual([]);
        expect(report.notImported[0].notes[0]).toMatchObject({
            group: "needs-choice",
            code: "size-aspect",
        });
    });
});

// ------------------------------------------------------------ JPEG

describe("JPEG", () => {
    it("doesn't trust JPEG density, only PNG pHYs", async () => {
        const file = await jpeg("photo.jpg", 600, 400, { density: 300 });
        const inspection = await inspectArtwork(file);
        expect(inspection.ok && inspection.pages[0].fileSize).toBeNull();
    });

    it("converts CMYK to sRGB for display, keeping the original", async () => {
        const file = await jpeg("print.jpg", 1200, 1800, { cmyk: true });
        const inspection = await inspectArtwork(file);
        expect(inspection.ok && inspection.colorSpace).toBe("cmyk");

        const report = await importArtwork(store, {
            file,
            surface: "silk",
            size: silk36x54,
        });
        const [result] = report.imported;
        expect(result.sidecar.original.colorSpace).toBe("cmyk");
        expect(result.sidecar.importNotes).toContainEqual({
            group: "fixed",
            code: "converted-from-cmyk",
            message: "Converted from CMYK for display; colors may differ.",
        });
        const { parts, meta } = await displayOf(
            result.item.id,
            result.version.hash,
        );
        expect(meta).toMatchObject({
            format: "jpeg",
            space: "srgb",
            channels: 3,
            width: 1024,
            height: 1536,
        });
        expect((await sharp(parts.original).metadata()).space).toBe("cmyk");
    });

    it("applies EXIF orientation before measuring", async () => {
        const file = await jpeg("turned.jpg", 300, 200, { orientation: 6 });
        const inspection = await inspectArtwork(file);
        expect(inspection.ok && inspection.pages[0].pixels).toEqual({
            width: 200,
            height: 300,
        });
        const report = await importArtwork(store, {
            file,
            surface: "propSlot",
            size: {
                width: lengthOf(2, "in"),
                height: lengthOf(3, "in"),
                source: "user",
            },
        });
        const { meta } = await displayOf(
            report.imported[0].item.id,
            report.imported[0].version.hash,
        );
        expect(meta).toMatchObject({ width: 200, height: 300 });
    });
});

// ------------------------------------------------------------ SVG

describe("SVG", () => {
    it("uses a physical page size and stays vector", async () => {
        const file = svg(
            "silk.svg",
            'width="36in" height="54in" viewBox="0 0 36 54"',
        );
        const inspection = await inspectArtwork(file);
        expect(inspection.ok).toBe(true);
        if (!inspection.ok) return;
        expect(inspection.pages).toHaveLength(1);
        expect(inspection.pages[0]).toMatchObject({
            vector: true,
            pixels: null,
            fileSize: {
                width: { m: toMeters(36, "in"), typed: "36 in" },
                height: { m: toMeters(54, "in"), typed: "54 in" },
                from: "svg-page",
            },
        });

        const report = await importArtwork(store, { file, surface: "silk" });
        const [result] = report.imported;
        expect(result.sidecar.nativeDpi).toBe("vector");
        expect(result.sidecar.badges).toEqual([]);
        expect(result.sidecar.original).toEqual({
            format: "svg",
            page: null,
            pixels: null,
            colorSpace: "srgb",
        });
        expect(result.sidecar.display).toEqual({
            width: 1024,
            height: 1536,
            format: "png",
        });
        expect(result.sidecar.importNotes.map((n) => n.code)).toEqual([
            "display-rasterized",
        ]);
        const { parts, meta } = await displayOf(
            result.item.id,
            result.version.hash,
        );
        expect(meta).toMatchObject({
            format: "png",
            width: 1024,
            height: 1536,
        });
        expect(new TextDecoder().decode(parts.original)).toContain("<svg");
    });

    it("asks for a size when the SVG is sized in pixels", async () => {
        const file = svg(
            "logo.svg",
            'width="800" height="400" viewBox="0 0 800 400"',
        );
        const inspection = await inspectArtwork(file);
        expect(inspection.ok).toBe(true);
        if (!inspection.ok) return;
        expect(inspection.pages[0].fileSize).toBeNull();
        expect(inspection.pages[0].aspect).toBe(2);
        expect(inspection.notes.map((n) => n.code)).toEqual(["size"]);

        const report = await importArtwork(store, {
            file,
            surface: "floorProp",
            size: {
                width: lengthOf(8, "ft"),
                height: lengthOf(4, "ft"),
                source: "user",
            },
        });
        expect(report.imported[0].sidecar.display).toEqual({
            width: 2048,
            height: 1024,
            format: "png",
        });
    });
});

// ------------------------------------------------------------ PDF

describe("PDF", () => {
    it("is refused while the app has no PDF renderer, storing nothing", async () => {
        const file = await twoPagePdf();
        const inspection = await inspectArtwork(file);
        expect(inspection).toEqual({
            ok: false,
            filename: "front-back.pdf",
            format: "pdf",
            notes: [
                expect.objectContaining({
                    group: "cant-import",
                    code: "pdf-unavailable",
                }),
            ],
        });
        const report = await importArtwork(store, {
            file,
            surface: "propSlot",
        });
        expect(report.imported).toEqual([]);
        expect(report.notImported[0].page).toBeNull();
        expect(await store.listItems()).toEqual([]);
    });

    it("makes one Artwork per page with a renderer", async () => {
        const file = await twoPagePdf();
        const options = { pdfRenderer: fakePdfRenderer };
        const inspection = await inspectArtwork(file, options);
        expect(inspection.ok).toBe(true);
        if (!inspection.ok) return;
        expect(inspection.pages.map((p) => p.fileSize?.from)).toEqual([
            "pdf-page",
            "pdf-page",
        ]);
        expect(inspection.notes.map((n) => n.code)).toEqual(["pages"]);

        const report = await importArtwork(
            store,
            { file, surface: "propSlot" },
            options,
        );
        expect(report.notImported).toEqual([]);
        expect(report.imported.map((r) => r.item.name)).toEqual([
            "front-back (page 1)",
            "front-back (page 2)",
        ]);
        const [first, second] = report.imported;
        expect(first.item.id).not.toBe(second.item.id);
        expect(first.sidecar.original.page).toEqual({ index: 0, count: 2 });
        expect(second.sidecar.original.page).toEqual({ index: 1, count: 2 });
        expect(first.sidecar.nativeDpi).toBe("vector");
        expect(first.sidecar.size.width.m).toBeCloseTo(toMeters(8.5, "in"), 12);
        expect(second.sidecar.size.height.m).toBeCloseTo(
            toMeters(11, "in"),
            12,
        );
        expect(first.sidecar.display).toMatchObject({
            width: 791,
            height: 1024,
        });
        expect(second.sidecar.display).toMatchObject({
            width: 1024,
            height: 663,
        });
        // Both pages keep the whole PDF as their original: one stored blob.
        const a = await store.readVersionParts(
            first.item.id,
            first.version.hash,
        );
        const b = await store.readVersionParts(
            second.item.id,
            second.version.hash,
        );
        expect(sha256Hex(a.original)).toBe(sha256Hex(file.bytes));
        expect(sha256Hex(b.original)).toBe(sha256Hex(file.bytes));
    });

    it("imports only the picked pages", async () => {
        const report = await importArtwork(
            store,
            { file: await twoPagePdf(), surface: "propSlot", pages: [1, 5] },
            { pdfRenderer: fakePdfRenderer },
        );
        expect(report.imported.map((r) => r.page)).toEqual([1]);
        expect(report.notImported).toEqual([
            {
                page: 5,
                notes: [expect.objectContaining({ code: "no-such-page" })],
            },
        ]);
    });
});

// ------------------------------------------------------------ refusals

describe("refusals", () => {
    it("refuses other formats and unreadable files", async () => {
        const gif = {
            filename: "anim.gif",
            bytes: new Uint8Array(await solid(4, 4).gif().toBuffer()),
        };
        expect(await inspectArtwork(gif)).toMatchObject({
            ok: false,
            format: null,
            notes: [{ group: "cant-import", code: "unsupported-format" }],
        });
        const broken = {
            filename: "broken.png",
            bytes: new Uint8Array([
                0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
            ]),
        };
        expect(await inspectArtwork(broken)).toMatchObject({
            ok: false,
            format: "png",
            notes: [{ group: "cant-import", code: "unreadable" }],
        });
    });

    it("reports a page whose pixels can't be decoded and imports the rest", async () => {
        // The header reads, so inspection passes; decoding fails.
        const whole = await sharp({
            create: {
                width: 200,
                height: 300,
                channels: 3,
                noise: { type: "gaussian", mean: 128, sigma: 40 },
            },
        })
            .png()
            .toBuffer();
        const cut = {
            filename: "cut.png",
            bytes: new Uint8Array(whole.subarray(0, whole.length / 2)),
        };
        expect((await inspectArtwork(cut)).ok).toBe(true);
        expect(
            await importArtwork(store, {
                file: cut,
                surface: "silk",
                size: silk36x54,
            }),
        ).toMatchObject({
            imported: [],
            notImported: [
                {
                    page: 0,
                    notes: [{ group: "cant-import", code: "unreadable" }],
                },
            ],
        });
        expect(await renderArtworkPreview(cut, 0, 256)).toMatchObject({
            ok: false,
            notes: [{ group: "cant-import", code: "unreadable" }],
        });

        const badSecondPage: PdfRenderer = {
            async open(bytes) {
                const doc = await fakePdfRenderer.open(bytes);
                return {
                    ...doc,
                    async renderPage(index, size) {
                        if (index === 1) throw new Error("bad page");
                        return doc.renderPage(index, size);
                    },
                };
            },
        };
        const report = await importArtwork(
            store,
            { file: await twoPagePdf(), surface: "propSlot" },
            { pdfRenderer: badSecondPage },
        );
        expect(report.imported.map((p) => p.page)).toEqual([0]);
        expect(report.notImported).toMatchObject([
            {
                page: 1,
                notes: [
                    {
                        code: "unreadable",
                        message: expect.stringMatching(/bad page/),
                    },
                ],
            },
        ]);
    });
});

// ------------------------------------------------------------ Library

describe("Library", () => {
    it("reuses the item for the same file imported the same way", async () => {
        const file = await png("silk.png", 1000, 1500, { density: 254 });
        const first = await importArtwork(store, { file, surface: "silk" });
        const again = await importArtwork(store, { file, surface: "silk" });
        expect(again.imported[0].outcome).toBe("existing");
        expect(again.imported[0].item.id).toBe(first.imported[0].item.id);
        expect(again.imported[0].version.hash).toBe(
            first.imported[0].version.hash,
        );
    });

    it("gives the same Version hash in another Library", async () => {
        const file = await jpeg("print.jpg", 1200, 1800, { cmyk: true });
        const request = { file, surface: "silk" as const, size: silk36x54 };
        const here = await importArtwork(store, request);
        const other = await openLibraryStore({ root: path.join(dir, "other") });
        const there = await importArtwork(other, request);
        expect(there.imported[0].version.hash).toBe(
            here.imported[0].version.hash,
        );
    });

    it("adds a new Version when re-imported into an item at another size", async () => {
        const file = await png("flag.png", 2000, 3000);
        const first = await importArtwork(store, {
            file,
            surface: "silk",
            size: silk36x54,
            name: "Opener silk",
            tags: ["opener"],
            license: { license: "CC0-1.0", author: "Guard staff" },
        });
        const item = first.imported[0].item;
        expect(item).toMatchObject({
            name: "Opener silk",
            tags: ["opener"],
            license: "CC0-1.0",
            author: "Guard staff",
        });
        const second = await importArtwork(store, {
            file,
            surface: "silk",
            itemId: item.id,
            size: {
                width: lengthOf(30, "in"),
                height: lengthOf(45, "in"),
                source: "template",
                templateId: "silk-5ft-30x46",
            },
        });
        expect(second.imported[0].outcome).toBe("added-version");
        expect(second.imported[0].item.versions).toHaveLength(2);
    });

    it("refuses an itemId for a multi-page import", async () => {
        await expect(
            importArtwork(
                store,
                {
                    file: await twoPagePdf(),
                    surface: "propSlot",
                    itemId: "11111111-2222-4333-8444-555555555555",
                },
                { pdfRenderer: fakePdfRenderer },
            ),
        ).rejects.toThrow(/one page at a time/);
    });
});

// ------------------------------------------------------------ multi-select

describe("groupByAspect", () => {
    it("asks once per distinct aspect", async () => {
        const inspections = await Promise.all([
            inspectArtwork(await png("a.png", 1000, 1500, { density: 254 })),
            inspectArtwork(await png("b.png", 2000, 3000)),
            inspectArtwork(svg("c.svg", 'width="36in" height="54in"')),
            inspectArtwork(await png("d.png", 800, 400)),
            inspectArtwork({
                filename: "e.gif",
                bytes: new Uint8Array([1, 2, 3]),
            }),
        ]);
        const groups = groupByAspect(inspections);
        expect(groups).toHaveLength(2);
        const [tall, wide] = groups;
        expect(tall.members).toEqual([
            { file: 0, page: 0 },
            { file: 1, page: 0 },
            { file: 2, page: 0 },
        ]);
        // Their file sizes disagree (or are missing), so nothing is pre-selected.
        expect(tall.fileSize).toBeNull();
        expect(tall.chips.map((c) => c.label)).toContain("Silk 36 × 54 in");
        expect(wide.members).toEqual([{ file: 3, page: 0 }]);
        expect(wide.chips.map((c) => c.label)).toContain("Flat prop 8 × 4 ft");
    });

    it("pre-selects a size every member shares", async () => {
        const groups = groupByAspect([
            await inspectArtwork(svg("a.svg", 'width="36in" height="54in"')),
            await inspectArtwork(svg("b.svg", 'width="36in" height="54in"')),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].fileSize).toEqual({
            width: { m: toMeters(36, "in"), typed: "36 in" },
            height: { m: toMeters(54, "in"), typed: "54 in" },
        });
    });
});

// ------------------------------------------------------------ preview

async function pngInfo(bytes: Uint8Array) {
    const meta = await sharp(bytes).metadata();
    return {
        format: meta.format,
        width: meta.width,
        height: meta.height,
        space: meta.space,
    };
}

describe("renderArtworkPreview", () => {
    it("fits a raster's longest edge to maxPx, keeping its shape", async () => {
        const file = await png("wide.png", 2000, 1000);
        const preview = await renderArtworkPreview(file, 0, 256);
        expect(preview).toMatchObject({ ok: true, page: 0, width: 256 });
        if (!preview.ok) return;
        expect(preview.height).toBe(128);
        expect(await pngInfo(preview.png)).toEqual({
            format: "png",
            width: 256,
            height: 128,
            space: "srgb",
        });
    });

    it("never enlarges a small raster", async () => {
        const preview = await renderArtworkPreview(
            await png("small.png", 300, 200),
            0,
            1024,
        );
        expect(preview).toMatchObject({ ok: true, width: 300, height: 200 });
    });

    it("converts a CMYK JPEG to sRGB and applies EXIF orientation", async () => {
        const preview = await renderArtworkPreview(
            await jpeg("cmyk.jpg", 400, 1000, { cmyk: true, orientation: 6 }),
            0,
            256,
        );
        expect(preview.ok).toBe(true);
        if (!preview.ok) return;
        // Orientation 6 turns 400 × 1000 into 1000 × 400.
        expect(await pngInfo(preview.png)).toEqual({
            format: "png",
            width: 256,
            height: 102,
            space: "srgb",
        });
    });

    it("renders an SVG at maxPx on its longest edge", async () => {
        const file = svg("silk.svg", 'width="36in" height="54in"');
        const preview = await renderArtworkPreview(file, 0, 1024);
        expect(preview).toMatchObject({ ok: true, width: 683, height: 1024 });
        if (!preview.ok) return;
        expect(await pngInfo(preview.png)).toMatchObject({
            width: 683,
            height: 1024,
            space: "srgb",
        });
    });

    it("renders a PDF page through the renderer and closes it", async () => {
        const close = vi.fn();
        const renderer: PdfRenderer = {
            async open(bytes) {
                const doc = await fakePdfRenderer.open(bytes);
                return { ...doc, close };
            },
        };
        const preview = await renderArtworkPreview(await twoPagePdf(), 1, 256, {
            pdfRenderer: renderer,
        });
        expect(preview).toMatchObject({
            ok: true,
            page: 1,
            width: 256,
            height: 166,
        });
        if (!preview.ok) return;
        expect(await pngInfo(preview.png)).toMatchObject({
            format: "png",
            width: 256,
            height: 166,
        });
        expect(close).toHaveBeenCalledTimes(1);
    });

    it("answers with notes for a missing page or an unreadable file", async () => {
        expect(
            await renderArtworkPreview(await png("a.png", 10, 10), 3, 256),
        ).toEqual({
            ok: false,
            filename: "a.png",
            page: 3,
            notes: [expect.objectContaining({ code: "no-such-page" })],
        });
        const pdf = await renderArtworkPreview(await twoPagePdf(), 0, 256);
        expect(pdf).toMatchObject({
            ok: false,
            notes: [expect.objectContaining({ code: "pdf-unavailable" })],
        });
        await expect(
            renderArtworkPreview(await png("a.png", 10, 10), 0, 0),
        ).rejects.toThrow(/maxPx/);
    });
});

// ------------------------------------------------------------ cancel, progress

/** A two-page renderer whose page renders wait until `release()`. */
function slowPdfRenderer() {
    const close = vi.fn();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const rendering = vi.fn();
    const renderer: PdfRenderer = {
        async open(bytes) {
            const doc = await fakePdfRenderer.open(bytes);
            return {
                ...doc,
                async renderPage(index, size) {
                    rendering(index);
                    if (index === 1) await gate;
                    return doc.renderPage(index, size);
                },
                close,
            };
        },
    };
    return { renderer, close, release: () => release(), rendering };
}

describe("cancellation", () => {
    it("rejects before reading when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const open = vi.fn();
        const error = await inspectArtwork(await twoPagePdf(), {
            pdfRenderer: { open },
            signal: controller.signal,
        }).catch((e: unknown) => e);
        expect(isArtworkImportCancelled(error)).toBe(true);
        expect(error).toMatchObject({
            code: "cancelled",
            filename: "front-back.pdf",
            report: null,
        });
        expect(open).not.toHaveBeenCalled();
    });

    it("stops between pages, keeps what was stored and closes the PDF", async () => {
        const slow = slowPdfRenderer();
        const controller = new AbortController();
        const progress: [number, number][] = [];
        const running = importArtwork(
            store,
            { file: await twoPagePdf(), surface: "propSlot" },
            {
                pdfRenderer: slow.renderer,
                signal: controller.signal,
                onProgress: (done, total) => progress.push([done, total]),
            },
        );
        await vi.waitFor(() => expect(slow.rendering).toHaveBeenCalledWith(1));
        controller.abort();
        // Aborting closes the document at once, while page 2 still renders.
        expect(slow.close).toHaveBeenCalledTimes(1);
        slow.release();

        const error = await running.catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ArtworkImportCancelled);
        const { report } = error as ArtworkImportCancelled;
        expect(report?.imported.map((r) => r.page)).toEqual([0]);
        expect(progress).toEqual([
            [0, 2],
            [1, 2],
        ]);
        // Page 1 stays in the Library; page 2's render was discarded.
        expect((await store.listItems()).map((i) => i.name)).toEqual([
            "front-back (page 1)",
        ]);
        expect(slow.close).toHaveBeenCalledTimes(1);
    });

    it("reports progress per page and once for an inspection", async () => {
        const progress: [number, number][] = [];
        const onProgress = (done: number, total: number) =>
            progress.push([done, total]);
        await importArtwork(
            store,
            { file: await twoPagePdf(), surface: "propSlot", pages: [0, 1, 7] },
            { pdfRenderer: fakePdfRenderer, onProgress },
        );
        expect(progress).toEqual([
            [0, 3],
            [1, 3],
            [2, 3],
            [3, 3],
        ]);
        progress.length = 0;
        await inspectArtwork(await png("a.png", 10, 10), { onProgress });
        expect(progress).toEqual([
            [0, 1],
            [1, 1],
        ]);
    });
});
