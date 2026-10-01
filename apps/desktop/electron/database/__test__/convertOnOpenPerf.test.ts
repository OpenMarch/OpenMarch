// @vitest-environment node
/**
 * Timing of the convert-on-open backup and conversion on a large show (P9.8).
 * Skipped unless `OPENMARCH_PERF=1`, since it takes several seconds; the
 * numbers go into docs/timeline/findings.md.
 *
 *   OPENMARCH_PERF=1 pnpm exec vitest run electron/database/__test__/convertOnOpenPerf.test.ts
 *
 * `OPENMARCH_PERF_SIZE=250x50` changes the size (marchers x pages).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DatabaseSync } from "node:sqlite";
import { backupBeforeConversion } from "../backup";
import { convertFileOnOpen } from "../convertOnOpen";
import { createLargePageShow, stateOf } from "./convertOnOpenFixtures";

const [marchers, pages] = (process.env.OPENMARCH_PERF_SIZE ?? "400x100")
    .split("x")
    .map(Number) as [number, number];

describe.runIf(process.env.OPENMARCH_PERF === "1")(
    "convert on open timing",
    () => {
        let tempDir: string;
        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-perf-"));
            vi.spyOn(console, "log").mockImplementation(() => {});
        });
        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
            vi.restoreAllMocks();
        });

        it(`${marchers} marchers by ${pages} pages`, async () => {
            const showPath = path.join(tempDir, "large.dots");
            await createLargePageShow(showPath, { marchers, pages });
            const bytes = fs.statSync(showPath).size;

            let t = performance.now();
            const backup = backupBeforeConversion(showPath);
            const backupMs = performance.now() - t;
            expect(backup.ok).toBe(true);

            const db = new DatabaseSync(showPath);
            let result;
            const steps: string[] = [];
            t = performance.now();
            let last = t;
            try {
                result = await convertFileOnOpen(showPath, db, {
                    backup: () => backup,
                    afterStep: (step) => {
                        const now = performance.now();
                        steps.push(`${step} ${(now - last).toFixed(0)}`);
                        last = now;
                    },
                });
            } finally {
                db.close();
            }
            const convertMs = performance.now() - t;
            process.stdout.write(`\nP9.8 steps (ms): ${steps.join(", ")}\n`);
            expect(result.status).toBe("converted");
            expect(stateOf(showPath).assignments).toBe(marchers * pages);

            process.stdout.write(
                `\nP9.8 timing: ${marchers}x${pages}, ${(bytes / 1e6).toFixed(1)} MB: backup ${backupMs.toFixed(0)} ms, conversion ${convertMs.toFixed(0)} ms\n`,
            );
        }, 300_000);
    },
);
