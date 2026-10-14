/**
 * Artwork template surfaces (docs/3d/props-spec.md §3 "Artwork size and
 * templates", ADR 0002 D-16): what each surface kind expects, so people can
 * author Artwork that fits. Every size comes from the size catalog
 * (`../sizes`) or the median v4u body (`./uniformPanels`); nothing here
 * restates a catalog size.
 *
 * A surface carries only what the spec fixes: its size, minimum and
 * recommended DPI, print process, the bleed the spec gives (⅛ in for flags,
 * ½ in for sublimation), its cut family and outline (from `../sizes/silkCuts`)
 * and its orientation. The safe area and the bleed of floors and props come
 * from a `TemplatePolicy` (./policy); `DEFAULT_TEMPLATE_POLICY` holds the
 * owner's figures.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words teardrop
import {
    catalogDims,
    catalogEntries,
    silkDepthM,
    type CatalogEntryOf,
} from "../sizes/catalog";
import {
    CUT_FROM_VENDOR_PHOTO_NOTE,
    cutPathBounds,
    silkCutPath,
    silkCutShape,
    type CutPath,
    type SilkCutFamily,
    type SilkCutOptions,
} from "../sizes/silkCuts";
import { fromMeters, lengthOf, type Length } from "../sizes/units";
import {
    MEDIAN_V4U_PANELS,
    type UniformArtworkPart,
    type UniformPanel,
    type UniformSide,
} from "./uniformPanels";

export type TemplateSurfaceKind =
    | "silk"
    | "baseFloor"
    | "floorProp"
    | "propTop"
    | "propFront"
    | "propBack"
    | "uniformFront"
    | "uniformBack";

/** How the surface is printed, which sets its bleed. */
export type PrintProcess = "flag" | "sublimation" | "floor" | "prop";

/**
 * The shape of a silk Cut: a rectangle, or one of the silk Cut families
 * (`../sizes/silkCuts`). Only rectangles need no shape mask; a curve-family
 * Cut is a rectangle until it has a sag.
 */
export type CutFamily = "rectangle" | SilkCutFamily;

/**
 * Which edge the orientation marker names: the pole (header) side of a silk,
 * the audience side of a floor, the front edge of a prop top, or up on a
 * standing surface.
 */
export type TemplateOrientation =
    | "poleLeft"
    | "audienceBottom"
    | "frontBottom"
    | "upTop";

export interface DpiGuide {
    readonly minimum: number;
    readonly recommended: number;
}

/** Print readiness at 1:1 (props-spec §3 "Fit", D-16). */
export const DPI_GUIDE: Readonly<Record<"standard" | "floor", DpiGuide>> = {
    standard: { minimum: 150, recommended: 300 },
    floor: { minimum: 30, recommended: 60 },
};

/** The bleed the spec fixes: ⅛ in for flags, ½ in for sublimation. */
export const FIXED_BLEED: Readonly<Partial<Record<PrintProcess, Length>>> = {
    flag: lengthOf(0.125, "in"),
    sublimation: lengthOf(0.5, "in"),
};

export interface TemplateSurface {
    /** Also the downloaded file's stem. */
    readonly id: string;
    readonly kind: TemplateSurfaceKind;
    readonly name: string;
    /** Trim width, left to right on the template. */
    readonly width: Length;
    /**
     * Trim height, top to bottom on the template. For a silk, its overall
     * depth, which exceeds the header for Cuts that hang below the pole.
     */
    readonly height: Length;
    /** A silk's header (pole edge), along the left of the trim from the top. */
    readonly header?: Length;
    /** The unit downloads are drawn in: the size's own unit system. */
    readonly unit: "in" | "mm";
    readonly dpi: DpiGuide;
    readonly process: PrintProcess;
    readonly cut: CutFamily;
    /**
     * The cut's outline in meters, from the trim's top-left corner, for any
     * cut other than a rectangle.
     */
    readonly cutPath?: CutPath;
    /** A silk sleeve shorter than the header, where the catalog gives one. */
    readonly sleeve?: Length;
    readonly orientation: TemplateOrientation;
    readonly notes: readonly string[];
    /** The size catalog entry the size comes from, if any. */
    readonly catalogId?: string;
}

// ---------------------------------------------------------------- silks

const MIRROR_NOTE =
    "A single-sided print shows the mirror image on the back of the silk.";
const CUT_NOTE =
    "Content outside the cut is clipped in 3D and flagged as outside the cut.";

