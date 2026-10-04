import { eq } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import {
    defaultVenueForField,
    parseVenueSettings,
    parseVenueSettingsJson,
    type VenueFieldInfo,
    type VenueSettings,
} from "@/view3d/core/venueSettings";

/** The only row id of `view3d_venue` (ADR 0002 D-5). */
export const VIEW3D_VENUE_ROW_ID = 1;

/**
 * Reads the stored venue settings.
 *
 * Returns `undefined` when the show has no `view3d_venue` row, or when the
 * stored JSON doesn't match the schema (logged as a warning). Never writes.
 */
export async function getStoredVenueSettings({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<VenueSettings | undefined> {
    const row = await db
        .select({ json_data: schema.view3d_venue.json_data })
        .from(schema.view3d_venue)
        .where(eq(schema.view3d_venue.id, VIEW3D_VENUE_ROW_ID))
        .get();
    if (!row) return undefined;

    const settings = parseVenueSettingsJson(row.json_data);
    if (!settings)
        console.warn(
            "Ignoring invalid view3d_venue settings; using the default venue",
            row.json_data,
        );
    return settings;
}

/**
 * Reads the venue settings, falling back to the default for the field when
 * nothing valid is stored. Never writes.
 */
export async function getVenueSettings({
    db,
    field,
}: {
    db: DbConnection | DbTransaction;
    field: VenueFieldInfo;
}): Promise<VenueSettings> {
    return (
        (await getStoredVenueSettings({ db })) ?? defaultVenueForField(field)
    );
}

/**
 * Validates and stores the venue settings, creating the row on the first
 * change. Throws a ZodError if `settings` is invalid.
 */
export async function updateVenueSettingsInTransaction({
    tx,
    settings,
}: {
    tx: DbTransaction;
    settings: unknown;
}): Promise<VenueSettings> {
    const validated = parseVenueSettings(settings);
    const json_data = JSON.stringify(validated);
    await tx
        .insert(schema.view3d_venue)
        .values({ id: VIEW3D_VENUE_ROW_ID, json_data })
        .onConflictDoUpdate({
            target: schema.view3d_venue.id,
            set: { json_data },
        })
        .run();
    return validated;
}

/**
 * Validates and stores the venue settings as one undoable history group.
 */
export async function updateVenueSettings({
    db,
    settings,
}: {
    db: DbConnection;
    settings: unknown;
}): Promise<VenueSettings> {
    return await transactionWithHistory(
        db,
        "updateVenueSettings",
        async (tx) => await updateVenueSettingsInTransaction({ tx, settings }),
    );
}
