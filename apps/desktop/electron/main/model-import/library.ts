/**
 * Storing an imported model in the local Library (ADR 0002 D-12, D-13).
 *
 * A model Version is two parts: `glb` (the normalized GLB) and `sidecar` (the
 * OpenMarch sidecar as canonical JSON). The original file is the Version's
 * `source`, kept in the local Library only and outside the Version hash, so a
 * later pipeline can re-normalize it. Identical imports give identical parts,
 * so re-importing the same file with the same choices reuses the existing
 * Version ("already in your Library").
 */
import type {
    AddVersionResult,
    LibraryStore,
    LicenseInput,
} from "../library/store";
import { sourceFileOf } from "./container";
import type { ModelFileInput, ModelImportResult } from "./types";

/** The Version part roles of a model. */
export const MODEL_PART_GLB = "glb";
export const MODEL_PART_SIDECAR = "sidecar";

export interface SaveModelInput {
    /** The file as imported: kept as the Version's source. */
    file: ModelFileInput;
    result: ModelImportResult;
    name: string;
    tags?: readonly string[];
    license?: LicenseInput;
    /**
     * The item to add this Version to ("New version of …"). Defaults to the
     * Starter kit stamp's `itemId`, if any; a built-in's id makes a user copy.
     */
    itemId?: string;
}

/** The parts of a model Version, by role. */
export function modelVersionParts(
    result: ModelImportResult,
): Record<string, Uint8Array> {
    if (!result.output) {
        throw new Error(
            `cannot store a model import that is ${result.report.status}`,
        );
    }
    return {
        [MODEL_PART_GLB]: result.output.glb,
        [MODEL_PART_SIDECAR]: result.output.sidecarBytes,
    };
}

export function saveModelToLibrary(
    store: LibraryStore,
    input: SaveModelInput,
): Promise<AddVersionResult> {
    const parts = modelVersionParts(input.result);
    const itemId =
        input.itemId ?? input.result.output!.sidecar.stamp.itemId ?? undefined;
    return store.addVersion({
        ...(itemId ? { itemId } : {}),
        kind: "model",
        name: input.name,
        tags: input.tags,
        originalFilename: input.file.filename,
        license: input.license,
        parts,
        source: sourceFileOf(input.file),
    });
}
