/**
 * The size standards catalog (docs/3d/props-spec.md §3 "Catalog", ADR 0002
 * D-16): the default size for every kind, with custom sizes as the escape
 * hatch. Figures come from `research/size-standards.md` (2026-10-11).
 *
 * Every size is stored in its source unit and converted to meters on read, so
 * a 36 × 54 in silk stays exactly 36 × 54 in. Every entry names its sources.
 * Silks are written header (along the pole) × fly, plus an overall depth for
 * Cuts that hang below the end of the pole; their outlines are in
 * `./silkCuts`.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words sabre sabres ultralite fjminc demoulin bandshoppe drillcomp styleplus wgi teardrop mccormick
import { lengthOf, type ImperialUnit, type Length } from "./units";

/** A catalog size in the unit its source gives. */
export interface SourcedLength {
    readonly value: number;
    readonly unit: ImperialUnit;
}

/**
 * How firmly a figure is sourced (research/size-standards.md "How to read
 * this"): read on the vendor's or rule-maker's own page, read from a search
 * engine's copy of a page that refused direct fetches, or general practice.
 */
export type SourceConfidence = "verified" | "snippet" | "unverified";

export interface CatalogSource {
    readonly name: string;
    readonly url?: string;
    readonly confidence: SourceConfidence;
}

export type SizeKind =
    | "pole"
    | "swingPole"
    | "tPole"
    | "silk"
    | "rifle"
    | "sabre"
    | "floor"
    | "flatProp";

/** The dimensions each kind has, in some length type. */
export interface DimsByKind<L> {
    pole: { readonly length: L; readonly diameter: L };
    swingPole: { readonly length: L; readonly diameter: L };
    tPole: { readonly upright: L; readonly crossbars: readonly L[] };
    /**
     * `depth` is the overall height, top of the pole edge to the lowest
     * point, for Cuts that hang below the end of the pole; omitted, it equals
     * the header (see `silkDepth`). `sleeve` only where the source gives a
     * sleeve shorter than the header. `sag` is how far a curve-family Cut's
     * top and bottom edges droop toward the fly; omitted, it is 0 (a true
     * rectangle, owner Q40).
     */
    silk: {
        readonly header: L;
        readonly fly: L;
        readonly depth?: L;
        readonly sleeve?: L;
        readonly sag?: L;
    };
    rifle: { readonly length: L };
    sabre: { readonly length: L };
    /** The source doesn't say which side faces the audience; WGI checks ignore orientation. */
    floor: { readonly width: L; readonly depth: L };
    flatProp: { readonly width: L; readonly height: L };
}

/** Which flags a silk Cut belongs to: a standard flag pole or a swing pole. */
export type SilkUse = "flag" | "swing";

interface EntryBase<K extends SizeKind> {
    readonly id: string;
    readonly kind: K;
    readonly name: string;
    readonly dims: DimsByKind<SourcedLength>[K];
    readonly sources: readonly [CatalogSource, ...CatalogSource[]];
    /** The kind's default size (for silks, per use). */
    readonly isDefault?: true;
    /** Available only by special order. */
    readonly special?: true;
}

export type CatalogEntry = {
    [K in SizeKind]: K extends "silk"
        ? EntryBase<K> & {
              readonly use: SilkUse;
              /** The pole the source pairs this Cut with. */
              readonly pole?: string;
              /**
               * Other names for this Cut, vendors' included, for search
               * only: never shown as its label or on its template (Q44).
               */
              readonly aliases?: readonly string[];
          }
        : EntryBase<K>;
}[SizeKind];

export type CatalogEntryOf<K extends SizeKind> = Extract<
    CatalogEntry,
    { kind: K }
>;

// ---------------------------------------------------------------- sources

