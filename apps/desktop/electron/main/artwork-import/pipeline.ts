/**
 * The Artwork import pipeline (package C1.8; props-spec.md §2 "Artwork
 * images" and §3 "Artwork size and templates"; ADR 0002 D-13, D-16).
 *
 * PNG, JPEG, SVG or PDF in; one Artwork Version per page out, made of the
 * original as imported, a display texture and a sidecar (see `sidecar.ts`).
 * Main process only, with no IPC of its own: the channels are package C1.9
 * and the review screen is C1.10.
 *
 * Two steps, so the review can ask its questions between them:
 *
 * 1. `inspectArtwork` reads a file without storing anything: its format,
 *    pages, pixel sizes, any trustworthy physical size and color space, and
 *    what the user must choose (a size, and which pages).
 * 2. `importArtwork` takes those choices, renders each display texture with
 *    `sharp` (rasterized for vectors, converted to sRGB for CMYK and
 *    ICC-tagged images, downsized to the surface's cap, never enlarged) and
 *    adds each page as a Version to the local Library.
 *
 * `groupByAspect` gives the size step one question per distinct aspect when
 * several files are imported together.
 */
// cspell:words rasterizing EXIF Colourspace
import path from "node:path";
import type { Sharp, SharpOptions } from "sharp";
import {
    ASPECT_TOLERANCE,
    catalogSizesForAspect,
    displaySize,
    formatFeetInches,
    nativeDpi,
    pixelAspectTolerance,
    sameAspect,
    toMeters,
    type ArtworkSurface,
    type AspectSizeChip,
    type Length,
    type PixelSize,
} from "../../../src/view3d/core/sizes";
import type {
    AddVersionOutcome,
    LibraryStore,
    LicenseInput,
} from "../library/store";
import type { LibraryItem, LibraryVersion } from "../library/types";
import {
    readSvgPage,
    sniffArtworkFormat,
    trustedPngSize,
    type ArtworkFormat,
} from "./formats";
import type { PdfDocument, PdfRenderer } from "./pdf";
import {
    ARTWORK_PARTS,
    ARTWORK_SIDECAR_VERSION,
    encodeArtworkSidecar,
    type ArtworkSidecar,
    type ArtworkSizeSource,
    type ImportNote,
} from "./sidecar";

/**
 * Inputs larger than this many pixels are refused. A minimum-DPI print of
 * the largest WGI floor (78 × 106 ft at 30 DPI) is about 1.07 gigapixels.
 */
export const MAX_INPUT_PIXELS = 1_500_000_000;

/** JPEG quality for opaque display textures. */
const DISPLAY_JPEG_QUALITY = 90;

/** sharp caps rasterizing density at 100000 DPI. */
const MAX_SVG_DENSITY = 100_000;

export interface ArtworkFile {
    /** The file's name as picked, for naming and re-import matching. */
    readonly filename: string;
    readonly bytes: Uint8Array;
}

export interface ArtworkPipelineOptions {
    /**
     * Renders PDF pages: `createElectronPdfRenderer()` in the app. PDFs are
     * refused with `pdf-unavailable` while this is left out.
     */
    readonly pdfRenderer?: PdfRenderer | null;
}

/** Options for `inspectArtwork` and `importArtwork`. */
export interface ArtworkRunOptions extends ArtworkPipelineOptions {
    /**
     * Checked before the file is read, after it's opened and before each
     * page; aborting also closes an open PDF document, which destroys its
     * hidden window. A `sharp` call in flight finishes and its result is
     * discarded. Pass one signal to every file of a multi-select, so a
     * cancel also stops between files. Rejects with `ArtworkImportCancelled`.
     */
    readonly signal?: AbortSignal;
    /**
     * Called with `(0, total)` once the file is open, then after each page
     * (imported or not). `total` is the pages being imported, or 1 for an
     * inspection.
     */
    readonly onProgress?: (done: number, total: number) => void;
}

/**
 * The rejection for an aborted `signal`. `report` is what `importArtwork`
 * had already stored (those Versions stay in the Library); null for an
 * inspection or a preview.
 */
