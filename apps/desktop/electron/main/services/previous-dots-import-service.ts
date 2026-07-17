import { getOrm, schema } from "@om-electron/database/db";
import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import { DatabaseSync } from "node:sqlite";
import { desc, eq } from "drizzle-orm";

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

export interface PreviousDotsImportResult {
    sourcePath: string;
    fieldPropertiesJson: string;
    marchers: PreviousDotsMarcherImport[];
    coordinates: PreviousDotsCoordinateImport[];
}

async function readPreviousDotsFile(
    sourcePath: string,
): Promise<PreviousDotsImportResult> {
    const db = new DatabaseSync(sourcePath, { readOnly: true });
    try {
        const orm = getOrm(db);
        const fieldProperties = await orm.query.field_properties.findFirst({
            columns: { json_data: true },
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

        return {
            sourcePath,
            fieldPropertiesJson: fieldProperties.json_data,
            marchers: marchers.map(({ id: _id, ...marcher }) => marcher),
            coordinates,
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