const FJM_POLES: CatalogSource = {
    name: "Fred J. Miller, Flag Poles",
    url: "https://fjminc.com/collections/flag-poles",
    confidence: "verified",
};
const DEMOULIN_POLES: CatalogSource = {
    name: "DeMoulin, Flag Poles",
    url: "https://demoulin.com/collections/flag-poles",
    confidence: "verified",
};
const BAND_SHOPPE_SIZE_CHART: CatalogSource = {
    name: "Band Shoppe, printed-flag size chart",
    url: "https://www.bandshoppe.com/product/print-on-demand-double-sided-battle-letter-flag/",
    confidence: "snippet",
};
const FJM_CUSTOM_FLAGS: CatalogSource = {
    name: "Fred J. Miller, Custom Flag Designs",
    url: "https://fjminc.com/pages/custom-flag-designs",
    confidence: "verified",
};
const DEMOULIN_PERFORMANCE_FLAG: CatalogSource = {
    name: "DeMoulin, In-Stock Performance Flag",
    confidence: "verified",
};
const DEMOULIN_PRINTED_FLAG: CatalogSource = {
    name: "DeMoulin, Design Your Own Digital Print Flag - Standard (36 x 56)",
    confidence: "verified",
};
const BAND_SHOPPE_SWING: CatalogSource = {
    name: "Band Shoppe, Printed Swing Flag",
    url: "https://www.bandshoppe.com/product/printed-color-guard-swing-flag-56317/",
    confidence: "snippet",
};
const DRILLCOMP_SUPER_SWING: CatalogSource = {
    name: "drillcomp, StylePlus Glamour Super Swing",
    url: "https://www.drillcomp.com/product/styleplus-glamour-super-swing-color-guard-flags-6-colors-available/",
    confidence: "verified",
};
const DEMOULIN_SWING_FLAG: CatalogSource = {
    name: "DeMoulin, In-Stock Swing Flag",
    confidence: "verified",
};
const DEMOULIN_GUARD_EQUIPMENT: CatalogSource = {
    name: "DeMoulin, Guard and Dance Equipment",
    url: "https://demoulin.com/collections/guard-dance-equipment",
    confidence: "verified",
};
const BAND_SHOPPE_RIFLES: CatalogSource = {
    name: "Band Shoppe, Rifles",
    url: "https://www.bandshoppe.com/pages/rifles/",
    confidence: "snippet",
};
const BAND_SHOPPE_SAMURAI: CatalogSource = {
    name: "Band Shoppe, DSI Samurai Sabre",
    url: "https://www.bandshoppe.com/product/dsi-samurai-36-color-guard-sabre/",
    confidence: "snippet",
};
/** WGI 2026 Color Guard Contest Rules (§2.1 to §2.6 floors, §4.2 equipment). */
export const WGI_RULES_2026: CatalogSource = {
    name: "WGI Color Guard Contest Rules 2026",
    url: "https://www.wgi.org/wp-content/uploads/2025/09/2026_WGI_ColorGuard_Rules_Sep25.pdf",
    confidence: "verified",
};
const DPG_FLOORS: CatalogSource = {
    name: "DPG, guard floors",
    url: "https://dpgperforms.com/?p=1275",
    confidence: "snippet",
};
/**
 * Overall depths (and two fly widths) measured from vendors' shape images where the
 * vendor states only header and one other figure (research/silk-cuts.md,
 * 2026-10-12), rounded to the catalog's ⅛ in.
 */
const SILK_CUT_TRACING: CatalogSource = {
    name: "Traced from vendor shape images (research/silk-cuts.md)",
    url: "https://fjminc.com/pages/custom-flag-designs",
    confidence: "unverified",
};
const SHEET_GOODS: CatalogSource = {
    name: "General practice: 4 x 8 ft sheet goods",
    confidence: "unverified",
};

// ---------------------------------------------------------------- entries

const inch = (value: number): SourcedLength => ({ value, unit: "in" });
const feet = (value: number): SourcedLength => ({ value, unit: "ft" });

const POLE_SOURCES = [FJM_POLES, DEMOULIN_POLES] as const;

const poles: CatalogEntryOf<"pole">[] = [5, 5.5, 6, 6.5, 7, 8].map(
    (lengthFt) => ({
        id: `pole-${lengthFt}ft`,
        kind: "pole",
        name: `${lengthFt} ft pole`,
        dims: { length: feet(lengthFt), diameter: inch(1) },
        sources: POLE_SOURCES,
        ...(lengthFt === 6 ? { isDefault: true as const } : {}),
        ...(lengthFt === 8 ? { special: true as const } : {}),
    }),
);