export class ArtworkImportCancelled extends Error {
    readonly code = "cancelled" as const;
    readonly filename: string;
    readonly report: ArtworkImportReport | null;

    constructor(filename: string, report: ArtworkImportReport | null = null) {
        super(`Importing ${filename} was cancelled.`);
        this.name = "ArtworkImportCancelled";
        this.filename = filename;
        this.report = report;
    }
}

export function isArtworkImportCancelled(
    error: unknown,
): error is ArtworkImportCancelled {
    return error instanceof ArtworkImportCancelled;
}

/** Where a trustworthy physical size came from (props-spec.md §3). */
export type FileSizeSource = "png-phys" | "svg-page" | "pdf-page";

export interface ArtworkPage {
    /** 0-based. */
    readonly index: number;
    readonly vector: boolean;
    /** Pixel size after EXIF orientation; null for vector pages. */
    readonly pixels: PixelSize | null;
    /** width ÷ height. */
    readonly aspect: number;
    /** A physical size from trustworthy metadata, else null (ask the user). */
    readonly fileSize: {
        readonly width: Length;
        readonly height: Length;
        readonly from: FileSizeSource;
    } | null;
}

export type ArtworkInspection =
    | {
          readonly ok: true;
          readonly filename: string;
          readonly format: ArtworkFormat;
          readonly pages: readonly ArtworkPage[];
          /** The original's color space as read, such as `srgb` or `cmyk`. */
          readonly colorSpace: string;
          /** Pre-selected questions: a size without trustworthy metadata, pages. */
          readonly notes: readonly ImportNote[];
      }
    | {
          readonly ok: false;
          readonly filename: string;
          readonly format: ArtworkFormat | null;
          readonly notes: readonly ImportNote[];
      };

/** A size the user or a picker chose. Width and height follow the image. */
export interface ArtworkSizeChoice {
    readonly width: Length;
    readonly height: Length;
    readonly source: Exclude<ArtworkSizeSource, "file">;
    /** The template or catalog entry, such as `silk-6ft-36x54`. */
    readonly templateId?: string | null;
}

/** A chosen size, or "file" for the page's trustworthy metadata. */
export type ArtworkSizeInput = ArtworkSizeChoice | "file";

export interface ArtworkImportRequest {
    readonly file: ArtworkFile;
    /** The surface kind sets the display cap and the DPI thresholds. */
    readonly surface: ArtworkSurface;
    /** 0-based pages to import, one Artwork each. Defaults to every page. */
    readonly pages?: readonly number[];
    /**
     * The size for every page without its own `pageSizes` entry. Left out, a
     * page with a trustworthy size uses it; a page without one isn't imported
     * and the report asks for a size.
     */
    readonly size?: ArtworkSizeInput;
    readonly pageSizes?: Readonly<Record<number, ArtworkSizeInput>>;
    /** Defaults to the filename without its extension, plus "(page N)". */
    readonly name?: string;
    readonly tags?: readonly string[];
    readonly license?: LicenseInput;
    /**
     * Add the Version to this item ("New version of …"). Only for a
     * single-page import.
     */
    readonly itemId?: string;
}

export interface ArtworkImportedPage {
    readonly page: number;
    /** `existing` when these bytes, size and page were already in the Library. */
    readonly outcome: AddVersionOutcome;
    readonly item: LibraryItem;
    readonly version: LibraryVersion;
    readonly sidecar: ArtworkSidecar;
}

export interface ArtworkImportReport {
    readonly filename: string;
    readonly format: ArtworkFormat | null;
    readonly imported: readonly ArtworkImportedPage[];
    /** `page` is null when the whole file was refused. */
    readonly notImported: readonly {
        readonly page: number | null;
        readonly notes: readonly ImportNote[];
    }[];
}

type SharpFactory = (input?: Uint8Array, options?: SharpOptions) => Sharp;

let sharpModule: Promise<SharpFactory> | null = null;

/** Loads sharp on first use, so main starts without the native module. */
function loadSharp(): Promise<SharpFactory> {
    sharpModule ??= import("sharp").then(
        (m) => m.default as unknown as SharpFactory,
    );
    return sharpModule;
}

function note(
    group: ImportNote["group"],
    code: string,
    message: string,
): ImportNote {
    return { group, code, message };
}

