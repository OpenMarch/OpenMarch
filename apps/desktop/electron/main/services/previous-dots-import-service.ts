import { getOrm, schema } from "@om-electron/database/db";
import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import { DatabaseSync } from "node:sqlite";
import { desc, eq, isNotNull } from "drizzle-orm";

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
}

// eslint-disable-next-line max-lines-per-function
async function readPreviousDotsFile(
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

        const marchers = await orm
            .select()
            .from(schema.marchers)
            .orderBy(
                schema.marchers.drill_prefix,
                schema.marchers.drill_order,
                schema.marchers.year,
                schema.marchers.notes,
            )
            .all();

        const lastPage = await orm
            .select({ page_id: schema.timing_objects.page_id })
            .from(schema.timing_objects)
            .where(isNotNull(schema.timing_objects.page_id))
            .orderBy(desc(schema.timing_objects.position))
            .limit(1)
            .get();

        if (!lastPage?.page_id)
            throw new Error("No timing objects found in source file");

        const coordinates = await orm
            .select({
                drill_prefix: schema.marchers.drill_prefix,
                drill_order: schema.marchers.drill_order,
                x: schema.marcher_pages.x,
                y: schema.marcher_pages.y,
            })
            .from(schema.marcher_pages)
            .innerJoin(
                schema.marchers,
                eq(schema.marcher_pages.marcher_id, schema.marchers.id),
            )
            .where(eq(schema.marcher_pages.page_id, lastPage.page_id))
            .all();

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
