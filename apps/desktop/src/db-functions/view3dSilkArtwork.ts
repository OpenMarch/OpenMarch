/**
 * The show's imported silk Artwork (fork #973, ADR 0010 amendment
 * 2026-11-15): PNG rows in `view3d_silk_artwork`, named by id. The venue
 * settings' `silkArtwork` names the one the guard's flags start the show
 * with; Silk cues can name others later, so a row is only removed when
 * nothing names it.
 */
import { eq } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import {
    getStoredVenueSettings,
    updateVenueSettingsInTransaction,
} from "./view3dVenue";
import {
    defaultVenueForField,
    type VenueFieldInfo,
} from "@/view3d/core/venueSettings";
import type { SilkArtworkImport } from "@/view3d/core/silkArtwork";

export interface SilkArtworkRow {
    id: number;
    name: string;
    data: Uint8Array;
    width: number;
    height: number;
}

/** One Artwork row by id, or undefined when there is none. */
export async function getSilkArtwork({
    db,
    id,
}: {
    db: DbConnection | DbTransaction;
    id: number;
}): Promise<SilkArtworkRow | undefined> {
    return await db
        .select({
            id: schema.view3d_silk_artwork.id,
            name: schema.view3d_silk_artwork.name,
            data: schema.view3d_silk_artwork.data,
            width: schema.view3d_silk_artwork.width,
            height: schema.view3d_silk_artwork.height,
        })
        .from(schema.view3d_silk_artwork)
        .where(eq(schema.view3d_silk_artwork.id, id))
        .get();
}

/**
 * Makes `artwork` the show's silk Artwork, or removes it with null: adds
 * the row, points the venue settings at it, and deletes the Artwork it
 * replaces, which nothing else names yet. Returns the new row's id, or
 * null.
 */
export async function setSilkArtworkInTransaction({
    tx,
    artwork,
    field,
}: {
    tx: DbTransaction;
    artwork: SilkArtworkImport | null;
    /** For the default venue, when the show has no venue row yet. */
    field: VenueFieldInfo;
}): Promise<number | null> {
    const venue =
        (await getStoredVenueSettings({ db: tx })) ??
        defaultVenueForField(field);
    const previous = venue.silkArtwork;
    let id: number | null = null;
    if (artwork) {
        const row = await tx
            .insert(schema.view3d_silk_artwork)
            .values({
                name: artwork.name,
                data: artwork.data,
                width: artwork.width,
                height: artwork.height,
            })
            .returning({ id: schema.view3d_silk_artwork.id })
            .get();
        id = row.id;
    }
    const { silkArtwork: _old, ...rest } = venue;
    await updateVenueSettingsInTransaction({
        tx,
        settings: id === null ? rest : { ...rest, silkArtwork: id },
    });
    if (previous !== undefined && previous !== id)
        await tx
            .delete(schema.view3d_silk_artwork)
            .where(eq(schema.view3d_silk_artwork.id, previous))
            .run();
    return id;
}

/** {@link setSilkArtworkInTransaction} as one undoable history group. */
export async function setSilkArtwork({
    db,
    artwork,
    field,
}: {
    db: DbConnection;
    artwork: SilkArtworkImport | null;
    field: VenueFieldInfo;
}): Promise<number | null> {
    return await transactionWithHistory(
        db,
        "setSilkArtwork",
        async (tx) => await setSilkArtworkInTransaction({ tx, artwork, field }),
    );
}
