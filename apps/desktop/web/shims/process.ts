/**
 * TEMPORARY (see ../README.md). A `process` global for the main-process code
 * in the web build. `database.services.ts` loads SQLite with
 * `process.getBuiltinModule("node:sqlite")`, which here is `./sqlite.ts`.
 * It has no `versions.node`, so libraries still see a browser.
 */
import * as sqlite from "./sqlite";

const globals = globalThis as unknown as { process?: Record<string, unknown> };

globals.process ??= {
    env: {},
    platform: "browser",
    versions: {},
    cwd: () => "/",
};
globals.process.getBuiltinModule = (name: string) =>
    name === "node:sqlite" || name === "sqlite" ? sqlite : undefined;
