/* eslint-disable no-console */
/* eslint-disable no-empty-pattern */
import { test as base, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import initSqlJs from "sql.js";
import { expectedAudioFiles } from "./mock-databases/audio-files.mjs";

// Resolve __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths similar to _codegen.mjs
const distAssetsDir = path.resolve(__dirname, "../dist-electron/main");
const mainFile = path.resolve(distAssetsDir, "index.js");
const dbPath = "../electron/database/migrations/_blank.dots";
const blankDatabaseFile = path.resolve(__dirname, dbPath);

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
        `${dbPath} file does not exist. Please provide a valid .dots file.`,
    );
}

const PLAYWRIGHT_ENV = {
    ...process.env,
    NODE_ENV: "development",
    ELECTRON_ENABLE_LOGGING: "1",
    ELECTRON_ENABLE_STACK_DUMPING: "1",
    PLAYWRIGHT_SESSION: "true",
    DISPLAY: ":0",
    DEBUG: "pw:browser",
};

const getTempDotsPath = (testInfo: { outputDir: string }) => {
    return path.resolve(testInfo.outputDir, "temp.dots");
};

/**
 * Utility function to load and apply SQL to a database file
 * @param testInfo - Test info object containing outputDir
 * @param sqlFilename - Name of the SQL file (relative to mock-databases folder)
 */
const loadSqlIntoDatabase = async (
    testInfo: { outputDir: string },
    sqlFilename: string,
): Promise<void> => {
    // Get the path to the temporary database file
    const dbPath = getTempDotsPath(testInfo);

    // Resolve SQL file path relative to mock-databases folder
    const sqlPath = path.resolve(__dirname, "mock-databases", sqlFilename);

    // ✅ Assert database file exists
    if (!fs.existsSync(dbPath)) {
        throw new Error(`Expected DB file at ${dbPath} to exist`);
    }

    // ✅ Assert SQL file exists
    if (!fs.existsSync(sqlPath)) {
        throw new Error(`SQL file not found at ${sqlPath}`);
    }

    // ✅ Load and apply SQL using sql.js
    const sql = fs.readFileSync(sqlPath, "utf-8");
    const dbBuffer = fs.readFileSync(dbPath);

    // Initialize sql.js
    const SQL = await initSqlJs({
        locateFile: (file: string) => `./node_modules/sql.js/dist/${file}`,
    });

    const db = new SQL.Database(dbBuffer);
    db.exec(sql);
    const updatedDbBuffer = db.export();
    fs.writeFileSync(dbPath, updatedDbBuffer);
    db.close();
};

/**ENV ELECTRON_NO_SANDBOX=1
ENV ELECTRON_DISABLE_SECURITY_WARNINGS=1
ENV ELECTRON_ENABLE_LOGGING=1
ENV ELECTRON_ENABLE_STACK_DUMPING=1
ENV ELECTRON_DISABLE_AUDIO=1
ENV ELECTRON_IPC_BUFFER_SIZE=65536 */

type MyFixtures = {
    setupDb: { databasePath: string };
    electronApp: { app: ElectronApplication; databasePath: string; page: Page };
    electronAppEmpty: { app: ElectronApplication; page: Page };
    electronAppNewFile: {
        app: ElectronApplication;
        page: Page;
        newFilePath: string;
    };
    audioFiles: { expectedAudioFiles: string[] };
};
export const test = base.extend<MyFixtures>({
    setupDb: [
        async ({}, use, testInfo) => {
            // Ensure the temporary directory exists
            await fs.ensureDir(testInfo.outputDir);

            // Create a unique temporary database file
            const tempDatabaseFile = getTempDotsPath(testInfo);
            try {
                await fs.copyFile(blankDatabaseFile, tempDatabaseFile);
                await use({ databasePath: tempDatabaseFile });
            } catch (error) {
                console.error("Error setting up database:", error);
                throw error;
            } finally {
                await fs.remove(tempDatabaseFile);
                console.log(
                    "Cleaned up temporary database file:",
                    tempDatabaseFile,
                );
            }
        },
        { auto: true },
    ],
    electronApp: async ({}, use, testInfo) => {
        const tempDatabaseFile = getTempDotsPath(testInfo);
        // assert that the file exists
        if (!fs.existsSync(tempDatabaseFile)) {
            throw new Error(`Expected DB file at ${tempDatabaseFile} to exist`);
        }
        console.log("Launching app with args:", [mainFile, tempDatabaseFile]);

        let browser: ElectronApplication | undefined;
        try {
            browser = await electron.launch({
                args: [
                    mainFile,
                    tempDatabaseFile,
                    "--no-audio",
                    "--disable-audio-output",
                    "--disable-audio-input",
                ],
                env: PLAYWRIGHT_ENV,
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
        }
    },
    electronAppEmpty: async ({}, use) => {
        let browser: ElectronApplication | undefined;
        try {
            browser = await electron.launch({
                args: [
                    mainFile,
                    ".",
                    "--no-audio",
                    "--disable-audio-output",
                    "--disable-audio-input",
                ],
                env: PLAYWRIGHT_ENV,
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
            await use({ app: browser, page });
        } finally {
            // Cleanup: Close the browser and delete the temporary database file
            if (browser) {
                await browser.close();
            }
        }
    },
    /**
     * Fixture for testing new file creation.
     * Launches the app with PLAYWRIGHT_NEW_FILE_PATH env variable set,
     * which causes the main process to use this path instead of showing the save dialog.
     */
    electronAppNewFile: async ({}, use, testInfo) => {
        // Create a path for the new test file in the test output directory
        const newFilePath = path.resolve(
            testInfo.outputDir,
            "new-test-file.dots",
        );

        // Clean up any existing file before test
        if (fs.existsSync(newFilePath)) {
            fs.unlinkSync(newFilePath);
        }

        let browser: ElectronApplication | undefined;
        try {
            browser = await electron.launch({
                args: [
                    mainFile,
                    ".",
                    "--no-audio",
                    "--disable-audio-output",
                    "--disable-audio-input",
                ],
                env: {
                    ...PLAYWRIGHT_ENV,
                    PLAYWRIGHT_NEW_FILE_PATH: newFilePath,
                },
            });

            // Capture main process logs
            browser.process().stdout?.on("data", (data) => {
                console.log("[MAIN STDOUT]", data.toString().trim());
            });
            browser.process().stderr?.on("data", (data) => {
                console.log("[MAIN STDERR]", data.toString().trim());
            });

            const page = await browser.firstWindow();

            await use({ app: browser, page, newFilePath });
        } finally {
            if (browser) {
                await browser.close();
            }
            // Clean up the test file after test
            if (fs.existsSync(newFilePath)) {
                fs.unlinkSync(newFilePath);
            }
        }
    },
    audioFiles: async ({}, use, testInfo) => {
        // Load and apply SQL using the utility function
        await loadSqlIntoDatabase(testInfo, "audio-files.sql");
        await use({ expectedAudioFiles });
    },
});
