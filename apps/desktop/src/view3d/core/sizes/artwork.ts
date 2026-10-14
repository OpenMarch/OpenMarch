/**
 * Artwork sizes (docs/3d/props-spec.md §3 "Artwork size and templates" and
 * "Fit", §9 "Display sizes"; ADR 0002 D-16, D-17, D-19). There is no
 * print-readiness check (owner decision Q75, 2026-10-12).
 *
 * The pure arithmetic both the import pipeline (main) and the import review
 * (renderer) need: display caps per surface kind, native and effective DPI,
 * the fill and fit scales, the catalog sizes whose aspect matches an image,
 * and each surface's default size fitted to an image (Q77). Pixels never decide a physical size on their own here: every
 * Artwork's width × height comes from a template, trustworthy metadata or the
 * user.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
import {
    catalogDims,
    catalogEntries,
    defaultCatalogEntry,
    type SourcedLength,
} from "./catalog";
import { lengthOf, METERS_PER_INCH, type Length } from "./units";

/** The surface kinds an Artwork's display texture is sized for. */
export const ARTWORK_SURFACES = [
    "silk",
    "baseFloor",
    "floorProp",
    "propSlot",
    "uniformPart",
] as const;
export type ArtworkSurface = (typeof ARTWORK_SURFACES)[number];

export interface ArtworkSurfaceSpec {
    /**
     * The display texture fits inside `long` × `short` pixels, turned to match
     * the image (props-spec.md §9, ADR 0002 D-17 and D-19). Provisional until
     * the integrated-GPU run.
     */
    readonly displayCap: { readonly long: number; readonly short: number };
}

export const ARTWORK_SURFACE_SPECS: Readonly<
    Record<ArtworkSurface, ArtworkSurfaceSpec>
> = {
    // Silk texture-array layers are 1024 × 1536 at `high`, no 2048 in v1.
    silk: {
        displayCap: { long: 1536, short: 1024 },
    },
    baseFloor: {
        displayCap: { long: 2048, short: 2048 },
    },
    // A Floor prop is a tarp or vinyl laid on the floor: a floor at 1:1.
    floorProp: {
        displayCap: { long: 2048, short: 2048 },
    },
    // Prop Artwork slots (top, front, back) and Equipment textures.
    propSlot: {
        displayCap: { long: 1024, short: 1024 },
    },
    // Uniform part front/back: 1024 on the long edge like prop slots (owner
    // decision Q34, 2026-10-11).
    uniformPart: {
        displayCap: { long: 1024, short: 1024 },
    },
};

export interface PixelSize {
    readonly width: number;
    readonly height: number;
}

/**
 * The display texture's pixel size for an image of `source` pixels (or, for
 * a vector page, any size with its aspect): as large as fits the surface's
 * cap, turned to match the image. Rasters are never enlarged; vectors are
 * rendered at the cap (`enlarge: true`).
 */
export function displaySize(
    surface: ArtworkSurface,
    source: PixelSize,
    options: { enlarge?: boolean } = {},
): PixelSize {
    const { long, short } = ARTWORK_SURFACE_SPECS[surface].displayCap;
    const landscape = source.width >= source.height;
    const capW = landscape ? long : short;
    const capH = landscape ? short : long;
    let scale = Math.min(capW / source.width, capH / source.height);
    if (!options.enlarge) scale = Math.min(scale, 1);
    return {
        width: Math.min(capW, Math.max(1, Math.round(source.width * scale))),
        height: Math.min(capH, Math.max(1, Math.round(source.height * scale))),
    };
}

/** Pixels per inch of a raster `pixelWidth` wide printed `widthM` wide. */
export function nativeDpi(pixelWidth: number, widthM: number): number {
    return pixelWidth / (widthM / METERS_PER_INCH);
}

/** Vector originals report "vector" instead of a DPI. */
export type Dpi = number | "vector";

export type FitMode = "fill" | "fit";