const FORMAT_NAMES: Record<ArtworkFormat, string> = {
    png: "PNG",
    jpeg: "JPEG",
    svg: "SVG",
    pdf: "PDF",
};

/** What a probe keeps between inspecting and rendering. */
interface Probe {
    readonly inspection: ArtworkInspection & { ok: true };
    /** Renders page `index` at exactly `size`, as an un-encoded sharp pipeline. */
    render(index: number, size: PixelSize): Promise<Sharp>;
    close(): Promise<void>;
}

type ProbeResult =
    | { ok: true; probe: Probe }
    | { ok: false; inspection: ArtworkInspection & { ok: false } };

function refused(
    file: ArtworkFile,
    format: ArtworkFormat | null,
    code: string,
    message: string,
): ProbeResult {
    return {
        ok: false,
        inspection: {
            ok: false,
            filename: file.filename,
            format,
            notes: [note("cant-import", code, message)],
        },
    };
}

const noSuchPage = (index: number): ImportNote =>
    note("cant-import", "no-such-page", `This file has no page ${index + 1}.`);

/** A page whose header read but whose pixels didn't, such as a cut-off PNG. */
const unreadablePage = (pageCount: number, error: unknown): ImportNote =>
    note(
        "cant-import",
        "unreadable",
        `${pageCount > 1 ? "This page" : "This file"} can't be read: ${errorText(error)}`,
    );

function inspectionNotes(pages: readonly ArtworkPage[]): ImportNote[] {
    const notes: ImportNote[] = [];
    if (pages.length > 1) {
        notes.push(
            note(
                "needs-choice",
                "pages",
                `This file has ${pages.length} pages. Each page you pick becomes its own Artwork.`,
            ),
        );
    }
    for (const page of pages) {
        if (!page.fileSize) {
            notes.push(
                note(
                    "needs-choice",
                    "size",
                    pages.length > 1
                        ? `Page ${page.index + 1} doesn't say how big it prints. Choose its size.`
                        : "This file doesn't say how big it prints. Choose its size.",
                ),
            );
        }
    }
    return notes;
}

async function probeRaster(
    file: ArtworkFile,
    format: "png" | "jpeg",
): Promise<ProbeResult> {
    const sharp = await loadSharp();
    const options: SharpOptions = { limitInputPixels: MAX_INPUT_PIXELS };
    let meta;
    try {
        meta = await sharp(file.bytes, options).metadata();
    } catch (error) {
        return refused(
            file,
            format,
            "unreadable",
            `This ${FORMAT_NAMES[format]} can't be read: ${errorText(error)}`,
        );
    }
    const oriented = meta.autoOrient ?? {
        width: meta.width,
        height: meta.height,
    };
    if (!oriented.width || !oriented.height) {
        return refused(file, format, "unreadable", "This image has no size.");
    }
    if (oriented.width * oriented.height > MAX_INPUT_PIXELS) {
        return refused(
            file,
            format,
            "too-large",
            `This image is ${oriented.width} × ${oriented.height} pixels, more than the ${MAX_INPUT_PIXELS / 1e9} gigapixels import can read.`,
        );
    }
    const pixels = { width: oriented.width, height: oriented.height };
    const trusted =
        format === "png" ? trustedPngSize(file.bytes, pixels) : null;
    const page: ArtworkPage = {
        index: 0,
        vector: false,
        pixels,
        aspect: pixels.width / pixels.height,
        fileSize: trusted
            ? {
                  width: { m: trusted.widthM },
                  height: { m: trusted.heightM },
                  from: "png-phys",
              }
            : null,
    };
    return {
        ok: true,
        probe: {
            inspection: {
                ok: true,
                filename: file.filename,
                format,
                pages: [page],
                colorSpace: meta.space ?? "srgb",
                notes: inspectionNotes([page]),
            },
            async render(_index, size) {
                const image = sharp(file.bytes, options).autoOrient();
                return size.width === pixels.width &&
                    size.height === pixels.height
                    ? image
                    : image.resize(size.width, size.height, { fit: "fill" });
            },
            async close() {},
        },
    };
}

