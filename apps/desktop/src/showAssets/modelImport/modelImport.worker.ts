// cspell:words meshoptimizer
/**
 * The model import worker (fork #998; ADR 0010 amendment 2026-11-15, "Import runs in a renderer
 * Web Worker"). It gets the picked files by message and returns finished bytes; it never reads a
 * path, fetches or writes the show.
 *
 * It runs under its own CSP in every environment (`MODEL_IMPORT_WORKER_CSP`): its own script and
 * WebAssembly (meshoptimizer, Draco), nothing else.
 */
import { browserImageCodec } from "./imageCodec";
import { importModel } from "./pipeline";
import type {
    ModelImportProbe,
    ModelImportRequest,
    ModelImportResponse,
} from "./protocol";

/** The smallest valid WebAssembly module */
const EMPTY_WASM = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);

async function loadDraco(): Promise<unknown> {
    const { default: createDecoderModule, wasmBinary } =
        await import("virtual:openmarch/draco-decoder");
    return createDecoderModule({ wasmBinary });
}

async function probe(): Promise<ModelImportProbe> {
    const outcome = async (attempt: () => unknown) => {
        try {
            await attempt();
            return "allowed";
        } catch (error) {
            return `refused: ${String(error)}`;
        }
    };
    return {
        type: "probe",
        wasm: await outcome(() => WebAssembly.compile(EMPTY_WASM)),
        fetch: await outcome(() => fetch(globalThis.location.href)),
        // eslint-disable-next-line no-new-func -- checks that the worker's CSP refuses it
        evalFunction: await outcome(() => new Function("return 1")()),
    };
}

const reply = (message: ModelImportResponse, transfer: Transferable[] = []) =>
    postMessage(message, { transfer });

onmessage = async (event: MessageEvent<ModelImportRequest>) => {
    const request = event.data;
    if (request.type === "probe") {
        reply(await probe());
        return;
    }
    try {
        const result = await importModel(request.files, request.choices, {
            images: browserImageCodec,
            dracoDecoder: loadDraco,
        });
        const buffers = result.ok
            ? new Set(Object.values(result.model.parts).map((p) => p.buffer))
            : new Set<ArrayBufferLike>();
        reply({ type: "result", result }, [...buffers] as Transferable[]);
    } catch (error) {
        reply({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
        });
    }
};