export interface PhysicalSize {
    readonly widthM: number;
    readonly heightM: number;
}

/**
 * The uniform scale that places an Artwork on a slot (props-spec.md §3
 * "Fit"): `fill` covers the slot and crops, `fit` stays inside and pads.
 * Never non-uniform. Equal aspects give the same scale either way, the
 * "scaled N%" case.
 */
export function fitScale(
    artwork: PhysicalSize,
    slot: PhysicalSize,
    mode: FitMode,
): number {
    const sx = slot.widthM / artwork.widthM;
    const sy = slot.heightM / artwork.heightM;
    return mode === "fill" ? Math.max(sx, sy) : Math.min(sx, sy);
}

/** Effective DPI on a slot: native ÷ scale (after crop). Vectors stay vector. */
export function effectiveDpi(native: Dpi, scale: number): Dpi {
    return native === "vector" ? "vector" : native / scale;
}

/** Default relative tolerance for "same aspect". */
export const ASPECT_TOLERANCE = 0.005;

/** Whether two width ÷ height ratios match within a relative tolerance. */
export function sameAspect(
    a: number,
    b: number,
    tolerance = ASPECT_TOLERANCE,
): boolean {
    return Math.abs(a - b) <= tolerance * Math.max(a, b);
}

/**
 * The tolerance for comparing a raster's pixel aspect with a physical size:
 * rounding to whole pixels can move the aspect by up to a pixel on the short
 * side.
 */
export function pixelAspectTolerance(pixels: PixelSize): number {
    return Math.max(
        ASPECT_TOLERANCE,
        1 / Math.min(pixels.width, pixels.height),
    );
}

export interface AspectSizeChip {
    /** The catalog entry the size comes from. */
    readonly catalogId: string;
    /** Such as "Silk 36 × 54 in" or "Flat prop 4 × 8 ft", in the image's orientation. */
    readonly label: string;
    /** Turned so that width ÷ height matches the image. */
    readonly width: Length;
    readonly height: Length;
}

const CHIP_KINDS = [
    { kind: "silk", label: "Silk", dims: ["header", "fly"] },
    { kind: "floor", label: "Floor", dims: ["width", "depth"] },
    { kind: "flatProp", label: "Flat prop", dims: ["width", "height"] },
] as const;

/** `36 × 54 in` when both sides share a unit, else `4 ft × 30 in`. */
function chipDims(width: Length, height: Length): string {
    const [wv, wu] = (width.typed ?? `${width.m} m`).split(" ");
    const [hv, hu] = (height.typed ?? `${height.m} m`).split(" ");
    return wu === hu ? `${wv} × ${hv} ${hu}` : `${wv} ${wu} × ${hv} ${hu}`;
}

/**
 * Catalog sizes an image of this aspect fits without crop, in either
 * orientation: silk Cuts, floors and flat props. These are the size step's
 * chips ("Silk 36 × 54 in").
 */
export function catalogSizesForAspect(
    aspect: number,
    tolerance = ASPECT_TOLERANCE,
): AspectSizeChip[] {
    const chips: AspectSizeChip[] = [];
    for (const { kind, label, dims } of CHIP_KINDS) {
        for (const entry of catalogEntries(kind)) {
            const d = catalogDims(entry) as unknown as Record<string, Length>;
            const a = d[dims[0]];
            const b = d[dims[1]];
            let size: [Length, Length] | null = null;
            if (sameAspect(a.m / b.m, aspect, tolerance)) size = [a, b];
            else if (sameAspect(b.m / a.m, aspect, tolerance)) size = [b, a];
            if (!size) continue;
            chips.push({
                catalogId: entry.id,
                label: `${label} ${chipDims(size[0], size[1])}`,
                width: size[0],
                height: size[1],
            });
        }
    }
    return chips;
}

/**
 * The catalog kind whose default size an Artwork for each surface starts at
 * (owner decision Q77, 2026-10-12): the default flag silk, the default floor,
 * or a flat prop sheet. Uniform parts have none.
 */
