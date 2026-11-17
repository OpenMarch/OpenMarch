// cspell:words ndarray
import fs from "node:fs";
import path from "node:path";
import {
    isModelImportWorkerUrl,
    MODEL_IMPORT_WORKER_CSP,
} from "./src/showAssets/modelImport/protocol";

/**
 * What the model import worker (fork #998, `src/showAssets/modelImport/`) needs from the build.
 * Used by the desktop, web and browser-harness builds, for the page and for workers.
 *
 * - `ndarrayAliases`: `ndarray` and `ndarray-pixels` are swapped for stubs.
 *   `@gltf-transform/functions` imports them for helpers the import never calls (it resizes
 *   with `createImageBitmap`; `prune` keeps solid textures). Both compile code with
 *   `Function()` (`ndarray-ops` as it loads), which the worker's CSP refuses. Aliases, not a
 *   plugin, so dev's dependency pre-bundling takes them too.
 * - The dev server sends the worker's script with the worker's own CSP, as the built web app's
 *   `_headers` and the desktop app's main process do (a URL worker takes its policy from its
 *   own response, never from the page).
 * - `virtual:openmarch/draco-decoder` is three's web build of Google's Draco decoder as an ES
 *   module, with its WebAssembly inlined: the worker may not fetch anything, not even its own
 *   files. Only a Draco-compressed import loads it.
 */
const RESOLVED_DRACO_ID = "\0openmarch-draco-decoder";

const stubs = path.join(
    import.meta.dirname,
    "src/showAssets/modelImport/ndarrayStubs.ts",
);

/** `resolve.alias` entries: `{ find, replacement }` */
export const ndarrayAliases = [
    { find: /^ndarray$/, replacement: stubs },
    { find: /^ndarray-pixels$/, replacement: stubs },
];

/**
 * Serves `virtual:openmarch/draco-decoder`, and the worker's CSP from the dev server.
 * @returns {import("vite").Plugin}
 */
export const modelImportWorker = () => ({
    name: "openmarch-model-import-worker",
    enforce: "pre",
    configureServer(server) {
        server.middlewares.use((req, res, next) => {
            if (isModelImportWorkerUrl(`http://dev${req.url ?? ""}`))
                res.setHeader(
                    "Content-Security-Policy",
                    MODEL_IMPORT_WORKER_CSP,
                );
            next();
        });
    },
    resolveId: {
        filter: { id: /^virtual:openmarch\/draco-decoder$/ },
        handler: () => RESOLVED_DRACO_ID,
    },
    load: {
        filter: { id: /^\0openmarch-draco-decoder$/ },
        handler() {
            const dir = path.join(
                import.meta.dirname,
                "node_modules/three/examples/jsm/libs/draco/gltf",
            );
            const wrapper = fs.readFileSync(
                path.join(dir, "draco_wasm_wrapper.js"),
                "utf8",
            );
            const wasm = fs
                .readFileSync(path.join(dir, "draco_decoder.wasm"))
                .toString("base64");
            return [
                // Its UMD footer only exports for CommonJS and AMD; the ES export is below
                wrapper.replace(
                    /"object"===typeof exports&&"object"===typeof module[\s\S]*$/,
                    "",
                ),
                `const wasmBase64 = ${JSON.stringify(wasm)};`,
                "export const wasmBinary = Uint8Array.from(atob(wasmBase64), (c) => c.charCodeAt(0));",
                "export default DracoDecoderModule;",
            ].join("\n");
        },
    },
});