/**
 * The cut family a catalog Cut has: its outline's family, with a curve-family
 * Cut a rectangle while its sag is 0 (the default, owner Q40).
 */
export function cutFamilyOf(
    entry: CatalogEntryOf<"silk">,
    options: SilkCutOptions = {},
): CutFamily {
    const shape = silkCutShape(entry.id, options.variant);
    if (!shape) return "rectangle";
    if (shape.family !== "curve") return shape.family;
    const sag = options.sag ?? catalogDims(entry).sag;
    return sag && sag.m > 0 ? "curve" : "rectangle";
}

/** A length in inches when its parts were typed in feet or inches. */
function lengthFromM(m: number, typed: boolean): Length {
    return typed
        ? lengthOf(Number(fromMeters(m, "in").toFixed(6)), "in")
        : { m };
}

/**
 * A silk Cut's template. Silks are written header × fly; the template lies
 * with the header (the pole side) on the left, so it is fly wide and as tall
 * as the Cut's overall depth (the header, for Cuts that don't hang below the
 * pole). `options` picks a sag or an alternative shape.
 */
export function silkSurface(
    entry: CatalogEntryOf<"silk">,
    options: SilkCutOptions = {},
): TemplateSurface {
    const dims = catalogDims(entry);
    const sized = options.sag ? { ...dims, sag: options.sag } : dims;
    const cut = cutFamilyOf(entry, options);
    const cutPath =
        cut === "rectangle" ? undefined : silkCutPath(entry.id, sized, options);
    // The outline's lowest point, else the stated depth or header plus sag.
    const depthM = cutPath ? cutPathBounds(cutPath).maxY : silkDepthM(sized);
    const near = (l: Length | undefined) =>
        l !== undefined && Math.abs(l.m - depthM) < 1e-9;
    const height = near(sized.depth)
        ? sized.depth!
        : near(dims.header)
          ? dims.header
          : lengthFromM(
                depthM,
                dims.header.typed !== undefined &&
                    (sized.sag === undefined || sized.sag.typed !== undefined),
            );
    const shape = silkCutShape(entry.id, options.variant);
    const notes = [MIRROR_NOTE];
    if (cut !== "rectangle") notes.push(CUT_NOTE);
    if (cut !== "rectangle" && shape?.fromVendorPhoto)
        notes.push(CUT_FROM_VENDOR_PHOTO_NOTE);
    const variant =
        (options.variant && options.variant !== "default"
            ? `-${options.variant}`
            : "") +
        (options.sag && options.sag.m > 0
            ? `-sag-${Number(fromMeters(options.sag.m, "in").toFixed(3))}in`
            : "");
    return {
        id: `${entry.id}${variant}`,
        kind: "silk",
        name: `Silk Cut: ${entry.name}`,
        width: dims.fly,
        height,
        ...(height.m !== dims.header.m ? { header: dims.header } : {}),
        unit: "in",
        dpi: DPI_GUIDE.standard,
        process: "flag",
        cut,
        ...(cutPath ? { cutPath } : {}),
        ...(dims.sleeve ? { sleeve: dims.sleeve } : {}),
        orientation: "poleLeft",
        notes,
        catalogId: entry.id,
    };
}

// ---------------------------------------------------------------- floors

/**
 * The longest edge a floor's PNG may have (Q31): a floor at its minimum DPI
 * would be tens of thousands of pixels, so its PNG is a capped preview and
 * the PDF or SVG is the print master.
 */
export const FLOOR_PNG_MAX_PX = 8192;

export const FLOOR_PRINT_MASTER_NOTE = `The PNG is capped at ${FLOOR_PNG_MAX_PX} px on the long edge; print from the PDF or SVG, the print master.`;

/** A Base floor template, audience side at the bottom. */
export function baseFloorSurface(
    entry: CatalogEntryOf<"floor">,
): TemplateSurface {
    const dims = catalogDims(entry);
    return {
        id: `base-${entry.id}`,
        kind: "baseFloor",
        name: `Base floor, ${entry.name}`,
        width: dims.width,
        height: dims.depth,
        unit: "in",
        dpi: DPI_GUIDE.floor,
        process: "floor",
        cut: "rectangle",
        orientation: "audienceBottom",
        notes: [FLOOR_PRINT_MASTER_NOTE],
        catalogId: entry.id,
    };
}

