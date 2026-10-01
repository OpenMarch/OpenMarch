/**
 * Builds the convert-on-open worker (P9.8) for tests, with Vite as the app
 * build does, so tests start a real worker thread on the same code. The
 * bundle is written under `node_modules/.cache`, so its external packages
 * (drizzle-orm, @openmarch/core) resolve from the desktop package.
 */
import * as fs from "fs";
import * as path from "path";
import { build, type Rollup } from "vite";

const root = path.resolve(__dirname, "../../..");

export interface BuiltConvertWorker {
    /** The worker script to pass to `convertInWorker`. */
    workerPath: string;
    /** Every module in the bundle (absolute ids). */
    moduleIds: string[];
    /** Bare packages and `node:` modules the bundle requires. */
    imports: string[];
    remove(): void;
}

const isBare = (id: string) =>
    !id.startsWith(".") &&
    !id.startsWith("/") &&
    !id.startsWith("@/") &&
    !id.startsWith("@om-electron/") &&
    !id.startsWith("\0");

export async function buildConvertWorker(): Promise<BuiltConvertWorker> {
    const outDir = path.join(
        root,
        "node_modules/.cache/convert-worker-test",
        `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const output = (await build({
        configFile: false,
        logLevel: "silent",
        root,
        resolve: {
            alias: {
                "@": path.join(root, "src"),
                "@om-electron": path.join(root, "electron"),
            },
        },
        build: {
            outDir,
            emptyOutDir: true,
            minify: false,
            ssr: true,
            rollupOptions: {
                input: path.join(
                    root,
                    "electron/database/convertOnOpenWorker.ts",
                ),
                external: (id) => isBare(id) || id.startsWith("node:"),
                output: {
                    format: "cjs",
                    entryFileNames: "convertOnOpenWorker.cjs",
                },
            },
        },
    })) as Rollup.RollupOutput | Rollup.RollupOutput[];
    const chunks = (Array.isArray(output) ? output : [output])
        .flatMap((o) => o.output)
        .filter((c): c is Rollup.OutputChunk => c.type === "chunk");
    return {
        workerPath: path.join(outDir, "convertOnOpenWorker.cjs"),
        moduleIds: chunks.flatMap((c) => c.moduleIds),
        imports: [...new Set(chunks.flatMap((c) => c.imports))],
        remove: () => fs.rmSync(outDir, { recursive: true, force: true }),
    };
}
