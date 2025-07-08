import { _electron as electron } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import { setTimeout } from "node:timers/promises";
import fs from "fs-extra";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distAssetsDir = path.resolve(__dirname, "../dist-electron/main");
if (!fs.existsSync(distAssetsDir)) {
    throw new Error(
        "dist-electron/main directory does not exist. Please run 'pnpm run build:electron' first.",
    );
}
const mainFile = path.resolve(distAssetsDir, "index.js");
if (!fs.existsSync(mainFile)) {
    throw new Error(
        "dist-electron/main/index.js file does not exist. Please run 'pnpm run build:electron' first.",
    );
}
const databaseFile = path.resolve(__dirname, "./mock-databases/blank.dots");
if (!fs.existsSync(databaseFile)) {
    throw new Error(
        "mock-databases/blank.dots file does not exist. Please provide a valid .dots file.",
    );
}

const tempDir = path.resolve(__dirname, "_temp");
await fs.ensureDir(tempDir);
const tempDatabaseFile = path.resolve(
    tempDir,
    `codegen-db-${crypto.randomUUID()}.dots`,
);
await fs.copyFile(databaseFile, tempDatabaseFile);

console.log("Launching app with args:", [mainFile, tempDatabaseFile]);

let browser;
try {
    browser = await electron.launch({
        args: [mainFile, tempDatabaseFile],
        // Enable logging
        env: {
            ...process.env,
            // Enable Electron logging
            ELECTRON_ENABLE_LOGGING: "1",
            ELECTRON_ENABLE_STACK_DUMPING: "1",
            // Set codegen flag for app-specific behavior
            PLAYWRIGHT_CODEGEN: "true",
        },
    });

    // Capture main process logs
    browser.process().stdout?.on("data", (data) => {
        console.log("[MAIN STDOUT]", data.toString().trim());
    });

    browser.process().stderr?.on("data", (data) => {
        console.log("[MAIN STDERR]", data.toString().trim());
    });

    const context = await browser.context({
        viewport: { width: 1920, height: 1080 },
    });

    // Capture console logs from renderer process
    context.on("console", (msg) => {
        const type = msg.type();
        const text = msg.text();
        console.log(`[RENDERER ${type.toUpperCase()}]`, text);
    });

    // Capture page errors
    context.on("page", (page) => {
        page.on("console", (msg) => {
            const type = msg.type();
            const text = msg.text();
            console.log(`[PAGE ${type.toUpperCase()}]`, text);
        });

        page.on("pageerror", (error) => {
            console.log("[PAGE ERROR]", error.message);
            console.log("[PAGE ERROR STACK]", error.stack);
        });

        page.on("crash", () => {
            console.log("[PAGE CRASH]");
        });
    });

    await context.route("**/*", (route) => route.continue());

    await setTimeout(3000); // wait for the window to load
    await browser.windows()[0].pause(); // .pause() opens the Playwright-Inspector for manual recording
} finally {
    if (browser) {
        await browser.close();
    }
    await fs.remove(tempDatabaseFile);
    console.log("Cleaned up temporary database file:", tempDatabaseFile);
}
