/* eslint-disable no-console -- the opt-in runner reports to the terminal */
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { drizzle as sqliteProxyDrizzle } from "drizzle-orm/sqlite-proxy";
import { schema, type DbConnection } from "@/test/base";
import { handleSqlProxyWithDbBetterSqlite } from "@/test/sqlProxyTestUtil";
import { createAllUndoTriggers } from "@/db-functions";
import { resetTimelineChangeLog } from "@/db-functions/history";
import { setDbPath, connect } from "@/../electron/database/database.services";
import { getOrm } from "@/../electron/database/db";
import { DrizzleMigrationService } from "@/../electron/database/services/DrizzleMigrationService";
import { applyFileVersionDecision } from "@/../electron/database/fileVersion";
import { convertPagesToTimeline } from "../convert/writePageConversion";
import { describePageConversionReport } from "../convert/planPageConversion";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
} from "../timelineStore";
import { compareConversion, lossReportCounts } from "./conversionEquality";

/**
 * The conversion corpus runner (docs/timeline/phases/06-converter.md P6.6). Opt-in and skipped by
 * default: it runs only when `OPENMARCH_CONVERSION_CORPUS` lists `.dots` files, separated by the
 * platform's path delimiter (`:` on macOS and Linux).
 *
 *   OPENMARCH_CONVERSION_CORPUS="/path/a.dots:/path/b.dots" \
 *   OPENMARCH_CONVERSION_REPORT=/tmp/conversion-corpus.json \
 *   pnpm run test:focused src/timeline/__test__/conversionCorpus.test.ts
 *
 * Each file is copied to a temporary directory first; the original is only ever read (its hash is
 * checked before and after). The copy is opened the way the app opens a file (`setActiveDb`:
 * version check, pending migrations, then the renderer's undo triggers and change-log reset),
 * converted with the dev command's edit (`convertPagesToTimeline`), and compared with page-mode
 * playback by `compareConversion`. The JSON report (default: `conversion-corpus-<random>.json` in
 * the OS temporary directory) must be outside any git checkout, because real shows stay out of
 * the repository; it holds coordinates but not the source paths. Only aggregate numbers may be
 * logged in the repository.
 */

const CORPUS = (process.env.OPENMARCH_CONVERSION_CORPUS ?? "")
    .split(path.delimiter)
    .map((p) => p.trim())
    .filter(Boolean);
const REPORT_PATH = path.resolve(
    process.env.OPENMARCH_CONVERSION_REPORT ??
        path.join(os.tmpdir(), `conversion-corpus-${randomUUID()}.json`),
);
const MIGRATIONS = path.resolve(
    __dirname,
    "../../../electron/database/migrations",
);

const sha256 = (file: string) =>
    createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/**
 * True when `file` would land inside a git checkout: its parent directory, with symlinks resolved,
 * is in a work tree. Catches nested checkouts, symlinks and case variants.
 */
function insideGitCheckout(file: string): boolean {
    const dir = fs.realpathSync(path.dirname(file));
    try {
        execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
            stdio: "ignore",
        });
        return true;
    } catch {
        return false;
    }
}

/** The database steps of `setActiveDb` in `electron/main/index.ts`, on an existing file. */
async function openLikeTheApp(file: string): Promise<void> {
    const code = setDbPath(file, false);
    if (code !== 200) throw new Error(`the file was refused (status ${code})`);
    const raw = connect();
    try {
        const orm = getOrm(raw);
        applyFileVersionDecision(raw, false);
        await new DrizzleMigrationService(orm, raw).applyPendingMigrations(
            MIGRATIONS,
        );
    } finally {
        raw.close();
    }
}

afterEach(() => stopTimelineResolver());

describe.skipIf(CORPUS.length === 0)("conversion corpus (opt-in)", () => {
    it("converts each show and compares it with page-mode playback", async () => {
        expect(
            insideGitCheckout(REPORT_PATH),
            "the report must be written outside any git checkout",
        ).toBe(false);

        const shows = [];
        for (const [i, source] of CORPUS.entries()) {
            const label = `show-${i + 1}`;
            const before = sha256(source);
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-corpus-"));
            const copy = path.join(dir, `${label}.dots`);
            let after: string | undefined;
            try {
                fs.copyFileSync(source, copy);
                expect(sha256(copy), `${label}: the copy matches`).toBe(before);
                await openLikeTheApp(copy);
                const sqlite = new DatabaseSync(copy);
                try {
                    const db = sqliteProxyDrizzle(
                        async (sql, params, method) =>
                            handleSqlProxyWithDbBetterSqlite(
                                sqlite,
                                sql,
                                params,
                                method,
                            ),
                        { schema, casing: "snake_case" },
                    ) as unknown as DbConnection;
                    await createAllUndoTriggers(db);
                    await resetTimelineChangeLog(db);
                    const started = Date.now();
                    const { report } = await convertPagesToTimeline(db, {
                        replace: true,
                    });
                    const convertMs = Date.now() - started;
                    await startTimelineResolver(db);
                    await timelineResolverSettled();
                    const equality = await compareConversion(db, {
                        interiorSamples: 4,
                        keepSamples: 6,
                    });
                    shows.push({
                        label,
                        convertMs,
                        loss: lossReportCounts(report),
                        lossLines: describePageConversionReport(report),
                        equality,
                    });
                    console.info(
                        `${label}: ${equality.marchers} marchers, ${equality.pages} pages; page ends max ${equality.pageEnd.max} (${equality.pageEnd.exact}/${equality.pageEnd.samples} exact); inside max ${equality.plain.max}`,
                    );
                } finally {
                    stopTimelineResolver();
                    sqlite.close();
                }
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
                after = sha256(source);
            }
            expect(after, `${label}: the original is unchanged`).toBe(before);
        }

        fs.writeFileSync(
            REPORT_PATH,
            JSON.stringify(
                { createdAt: new Date().toISOString(), shows },
                null,
                1,
            ),
        );
        console.info(`wrote ${REPORT_PATH}`);
        // Page ends are exact, and straight moves inside pages match at the same beat and, on
        // even-tempo pages, in milliseconds. Marchers without a row glide or hold like page mode
        // (P6.7)
        for (const show of shows) {
            expect(show.equality.pageEnd.max, show.label).toBe(0);
            expect(show.equality.plain.max, show.label).toBeLessThan(1e-9);
            expect(show.equality.missingRow.max, show.label).toBeLessThan(1e-9);
            expect(show.equality.gapEnd.max, show.label).toBeLessThan(1e-9);
            expect(
                show.equality.maxMsDifferenceEvenTempo,
                show.label,
            ).toBeLessThan(1e-9);
        }
    });
});