export const ARTWORK_SURFACE_SIZE_KIND: Readonly<
    Record<ArtworkSurface, "silk" | "floor" | "flatProp" | null>
> = {
    silk: "silk",
    baseFloor: "floor",
    floorProp: "floor",
    propSlot: "flatProp",
    uniformPart: null,
};

export interface FittedArtworkSize {
    /** The default catalog entry the size comes from. */
    readonly catalogId: string;
    /** In the image's orientation, with the image's aspect. */
    readonly width: Length;
    readonly height: Length;
    /** The catalog size itself, turned to the image's orientation. */
    readonly standard: { readonly width: Length; readonly height: Length };
    /** The image's shape differs from the standard's, so one side was derived. */
    readonly fitted: boolean;
}

/** How far rounding a derived side for display may move it. */
const FIT_ROUNDING = 0.002;

/**
 * `value` in `unit`, rounded to the coarsest step that stays within
 * `FIT_ROUNDING` of it, so it reads as people would write it ("40.5 in",
 * "67.5 ft"): feet to a tenth, inches to an eighth. Falls back to inches,
 * then to exact meters.
 */
function readableLength(value: number, unit: SourcedLength["unit"]): Length {
    // Steps as divisors: 1, ½, ¼ and ⅒ ft; 1, ½, ¼ and ⅛ in.
    const tries: [number, SourcedLength["unit"], number[]][] =
        unit === "ft"
            ? [
                  [value, "ft", [1, 2, 4, 10]],
                  [value * 12, "in", [1, 2, 4, 8]],
              ]
            : [[value, "in", [1, 2, 4, 8]]];
    for (const [v, u, divisors] of tries) {
        for (const d of divisors) {
            const rounded = Math.round(v * d) / d;
            if (rounded > 0 && Math.abs(rounded - v) <= FIT_ROUNDING * v) {
                return lengthOf(rounded, u);
            }
        }
    }
    return { m: lengthOf(value, unit).m };
}

/**
 * A surface's default catalog size fitted to an image of `aspect` (width ÷
 * height), or null when the surface has no default (Q77). The standard's
 * long side keeps its length and the other side follows the image, so the
 * Artwork is never stretched; the long side runs along the image's long
 * side. Within `tolerance` of the standard's shape, the standard is used
 * as is.
 */
export function fittedDefaultSize(
    surface: ArtworkSurface,
    aspect: number,
    tolerance = ASPECT_TOLERANCE,
): FittedArtworkSize | null {
    const kind = ARTWORK_SURFACE_SIZE_KIND[surface];
    if (!kind || !(aspect > 0) || !Number.isFinite(aspect)) return null;
    const entry = defaultCatalogEntry(kind);
    if (!entry) return null;
    const chipKind = CHIP_KINDS.find((c) => c.kind === kind)!;
    const sourced = entry.dims as unknown as Record<string, SourcedLength>;
    const lengths = catalogDims(entry) as unknown as Record<string, Length>;
    const [a, b] = chipKind.dims;
    const aLonger = lengths[a].m >= lengths[b].m;
    const long = aLonger ? sourced[a] : sourced[b];
    const longLength = aLonger ? lengths[a] : lengths[b];
    const shortLength = aLonger ? lengths[b] : lengths[a];
    const landscape = aspect >= 1;
    const standard = landscape
        ? { width: longLength, height: shortLength }
        : { width: shortLength, height: longLength };
    if (sameAspect(standard.width.m / standard.height.m, aspect, tolerance)) {
        return { catalogId: entry.id, ...standard, standard, fitted: false };
    }
    const other = readableLength(
        landscape ? long.value / aspect : long.value * aspect,
        long.unit,
    );
    return {
        catalogId: entry.id,
        width: landscape ? longLength : other,
        height: landscape ? other : longLength,
        standard,
        fitted: true,
    };
}
