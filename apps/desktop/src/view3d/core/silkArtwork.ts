// cspell:words IHDR
/**
 * Imported silk Artwork (fork #973): what an import must be, and where the
 * painted silk lies in the image. A painter starts from the shape's
 * template (`artworkTemplates`), whose page is the trim plus a ⅛ in bleed
 * on every side, and may hand back the whole page or only the trim; the
 * image's proportions say which.
 *
 * Plain TypeScript and zod only: this module lives under `view3d/core/`, so
 * it must not import React, React Three Fiber, drei, Electron or the
 * database.
 */
import * as z from "zod";
import type { TemplateSurface } from "./artworkTemplates/surfaces";
import { FIXED_BLEED } from "./artworkTemplates/surfaces";

/**
 * The largest PNG a show stores. An import is first brought down to
 * `SILK_ARTWORK_MAX_PX`, so this only turns away a 4096 px image that
 * compresses badly (photographic noise); kept small, too, because replacing
 * or removing the Artwork copies it into the undo history.
 */
export const SILK_ARTWORK_MAX_BYTES = 32 * 1024 * 1024;

/**
 * The longest edge a silk texture gets, and so the longest the show stores:
 * a larger import is scaled down to it first.
 */
export const SILK_ARTWORK_MAX_PX = 4096;

/** The largest PNG file an import reads (props-spec section 2's artwork limit). */
export const SILK_ARTWORK_MAX_FILE_BYTES = 300 * 1024 * 1024;

/**
 * The most pixels an import decodes. A full-size painted template is far
 * under it (the largest silk's PNG template, at 150 DPI, is about 170 million).
 */
export const SILK_ARTWORK_MAX_PIXELS = 400_000_000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Whether bytes start like a PNG file. */
export function isPng(data: Uint8Array): boolean {
    return PNG_SIGNATURE.every((b, i) => data[i] === b);
}

/**
 * A PNG's size in pixels, from its header (the IHDR chunk right after the
 * signature), or null when the bytes don't start like a PNG with one.
 */
export function pngSize(
    data: Uint8Array,
): { width: number; height: number } | null {
    if (data.length < 24 || !isPng(data)) return null;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const chunk = String.fromCharCode(...data.subarray(12, 16));
    if (chunk !== "IHDR") return null;
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * An Artwork import, as the 3D window sends it to the editor: a PNG of at
 * most `SILK_ARTWORK_MAX_PX` on its longest edge, whose stated size is its
 * header's.
 */
export const silkArtworkImportSchema = z
    .object({
        name: z.string().min(1).max(200),
        data: z
            .instanceof(Uint8Array)
            .refine((d) => d.length <= SILK_ARTWORK_MAX_BYTES, "PNG too large")
            .refine(isPng, "Not a PNG file"),
        width: z.number().int().positive().max(SILK_ARTWORK_MAX_PX),
        height: z.number().int().positive().max(SILK_ARTWORK_MAX_PX),
    })
    .refine((a) => {
        const size = pngSize(a.data);
        return size?.width === a.width && size.height === a.height;
    }, "Size doesn't match the PNG");

export type SilkArtworkImport = z.infer<typeof silkArtworkImportSchema>;

/** The trim's rectangle in the image, in fractions of its width and height. */
export interface ArtworkRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const WHOLE: ArtworkRect = { x: 0, y: 0, width: 1, height: 1 };

/** How far an image's proportions may stray from a page's and still be one (0.3%). */
const PAGE_ASPECT_TOLERANCE = 0.003;

/**
 * Where a silk's trim lies in an image `width` × `height`: inside the
 * bleed when the image has the template page's proportions, else the
 * whole image (painted to the trim, or to any size: it is stretched).
 */
export function silkArtworkTrimRect(
    width: number,
    height: number,
    surface: TemplateSurface,
): ArtworkRect {
    const bleed = (FIXED_BLEED[surface.process] ?? { m: 0 }).m;
    const trimW = surface.width.m;
    const trimH = surface.height.m;
    if (!(bleed > 0) || !(width > 0 && height > 0)) return WHOLE;
    const pageW = trimW + 2 * bleed;
    const pageH = trimH + 2 * bleed;
    const aspect = width / height;
    const offPage = Math.abs(Math.log(aspect / (pageW / pageH)));
    const offTrim = Math.abs(Math.log(aspect / (trimW / trimH)));
    // the page's proportions, to within the pixels' rounding, and nearer
    // them than the trim's: the bleed is in it
    if (!(offPage < PAGE_ASPECT_TOLERANCE && offPage < offTrim)) return WHOLE;
    return {
        x: bleed / pageW,
        y: bleed / pageH,
        width: trimW / pageW,
        height: trimH / pageH,
    };
}