async function probeSvg(file: ArtworkFile): Promise<ProbeResult> {
    const sharp = await loadSharp();
    const svgPage = readSvgPage(file.bytes);
    let meta;
    try {
        meta = await sharp(file.bytes).metadata();
    } catch (error) {
        return refused(
            file,
            "svg",
            "unreadable",
            `This SVG can't be read: ${errorText(error)}`,
        );
    }
    if (!meta.width || !meta.height) {
        return refused(file, "svg", "unreadable", "This SVG has no size.");
    }
    // sharp measures an SVG at 72 DPI.
    const at72 = { width: meta.width, height: meta.height };
    const aspect = svgPage?.aspect ?? at72.width / at72.height;
    const page: ArtworkPage = {
        index: 0,
        vector: true,
        pixels: null,
        aspect,
        fileSize: svgPage?.size ? { ...svgPage.size, from: "svg-page" } : null,
    };
    return {
        ok: true,
        probe: {
            inspection: {
                ok: true,
                filename: file.filename,
                format: "svg",
                pages: [page],
                colorSpace: "srgb",
                notes: inspectionNotes([page]),
            },
            async render(_index, size) {
                const scale = Math.max(
                    size.width / at72.width,
                    size.height / at72.height,
                );
                const density = Math.min(MAX_SVG_DENSITY, 72 * scale);
                return sharp(file.bytes, { density }).resize(
                    size.width,
                    size.height,
                    { fit: "fill" },
                );
            },
            async close() {},
        },
    };
}

async function probePdf(
    file: ArtworkFile,
    renderer: PdfRenderer | null | undefined,
): Promise<ProbeResult> {
    if (!renderer) {
        return refused(
            file,
            "pdf",
            "pdf-unavailable",
            "PDF artwork can't be imported in this version. Export it as SVG or PNG and import that.",
        );
    }
    const sharp = await loadSharp();
    let doc: PdfDocument;
    try {
        doc = await renderer.open(file.bytes);
    } catch (error) {
        return refused(
            file,
            "pdf",
            "unreadable",
            `This PDF can't be read: ${errorText(error)}`,
        );
    }
    if (doc.pages.length === 0) {
        await doc.close?.();
        return refused(file, "pdf", "unreadable", "This PDF has no pages.");
    }
    const pages: ArtworkPage[] = doc.pages.map((p, index) => ({
        index,
        vector: true,
        pixels: null,
        aspect: p.widthPt / p.heightPt,
        fileSize: {
            width: { m: toMeters(p.widthPt / 72, "in") },
            height: { m: toMeters(p.heightPt / 72, "in") },
            from: "pdf-page",
        },
    }));
    return {
        ok: true,
        probe: {
            inspection: {
                ok: true,
                filename: file.filename,
                format: "pdf",
                pages,
                colorSpace: "srgb",
                notes: inspectionNotes(pages),
            },
            async render(index, size) {
                const rendered = await doc.renderPage(index, size);
                return sharp(rendered).resize(size.width, size.height, {
                    fit: "fill",
                });
            },
            async close() {
                await doc.close?.();
            },
        },
    };
}

async function probe(
    file: ArtworkFile,
    options: ArtworkPipelineOptions,
): Promise<ProbeResult> {
    const format = sniffArtworkFormat(file.bytes);
    switch (format) {
        case "png":
        case "jpeg":
            return probeRaster(file, format);
        case "svg":
            return probeSvg(file);
        case "pdf":
            return probePdf(file, options.pdfRenderer);
        case null:
            return refused(
                file,
                null,
                "unsupported-format",
                "Artwork must be a PNG, JPEG, SVG or PDF file.",
            );
    }
}

/** Throws `ArtworkImportCancelled` once `signal` is aborted. */
function checkCancelled(
    file: ArtworkFile,
    signal: AbortSignal | undefined,
    report: () => ArtworkImportReport | null = () => null,
): void {
    if (signal?.aborted)
        throw new ArtworkImportCancelled(file.filename, report());
}

/**
 * Opens a probe, closing it (once) when `signal` aborts so an open PDF's
 * window goes at once. `release` removes the listener and closes the probe.
 */
