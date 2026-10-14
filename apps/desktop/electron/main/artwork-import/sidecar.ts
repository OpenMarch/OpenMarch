/**
 * The Artwork sidecar: the third part of an Artwork Version, beside the
 * original and the display texture. It holds what makes the Artwork more than
 * its bytes: its physical size, its native DPI, which page of the original it
 * is, and the Import notes. It is part of the Version hash, so changing an
 * Artwork's size makes a new Version, and it contains nothing that varies
 * between runs (no timestamps), so importing the same file the same way
 * gives the same Version.
 */
// cspell:words EXIF
import { z } from "zod";
import { ARTWORK_SURFACES, lengthSchema } from "../../../src/view3d/core/sizes";

/** Part roles of an Artwork Version in the Library store. */
export const ARTWORK_PARTS = {
    /** The file as imported: the print master is rendered from it at export. */
    original: "original",
    /** sRGB PNG or JPEG at the surface's display cap; what the 3D View loads. */
    display: "display",
    /** This module's JSON. */
    sidecar: "sidecar",
} as const;

export const ARTWORK_SIDECAR_VERSION = 1;

/**
 * The report's groups (props-spec.md §2, "The review"). Artwork has no
 * "Fixed for you" choices to undo, but uses the same three groups as models.
 */
export const IMPORT_NOTE_GROUPS = [
    "cant-import",
    "needs-choice",
    "fixed",
] as const;
export type ImportNoteGroup = (typeof IMPORT_NOTE_GROUPS)[number];

export const ImportNoteSchema = z.object({
    group: z.enum(IMPORT_NOTE_GROUPS),
    /** Stable, for code: such as `converted-from-cmyk`. */
    code: z.string().min(1),
    /** For people. */
    message: z.string().min(1),
});
export type ImportNote = z.infer<typeof ImportNoteSchema>;

/**
 * Lasting states shown on the Artwork. Import no longer writes any (the
 * print-readiness check was dropped, owner decision Q75, 2026-10-12);
 * `not-print-ready` stays so sidecars written before still read.
 */
export const ARTWORK_BADGES = ["not-print-ready"] as const;

export const ARTWORK_SIZE_SOURCES = [
    "template",
    "slot",
    "file",
    "user",
] as const;
export type ArtworkSizeSource = (typeof ARTWORK_SIZE_SOURCES)[number];

const pixels = z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
});

export const ArtworkSidecarSchema = z.object({
    schemaVersion: z.literal(ARTWORK_SIDECAR_VERSION),
    type: z.literal("openmarch-artwork"),
    /** The surface kind the display texture was sized for. */
    surface: z.enum(ARTWORK_SURFACES),
    original: z.object({
        format: z.enum(["png", "jpeg", "svg", "pdf"]),
        /** Which page of a paged original this Artwork is; null for one-page formats. */
        page: z
            .object({
                index: z.number().int().nonnegative(),
                count: z.number().int().positive(),
            })
            .nullable(),
        /** Pixel size after EXIF orientation; null for vector originals. */
        pixels: pixels.nullable(),
        /** The original's color space as read, such as `srgb` or `cmyk`. */
        colorSpace: z.string().min(1),
    }),
    /** The physical size, width × height in the image's orientation. */
    size: z.object({
        width: lengthSchema,
        height: lengthSchema,
        source: z.enum(ARTWORK_SIZE_SOURCES),
        /** The template or catalog entry the size came from, if any. */
        templateId: z.string().nullable(),
    }),
    /** Native DPI at that size, or "vector" for vector originals. */
    nativeDpi: z.union([z.number().positive(), z.literal("vector")]),
    display: pixels.extend({ format: z.enum(["png", "jpeg"]) }),
    importNotes: z.array(ImportNoteSchema),
    badges: z.array(z.enum(ARTWORK_BADGES)),
});
export type ArtworkSidecar = z.infer<typeof ArtworkSidecarSchema>;

export function encodeArtworkSidecar(sidecar: ArtworkSidecar): Uint8Array {
    const valid = ArtworkSidecarSchema.parse(sidecar);
    return new TextEncoder().encode(JSON.stringify(valid));
}

export function decodeArtworkSidecar(bytes: Uint8Array): ArtworkSidecar {
    return ArtworkSidecarSchema.parse(
        JSON.parse(new TextDecoder().decode(bytes)),
    );
}