const swingPoles: CatalogEntryOf<"swingPole">[] = [24, 30, 36, 42, 48, 52].map(
    (lengthIn) => ({
        id: `swing-pole-${lengthIn}in`,
        kind: "swingPole",
        name: `${lengthIn} in swing pole`,
        dims: { length: inch(lengthIn), diameter: inch(0.5) },
        sources: POLE_SOURCES,
        ...(lengthIn === 36 ? { isDefault: true as const } : {}),
    }),
);

const DEMOULIN_T_POLES: CatalogSource = {
    name: "DeMoulin, Single, Two and Three Tier T-Pole",
    url: "https://demoulin.com/collections/flag-poles",
    confidence: "verified",
};

const tPoles: CatalogEntryOf<"tPole">[] = [
    ...[30, 36, 42, 48].map(
        (crossbar): CatalogEntryOf<"tPole"> => ({
            id: `t-pole-1-tier-${crossbar}in`,
            kind: "tPole",
            name: `Single tier T-pole, ${crossbar} in crossbar`,
            dims: { upright: inch(48), crossbars: [inch(crossbar)] },
            sources: [DEMOULIN_T_POLES],
        }),
    ),
    {
        id: "t-pole-2-tier",
        kind: "tPole",
        name: "Two tier T-pole",
        dims: { upright: inch(68), crossbars: [inch(30), inch(36)] },
        sources: [DEMOULIN_T_POLES],
    },
    {
        id: "t-pole-3-tier",
        kind: "tPole",
        name: "Three tier T-pole",
        dims: {
            upright: inch(84),
            crossbars: [inch(30), inch(36), inch(42)],
        },
        sources: [DEMOULIN_T_POLES],
    },
];

interface SilkExtra extends Partial<
    Pick<CatalogEntryOf<"silk">, "pole" | "isDefault" | "aliases">
> {
    readonly depth?: number;
    readonly sleeve?: number;
}

function silk(
    id: string,
    name: string,
    header: number,
    fly: number,
    use: SilkUse,
    sources: CatalogEntryOf<"silk">["sources"],
    extra: SilkExtra = {},
): CatalogEntryOf<"silk"> {
    const { depth, sleeve, ...rest } = extra;
    return {
        id,
        kind: "silk",
        name,
        use,
        dims: {
            header: inch(header),
            fly: inch(fly),
            ...(depth === undefined ? {} : { depth: inch(depth) }),
            ...(sleeve === undefined ? {} : { sleeve: inch(sleeve) }),
        },
        sources,
        ...rest,
    };
}

const CURVE_ALIASES = [
    "standard curve",
    "curved rectangle",
    "arc shape (Band Shoppe)",
    "Arced, Curved Rectangle (DeMoulin)",
];

/**
 * Header × fly as the vendors write them, except the hanging Cuts, whose
 * second figure is their overall depth (owner Q39, research/silk-cuts.md
 * "How the second number is measured"). Ids keep the vendors' figures.
 */