async function openProbe(
    file: ArtworkFile,
    options: ArtworkPipelineOptions,
    signal: AbortSignal | undefined,
): Promise<
    | { ok: true; probe: Probe; release: () => Promise<void> }
    | { ok: false; inspection: ArtworkInspection & { ok: false } }
> {
    checkCancelled(file, signal);
    const result = await probe(file, options);
    if (!result.ok) return result;
    let closing: Promise<void> | null = null;
    const close = () => (closing ??= result.probe.close());
    const onAbort = () => void close().catch(() => {});
    signal?.addEventListener("abort", onAbort, { once: true });
    const release = async () => {
        signal?.removeEventListener("abort", onAbort);
        await close();
    };
    if (signal?.aborted) {
        await release();
        checkCancelled(file, signal);
    }
    return { ok: true, probe: result.probe, release };
}

/** Reads a file for the review, storing nothing. */
export async function inspectArtwork(
    file: ArtworkFile,
    options: ArtworkRunOptions = {},
): Promise<ArtworkInspection> {
    const { signal, onProgress } = options;
    const opened = await openProbe(file, options, signal);
    if (!opened.ok) return opened.inspection;
    onProgress?.(0, 1);
    await opened.release();
    checkCancelled(file, signal);
    onProgress?.(1, 1);
    return opened.probe.inspection;
}

/** A preview raster: PNG bytes in sRGB and their pixel size. */
export type ArtworkPreview =
    | {
          readonly ok: true;
          readonly filename: string;
          readonly page: number;
          readonly png: Uint8Array;
          readonly width: number;
          readonly height: number;
      }
    | {
          readonly ok: false;
          readonly filename: string;
          readonly page: number;
          readonly notes: readonly ImportNote[];
      };

/**
 * The pixel size of a preview: the longest edge at `maxPx`, the page's
 * shape kept. Rasters are never enlarged.
 */
export function artworkPreviewSize(
    page: ArtworkPage,
    maxPx: number,
): PixelSize {
    const fit = (width: number, height: number, enlarge: boolean) => {
        const scale = maxPx / Math.max(width, height);
        const s = enlarge ? scale : Math.min(1, scale);
        const side = (v: number) =>
            Math.min(maxPx, Math.max(1, Math.round(v * s)));
        return { width: side(width), height: side(height) };
    };
    return page.pixels
        ? fit(page.pixels.width, page.pixels.height, false)
        : fit(page.aspect, 1, true);
}

/**
 * Renders one page (0-based) of a file as a PNG preview for the review
 * screen and page picker (C1.9 Q51; 256 and 1024 px in the app), with the
 * display texture's path: sharp for PNG, JPEG and SVG, the PDF renderer for
 * PDF, converted to sRGB. Stores nothing. A file or page that can't be read
 * comes back as notes, like an inspection.
 */
export async function renderArtworkPreview(
    file: ArtworkFile,
    page: number,
    maxPx: number,
    options: ArtworkPipelineOptions & { readonly signal?: AbortSignal } = {},
): Promise<ArtworkPreview> {
    if (!Number.isInteger(maxPx) || maxPx < 1) {
        throw new Error("renderArtworkPreview: maxPx must be whole pixels");
    }
    const { signal } = options;
    const opened = await openProbe(file, options, signal);
    if (!opened.ok) {
        return {
            ok: false,
            filename: file.filename,
            page,
            notes: opened.inspection.notes,
        };
    }
    try {
        const info = opened.probe.inspection.pages[page];
        if (!info) {
            return {
                ok: false,
                filename: file.filename,
                page,
                notes: [noSuchPage(page)],
            };
        }
        const size = artworkPreviewSize(info, maxPx);
        let png: Buffer;
        try {
            png = await (await opened.probe.render(info.index, size))
                .toColourspace("srgb")
                .png()
                .toBuffer();
        } catch (error) {
            checkCancelled(file, signal);
            return {
                ok: false,
                filename: file.filename,
                page: info.index,
                notes: [
                    unreadablePage(opened.probe.inspection.pages.length, error),
                ],
            };
        }
        checkCancelled(file, signal);
        return {
            ok: true,
            filename: file.filename,
            page: info.index,
            png: new Uint8Array(png),
            width: size.width,
            height: size.height,
        };
    } finally {
        await opened.release();
    }
}

