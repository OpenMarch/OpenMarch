import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * ENVIRONMENT VARIABLES
 *
 * VITEST_ENABLE_HISTORY - Enable history reporter (Tests undo/redo functionality at the cost of much slower tests)
 * VITEST_ENABLE_SQLJS - Enable better-sqlite3 database driver
 */

export default defineConfig({
    resolve: {
        alias: {
            "@": path.join(__dirname, "src"),
        },
        extensions: [".js", ".ts", ".jsx", ".tsx", ".json"],
    },
    test: {
        // Enable Node.js built-in modules
        globals: true,
        setupFiles: ["./vitest.setup.ts"],
        include: ["**/__test__/**.test.ts?(x)"],
        coverage: {
            reporter: ["text", "json", "json-summary", "html"],
            reportOnFailure: true,
        },
        environmentMatchGlobs: [
            ["src/**", "jsdom"],
            ["electron/**", "node"],
        ],

        pool: "threads",
        testTimeout: 10 * 60 * 1000, // 10 minute global timeout for all tests
    },
});
