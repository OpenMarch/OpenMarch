import { eq } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { runFieldEdits, type FieldEditRequest } from "@/field/edits";
import { getFieldPropertiesInTransaction } from "./fieldEdits";
import { transactionWithHistory } from "./history";
import type { DbConnection } from "./types";

/** The only row of `field_properties` */
const FIELD_PROPERTIES_ROW_ID = 1;

/**
 * Sets the field's background image (or removes it, with `image` null) and, in the same
 * transaction, applies field edits that go with it (#824): importing an image also turns it on,
 * and both are one undo step.
 *
 * The image lives in its own column, beside the field's JSON, so it can't be a field edit
 * (`applyFieldEdits`); this writes both. The edits are checked like any field edit: a refused one
 * throws and nothing is written, and an empty one only skips the JSON.
 */
export async function setFieldImage({
    db,
    image,
    edits = [],
}: {
    db: DbConnection;
    image: Uint8Array | null;
    edits?: readonly FieldEditRequest[];
}): Promise<void> {
    await transactionWithHistory(
        db,
        image ? "fieldImage:import" : "fieldImage:remove",
        async (tx) => {
            await tx
                .update(schema.field_properties)
                .set({ image })
                .where(eq(schema.field_properties.id, FIELD_PROPERTIES_ROW_ID));
            if (edits.length === 0) return;
            const result = runFieldEdits(
                await getFieldPropertiesInTransaction({ tx }),
                edits,
            );
            if (!result.diff.ok)
                throw new Error(
                    `Field edit ${result.diff.edit} refused: ${result.diff.errors.map((e) => e.message).join("; ")}`,
                );
            if (result.diff.empty) return;
            await tx
                .update(schema.field_properties)
                .set({ json_data: JSON.stringify(result.next) })
                .where(eq(schema.field_properties.id, FIELD_PROPERTIES_ROW_ID));
        },
    );
}