/** `36 in`, `1.5 m`: a size for messages. */
function describeSize(width: Length, height: Length): string {
    const side = (l: Length) => l.typed ?? formatFeetInches(l.m);
    return `${side(width)} × ${side(height)}`;
}

interface ResolvedSize {
    readonly width: Length;
    readonly height: Length;
    readonly source: ArtworkSizeSource;
    readonly templateId: string | null;
}

type SizeResult =
    | ({ ok: true } & ResolvedSize)
    | { ok: false; note: ImportNote };

const askSize = (code: string, message: string): SizeResult => ({
    ok: false,
    note: note("needs-choice", code, message),
});

function resolveSize(
    page: ArtworkPage,
    input: ArtworkSizeInput | undefined,
): SizeResult {
    const chosen = input ?? (page.fileSize ? "file" : undefined);
    if (chosen === undefined) {
        return askSize("size", "Choose how big this Artwork prints.");
    }
    if (chosen === "file") {
        if (!page.fileSize) {
            return askSize(
                "size",
                "This file doesn't say how big it prints. Choose its size.",
            );
        }
        return {
            ok: true,
            width: page.fileSize.width,
            height: page.fileSize.height,
            source: "file",
            templateId: null,
        };
    }
    const { width, height } = chosen;
    const positive = (l: Length) => l.m > 0 && Number.isFinite(l.m);
    if (!positive(width) || !positive(height)) {
        return askSize("size", "A size must be larger than zero.");
    }
    const tolerance = page.pixels
        ? pixelAspectTolerance(page.pixels)
        : ASPECT_TOLERANCE;
    if (!sameAspect(width.m / height.m, page.aspect, tolerance)) {
        return askSize(
            "size-aspect",
            `${describeSize(width, height)} has a different shape from the artwork. Artwork is never stretched, so choose a size with its shape.`,
        );
    }
    return {
        ok: true,
        width,
        height,
        source: chosen.source,
        templateId: chosen.templateId ?? null,
    };
}

function baseName(filename: string): string {
    const base = path.basename(filename);
    const ext = path.extname(base);
    return (ext ? base.slice(0, -ext.length) : base) || base;
}

/**
 * Imports the chosen pages of a file into the local Library, one Artwork
 * Version each. Nothing is stored for a file or page the report lists under
 * `notImported`.
 */
export async function importArtwork(
    store: LibraryStore,
    request: ArtworkImportRequest,
    options: ArtworkRunOptions = {},
): Promise<ArtworkImportReport> {
    const { file } = request;
    const { signal, onProgress } = options;
    const result = await openProbe(file, options, signal);
    if (!result.ok) {
        return {
            filename: file.filename,
            format: result.inspection.format,
            imported: [],
            notImported: [{ page: null, notes: result.inspection.notes }],
        };
    }
    const { probe: probed } = result;
    const { inspection } = probed;
    const imported: ArtworkImportedPage[] = [];
    const notImported: { page: number | null; notes: ImportNote[] }[] = [];
    const soFar = (): ArtworkImportReport => ({
        filename: file.filename,
        format: inspection.format,
        imported: [...imported],
        notImported: [...notImported],
    });
    try {
        const chosen = request.pages ?? inspection.pages.map((p) => p.index);
        if (request.itemId !== undefined && chosen.length > 1) {
            throw new Error(
                "importArtwork: itemId adds one Version, so import one page at a time",
            );
        }
        const unique = [...new Set(chosen)];
        onProgress?.(0, unique.length);
        for (const [done, index] of unique.entries()) {
            if (done > 0) onProgress?.(done, unique.length);
            checkCancelled(file, signal, soFar);
            const page = inspection.pages[index];
            if (!page) {
                notImported.push({ page: index, notes: [noSuchPage(index)] });
                continue;
            }
            const size = resolveSize(
                page,
                request.pageSizes?.[index] ?? request.size,
            );
            if (!size.ok) {
                notImported.push({ page: index, notes: [size.note] });
                continue;
            }
            const added = await importPage(
                store,
                request,
                probed,
                page,
                size,
                signal,
            );
            if (added.ok) imported.push(added.page);
            else notImported.push({ page: index, notes: [added.note] });
        }
        onProgress?.(unique.length, unique.length);
        return soFar();
    } catch (error) {
        if (signal?.aborted) {
            throw isArtworkImportCancelled(error) && error.report
                ? error
                : new ArtworkImportCancelled(file.filename, soFar());
        }
        throw error;
    } finally {
        await result.release();
    }
}

