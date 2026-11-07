// The smallest Vite setup that can import the app's registries from Node (for generate.mts).
import path from "node:path";
import { defineConfig } from "vite";

const desktop = path.resolve(import.meta.dirname, "../..");
const stub = path.join(import.meta.dirname, "electron-stub.mts");
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
    plugins: [
        {
            // The application menu's template imports Electron and the main process, neither of
            // which can load in Node; the template only needs `app.name` from them
            name: "stub-electron-main",
            enforce: "pre",
            resolveId(source, importer) {
                if (source === "electron") return stub;
                if (
                    importer?.endsWith("electron/main/application-menu.ts") &&
                    (source === "./index" || source === "./view3dWindow")
                )
                    return stub;
                return null;
            },
        },
    ],
});
