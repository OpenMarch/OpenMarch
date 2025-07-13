import { _electron as electron } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import { setTimeout } from "node:timers/promises";
import fs from "fs-extra";
import crypto from "crypto";
import initSqlJs from "sql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
    audio: args.includes("-a") || args.includes("--audio"),
    help: args.includes("-h") || args.includes("--help"),
};

// Map of flag to SQL file for easy expansion
const sqlOptions = [
    {
        flag: "audio",
        cli: ["-a", "--audio"],
        sqlFile: "audio-files.sql",
        description: "Apply audio-files.sql to the temporary database",
    },
    // Add more options here as needed
];

// Collect all valid SQL flags in the order they appear, without duplicates
const seenFlags = new Set();
const selectedSqlOptions = [];
for (const arg of args) {
    for (const option of sqlOptions) {
        if (option.cli.includes(arg)) {
            if (seenFlags.has(option.flag)) {
                console.error(
                    `Error: Duplicate flag detected: ${option.cli.join(" or ")}`,
                );
                process.exit(1);
            }
            seenFlags.add(option.flag);
            selectedSqlOptions.push(option);
        }
    }
}

// Show help if requested
if (flags.help) {
    console.log(`\nUsage: node _codegen.mjs [options]\n`);
    for (const option of sqlOptions) {
        console.log(
            `  ${option.cli.join(", ").padEnd(15)}${option.description}`,
        );
    }
    console.log(`  -h, --help     Show this help message\n`);
    console.log(`Examples:`);
    console.log(`  node _codegen.mjs                    # Use blank database`);
    for (const option of sqlOptions) {
        console.log(
            `  node _codegen.mjs ${option.cli[1]}           # ${option.description}`,
        );
    }
    process.exit(0);
}

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

// Initialize sql.js
const SQL = await initSqlJs({
    locateFile: (file) => `./node_modules/sql.js/dist/${file}`,
});

// Apply all selected SQL files in order
for (const selectedSqlOption of selectedSqlOptions) {
    const sqlFilePath = path.resolve(
        __dirname,
        `./mock-databases/${selectedSqlOption.sqlFile}`,
    );
    if (!fs.existsSync(sqlFilePath)) {
        throw new Error(
            `mock-databases/${selectedSqlOption.sqlFile} file does not exist.`,
        );
    }
    console.log(
        `Applying ${selectedSqlOption.sqlFile} to temporary database...`,
    );
    try {
        const sqlContent = await fs.readFile(sqlFilePath, "utf8");
        const dbBuffer = await fs.readFile(tempDatabaseFile);
        const db = new SQL.Database(dbBuffer);
        db.exec(sqlContent);
        const updatedDbBuffer = db.export();
        await fs.writeFile(tempDatabaseFile, updatedDbBuffer);
        db.close();
        console.log(
            `Successfully applied SQL (${sqlContent.length} characters) to database`,
        );
    } catch (error) {
        console.error(`Error applying SQL to database:`, error);
        throw error;
    }
}

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