/** "Fixed for you" notes about the display texture. */
function displayNotes(
    page: ArtworkPage,
    target: PixelSize,
    colorSpace: string,
): ImportNote[] {
    const notes: ImportNote[] = [];
    const size = `${target.width} × ${target.height}`;
    if (page.vector) {
        notes.push(
            note(
                "fixed",
                "display-rasterized",
                `Rasterized at ${size} for display. The original stays vector and prints at any size.`,
            ),
        );
    } else if (
        page.pixels &&
        (target.width < page.pixels.width || target.height < page.pixels.height)
    ) {
        notes.push(
            note(
                "fixed",
                "display-downsized",
                `Downsized to ${size} for display. The original ${page.pixels.width} × ${page.pixels.height} is kept for print.`,
            ),
        );
    }
    if (colorSpace === "cmyk") {
        notes.push(
            note(
                "fixed",
                "converted-from-cmyk",
                "Converted from CMYK for display; colors may differ.",
            ),
        );
    }
    return notes;
}

/**
 * The display texture in sRGB: PNG when it can be transparent (vectors,
 * images with alpha), else JPEG. sharp drops all metadata on output. A page
 * that won't decode, such as a cut-off PNG, comes back as its error so the
 * other pages still import.
 */
async function renderDisplay(
    probed: Probe,
    page: ArtworkPage,
    target: PixelSize,
    signal: AbortSignal | undefined,
): Promise<
    | { ok: true; bytes: Uint8Array; format: "png" | "jpeg" }
    | { ok: false; error: unknown }
> {
    let result;
    try {
        result = await encodeDisplay(probed, page, target);
    } catch (error) {
        signal?.throwIfAborted();
        return { ok: false, error };
    }
    // A render in flight finishes; once cancelled, its result isn't stored
    // (`importArtwork` turns the abort into `ArtworkImportCancelled`).
    signal?.throwIfAborted();
    return { ok: true, ...result };
}

async function encodeDisplay(
    probed: Probe,
    page: ArtworkPage,
    target: PixelSize,
): Promise<{ bytes: Uint8Array; format: "png" | "jpeg" }> {
    const image = (await probed.render(page.index, target)).toColourspace(
        "srgb",
    );
    const { hasAlpha } = await image.clone().metadata();
    if (page.vector || hasAlpha === true) {
        return {
            bytes: new Uint8Array(await image.png().toBuffer()),
            format: "png",
        };
    }
    const jpeg = await image.jpeg({ quality: DISPLAY_JPEG_QUALITY }).toBuffer();
    return { bytes: new Uint8Array(jpeg), format: "jpeg" };
}

/**
 * Vectors render at the cap in the physical size's shape; rasters keep
 * their pixels, downsized to fit the cap, never enlarged.
 */
function displayTarget(
    surface: ArtworkSurface,
    page: ArtworkPage,
    size: ResolvedSize,
): PixelSize {
    return page.pixels
        ? displaySize(surface, page.pixels)
        : displaySize(
              surface,
              { width: size.width.m, height: size.height.m },
              { enlarge: true },
          );
}

async function importPage(
    store: LibraryStore,
    request: ArtworkImportRequest,
    probed: Probe,
    page: ArtworkPage,
    size: ResolvedSize,
    signal: AbortSignal | undefined,
): Promise<
    { ok: true; page: ArtworkImportedPage } | { ok: false; note: ImportNote }
