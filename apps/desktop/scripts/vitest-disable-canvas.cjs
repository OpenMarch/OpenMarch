/**
 * Prevent Vitest/jsdom from loading node-canvas native bindings.
 *
 * In Linux CI, loading canvas can preload a bundled libstdc++.so.6 that is too old
 * for better-sqlite3, causing GLIBCXX symbol errors. Returning MODULE_NOT_FOUND keeps
 * jsdom on its no-canvas code path, which is acceptable for our DB-focused tests.
 */
const Module = require("node:module");

const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "canvas") {
        const error = new Error("Cannot find module 'canvas'");
        error.code = "MODULE_NOT_FOUND";
        throw error;
    }

    return originalLoad.call(this, request, parent, isMain);
};
