/**
 * Writes an imported model to the show's asset store (fork #998). The editor is the show's only
 * writer (ADR 0010 D-4); the worker only returns bytes.
 *
 * The store hashes the parts inside the transaction, so the write gets a short transaction of
 * its own, never a long edit. It is outside undo history: the prop's `items.model` reference is
 * what an edit changes.
 */
import { addShowAssetInTransaction } from "@/db-functions/showAssets";
import type { DbConnection } from "@/db-functions/types";
import type { JsonObject } from "@/showAssets/hash";
import { showAssetRefValue, type ShowAssetRef } from "@/showAssets/ref";
import { MODEL_ASSET_KIND } from "./rules";
import { sidecarJson, type ImportedModel } from "./types";

export async function saveImportedModel({
    db,
    model,
}: {
    db: DbConnection;
    model: ImportedModel;
}): Promise<{
    ref: ShowAssetRef;
    /** False when the show already had this Version (a re-import) */
    added: boolean;
    /** `library:<id>@<version hash>`, for `items.model` */
    modelValue: string;
}> {
    const { ref, added } = await db.transaction(async (tx) =>
        addShowAssetInTransaction({
            tx,
            asset: {
                kind: MODEL_ASSET_KIND,
                name: model.name,
                parts: model.parts,
                sidecar: sidecarJson(model.sidecar),
                credits: model.credits as JsonObject,
            },
        }),
    );
    return { ref, added, modelValue: showAssetRefValue(ref) };
}
