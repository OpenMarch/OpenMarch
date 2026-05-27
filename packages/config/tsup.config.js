import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
    },
    format: ["esm", "cjs"],
    outDir: "dist",
    // tsup injects baseUrl: "." for DTS builds; TS 6 deprecates that (egoist/tsup#1388).
    dts: {
        compilerOptions: {
            ignoreDeprecations: "6.0",
        },
    },
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false, // Keep readable for debugging
});
