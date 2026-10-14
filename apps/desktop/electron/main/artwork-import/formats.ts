/**
 * Reading Artwork files without decoding them: the format from magic bytes
 * (never the extension), a PNG's pHYs chunk and an SVG's page size.
 */
// cspell:words IDAT IEND unitless
import {
    lengthOf,
    toMeters,
    type Length,
} from "../../../src/view3d/core/sizes";

/** The Artwork formats import accepts (props-spec.md §2, "Artwork images"). */
export type ArtworkFormat = "png" | "jpeg" | "svg" | "pdf";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
    return (
        bytes.length >= prefix.length &&
        prefix.every((byte, i) => bytes[i] === byte)
    );
}

/** The leading text of a file, for the text formats. */
function head(bytes: Uint8Array, length = 4096): string {
    return new TextDecoder("utf-8", { fatal: false }).decode(
        bytes.subarray(0, length),
    );
}

/**
 * The SVG root element's open tag: the first `<svg` after an optional BOM,
 * XML declaration, doctype, comments and processing instructions.
 */
function svgRootTag(bytes: Uint8Array): string | null {
    const text = head(bytes, 64 * 1024).replace(/^\uFEFF/, "");
    const prolog =
        /^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>)*/i;
    const rest = text.slice(prolog.exec(text)?.[0].length ?? 0);
    const match = /^<svg\b[^>]*>/.exec(rest);
    return match ? match[0] : null;
}

/** The format of some bytes, or null for anything import doesn't accept. */
export function sniffArtworkFormat(bytes: Uint8Array): ArtworkFormat | null {
    if (startsWith(bytes, PNG_SIGNATURE)) return "png";
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
    // A PDF header may follow up to 1 KiB of junk (ISO 32000-1 §7.5.2 notes).
    if (head(bytes, 1024).includes("%PDF-")) return "pdf";
    if (svgRootTag(bytes)) return "svg";
    return null;
}

export interface PngPhysicalDensity {
    /** Pixels per meter along x and y. */
    readonly x: number;
    readonly y: number;
}

/**
 * A PNG's pHYs chunk in pixels per meter, or null when there is none or it
 * only gives an aspect ratio (unit 0).
 */
export function readPngPhys(bytes: Uint8Array): PngPhysicalDensity | null {
    if (!startsWith(bytes, PNG_SIGNATURE)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = PNG_SIGNATURE.length;
    while (offset + 8 <= bytes.length) {
        const length = view.getUint32(offset);
        const type = String.fromCharCode(
            ...bytes.subarray(offset + 4, offset + 8),
        );
        const data = offset + 8;
        if (type === "pHYs" && length === 9 && data + 9 <= bytes.length) {
            const unit = bytes[data + 8];
            if (unit !== 1) return null;
            return { x: view.getUint32(data), y: view.getUint32(data + 4) };
        }
        // pHYs must come before the image data.
        if (type === "IDAT" || type === "IEND") return null;
        offset = data + length + 4;
    }
    return null;
}

/** DPI values that image tools write by default, so they say nothing. */
const DEFAULT_DENSITIES = [72, 96];

/**
 * A PNG's physical size from pHYs, when it can be trusted: square pixels in
 * meters, at a density other than 72 or 96 DPI (props-spec.md §3).
 */
export function trustedPngSize(
    bytes: Uint8Array,
    pixels: { width: number; height: number },
): { widthM: number; heightM: number; dpi: number } | null {
    const phys = readPngPhys(bytes);
    if (!phys || phys.x <= 0 || phys.x !== phys.y) return null;
    const dpi = phys.x * 0.0254;
    // pHYs stores whole pixels per meter: 72 DPI is written as 2835 px/m.
    if (DEFAULT_DENSITIES.some((d) => Math.abs(dpi - d) < 0.5)) return null;
    return {
        widthM: pixels.width / phys.x,
        heightM: pixels.height / phys.y,
        dpi,
    };
}

function attribute(tag: string, name: string): string | null {
    const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(
        tag,
    );
    return match ? (match[2] ?? match[3]).trim() : null;
}

/** CSS absolute units that name a physical size. `px` and unitless don't. */
function physicalLength(value: string | null): Length | null {
    if (!value) return null;
    const match =
        /^([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)\s*(in|cm|mm|pt|pc|q)$/i.exec(
            value,
        );
    if (!match) return null;
    const n = Number(match[1]);
    if (!(n > 0)) return null;
    switch (match[2].toLowerCase()) {
        case "in":
            return lengthOf(n, "in");
        case "cm":
            return lengthOf(n, "cm");
        case "mm":
            return lengthOf(n, "mm");
        case "pt":
            return { m: toMeters(n / 72, "in") };
        case "pc":
            return { m: toMeters(n / 6, "in") };
        default:
            // q: quarter-millimeters
            return { m: toMeters(n / 4, "mm") };
    }
}

function positiveNumber(value: string | null): number | null {
    if (!value) return null;
    const match = /^([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)(px)?$/i.exec(value);
    const n = match ? Number(match[1]) : NaN;
    return n > 0 ? n : null;
}

export interface SvgPage {
    /** The page size when width and height are both in physical units. */
    readonly size: { readonly width: Length; readonly height: Length } | null;
    /** width ÷ height from the size, else the viewBox, else px dimensions. */
    readonly aspect: number | null;
}

/**
 * An SVG's single page. SVG has no pages of its own, so an SVG is always one
 * Artwork; only a size in physical units is trustworthy metadata.
 */
export function readSvgPage(bytes: Uint8Array): SvgPage | null {
    const tag = svgRootTag(bytes);
    if (!tag) return null;
    const width = attribute(tag, "width");
    const height = attribute(tag, "height");
    const physicalW = physicalLength(width);
    const physicalH = physicalLength(height);
    if (physicalW && physicalH) {
        return {
            size: { width: physicalW, height: physicalH },
            aspect: physicalW.m / physicalH.m,
        };
    }
    const viewBox = attribute(tag, "viewBox")
        ?.split(/[\s,]+/)
        .map(Number);
    if (viewBox && viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
        return { size: null, aspect: viewBox[2] / viewBox[3] };
    }
    const pxW = positiveNumber(width);
    const pxH = positiveNumber(height);
    return { size: null, aspect: pxW && pxH ? pxW / pxH : null };
}
