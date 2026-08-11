#!/usr/bin/env node
/* eslint-disable no-console */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "../..");
const resultsDir = path.join(desktopDir, "e2e", "benchmark-results");

const args = process.argv.slice(2);
let label;
let compareLabel;
let keepVideo = false;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
        continue;
    } else if (arg === "--label") {
        label = args[++i];
    } else if (arg === "--compare") {
        compareLabel = args[++i];
    } else if (arg === "--keep-video") {
        keepVideo = true;
    } else {
        throw new Error(`Unknown argument: ${arg}`);
    }
}

if (!label) {
    throw new Error(
        "Usage: pnpm bench:video-export -- --label <name> [--compare <name>] [--keep-video]",
    );
}

if (!/^[a-zA-Z0-9._-]+$/.test(label)) {
    throw new Error(
        "--label may only contain letters, numbers, dot, underscore, and dash",
    );
}
if (compareLabel && !/^[a-zA-Z0-9._-]+$/.test(compareLabel)) {
    throw new Error(
        "--compare may only contain letters, numbers, dot, underscore, and dash",
    );
}

mkdirSync(resultsDir, { recursive: true });

const resultPath = path.join(resultsDir, `video-export-${label}.json`);
const exportPath = path.join(resultsDir, `video-export-${label}.mp4`);
const comparePath = compareLabel
    ? path.join(resultsDir, `video-export-${compareLabel}.json`)
    : null;
if (comparePath && !existsSync(comparePath)) {
    throw new Error(`Comparison result not found: ${comparePath}`);
}
rmSync(resultPath, { force: true });
rmSync(exportPath, { force: true });

const run = (command, commandArgs, options = {}) => {
    const result = spawnSync(command, commandArgs, {
        cwd: desktopDir,
        stdio: "inherit",
        shell: process.platform === "win32",
        ...options,
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

run("pnpm", ["run", "build:electron"]);
run(
    "pnpm",
    [
        "exec",
        "playwright",
        "test",
        "e2e/tests/video-export-benchmark.spec.mts",
        "--timeout",
        "900000",
    ],
    {
        env: {
            ...process.env,
            VIDEO_EXPORT_BENCHMARK_LABEL: label,
            VIDEO_EXPORT_BENCHMARK_RESULT_PATH: resultPath,
            PLAYWRIGHT_VIDEO_EXPORT_PATH: exportPath,
            PLAYWRIGHT_SESSION: "true",
            VITE_PUBLIC_PLAYWRIGHT_SESSION: "true",
        },
    },
);

if (!existsSync(resultPath)) {
    throw new Error(`Benchmark result was not written: ${resultPath}`);
}

const result = JSON.parse(readFileSync(resultPath, "utf8"));
if (!keepVideo && result.exportPath && existsSync(result.exportPath)) {
    rmSync(result.exportPath, { force: true });
}

const formatSeconds = (elapsedMs) => `${(elapsedMs / 1000).toFixed(1)}s`;
const relativeResultPath = path.relative(repoRoot, resultPath);

console.log("Video export benchmark");
if (compareLabel) {
    const previous = JSON.parse(readFileSync(comparePath, "utf8"));
    const delta =
        ((result.elapsedMs - previous.elapsedMs) / previous.elapsedMs) * 100;
    console.log(`${compareLabel}: ${formatSeconds(previous.elapsedMs)}`);
    console.log(`${label}: ${formatSeconds(result.elapsedMs)}`);
    console.log(`delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`);
} else {
    console.log(`label: ${label}`);
    console.log(`elapsed: ${formatSeconds(result.elapsedMs)}`);
}
console.log(`output: ${relativeResultPath}`);

if (keepVideo && existsSync(exportPath)) {
    console.log(
        `video: ${path.relative(repoRoot, exportPath)} (${statSync(exportPath).size} bytes)`,
    );
}
