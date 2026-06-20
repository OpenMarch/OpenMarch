/* eslint-disable no-console */
import { expect, test as base, _electron as electron } from "@playwright/test";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "fs-extra";
import initSqlJs from "sql.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDir = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(desktopDir, "../..");
const mainFile = path.resolve(desktopDir, "dist-electron/main/index.js");
const blankDatabaseFile = path.resolve(
    desktopDir,
    "electron/database/migrations/_blank.dots",
);
const audioSqlPath = path.resolve(
    desktopDir,
    "e2e/mock-databases/audio-files.sql",
);
const requireFromDesktop = createRequire(path.join(desktopDir, "package.json"));
const electronExecutable = requireFromDesktop("electron") as string;

const BENCHMARK_SETTINGS = {
    durationSeconds: 300,
    width: 1920,
    height: 1080,
    fps: 60,
    marchers: 120,
    pages: 36,
    overlay: true,
} as const;

const getEnv = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
};

const quote = (value: string | number | null) => {
    if (value === null) return "NULL";
    if (typeof value === "number") return value.toString();
    return `'${value.replaceAll("'", "''")}'`;
};

const benchmarkPathJson = (index: number) =>
    JSON.stringify({
        segments: [
            {
                type: "line",
                data: {
                    startPoint: { x: 80 + index * 12, y: 120 },
                    endPoint: { x: 160 + index * 12, y: 720 },
                },
            },
            {
                type: "quadratic-curve",
                data: {
                    startPoint: { x: 160 + index * 12, y: 720 },
                    controlPoint: { x: 900, y: 180 + index * 8 },
                    endPoint: { x: 1720 - index * 12, y: 820 },
                },
            },
        ],
    });

// eslint-disable-next-line max-lines-per-function
const seedBenchmarkDatabase = async (databasePath: string) => {
    await fs.copyFile(blankDatabaseFile, databasePath);

    const SQL = await initSqlJs({
        locateFile: (file: string) =>
            path.join(desktopDir, "node_modules/sql.js/dist", file),
    });
    const db = new SQL.Database(await fs.readFile(databasePath));
    const statements: string[] = [
        "PRAGMA foreign_keys=OFF",
        "DELETE FROM marcher_pages",
        "DELETE FROM pathways",
        "DELETE FROM marchers",
        "DELETE FROM measures",
        "DELETE FROM pages WHERE id <> 0",
        "DELETE FROM beats WHERE id <> 0",
        "DELETE FROM audio_files",
        "UPDATE utility SET last_page_counts = 8, default_beat_duration = 8.333333333333334 WHERE id = 0",
    ];

    const pageDuration =
        BENCHMARK_SETTINGS.durationSeconds / BENCHMARK_SETTINGS.pages;
    for (let i = 0; i < BENCHMARK_SETTINGS.pages; i++) {
        statements.push(
            `INSERT INTO beats (id, duration, position, include_in_measure) VALUES (${i + 1}, ${pageDuration}, ${i + 1}, 1)`,
        );
    }

    for (let i = 0; i < BENCHMARK_SETTINGS.pages; i++) {
        statements.push(
            `INSERT INTO pages (id, is_subset, start_beat) VALUES (${i + 1}, 0, ${i + 1})`,
        );
    }

    for (let i = 0; i < BENCHMARK_SETTINGS.pages; i += 4) {
        statements.push(
            `INSERT INTO measures (id, start_beat, rehearsal_mark) VALUES (${i / 4 + 1}, ${i + 1}, ${quote(String.fromCharCode(65 + i / 4))})`,
        );
    }

    for (let i = 0; i < 12; i++) {
        statements.push(
            `INSERT INTO pathways (id, path_data) VALUES (${i + 1}, ${quote(benchmarkPathJson(i))})`,
        );
    }

    const sections = [
        "Piccolo",
        "Clarinet",
        "Trumpet",
        "Baritone",
        "Tuba",
        "Color Guard",
    ];
    for (let i = 0; i < BENCHMARK_SETTINGS.marchers; i++) {
        const section = sections[i % sections.length];
        statements.push(
            `INSERT INTO marchers (id, name, section, drill_prefix, drill_order) VALUES (${i + 1}, ${quote(`${section} ${i + 1}`)}, ${quote(section)}, ${quote(section[0])}, ${i + 1})`,
        );
    }

    let marcherPageId = 1;
    for (
        let pageIndex = 0;
        pageIndex <= BENCHMARK_SETTINGS.pages;
        pageIndex++
    ) {
        for (
            let marcherIndex = 0;
            marcherIndex < BENCHMARK_SETTINGS.marchers;
            marcherIndex++
        ) {
            const row = Math.floor(marcherIndex / 12);
            const col = marcherIndex % 12;
            const wave = Math.sin((pageIndex + marcherIndex) / 5);
            const x = 160 + col * 135 + pageIndex * 6 + wave * 24;
            const y = 160 + row * 68 + Math.cos((pageIndex + col) / 4) * 28;
            const pathwayId =
                pageIndex > 0 ? ((marcherIndex + pageIndex) % 12) + 1 : null;
            statements.push(
                `INSERT INTO marcher_pages (id, marcher_id, page_id, x, y, path_data_id, path_start_position, path_end_position, rotation_degrees) VALUES (${marcherPageId++}, ${marcherIndex + 1}, ${pageIndex}, ${x.toFixed(3)}, ${y.toFixed(3)}, ${quote(pathwayId)}, ${pathwayId ? 0 : "NULL"}, ${pathwayId ? 1 : "NULL"}, ${(pageIndex * 10) % 360})`,
            );
        }
    }

    db.exec(`${statements.join(";\n")};`);
    db.exec(await fs.readFile(audioSqlPath, "utf8"));
    db.exec(
        "UPDATE audio_files SET selected = CASE WHEN id = (SELECT MIN(id) FROM audio_files) THEN 1 ELSE 0 END",
    );

    await fs.writeFile(databasePath, db.export());
    db.close();
};

