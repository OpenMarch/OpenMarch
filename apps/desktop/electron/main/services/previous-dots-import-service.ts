import { getOrm, schema, type DB } from "@om-electron/database/db";
import * as pageEra from "@om-electron/database/migrations/pageEraSchema";
import {
    PAGE_MODEL_USER_VERSION,
    readUserVersion,
} from "@om-electron/database/fileVersion";
import {
    countTimelineRows,
    hasConversionMarker,
} from "@om-electron/database/convertOnOpenGate";
import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import { DatabaseSync } from "node:sqlite";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { parseFromWorkspaceSettings } from "@/components/launchpage/parseFromWorkspaceSettings";
import { getLastPageNumber } from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import { readSourceTimelinePositions } from "@/timeline/sourceTimelinePositions";

export interface PreviousDotsMarcherImport {
    name?: string | null;
    section: string;
    drill_prefix: string;
    drill_order: number;
    year?: string | null;
    notes?: string | null;
}

export interface PreviousDotsCoordinateImport {
    drill_prefix: string;
    drill_order: number;
    x: number;
    y: number;
}

export interface PreviousDotsSectionAppearanceImport {
    section: string;
    fill_color: string | null;
    outline_color: string | null;
    shape_type: string | null;
    visible: number;
    label_visible: number;
    equipment_name: string | null;
    equipment_state: string | null;
}

export interface PreviousDotsTagImport {
    key: number;
    name?: string | null;
    description?: string | null;
    icon?: string | null;
    color_hex?: string | null;
}

export interface PreviousDotsMarcherTagImport {
    drill_prefix: string;
    drill_order: number;
    tagKey: number;
}

export interface PreviousDotsImportResult {
    sourcePath: string;
    fieldPropertiesJson: string;
    fieldImage: Uint8Array | null;
    marchers: PreviousDotsMarcherImport[];
    coordinates: PreviousDotsCoordinateImport[];
    sectionAppearances: PreviousDotsSectionAppearanceImport[];
    tags: PreviousDotsTagImport[];
    marcherTags: PreviousDotsMarcherTagImport[];
    designer?: string;
    client?: string;
    activity?: string;
    /** Last named page number from the source file; used as the new show's pageNumberOffset. */
    pageNumberOffset: number;
}

/**
 * The marcher columns the import uses. Selected by name so a source file from before migration
 * 0017 (no `home_x`/`home_y`) still reads, and so no other column reaches the new show.
 */
const sourceMarcherColumns = {
    id: schema.marchers.id,
    name: schema.marchers.name,
    section: schema.marchers.section,
    drill_prefix: schema.marchers.drill_prefix,
    drill_order: schema.marchers.drill_order,
    year: schema.marchers.year,
    notes: schema.marchers.notes,
};

type SourceMarcher = PreviousDotsMarcherImport & { id: number };

/**
 * A page-era source (not converted yet): its last page's `marcher_pages` rows.
 *
 * @throws when the source has no pages
 */
async function readLastPageMarcherPages(
    orm: DB,
): Promise<PreviousDotsCoordinateImport[]> {
    const lastPage = await orm
        .select({ page_id: schema.timing_objects.page_id })
        .from(schema.timing_objects)
        .where(isNotNull(schema.timing_objects.page_id))
        .orderBy(desc(schema.timing_objects.position))
        .limit(1)
        .get();

    if (!lastPage?.page_id)
        throw new Error("No timing objects found in source file");

    return await orm
        .select({
            drill_prefix: schema.marchers.drill_prefix,
            drill_order: schema.marchers.drill_order,
            x: pageEra.marcher_pages.x,
            y: pageEra.marcher_pages.y,
        })
        .from(pageEra.marcher_pages)
        .innerJoin(
            schema.marchers,
            eq(pageEra.marcher_pages.marcher_id, schema.marchers.id),
        )
        .where(eq(pageEra.marcher_pages.page_id, lastPage.page_id))
        .all();
}

/**
 * A timeline source: each marcher's position at the source's last page end beat, from the
 * source's resolver (docs/timeline/phases/07-page-parity.md P7.16). `null` when it has none.
 */
async function readTimelineCoordinates(
    orm: DB,
    marchers: readonly SourceMarcher[],
): Promise<PreviousDotsCoordinateImport[]> {
    const positions = await readSourceTimelinePositions({
        db: orm as unknown as DbConnection,
    });
    if (!positions) throw new Error("No timing objects found in source file");
    const marchersById = new Map(marchers.map((m) => [m.id, m]));
    return positions.flatMap(({ marcher_id, x, y }) => {
        const marcher = marchersById.get(marcher_id);
        return marcher
            ? [
                  {
                      drill_prefix: marcher.drill_prefix,
                      drill_order: marcher.drill_order,
                      x,
                      y,
                  },
              ]
            : [];
    });
}