const silks: CatalogEntryOf<"silk">[] = [
    silk(
        "silk-5ft-30x46",
        "5 ft pole silk",
        30,
        46,
        "flag",
        [BAND_SHOPPE_SIZE_CHART],
        { pole: "pole-5ft", aliases: CURVE_ALIASES },
    ),
    silk(
        "silk-5.5ft-33x50",
        "5.5 ft pole silk",
        33,
        50,
        "flag",
        [BAND_SHOPPE_SIZE_CHART],
        { pole: "pole-5.5ft", aliases: CURVE_ALIASES },
    ),
    silk(
        "silk-6ft-36x54",
        "6 ft pole silk",
        36,
        54,
        "flag",
        [DEMOULIN_PERFORMANCE_FLAG, BAND_SHOPPE_SIZE_CHART],
        { pole: "pole-6ft", isDefault: true, aliases: CURVE_ALIASES },
    ),
    silk(
        "silk-7ft-42x60",
        "7 ft pole silk",
        42,
        60,
        "flag",
        [BAND_SHOPPE_SIZE_CHART],
        { pole: "pole-7ft", aliases: CURVE_ALIASES },
    ),
    silk(
        "silk-standard-36x56",
        "Standard",
        36,
        56,
        "flag",
        [FJM_CUSTOM_FLAGS, DEMOULIN_PRINTED_FLAG],
        {
            aliases: [
                "Standard (Fred J. Miller)",
                "Standard Curve",
                ...CURVE_ALIASES,
            ],
        },
    ),
    silk(
        "silk-oversized-42x67",
        "Oversized",
        42,
        67,
        "flag",
        [FJM_CUSTOM_FLAGS],
        {
            aliases: [
                "Oversized (Fred J. Miller)",
                "7' Standard Curve (Field & Floor FX)",
            ],
        },
    ),
    silk(
        "silk-teardrop-44x74",
        "Teardrop",
        44,
        74,
        "flag",
        [FJM_CUSTOM_FLAGS, SILK_CUT_TRACING],
        {
            depth: 79.625,
            aliases: [
                "Teardrop (Fred J. Miller)",
                "Teardrop (Drill Company)",
                "Extended Tear Drop Swing (Field & Floor FX)",
                "Shape SC (McCormick's)",
            ],
        },
    ),
    silk("silk-swing-44x66", "Swing", 44, 66, "swing", [BAND_SHOPPE_SWING], {
        isDefault: true,
        aliases: [
            "Swing, arc shape (Band Shoppe)",
            "Standard Swing (Field & Floor FX)",
        ],
    }),
    silk(
        "silk-super-swing-44x84",
        "Curved or super swing",
        44,
        68,
        "swing",
        [FJM_CUSTOM_FLAGS, DRILLCOMP_SUPER_SWING, SILK_CUT_TRACING],
        {
            depth: 84,
            aliases: [
                "Curved Swing (Fred J. Miller)",
                "Super Swing (DeMoulin)",
                "Glamour Super Swing (StylePlus)",
                "Arch Swing (Field & Floor FX)",
                "Shape SD, Shape SE (McCormick's)",
            ],
        },
    ),
    silk(
        "silk-oversized-swing-56x84",
        "Oversized swing",
        42,
        56,
        "swing",
        [DEMOULIN_SWING_FLAG],
        {
            depth: 84,
            aliases: ["In-Stock Swing Flag (DeMoulin)", "Lava Lame Swing"],
        },
    ),
    silk(
        "silk-arc-45x96",
        "Regular arc",
        45,
        78.625,
        "flag",
        [FJM_CUSTOM_FLAGS, SILK_CUT_TRACING],
        {
            depth: 96,
            aliases: [
                "Regular Arc (Fred J. Miller)",
                "Arc Swing (Drill Company)",
                "Arc Swing (DPG)",
            ],
        },
    ),
    silk(
        "silk-narrow-arc-44x94",
        "Narrow arc",
        44,
        94,
        "flag",
        [FJM_CUSTOM_FLAGS, SILK_CUT_TRACING],
        { depth: 56, aliases: ["Narrow Arc (Fred J. Miller)"] },
    ),
    silk(
        "silk-super-arc-54x100",
        "Super arc",
        54,
        100,
        "flag",
        [FJM_CUSTOM_FLAGS, SILK_CUT_TRACING],
        {
            depth: 87,
            aliases: [
                "Super Arc (Fred J. Miller)",
                "Oversized Wing Swing (Field & Floor FX)",
            ],
        },
    ),
];

const rifles: CatalogEntryOf<"rifle">[] = [36, 37.5, 39].map((lengthIn) => ({
    id: `rifle-${lengthIn}in`,
    kind: "rifle",
    name: `${lengthIn} in rifle`,
    dims: { length: inch(lengthIn) },
    sources:
        lengthIn === 37.5
            ? [BAND_SHOPPE_RIFLES]
            : [DEMOULIN_GUARD_EQUIPMENT, BAND_SHOPPE_RIFLES],
    ...(lengthIn === 36 ? { isDefault: true as const } : {}),
}));

