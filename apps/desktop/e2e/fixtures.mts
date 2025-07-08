import { test as base, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import crypto from "crypto";

// Resolve __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths similar to _codegen.mjs
const distAssetsDir = path.resolve(__dirname, "../dist-electron/main");
const mainFile = path.resolve(distAssetsDir, "index.js");
const blankDatabaseFile = path.resolve(
    __dirname,
    "./mock-databases/blank.dots",
);
const tempDir = path.resolve(__dirname, "_temp");

// Ensure necessary directories and files exist (similar to _codegen.mjs checks)
if (!fs.existsSync(distAssetsDir)) {
    throw new Error(
        "dist-electron/main directory does not exist. Please run 'pnpm run build:electron' first.",
    );
}
if (!fs.existsSync(mainFile)) {
    throw new Error(
        "dist-electron/main/index.js file does not exist. Please run 'pnpm run build:electron' first.",
    );
}
if (!fs.existsSync(blankDatabaseFile)) {
    throw new Error(
        "mock-databases/blank.dots file does not exist. Please provide a valid .dots file.",
    );
}

type MyFixtures = {
    electronApp: { app: ElectronApplication; databasePath: string; page: Page };
};

export const test = base.extend<MyFixtures>({
    electronApp: async ({}, use) => {
        // Ensure the temporary directory exists
        await fs.ensureDir(tempDir);

        // Create a unique temporary database file
        const tempDatabaseFile = path.resolve(
            tempDir,
            `test-db-${crypto.randomUUID()}.dots`,
        );

        // Copy the blank database to the temporary file
        await fs.copyFile(blankDatabaseFile, tempDatabaseFile);

        console.log("Launching app with args:", [mainFile, tempDatabaseFile]);

        let browser: ElectronApplication | undefined;
        try {
            browser = await electron.launch({
                args: [mainFile, tempDatabaseFile],
                env: {
                    ...process.env,
                    ELECTRON_ENABLE_LOGGING: "1",
                    ELECTRON_ENABLE_STACK_DUMPING: "1",
                    PLAYWRIGHT_SESSION: "true",
                },
            });

            // Capture main process logs (optional, but good for debugging)
            browser.process().stdout?.on("data", (data) => {
                console.log("[MAIN STDOUT]", data.toString().trim());
            });
            browser.process().stderr?.on("data", (data) => {
                console.log("[MAIN STDERR]", data.toString().trim());
            });
            const page = await browser.firstWindow();

            // Provide the ElectronApp instance to the test
            await use({ app: browser, databasePath: tempDatabaseFile, page });
        } finally {
            // Cleanup: Close the browser and delete the temporary database file
            if (browser) {
                await browser.close();
            }
            await fs.remove(tempDatabaseFile);
            console.log(
                "Cleaned up temporary database file:",
                tempDatabaseFile,
            );
        }
    },
});
