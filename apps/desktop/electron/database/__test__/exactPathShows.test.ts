// @vitest-environment node
/**
 * QA-EP-7 (spec Appendix M, ADR 0018): every move of every marcher in real show files, turned
 * into exact paths by the converter (EP-C) and played back as EP-R says, agrees with the
 * resolver's `positionAt` at every tick, within 1/100 of an 8-to-5 step on the default field.
 *
 * Each file is opened through the main process's open path (`openShowFile`, converting v0.1.7
 * files as the app does), then read as the app reads it for playback.
 *
 * Runs on the v0.1.7 release files in `v017-files/`. More files, such as the parity shows, are
 * opt-in, with a report per show:
 *
 *     EXACT_PATH_INPUTS=/a.dots:/b.dots EXACT_PATH_REPORT=/tmp/report.json \
 *         pnpm --dir apps/desktop exec vitest run electron/database/__test__/exactPathShows.test.ts
 *
 * The report lists, per show: exact paths, keys per path, the worst gap and where, and the worst
 * gap with every key kept at its own tick (`roundingOnly`: what tick rounding costs by itself).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as DatabaseServices from "../database.services";
import { getOrm } from "../db";
import type { ConvertOnOpenDialogs } from "@om-electron/main/convertOnOpenFlow";
import { openShowFile } from "@om-electron/main/openShow";
import {
    EXACT_DEFAULT_TOLERANCE,
    TICKS_PER_BEAT,
    checkExactPath,
    createResolver,
    exactPathsOf,
    exactPlayer,
    type ExactMove,
    type Resolver,
} from "@openmarch/core";
import { readTimelineTables } from "@/timeline/timelineRows";
import type { DbConnection } from "@/db-functions/types";
import { migrationsFolder } from "./convertOnOpenFixtures";

const FIXTURES_DIR = path.resolve(__dirname, "v017-files");
const RELEASE_FILES = ["small", "realistic", "field-image"].map((n) =>
    path.join(FIXTURES_DIR, `${n}.dots`),
);
const EXTRA = (process.env.EXACT_PATH_INPUTS ?? "").split(":").filter(Boolean);
const REPORT = process.env.EXACT_PATH_REPORT ?? "";

const dialogs: ConvertOnOpenDialogs = {
    async whilePreparing(work) {
        return work(undefined);
    },
    async backupFailed() {},
    async conversionFailed() {},
};

async function open(filePath: string, confirmed: boolean) {
    const result = await openShowFile(
        filePath,
        false,
        { migrationsFolder, dialogs: () => dialogs },
        { conversionConfirmed: confirmed },
    );
    result.db?.close();
    if (result.sqlSuspension !== undefined)
        DatabaseServices.resumeSqlProxy(result.sqlSuspension);
    DatabaseServices.closePersistentConnection();
    DatabaseServices.setDbPath("", false);
    return result.status;
}

function worstGap(move: ExactMove, resolver: Resolver) {
    const player = exactPlayer(move.path);
    const last = move.path.keys[move.path.keys.length - 1]!.tick;
    let worst = 0;
    let at = 0;
    for (let tick = 0; tick <= last; tick++) {
        const beat = Math.min(move.end, move.start + tick / TICKS_PER_BEAT);
        const [x, y] = player.pointAt(tick);
        const [rx, ry] = resolver.positionAt(move.marcherId, beat);
        const gap = Math.hypot(x - rx, y - ry);
        if (gap > worst) {
            worst = gap;
            at = beat;
        }
    }
    return { worst, at };
}

interface ShowReport {
    show: string;
    marchers: number;
    exactPaths: number;
    keysPerPath: number;
    maxKeys: number;
    worstGap: number;
    worstAt: string;
    roundingOnly: number;
    seconds: number;
}

const reports: ShowReport[] = [];

describe("QA-EP-7: exact paths of real shows", () => {
    let tempDir: string;
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-exact-"));
        for (const level of ["log", "debug", "info", "warn"] as const)
            vi.spyOn(console, level).mockImplementation(() => {});
    });
    afterEach(() => {
        DatabaseServices.forceResumeSqlProxy();
        DatabaseServices.closePersistentConnection();
        DatabaseServices.setDbPath("", false);
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
        if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(reports, null, 2));
    });

    it.each([...RELEASE_FILES, ...EXTRA])("%s", async (input) => {
        const started = performance.now();
        const name = path.basename(input, ".dots");
        const showPath = path.join(tempDir, `${name}.dots`);
        fs.copyFileSync(input, showPath);
        let status = await open(showPath, false);
        if (status !== 200) status = await open(showPath, true);
        expect(status).toBe(200);

        const raw = new DatabaseSync(showPath, { readOnly: true });
        try {
            const orm = getOrm(raw) as unknown as DbConnection;
            const { snapshot } = await readTimelineTables(orm);
            const resolver = createResolver(snapshot);
            const moves = exactPathsOf(snapshot, resolver);
            // every key at its own tick: only tick rounding (and R-20) is left
            const fine = exactPathsOf(snapshot, resolver, { tolerance: 1e-9 });
            let worst = 0;
            let worstAt = "";
            let keys = 0;
            let maxKeys = 0;
            for (const m of moves) {
                expect(
                    checkExactPath(m.path),
                    `${name} marcher ${m.marcherId}`,
                ).toEqual([]);
                keys += m.path.keys.length;
                maxKeys = Math.max(maxKeys, m.path.keys.length);
                const g = worstGap(m, resolver);
                if (g.worst > worst) {
                    worst = g.worst;
                    worstAt = `marcher ${m.marcherId} beat ${g.at.toFixed(3)} (move ${m.transitionId})`;
                }
            }
            let roundingOnly = 0;
            for (const m of fine)
                roundingOnly = Math.max(
                    roundingOnly,
                    worstGap(m, resolver).worst,
                );
            const report: ShowReport = {
                show: name,
                marchers: resolver.marcherIds().length,
                exactPaths: moves.length,
                keysPerPath: moves.length ? keys / moves.length : 0,
                maxKeys,
                worstGap: worst,
                worstAt,
                roundingOnly,
                seconds: (performance.now() - started) / 1000,
            };
            reports.push(report);
            expect(worst, `${name}: ${worstAt}`).toBeLessThan(
                EXACT_DEFAULT_TOLERANCE,
            );
        } finally {
            raw.close();
        }
    });
});
