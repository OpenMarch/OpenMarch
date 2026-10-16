import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "../fixtures.mjs";
import { waitForField } from "../app.mjs";
import type { BenchmarkReport } from "../../../src/field/benchmark/frameStats";
import { makeStressShow } from "./stressShow.mjs";

/**
 * The in-app field benchmark (#205) on the parity gate's corpus (#208): both
 * demo shows and the 1,925-marcher stress show.
 * Not a pass/fail suite: it only runs with `BENCHMARK_OUT=<folder>`, and
 * writes each report there as JSON, plus one line per scenario to
 * `summary.tsv` (show, scenario, fps, p95 ms, CPU avg ms, renderer). The browser build is a
 * production build; headless Chromium draws WebGL in software, so its numbers
 * are lower bounds.
 *
 *     BENCHMARK_OUT=/tmp/bench pnpm exec playwright test --project=render benchmark
 */

const out = process.env.BENCHMARK_OUT;
const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);
const DEMOS = path.join(desktop, "view3d-web/public/demos");
const STRESS = path.join(
    process.env.RENDER_OUT ?? path.join(os.tmpdir(), "openmarch-field-render"),
    "stress-1925.dots",
);

const SHOWS = [
    { name: "part1", file: path.join(DEMOS, "part1-demo.dots") },
    { name: "daft-punk", file: path.join(DEMOS, "lhb-daft-punk-pt2.dots") },
    { name: "stress", file: STRESS },
];

for (const show of SHOWS)
    test.describe(show.name, () => {
        test.skip(!out, "set BENCHMARK_OUT to run");
        test.use({ showFile: show.file });
        test.beforeAll(() => {
            fs.mkdirSync(path.dirname(STRESS), { recursive: true });
            if (show.file === STRESS)
                makeStressShow(
                    path.join(DEMOS, "lhb-daft-punk-pt2.dots"),
                    STRESS,
                );
        });

        test("benchmark", async ({ show: app }) => {
            test.setTimeout(600_000);
            const { page } = app;
            await page.setViewportSize({ width: 1600, height: 1000 });
            await page.reload();
            await waitForField(page);
            // Let the show and its stored moves finish loading
            await page.waitForTimeout(5000);
            await page.waitForFunction(() => !!window.fieldBenchmark);
            const report: BenchmarkReport = await page.evaluate(() =>
                window.fieldBenchmark!.run(),
            );
            fs.mkdirSync(out!, { recursive: true });
            fs.writeFileSync(
                path.join(out!, `${show.name}.json`),
                JSON.stringify(report, null, 2),
            );
            const env = report.environment;
            for (const result of report.results)
                fs.appendFileSync(
                    path.join(out!, "summary.tsv"),
                    [
                        show.name,
                        result.kind,
                        ...("stats" in result
                            ? [
                                  result.stats.fps.toFixed(1),
                                  result.stats.intervalP95.toFixed(1),
                                  result.stats.cpuAvg.toFixed(2),
                              ]
                            : ["skipped", "", ""]),
                        `${env.renderer} (${env.gl}), ${env.quality}, ${env.width}x${env.height}@${env.pixelRatio}, ${env.marchers} marchers, ${env.build}`,
                    ].join("\t") + "\n",
                );
        });
    });
