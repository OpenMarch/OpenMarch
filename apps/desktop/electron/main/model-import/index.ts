/**
 * The model import pipeline (package C1.7). Main process only; no IPC here
 * (the channels are package C1.9) and no UI (the review is C1.10).
 *
 * `importModel` / `importModelFile` run the pipeline and return the import
 * report plus, when ready, the normalized GLB and sidecar.
 * `saveModelToLibrary` stores a ready result in the local Library as a
 * Version with the parts `glb` and `sidecar`.
 */
export { importModel, importModelFile } from "./pipeline";
export { readModelFile, sourceFileOf } from "./container";
export {
    MODEL_PART_GLB,
    MODEL_PART_SIDECAR,
    modelVersionParts,
    saveModelToLibrary,
    type SaveModelInput,
} from "./library";
export * from "./rules";
export * from "./types";
