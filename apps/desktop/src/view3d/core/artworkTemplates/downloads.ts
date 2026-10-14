/**
 * The Artwork templates the download menu offers (package C1.12): every
 * fixed-size surface in `TEMPLATE_SURFACES`, plus the variants and default
 * sizes a person picks from the menu.
 *
 * - each curve-family silk Cut with the recommended sag (a quarter of the
 *   header, Q40), beside its true rectangle;
 * - the swing's sagging-bottom alternative (Q41);
 * - a Floor prop and a prop top at the default flat-prop sheet size, since
 *   neither has a catalog size of its own.
 *
 * `library:template-save` resolves its `surfaceId` here, so the menu can only
 * ask for a template main knows. Custom sizes are a follow-up (they need a
 * size in the request).
 *
 * Plain TypeScript only (`view3d/core/`): no React, Electron or database.
 */
import {
    catalogDims,
    catalogEntries,
    type CatalogEntryOf,
} from "../sizes/catalog";
import { recommendedSilkSag, silkCut } from "../sizes/silkCuts";
import type { Length } from "../sizes/units";
import {
    flatPropSurfaces,
    floorPropSurface,
    propSurface,
    silkSurface,
    baseFloorSurface,
    uniformSurface,
    type PropFace,
    type TemplateSurface,
} from "./surfaces";
import {
    MEDIAN_V4U_PANELS,
    type UniformArtworkPart,
    type UniformSide,
} from "./uniformPanels";

/** The menu's sections, in order. */
export const TEMPLATE_DOWNLOAD_GROUPS = [
    "silk",
    "floor",
    "floorProp",
    "prop",
    "uniform",
] as const;
export type TemplateDownloadGroup = (typeof TEMPLATE_DOWNLOAD_GROUPS)[number];

/**
 * One template in the menu. The UI words its label from these fields; the
 * surface's own `name` is English log text.
 */
export interface TemplateDownload {
    readonly group: TemplateDownloadGroup;
    readonly surface: TemplateSurface;
    /** The size catalog entry's name, when the size comes from one. */
    readonly catalogName?: string;
    /** A silk Cut drawn with this sag. */
    readonly sag?: Length;
    /** A silk Cut's alternative shape, such as `sagging-bottom`. */
    readonly variant?: string;
    /** A prop panel's face. */
    readonly face?: PropFace;
    readonly uniformPart?: UniformArtworkPart;
    readonly uniformSide?: UniformSide;
}

function silkDownloads(entry: CatalogEntryOf<"silk">): TemplateDownload[] {
    const base = { group: "silk" as const, catalogName: entry.name };
    const downloads: TemplateDownload[] = [
        { ...base, surface: silkSurface(entry) },
    ];
    const shape = silkCut(entry.id);
    if (shape?.family === "curve") {
        const sag = recommendedSilkSag(catalogDims(entry).header);
        downloads.push({ ...base, sag, surface: silkSurface(entry, { sag }) });
    }
    for (const alternative of shape?.alternatives ?? []) {
        downloads.push({
            ...base,
            variant: alternative.id,
            surface: silkSurface(entry, { variant: alternative.id }),
        });
    }
    return downloads;
}

/** The default flat-prop sheet, which also sizes Floor props and prop tops. */
function defaultSheet(): CatalogEntryOf<"flatProp"> {
    const sheets = catalogEntries("flatProp");
    return sheets.find((entry) => entry.isDefault) ?? sheets[0];
}

function sheetSuffix(entry: CatalogEntryOf<"flatProp">): string {
    return entry.id.replace(/^flat-prop-/, "");
}

function floorPropDownloads(): TemplateDownload[] {
    const sheet = defaultSheet();
    const { width, height } = catalogDims(sheet);
    return [
        {
            group: "floorProp",
            catalogName: sheet.name,
            surface: floorPropSurface(
                width,
                height,
                `floor-prop-${sheetSuffix(sheet)}`,
            ),
        },
    ];
}

function propDownloads(): TemplateDownload[] {
    const sheet = defaultSheet();
    const { width, height } = catalogDims(sheet);
    const top: TemplateDownload = {
        group: "prop",
        catalogName: sheet.name,
        face: "top",
        surface: propSurface(
            "top",
            width,
            height,
            `prop-top-${sheetSuffix(sheet)}`,
        ),
    };
    const panels = catalogEntries("flatProp").flatMap((entry) =>
        flatPropSurfaces(entry).map(
            (surface): TemplateDownload => ({
                group: "prop",
                catalogName: entry.name,
                face: surface.kind === "propFront" ? "front" : "back",
                surface,
            }),
        ),
    );
    return [top, ...panels];
}

/** Every template the download menu offers, grouped and in menu order. */
export const TEMPLATE_DOWNLOADS: readonly TemplateDownload[] = [
    ...catalogEntries("silk").flatMap(silkDownloads),
    ...catalogEntries("floor").map(
        (entry): TemplateDownload => ({
            group: "floor",
            catalogName: entry.name,
            surface: baseFloorSurface(entry),
        }),
    ),
    ...floorPropDownloads(),
    ...propDownloads(),
    ...MEDIAN_V4U_PANELS.map(
        (panel): TemplateDownload => ({
            group: "uniform",
            uniformPart: panel.part,
            uniformSide: panel.side,
            surface: uniformSurface(panel),
        }),
    ),
];

/** The downloadable template with this id, if the menu offers it. */
export function templateDownloadSurface(
    id: string,
): TemplateSurface | undefined {
    return TEMPLATE_DOWNLOADS.find((d) => d.surface.id === id)?.surface;
}