// eslint-disable-next-line max-lines-per-function
export async function readPreviousDotsFile(
    sourcePath: string,
): Promise<PreviousDotsImportResult> {
    const db = new DatabaseSync(sourcePath, { readOnly: true });
    try {
        const orm = getOrm(db);
        const fieldProperties = await orm.query.field_properties.findFirst({
            columns: { json_data: true, image: true },
        });

        if (!fieldProperties?.json_data)
            throw new Error("Field properties not found in source file");

        const marchers: SourceMarcher[] = await orm
            .select(sourceMarcherColumns)
            .from(schema.marchers)
            .orderBy(
                schema.marchers.drill_prefix,
                schema.marchers.drill_order,
                schema.marchers.year,
                schema.marchers.notes,
            )
            .all();

        let workspaceSettingsJson: string | undefined;
        try {
            const workspaceSettings =
                await orm.query.workspace_settings.findFirst({
                    columns: { json_data: true },
                });
            workspaceSettingsJson = workspaceSettings?.json_data;
        } catch {
            // Older files may lack workspace_settings
        }

        // A show from an older version that was never converted still has its page-era tables;
        // any other show is a timeline show.
        const pageEraSource =
            readUserVersion(db) === PAGE_MODEL_USER_VERSION &&
            !hasConversionMarker(workspaceSettingsJson) &&
            countTimelineRows(db) === 0;
        const coordinates = pageEraSource
            ? await readLastPageMarcherPages(orm)
            : await readTimelineCoordinates(orm, marchers);

        const sectionAppearancesRaw = await orm
            .select({
                section: schema.section_appearances.section,
                fill_color: schema.section_appearances.fill_color,
                outline_color: schema.section_appearances.outline_color,
                shape_type: schema.section_appearances.shape_type,
                visible: schema.section_appearances.visible,
                label_visible: schema.section_appearances.label_visible,
                equipment_name: schema.section_appearances.equipment_name,
                equipment_state: schema.section_appearances.equipment_state,
            })
            .from(schema.section_appearances)
            .all();

        const tagsRaw = await orm.select().from(schema.tags).all();

        const marcherTagsRaw = await orm
            .select({
                drill_prefix: schema.marchers.drill_prefix,
                drill_order: schema.marchers.drill_order,
                tagKey: schema.marcher_tags.tag_id,
            })
            .from(schema.marcher_tags)
            .innerJoin(
                schema.marchers,
                eq(schema.marcher_tags.marcher_id, schema.marchers.id),
            )
            .all();

        const {
            designer,
            client,
            activity,
            pageNumberOffset: sourcePageNumberOffset,
        } = parseFromWorkspaceSettings(workspaceSettingsJson);

        const orderedPages = await orm
            .select({ is_subset: schema.pages.is_subset })
            .from(schema.pages)
            .innerJoin(
                schema.beats,
                eq(schema.pages.start_beat, schema.beats.id),
            )
            .orderBy(asc(schema.beats.position))
            .all();

        const isSubsetFlags = orderedPages.map((page) => page.is_subset === 1);
        const pageNumberOffset = getLastPageNumber(
            isSubsetFlags,
            sourcePageNumberOffset ?? 0,
        );

        const fieldImage = fieldProperties.image
            ? new Uint8Array(fieldProperties.image)
            : null;

        return {
            sourcePath,
            fieldPropertiesJson: fieldProperties.json_data,
            fieldImage,
            marchers: marchers.map(({ id: _id, ...marcher }) => marcher),
            coordinates,
            sectionAppearances: sectionAppearancesRaw,
            tags: tagsRaw.map((tag) => ({
                key: tag.id,
                name: tag.name,
                description: tag.description,
                icon: tag.icon,
                color_hex: tag.color_hex,
            })),
            marcherTags: marcherTagsRaw,
            designer,
            client,
            activity,
            pageNumberOffset,
        };
    } finally {
        db.close();
    }
}

export async function choosePreviousDotsFile(
    win: BrowserWindow | null,
): Promise<PreviousDotsImportResult | null> {
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
        filters: [
            { name: "OpenMarch File", extensions: ["dots"] },
            { name: "All Files", extensions: ["*"] },
        ],
        properties: ["openFile"],
    });

    if (result.canceled || !result.filePaths[0]) return null;
    return await readPreviousDotsFile(result.filePaths[0]);
}
