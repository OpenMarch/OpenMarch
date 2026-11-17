import { eq } from "drizzle-orm";
import { FieldProperties } from "@openmarch/core";
import { schema } from "@/global/database/db";
import {
    runFieldEdits,
    type FieldEditOptions,
    type FieldEditRequest,
    type FieldEditResult,
} from "@/field/edits";
import { transactionWithHistory } from "./history";
import type { DbConnection, DbTransaction } from "./types";

/** The only row of `field_properties` */
const FIELD_PROPERTIES_ROW_ID = 1;

export async function getFieldPropertiesInTransaction({
    tx,
}: {
    tx: DbConnection | DbTransaction;
}): Promise<FieldProperties> {
    const row = await tx
        .select({ json_data: schema.field_properties.json_data })
        .from(schema.field_properties)
        .where(eq(schema.field_properties.id, FIELD_PROPERTIES_ROW_ID))
        .get();
    if (!row) throw new Error("Field properties not found");
    return new FieldProperties(JSON.parse(row.json_data));
}

/** Carries a refusal found inside the transaction out of it, so the transaction rolls back */
class FieldEditNoLongerApplies extends Error {
    constructor(readonly result: FieldEditResult) {
        super(`Field edit ${result.diff.edit} no longer applies`);
    }
}

/**
 * Applies field edits (#823) as one undo step: reads the stored field inside the transaction,
 * runs the edits on it, and writes the result. A refused or empty edit writes nothing and makes
 * no undo step; it resolves (never throws) with a result that says why (`diff.ok`,
 * `diff.errors`, `diff.empty`). That holds when the field changed between the dry run and the
 * write (two quick deletes): the transaction rolls back and the refusal of the second run is
 * what comes back.
 *
 * The dry run is `runFieldEdit`/`runFieldEdits` from `@/field/edits`, with no database.
 * `options` are the edits' (`namer`, `allowGeometryChange`).
 */
export async function applyFieldEdits({
    db,
    edits,
    options,
}: {
    db: DbConnection;
    edits: readonly FieldEditRequest[];
    options?: FieldEditOptions;
}): Promise<FieldEditResult> {
    // A first run outside the transaction: refusals and no-ops must not open an undo step, which
    // transactionWithHistory requires to write something
    const dryRun = runFieldEdits(
        await getFieldPropertiesInTransaction({ tx: db }),
        edits,
        options,
    );
    if (!dryRun.diff.ok || dryRun.diff.empty) return dryRun;
    const name = `fieldEdit:${dryRun.diff.edit}`;
    try {
        return await transactionWithHistory(db, name, async (tx) => {
            // Again on what is stored now, in case another write landed in between
            const result = runFieldEdits(
                await getFieldPropertiesInTransaction({ tx }),
                edits,
                options,
            );
            if (!result.diff.ok || result.diff.empty)
                throw new FieldEditNoLongerApplies(result);
            await tx
                .update(schema.field_properties)
                .set({ json_data: JSON.stringify(result.next) })
                .where(eq(schema.field_properties.id, FIELD_PROPERTIES_ROW_ID));
            return result;
        });
    } catch (error) {
        if (error instanceof FieldEditNoLongerApplies) return error.result;
        throw error;
    }
}

/** applyFieldEdits for one edit */
export async function applyFieldEdit({
    db,
    edit,
    options,
}: {
    db: DbConnection;
    edit: FieldEditRequest;
    options?: FieldEditOptions;
}): Promise<FieldEditResult> {
    return await applyFieldEdits({ db, edits: [edit], options });
}

/** The field as stored (its JSON and its background image), to put back later */
export type FieldSnapshot = {
    readonly json: string;
    readonly image: Uint8Array | null;
};

export async function readFieldSnapshot(
    db: DbConnection,
): Promise<FieldSnapshot> {
    const row = await db
        .select({
            json: schema.field_properties.json_data,
            image: schema.field_properties.image,
        })
        .from(schema.field_properties)
        .where(eq(schema.field_properties.id, FIELD_PROPERTIES_ROW_ID))
        .get();
    if (!row) throw new Error("Field properties not found");
    return { json: row.json, image: toBytes(row.image) };
}

/**
 * Puts the field back as it was in `snapshot` (the Edit field panel's X, #824), as one undo step,
 * so undo brings the discarded changes back. Writes nothing, and makes no undo step, when the
 * field already matches. Resolves with whether it wrote.
 */
export async function restoreFieldSnapshot({
    db,
    snapshot,
}: {
    db: DbConnection;
    snapshot: FieldSnapshot;
}): Promise<boolean> {
    const now = await readFieldSnapshot(db);
    if (now.json === snapshot.json && sameBytes(now.image, snapshot.image))
        return false;
    await transactionWithHistory(db, "fieldEdit:discard", async (tx) => {
        await tx
            .update(schema.field_properties)
            .set({ json_data: snapshot.json, image: snapshot.image })
            .where(eq(schema.field_properties.id, FIELD_PROPERTIES_ROW_ID));
    });
    return true;
}

function toBytes(value: unknown): Uint8Array | null {
    if (value == null) return null;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (Array.isArray(value)) return Uint8Array.from(value as number[]);
    return null;
}

function sameBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
    if (a === null || b === null) return a === b;
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
    return true;
}
