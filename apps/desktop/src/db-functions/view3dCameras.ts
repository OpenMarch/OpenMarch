import { eq } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { DbConnection, DbTransaction } from "./types";
import {
    EMPTY_SHOW_CAMERAS,
    parseShowCamerasJson,
    showCamerasSchema,
    type ShowCameras,
} from "@/view3d/core/cameraList";

/** The only row id of `view3d_cameras` (ADR 0002 D-5). */
export const VIEW3D_CAMERAS_ROW_ID = 1;

/**
 * Reads the show's camera lists. No row, or JSON that doesn't match the
 * schema (logged as a warning), means every venue uses its defaults. Never
 * writes.
 */
export async function getShowCameras({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<ShowCameras> {
    let row: { json_data: string } | undefined;
    try {
        row = await db
            .select({ json_data: schema.view3d_cameras.json_data })
            .from(schema.view3d_cameras)
            .where(eq(schema.view3d_cameras.id, VIEW3D_CAMERAS_ROW_ID))
            .get();
    } catch (error) {
        // A read failure must not keep the 3D View from opening.
        console.warn("Couldn't read view3d_cameras; using the defaults", error);
        return EMPTY_SHOW_CAMERAS;
    }
    if (!row) return EMPTY_SHOW_CAMERAS;
    const cameras = parseShowCamerasJson(row.json_data);
    if (!cameras) {
        console.warn(
            "Ignoring invalid view3d_cameras; using the default cameras",
            row.json_data,
        );
        return EMPTY_SHOW_CAMERAS;
    }
    return cameras;
}

/**
 * Validates and stores the show's camera lists, creating the row on the
 * first change. Deliberately outside the undo history: camera lists are view
 * setup, and the table has no undo triggers. Throws a ZodError if `cameras`
 * is invalid.
 */
export async function updateShowCameras({
    db,
    cameras,
}: {
    db: DbConnection;
    cameras: unknown;
}): Promise<ShowCameras> {
    const validated = showCamerasSchema.parse(cameras);
    const json_data = JSON.stringify(validated);
    await db
        .insert(schema.view3d_cameras)
        .values({ id: VIEW3D_CAMERAS_ROW_ID, json_data })
        .onConflictDoUpdate({
            target: schema.view3d_cameras.id,
            set: { json_data },
        })
        .run();
    return validated;
}