/**
 * A Floor prop template for any size (Floor props have no catalog size).
 * Its DPI guide is the floors' (printed and seen like a floor).
 */
export function floorPropSurface(
    width: Length,
    depth: Length,
    id = "floor-prop",
): TemplateSurface {
    return {
        id,
        kind: "floorProp",
        name: "Floor prop",
        width,
        height: depth,
        unit: unitOf(width, depth),
        dpi: DPI_GUIDE.floor,
        process: "floor",
        cut: "rectangle",
        orientation: "audienceBottom",
        notes: [FLOOR_PRINT_MASTER_NOTE],
    };
}

// ---------------------------------------------------------------- props

export type PropFace = "top" | "front" | "back";

const PROP_KIND: Readonly<Record<PropFace, TemplateSurfaceKind>> = {
    top: "propTop",
    front: "propFront",
    back: "propBack",
};

/**
 * A prop face for any size. `top` is width × depth with the front edge at the
 * bottom; `front` and `back` are width × height, up at the top.
 */
export function propSurface(
    face: PropFace,
    width: Length,
    heightOrDepth: Length,
    id = `prop-${face}`,
): TemplateSurface {
    return {
        id,
        kind: PROP_KIND[face],
        name: `Prop ${face}`,
        width,
        height: heightOrDepth,
        unit: unitOf(width, heightOrDepth),
        dpi: DPI_GUIDE.standard,
        process: "prop",
        cut: "rectangle",
        orientation: face === "top" ? "frontBottom" : "upTop",
        notes: [],
    };
}

/** Front and back templates for a catalog flat prop (a sheet has no top). */
export function flatPropSurfaces(
    entry: CatalogEntryOf<"flatProp">,
): TemplateSurface[] {
    const dims = catalogDims(entry);
    return (["front", "back"] as const).map((face) => ({
        ...propSurface(face, dims.width, dims.height, `${entry.id}-${face}`),
        name: `${entry.name}, ${face}`,
        catalogId: entry.id,
    }));
}

// ---------------------------------------------------------------- uniforms

const PART_NAME: Readonly<Record<UniformArtworkPart, string>> = {
    top: "Top",
    bottoms: "Bottoms",
    overlay: "Overlay (cape)",
};

export const UNIFORM_WRAP_NOTE =
    "Art wraps poorly onto the sides and sleeves; keep it on the front or back panel.";
const UNIFORM_SIZE_NOTE =
    "Sized as worn by the median body; other body types are graded proportionally.";

export function uniformSurface(panel: UniformPanel): TemplateSurface {
    return {
        id: `uniform-${panel.part}-${panel.side}`,
        kind: panel.side === "front" ? "uniformFront" : "uniformBack",
        name: `${PART_NAME[panel.part]}, ${panel.side}`,
        width: panel.width,
        height: panel.height,
        unit: "mm",
        dpi: DPI_GUIDE.standard,
        process: "sublimation",
        cut: "rectangle",
        orientation: "upTop",
        notes: [UNIFORM_SIZE_NOTE, UNIFORM_WRAP_NOTE],
    };
}

export function uniformPanelSurface(
    part: UniformArtworkPart,
    side: UniformSide,
): TemplateSurface | undefined {
    const panel = MEDIAN_V4U_PANELS.find(
        (p) => p.part === part && p.side === side,
    );
    return panel ? uniformSurface(panel) : undefined;
}

// ---------------------------------------------------------------- all

/**
 * Every template with a fixed size: each silk Cut, each catalog floor as a
 * Base floor, each catalog flat prop's front and back, and each uniform
 * part's panels. Floor props and other props have no catalog size: make
 * those with `floorPropSurface` and `propSurface`.
 */
export const TEMPLATE_SURFACES: readonly TemplateSurface[] = [
    ...catalogEntries("silk").map((entry) => silkSurface(entry)),
    ...catalogEntries("floor").map(baseFloorSurface),
    ...catalogEntries("flatProp").flatMap(flatPropSurfaces),
    ...MEDIAN_V4U_PANELS.map(uniformSurface),
];

export function templateSurface(id: string): TemplateSurface | undefined {
    return TEMPLATE_SURFACES.find((s) => s.id === id);
}

/** Inches when both sizes were typed in feet or inches, else millimeters. */
function unitOf(a: Length, b: Length): "in" | "mm" {
    return a.typed !== undefined && b.typed !== undefined ? "in" : "mm";
}
