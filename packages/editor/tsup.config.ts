import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        "platform/index": "src/platform/index.ts",
    },
    format: ["esm", "cjs"],
    outDir: "dist",
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ["react", "react-dom"],
});
