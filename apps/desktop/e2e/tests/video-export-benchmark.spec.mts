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

const resolutionLabel = (height: number) =>
    height === 2160 ? "4K" : `${height}p`;
const BENCHMARK_RESOLUTION_LABEL = resolutionLabel(BENCHMARK_SETTINGS.height);
const BENCHMARK_FRAME_RATE_LABEL = `${BENCHMARK_SETTINGS.fps} fps`;

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
        "DELETE FROM timeline_assignments",
        "DELETE FROM timeline_slot_destinations",
        "DELETE FROM timeline_transitions",
        "DELETE FROM timelines",
        "DELETE FROM marchers",
        "DELETE FROM measures",
        "DELETE FROM pages WHERE id <> 0",
        "DELETE FROM beats WHERE id <> 0",
        "DELETE FROM audio_files",
        // One beat per page, the last page included
        "UPDATE utility SET last_page_counts = 1, default_beat_duration = 8.333333333333334 WHERE id = 0",
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

    const sections = [
        "Piccolo",
        "Clarinet",
        "Trumpet",
        "Baritone",
        "Tuba",
        "Color Guard",
    ];
    const position = (pageIndex: number, marcherIndex: number) => {
        const row = Math.floor(marcherIndex / 12);
        const col = marcherIndex % 12;
        const wave = Math.sin((pageIndex + marcherIndex) / 5);
        return {
            x: (160 + col * 135 + pageIndex * 6 + wave * 24).toFixed(3),
            y: (160 + row * 68 + Math.cos((pageIndex + col) / 4) * 28).toFixed(
                3,
            ),
        };
    };

    // Page 0's positions are the marchers' homes
    for (let i = 0; i < BENCHMARK_SETTINGS.marchers; i++) {
        const section = sections[i % sections.length]!;
        const { x, y } = position(0, i);
        statements.push(
            `INSERT INTO marchers (id, name, section, drill_prefix, drill_order, home_x, home_y) VALUES (${i + 1}, ${quote(`${section} ${i + 1}`)}, ${quote(section)}, ${quote(section.charAt(0))}, ${i + 1}, ${x}, ${y})`,
        );
    }

    // Each later page is one move over its beat, as convert on open writes a
    // page: a timeline with one transition and a destination per marcher.
    // Every third page moves along an arc, so the export draws curved paths.
    for (let page = 1; page <= BENCHMARK_SETTINGS.pages; page++) {
        const range = `${page}, ${page + 1}`;
        const style =
            page % 3 === 0
                ? `'arc', ${quote(JSON.stringify({ bulge: 0.3 }))}`
                : "'direct', NULL";
        statements.push(
            `INSERT INTO timelines (id, start_beat, end_beat) VALUES (${page}, ${range})`,
            `INSERT INTO timeline_transitions (id, timeline_id, path_style, path_params, slot_count, start_beat, end_beat) VALUES (${page}, ${page}, ${style}, ${BENCHMARK_SETTINGS.marchers}, ${range})`,
        );
        for (let i = 0; i < BENCHMARK_SETTINGS.marchers; i++) {
            const { x, y } = position(page, i);
            statements.push(
                `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (${page}, ${i}, ${x}, ${y})`,
                `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat) VALUES (${i + 1}, ${page}, ${i}, ${range})`,
            );
        }
    }
    // Seeded rows are already in the tables the resolver builds from
    statements.push("DELETE FROM timeline_change_log");

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

base.skip(
    !process.env.VIDEO_EXPORT_BENCHMARK_LABEL,
    "Run via `pnpm bench:video-export` to execute the video export benchmark",
);

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
            NODE_ENV: "production",
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

        await page.getByRole("combobox", { name: /^(720p|1080p|4K)$/ }).click();
        await page
            .getByRole("option", { name: BENCHMARK_RESOLUTION_LABEL })
            .click();
        await expect(
            page.getByRole("combobox", { name: BENCHMARK_RESOLUTION_LABEL }),
        ).toBeVisible();

        await page.getByRole("combobox", { name: /^\d+ fps$/ }).click();
        await page
            .getByRole("option", { name: BENCHMARK_FRAME_RATE_LABEL })
            .click();
        await expect(
            page.getByRole("combobox", { name: BENCHMARK_FRAME_RATE_LABEL }),
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
