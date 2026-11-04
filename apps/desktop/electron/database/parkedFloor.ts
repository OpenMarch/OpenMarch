/**
 * One-way recovery for fork-only files from the parked floor model (user_version 9, fork #285).
 *
 * That model moved the field image into the show's Library tables as a Base floor Artwork
 * (`library_items` + `library_blobs`), named it in `field_properties.json_data` as
 * `floor: { itemId, versionHash }`, and set `field_properties.image` to NULL. Nothing reads the
 * floor now, so without this such a file opens with a blank field. The fill/fit and opacity
 * stayed in the JSON (`imageFillOrFit`, `backgroundImageOpacity`), so putting the image bytes
 * back is enough.
 *
 * Raw SQL on purpose: the Library tables are no longer in the Drizzle schema, but files that
 * ran migration 0021 still have them.
 */
import type { DatabaseSync } from "node:sqlite";

interface FloorRef {
    itemId: string;
    versionHash: string;
}

interface FieldRow {
    json_data: string;
    image: Uint8Array | null;
}

/** The floor `json_data` names, or null. */
function floorOf(json: Record<string, unknown> | null): FloorRef | null {
    const floor = json?.floor as Partial<FloorRef> | undefined;
    return floor &&
        typeof floor.itemId === "string" &&
        floor.itemId.length > 0 &&
        typeof floor.versionHash === "string" &&
        floor.versionHash.length > 0
        ? { itemId: floor.itemId, versionHash: floor.versionHash }
        : null;
}

function parseJson(text: string): Record<string, unknown> | null {
    try {
        const value: unknown = JSON.parse(text);
        return value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

/** True for the raster formats the field image draws directly. */
function isRaster(bytes: Uint8Array): boolean {
    const at = (i: number) => bytes[i];
    const ascii = (from: number, text: string) =>
        [...text].every((c, i) => at(from + i) === c.charCodeAt(0));
    return (
        (at(0) === 0x89 && ascii(1, "PNG")) ||
        (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) ||
        ascii(0, "GIF8") ||
        (ascii(0, "RIFF") && ascii(8, "WEBP"))
    );
}

function hasTable(db: DatabaseSync, name: string): boolean {
    return !!db
        .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(name);
}

function readFieldRow(db: DatabaseSync): FieldRow | undefined {
    return db
        .prepare("SELECT json_data, image FROM field_properties WHERE id = 1")
        .get() as FieldRow | undefined;
}

/** The bytes of the floor's image: its original when that's a raster image, else its display texture. */
function floorImageBytes(db: DatabaseSync, floor: FloorRef): Uint8Array | null {
    if (!hasTable(db, "library_items") || !hasTable(db, "library_blobs"))
        return null;
    const item = db
        .prepare(
            "SELECT parts FROM library_items WHERE item_id = ? AND version_hash = ?",
        )
        .get(floor.itemId, floor.versionHash) as { parts: string } | undefined;
    const parts = item ? parseJson(item.parts) : null;
    if (!parts) return null;
    const blob = (role: string): Uint8Array | null => {
        const hash = parts[role];
        if (typeof hash !== "string") return null;
        const row = db
            .prepare("SELECT data FROM library_blobs WHERE hash = ?")
            .get(hash) as { data: Uint8Array } | undefined;
        return row?.data && row.data.byteLength > 0
            ? new Uint8Array(row.data)
            : null;
    };
    const original = blob("original");
    if (original && isRaster(original)) return original;
    return blob("display") ?? original;
}

export type ParkedFloorImage =
    /** The file has a field image of its own, or names no floor: nothing to recover. */
    | { kind: "none" }
    /** The floor's image, to write back as the field image. */
    | { kind: "found"; bytes: Uint8Array }
    /** The JSON names a floor, but the show doesn't hold its image. */
    | { kind: "missing"; floor: FloorRef };

/** Reads, without writing, the image a parked floor holds for a file whose field image is empty. */
export function readParkedFloorImage(db: DatabaseSync): ParkedFloorImage {
    if (!hasTable(db, "field_properties")) return { kind: "none" };
    const row = readFieldRow(db);
    if (!row || (row.image && row.image.byteLength > 0))
        return { kind: "none" };
    const floor = floorOf(parseJson(row.json_data));
    if (!floor) return { kind: "none" };
    const bytes = floorImageBytes(db, floor);
    return bytes ? { kind: "found", bytes } : { kind: "missing", floor };
}

/**
 * The field image to copy from a previous show: its own, or the image its parked floor holds.
 * Read-only, for "New show from a previous .dots".
 */
export function fieldImageOrParkedFloor(
    db: DatabaseSync,
    image: Uint8Array | null,
): Uint8Array | null {
    if (image && image.byteLength > 0) return new Uint8Array(image);
    const parked = readParkedFloorImage(db);
    if (parked.kind === "missing")
        console.warn(
            `The previous show names a floor (${parked.floor.itemId}) whose image it doesn't hold; its field stays empty`,
        );
    return parked.kind === "found" ? parked.bytes : null;
}

/**
 * Puts a parked floor's image back as `field_properties.image` and drops `floor` from the JSON,
 * outside undo history (the person never made this edit). Run it inside the transaction that
 * writes the file's version back to 8. When the show doesn't hold the floor's image, the field
 * stays empty and a warning is logged.
 */
export function recoverParkedFloorInTransaction(
    db: DatabaseSync,
): "recovered" | "missing" | "none" {
    const parked = readParkedFloorImage(db);
    if (parked.kind === "none") return "none";
    const row = readFieldRow(db)!;
    const { floor: _floor, ...json } = parseJson(row.json_data) ?? {};

    // Leave the undo history alone: set the triggers aside and put them back as they were
    const triggers = db
        .prepare(
            "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'field_properties'",
        )
        .all() as { name: string; sql: string }[];
    for (const trigger of triggers)
        db.exec(`DROP TRIGGER IF EXISTS "${trigger.name}"`);
    if (parked.kind === "found")
        db.prepare(
            "UPDATE field_properties SET image = ?, json_data = ? WHERE id = 1",
        ).run(parked.bytes, JSON.stringify(json));
    else
        db.prepare(
            "UPDATE field_properties SET json_data = ? WHERE id = 1",
        ).run(JSON.stringify(json));
    for (const trigger of triggers) db.exec(trigger.sql);

    if (parked.kind === "missing") {
        console.warn(
            `This file names a floor (${parked.floor.itemId}) whose image it doesn't hold; the field image stays empty`,
        );
        return "missing";
    }
    return "recovered";
}