> {
    const { file, surface } = request;
    const { inspection } = probed;
    const pageCount = inspection.pages.length;

    const target = displayTarget(surface, page, size);
    const display = await renderDisplay(probed, page, target, signal);
    if (!display.ok) {
        return { ok: false, note: unreadablePage(pageCount, display.error) };
    }

    const dpi = page.pixels
        ? nativeDpi(page.pixels.width, size.width.m)
        : "vector";

    const sidecar: ArtworkSidecar = {
        schemaVersion: ARTWORK_SIDECAR_VERSION,
        type: "openmarch-artwork",
        surface,
        original: {
            format: inspection.format,
            page:
                inspection.format === "pdf"
                    ? { index: page.index, count: pageCount }
                    : null,
            pixels: page.pixels
                ? { width: page.pixels.width, height: page.pixels.height }
                : null,
            colorSpace: inspection.colorSpace,
        },
        size: {
            width: size.width,
            height: size.height,
            source: size.source,
            templateId: size.templateId,
        },
        nativeDpi: dpi,
        display: {
            width: target.width,
            height: target.height,
            format: display.format,
        },
        importNotes: displayNotes(page, target, inspection.colorSpace),
        // No print-readiness check (Q75): nothing writes a badge today.
        badges: [],
    };

    const name =
        (request.name ?? baseName(file.filename)) +
        (pageCount > 1 ? ` (page ${page.index + 1})` : "");
    const added = await store.addVersion({
        itemId: request.itemId,
        kind: "artwork",
        name,
        tags: request.tags,
        originalFilename: file.filename,
        license: request.license,
        parts: {
            [ARTWORK_PARTS.original]: file.bytes,
            [ARTWORK_PARTS.display]: display.bytes,
            [ARTWORK_PARTS.sidecar]: encodeArtworkSidecar(sidecar),
        },
        source: { filename: file.filename, bytes: file.bytes },
    });
    return {
        ok: true,
        page: {
            page: page.index,
            outcome: added.outcome,
            item: added.item,
            version: added.version,
            sidecar,
        },
    };
}

export interface AspectGroupMember {
    /** Index into the inspections passed to `groupByAspect`. */
    readonly file: number;
    readonly page: number;
}

export interface AspectGroup {
    /** width ÷ height of the group's first member. */
    readonly aspect: number;
    readonly members: readonly AspectGroupMember[];
    /** Pre-selected: the trustworthy size every member shares, else null. */
    readonly fileSize: {
        readonly width: Length;
        readonly height: Length;
    } | null;
    /** Catalog sizes with this aspect, for the size step's chips. */
    readonly chips: readonly AspectSizeChip[];
}

/**
 * One size question per distinct aspect for a multi-select import
 * (props-spec.md §2): pages whose shapes match share a group. Refused files
 * are left out.
 */
export function groupByAspect(
    inspections: readonly ArtworkInspection[],
): AspectGroup[] {
    const groups: {
        aspect: number;
        tolerance: number;
        members: AspectGroupMember[];
        pages: ArtworkPage[];
    }[] = [];
    inspections.forEach((inspection, file) => {
        if (!inspection.ok) return;
        for (const page of inspection.pages) {
            const tolerance = page.pixels
                ? pixelAspectTolerance(page.pixels)
                : ASPECT_TOLERANCE;
            const group = groups.find((g) =>
                sameAspect(
                    g.aspect,
                    page.aspect,
                    Math.max(g.tolerance, tolerance),
                ),
            );
            if (group) {
                group.members.push({ file, page: page.index });
                group.pages.push(page);
            } else {
                groups.push({
                    aspect: page.aspect,
                    tolerance,
                    members: [{ file, page: page.index }],
                    pages: [page],
                });
            }
        }
    });
    return groups.map((g) => {
        const first = g.pages[0].fileSize;
        const shared =
            first &&
            g.pages.every(
                (p) =>
                    p.fileSize &&
                    sameSize(p.fileSize.width, first.width) &&
                    sameSize(p.fileSize.height, first.height),
            );
        return {
            aspect: g.aspect,
            members: g.members,
            fileSize: shared
                ? { width: first.width, height: first.height }
                : null,
            chips: catalogSizesForAspect(g.aspect, g.tolerance),
        };
    });
}

/** Equal to a millionth, which absorbs float noise from unit conversions. */
function sameSize(a: Length, b: Length): boolean {
    return Math.abs(a.m - b.m) <= 1e-6 * Math.max(a.m, b.m);
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
