import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, expect } from "vitest";
import type { OpenMarchShowData } from "@openmarch/schema";
import { betterSqliteTestWithProxy, getTempDotsPath } from "@/test/base";
import type { DB } from "@/global/database/db";
import * as DatabaseServices from "@/../electron/database/database.services";
import type { ConvertOnOpenDialogs } from "@/../electron/main/convertOnOpenFlow";
import { openShowFile } from "@/../electron/main/openShow";
import { readTimelinePageSnapshot } from "@/timeline/timelinePagePositions";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { toOpenMarchSchema } from "../dots-to-om";
import { hasMotionBetweenPages } from "../pageLines";

/**
 * The mobile export of a page-era show is the same as upstream OpenMarch's
 * (docs/convergence/inventory.md R1). Each v0.1.7 show in
 * `electron/database/__test__/v017-files` is converted as the app does on open, exported, and
 * compared with `upstream-export/<name>.upstream-om.json`: what upstream main (c9784b34a) exports
 * for the same file (see `upstream-export/README.md`).
 *
 * Both are compared as JSON, the form the phone gets. The one difference is the order of `coordinates`: upstream lists them in `marcher_pages` row
 * order, this build page by page. Each entry names its marcher and page, so they are compared
 * sorted.
 */

const V017_DIR = path.resolve(
    __dirname,
    "../../../../../electron/database/__test__/v017-files",
);
const MIGRATIONS = path.resolve(
    __dirname,
    "../../../../../electron/database/migrations",
);
const UPSTREAM_DIR = path.resolve(__dirname, "upstream-export");

const noDialogs: ConvertOnOpenDialogs = {
    whilePreparing: (work) => work(undefined),
    backupFailed: async () => {},
    conversionFailed: async () => {},
};

/** Copies the v0.1.7 show `name` and converts it through the main process's open path. */
async function convertedShow(name: string): Promise<string> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-om-parity-"));
    const file = path.join(dir, `${name}.dots`);
    fs.copyFileSync(path.join(V017_DIR, `${name}.dots`), file);
    try {
        const result = await openShowFile(
            file,
            false,
            { migrationsFolder: MIGRATIONS, dialogs: () => noDialogs },
            { conversionConfirmed: true },
        );
        result.db?.close();
        if (result.sqlSuspension !== undefined)
            DatabaseServices.resumeSqlProxy(result.sqlSuspension);
        expect(result.status).toBe(200);
    } finally {
        DatabaseServices.forceResumeSqlProxy();
        DatabaseServices.closePersistentConnection();
        DatabaseServices.setDbPath("", false);
    }
    return file;
}

const sortCoordinates = (data: OpenMarchShowData): OpenMarchShowData => ({
    ...data,
    coordinates: [...data.coordinates].sort(
        (a, b) =>
            Number(a.pageId) - Number(b.pageId) ||
            Number(a.marcherId) - Number(b.marcherId),
    ),
});

afterEach(() => stopTimelineResolver());

for (const name of ["small", "realistic"]) {
    const it = betterSqliteTestWithProxy.extend<{ show: string }>({
        show: async ({ task }, use) => {
            const file = await convertedShow(name);
            fs.copyFileSync(file, getTempDotsPath(task));
            fs.rmSync(path.dirname(file), { recursive: true, force: true });
            await use(name);
        },
    });

    it(`exports the v0.1.7 ${name} show as upstream does`, async ({
        show,
        db,
    }) => {
        const upstream = JSON.parse(
            fs.readFileSync(
                path.join(UPSTREAM_DIR, `${show}.upstream-om.json`),
                "utf-8",
            ),
        ) as OpenMarchShowData;

        // As the phone gets it: the file is JSON, so `-0` arrives as `0`, as upstream's does
        const fork = JSON.parse(
            JSON.stringify(await toOpenMarchSchema(db as unknown as DB)),
        ) as OpenMarchShowData;

        expect(fork.coordinates).toHaveLength(upstream.coordinates.length);
        expect(sortCoordinates(fork)).toEqual(sortCoordinates(upstream));
        // Straight page-to-page moves: the export panel says nothing
        expect(hasMotionBetweenPages(await readTimelinePageSnapshot(db))).toBe(
            false,
        );
    }, 60_000);
}
