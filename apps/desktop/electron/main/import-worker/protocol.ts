/**
 * Messages between main and the import worker (C1.9 §6, owner decision
 * Q46): a `utilityProcess` that runs the model pipeline and template
 * generation, so their synchronous WASM and encoding work never blocks
 * main's event loop, and a crash takes down only the worker.
 *
 * The worker never sees a path and never writes the Library: main reads the
 * files, sends bytes, and stores what comes back. Byte arrays are copied
 * (utility `postMessage` transfers only ports).
 */
import type { TemplateFormat } from "../../../src/view3d/library/protocol";
import type {
    ModelFileInput,
    ModelImportChoices,
    ModelImportResult,
    ModelImportStage,
    ModelKind,
} from "../model-import/types";

export interface WorkerOps {
    "model-import": {
        input: {
            file: ModelFileInput;
            kind?: ModelKind;
            choices: ModelImportChoices;
        };
        output: ModelImportResult;
    };
    template: {
        input: { surfaceId: string; format: TemplateFormat };
        output: { filename: string; mimeType: string; bytes: Uint8Array };
    };
}
export type WorkerOp = keyof WorkerOps;

export type WorkerRequest = {
    [K in WorkerOp]: { jobId: number; op: K; input: WorkerOps[K]["input"] };
}[WorkerOp];

export type WorkerResponse =
    | { jobId: number; stage: ModelImportStage }
    | { jobId: number; ok: true; output: unknown }
    | {
          jobId: number;
          ok: false;
          /** `not-found`: an unknown template surface; `failed`: anything thrown. */
          error: { code: "not-found" | "failed"; message: string };
      };
