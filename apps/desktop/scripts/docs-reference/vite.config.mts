// The smallest Vite setup that can import the app's registries from Node (for generate.mts).
import path from "node:path";
import { defineConfig } from "vite";

const desktop = path.resolve(import.meta.dirname, "../..");
export default defineConfig({
    root: desktop,
    // Tolgee's offline setup (no dev backend, no browser handshake), as in unit tests
    define: { "import.meta.env.VITEST": JSON.stringify("true") },
    resolve: {
        alias: {
            "@": path.join(desktop, "src"),
            "@om-electron": path.join(desktop, "electron"),
        },
    },
});