const getGitMetadata = () => {
    const run = (args: string[]) =>
        execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
    return {
        sha: run(["rev-parse", "--short", "HEAD"]),
        branch: run(["branch", "--show-current"]),
    };
};

const waitForFile = async (filePath: string, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await fs.pathExists(filePath)) {
            const size = (await fs.stat(filePath)).size;
            if (size > 0) return size;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for exported video: ${filePath}`);
};

base.setTimeout(900_000);

// eslint-disable-next-line no-empty-pattern
base("video export benchmark", async ({}, testInfo) => {
    const label = getEnv("VIDEO_EXPORT_BENCHMARK_LABEL");
    const resultPath = getEnv("VIDEO_EXPORT_BENCHMARK_RESULT_PATH");
    const exportPath = getEnv("PLAYWRIGHT_VIDEO_EXPORT_PATH");
    const databasePath = path.resolve(
        testInfo.outputDir,
        "video-export-benchmark.dots",
    );
    await fs.ensureDir(testInfo.outputDir);
    await fs.ensureDir(path.dirname(resultPath));
    await seedBenchmarkDatabase(databasePath);

    const app = await electron.launch({
        executablePath: electronExecutable,
        args: [
            mainFile,
            databasePath,
            "--no-audio",
            "--disable-audio-output",
            "--disable-audio-input",
        ],
        env: {
            ...process.env,
            NODE_ENV: "development",
            PLAYWRIGHT_SESSION: "true",
            PLAYWRIGHT_VIDEO_EXPORT_PATH: exportPath,
            ELECTRON_ENABLE_LOGGING: "1",
            ELECTRON_ENABLE_STACK_DUMPING: "1",
        },
    });

    try {
        app.process().stdout?.on("data", (data) =>
            console.log("[MAIN STDOUT]", data.toString().trim()),
        );
        app.process().stderr?.on("data", (data) =>
            console.log("[MAIN STDERR]", data.toString().trim()),
        );
        const page = await app.firstWindow();
        await expect(page.locator("canvas").nth(1)).toBeVisible();

        await page.getByRole("tab", { name: "File" }).click();
        await page.getByRole("button", { name: "Export" }).click();
        await page.getByRole("tab", { name: "Video" }).click();
        await expect(
            page.getByRole("combobox", { name: "1080p" }),
        ).toBeVisible();
        await expect(
            page.getByRole("combobox", { name: "60 fps" }),
        ).toBeVisible();

        const startedAt = performance.now();
        await page.getByRole("button", { name: "Export", exact: true }).click();
        await expect(page.getByText("Export completed!")).toBeVisible({
            timeout: 900_000,
        });
        const elapsedMs = Math.round(performance.now() - startedAt);
        const outputBytes = await waitForFile(exportPath, 30_000);

        await fs.writeJson(
            resultPath,
            {
                label,
                elapsedMs,
                exportPath,
                outputBytes,
                settings: BENCHMARK_SETTINGS,
                git: getGitMetadata(),
                createdAt: new Date().toISOString(),
            },
            { spaces: 4 },
        );
    } finally {
        await app.close();
    }
});