const sabres: CatalogEntryOf<"sabre">[] = [32, 36, 39].map((lengthIn) => ({
    id: `sabre-${lengthIn}in`,
    kind: "sabre",
    name: `${lengthIn} in sabre`,
    dims: { length: inch(lengthIn) },
    sources:
        lengthIn === 32
            ? [BAND_SHOPPE_SAMURAI]
            : [DEMOULIN_GUARD_EQUIPMENT, BAND_SHOPPE_SAMURAI],
    ...(lengthIn === 36 ? { isDefault: true as const } : {}),
}));

const floors: CatalogEntryOf<"floor">[] = [
    {
        id: "floor-wgi-minimum-60x90ft",
        kind: "floor",
        name: "WGI competition area, minimum",
        dims: { width: feet(90), depth: feet(60) },
        sources: [WGI_RULES_2026, DPG_FLOORS],
        isDefault: true,
    },
    {
        id: "floor-wgi-maximum-78x106ft",
        kind: "floor",
        name: "WGI competition area, maximum",
        dims: { width: feet(106), depth: feet(78) },
        sources: [WGI_RULES_2026],
    },
];

const flatProps: CatalogEntryOf<"flatProp">[] = [
    {
        id: "flat-prop-4x8ft",
        kind: "flatProp",
        name: "4 x 8 ft sheet",
        dims: { width: feet(4), height: feet(8) },
        sources: [SHEET_GOODS],
        isDefault: true,
    },
];

export const SIZE_CATALOG: readonly CatalogEntry[] = [
    ...poles,
    ...swingPoles,
    ...tPoles,
    ...silks,
    ...rifles,
    ...sabres,
    ...floors,
    ...flatProps,
];

// ---------------------------------------------------------------- lookups

export function catalogEntries<K extends SizeKind>(
    kind: K,
): CatalogEntryOf<K>[] {
    return SIZE_CATALOG.filter(
        (entry): entry is CatalogEntryOf<K> => entry.kind === kind,
    );
}

export function catalogEntry(id: string): CatalogEntry | undefined {
    return SIZE_CATALOG.find((entry) => entry.id === id);
}

/**
 * The kind's default size: a 6 ft pole, 36 in swing pole, 36 × 54 in silk
 * (44 × 66 in for `use: "swing"`), 36 in rifle and sabre, 60 × 90 ft floor,
 * 4 × 8 ft flat prop. T-poles have none.
 */
export function defaultCatalogEntry<K extends SizeKind>(
    kind: K,
    use: SilkUse = "flag",
): CatalogEntryOf<K> | undefined {
    return catalogEntries(kind).find((entry) => {
        const e: CatalogEntry = entry;
        return e.isDefault === true && (e.kind !== "silk" || e.use === use);
    });
}

/**
 * A silk's overall depth, top of the pole edge to the lowest point: the
 * stated depth, else the header, plus any sag on a curve-family Cut, in
 * meters. Pass `catalogDims(entry)` for a catalog Cut.
 */
export function silkDepthM(dims: DimsByKind<Length>["silk"]): number {
    return Math.max(
        dims.depth?.m ?? dims.header.m,
        dims.header.m + (dims.sag?.m ?? 0),
    );
}

/**
 * Whether an entry matches a search: its name, id or any alias contains the
 * query, ignoring case. Aliases are searchable but never shown (Q44).
 */
export function catalogEntryMatches(
    entry: CatalogEntry,
    query: string,
): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const aliases = entry.kind === "silk" ? (entry.aliases ?? []) : [];
    return [entry.name, entry.id, ...aliases].some((text) =>
        text.toLowerCase().includes(q),
    );
}

/** A catalog size as a stored length: exact meters, re-displaying as its source text. */
export function lengthFromSource(source: SourcedLength): Length {
    return lengthOf(source.value, source.unit);
}

/** An entry's dimensions as stored lengths. */
export function catalogDims<K extends SizeKind>(
    entry: CatalogEntryOf<K>,
): DimsByKind<Length>[K] {
    const out: Record<string, Length | readonly Length[]> = {};
    for (const [key, value] of Object.entries(entry.dims) as [
        string,
        SourcedLength | readonly SourcedLength[],
    ][]) {
        out[key] = Array.isArray(value)
            ? value.map(lengthFromSource)
            : lengthFromSource(value as SourcedLength);
    }
    return out as unknown as DimsByKind<Length>[K];
}
