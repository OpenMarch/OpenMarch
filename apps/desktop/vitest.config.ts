import { faker } from "@faker-js/faker";
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * ENVIRONMENT VARIABLES
 *
 * VITEST_ENABLE_HISTORY - Enable history reporter (Tests undo/redo functionality at the cost of much slower tests)
 * VITEST_ENABLE_SQLJS - Enable sql.js database driver
 */

export default defineConfig(() => {
    const env = loadEnv("development", __dirname, "");

    return {
        resolve: {
            alias: {
                "@": path.join(__dirname, "src"),
            },
            extensions: [".js", ".ts", ".jsx", ".tsx", ".json"],
        },
        define: Object.fromEntries(
            Object.entries(env)
                .filter(([key]) => key.startsWith("VITE_"))
                .map(([key, value]) => [
                    `import.meta.env.${key}`,
                    JSON.stringify(value),
                ]),
        ),
        test: {
            // Enable Node.js built-in modules
            globals: true,
            setupFiles: ["./vitest.setup.ts"],
            include: ["**/__test__/**.test.ts?(x)"],
            coverage: {
                reporter: ["text", "json", "json-summary", "html"],
                reportOnFailure: true,
            },
            slowTestThreshold: 1000 * 10, // 10 seconds

            pool: "forks",
            environment: "jsdom",
            testTimeout: 10 * 60 * 1000, // 10 minute global timeout for all tests
        },
    };
});
