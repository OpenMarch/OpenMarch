import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, expect, vi, type MockInstance } from "vitest";
import { eq } from "drizzle-orm";
import {
    betterSqliteTestWithProxy,
    getTempDotsPath,
    schema,
    type DbConnection,
} from "@/test/base";
import * as DatabaseServices from "@/../electron/database/database.services";
import type { ConvertOnOpenDialogs } from "@/../electron/main/convertOnOpenFlow";
import { openShowFile } from "@/../electron/main/openShow";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import Marcher, { dbMarcherToMarcher } from "@/global/classes/Marcher";
import type Page from "@/global/classes/Page";
import { getMarchers } from "@/db-functions/marcher";
import { drawGroupRoute } from "@/db-functions/timelineGroupRoutes";
import { readShowTiming } from "@/timeline/showTiming";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { acquireExportResolver } from "@/timeline/timelineExport";
import { pageEndBeat } from "@/timeline/pageEndBeat";
import { readExportPositions } from "../utils/exportPagePositions";
import { generateDrillChartExportSVGs } from "../utils/svg-generator";

/**
 * Individual drill charts draw walked paths (pathways step 18, spec R-20 item 10) without
 * changing a show that has none: the v0.1.7 `realistic` show, converted as the app does on open,
 * exports the same bytes with and without walked paths (QA-WP-13), and a curve drawn on it
 * exports as a curve (QA-WP-14). Both fail if anything is logged with `console.error`, which is
 * how a walked path that could not be worked out shows.
 *
 * `OPENMARCH_EXPORT_DUMP=<directory>` also writes every chart there (`plain/` for the show as
 * converted, `curved/` after an arc and a group path are added), for a before and after check
 * across two builds: `diff -r` of the `plain/` folders must be empty. The directory must be
 * outside the repository.
 */

const V017_DIR = path.resolve(
    __dirname,
    "../../../../electron/database/__test__/v017-files",
);
const MIGRATIONS = path.resolve(
    __dirname,
    "../../../../electron/database/migrations",
);
const DUMP = process.env.OPENMARCH_EXPORT_DUMP;
/** How many marchers get an individual chart */
const CHARTED = 6;
const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;

const noDialogs: ConvertOnOpenDialogs = {
    whilePreparing: (work) => work(undefined),
    backupFailed: async () => {},
    conversionFailed: async () => {},
};

/** Copies the v0.1.7 show `name` and converts it through the main process's open path. */
async function convertedShow(name: string): Promise<string> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-walked-"));
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

/** The individual charts as the export modal makes them; `walked` false is the export before step 18 */
async function charts(db: DbConnection, walked: boolean) {
    const { pages } = await readShowTiming(db);
    const sortedPages: Page[] = [...pages].sort((a, b) => a.order - b.order);
    const marchers: Marcher[] = (await getMarchers({ db })).map(
        dbMarcherToMarcher,
    );
    const positions = await readExportPositions({
        db,
        rendered: { pages: sortedPages, marchers },
    });
    const charted = marchers.slice(0, CHARTED);
    const { SVGs } = await generateDrillChartExportSVGs({
        fieldProperties,
        marchers: charted,
        sortedPages,
        marcherPagesMap: positions,
        walkedPaths: walked ? positions.walkedPaths : undefined,
        sectionAppearances: [],
        individualCharts: true,
    });
    return { SVGs, sortedPages, marchers: charted };
}

function dump(folder: string, SVGs: string[][]) {
    if (!DUMP) return;
    const dir = path.join(DUMP, folder);
    fs.mkdirSync(dir, { recursive: true });
    SVGs.forEach((pages, m) =>
        pages.forEach((svg, p) =>
            fs.writeFileSync(
                path.join(
                    dir,
                    `marcher-${String(m).padStart(2, "0")}-page-${String(p).padStart(3, "0")}.svg`,
                ),
                svg,
            ),
        ),
    );
}

// A walked path that can't be worked out is logged and its chart keeps the straight line, so a
// path that failed for every marcher would still export the same bytes as before. Any
// `console.error` fails these tests.
let errors: MockInstance<typeof console.error>;
beforeEach(() => {
    errors = vi.spyOn(console, "error");
});
afterEach(() => {
    const logged = errors.mock.calls
        .map((call) => call.map(String).join(" "))
        // the one error the open path logs here: it closes a database that was never set
        .filter((line) => !line.startsWith("setDbPath: File does not exist"));
    errors.mockRestore();
    stopTimelineResolver();
    expect(logged).toEqual([]);
});

const it = betterSqliteTestWithProxy.extend<{ show: string }>({
    show: async ({ task }, use) => {
        const file = await convertedShow("realistic");
        fs.copyFileSync(file, getTempDotsPath(task));
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
        await use("realistic");
    },
});

it("a show with no drawn paths exports the same bytes as before (QA-WP-13)", async ({
    show: _,
    db,
}) => {
    const before = await charts(db, false);
    const after = await charts(db, true);
    expect(after.SVGs.flat().length).toBeGreaterThan(CHARTED);
    expect(after.SVGs).toEqual(before.SVGs);
    expect(after.SVGs.flat().join("")).not.toContain("<path");
    dump("plain", after.SVGs);
}, 120_000);

it("an arc and a group path export as curves (QA-WP-14)", async ({
    show: _,
    db,
}) => {
    const plain = await charts(db, true);
    const ids = plain.marchers.map((m) => m.id);
    const resolver = await acquireExportResolver(db);
    // the first two page-to-page moves in which the first charted marcher travels
    const moving: number[] = [];
    for (let i = 1; i < plain.sortedPages.length && moving.length < 2; i++) {
        const a = resolver.positionAt(
            ids[0]!,
            pageEndBeat(plain.sortedPages[i - 1]!),
        );
        const b = resolver.positionAt(
            ids[0]!,
            pageEndBeat(plain.sortedPages[i]!),
        );
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 20) moving.push(i);
    }
    expect(moving).toHaveLength(2);
    const [arcPage, groupPage] = moving as [number, number];
    const spanOn = (marcherId: number, pageIndex: number) =>
        resolver.explain(
            marcherId,
            pageEndBeat(plain.sortedPages[pageIndex]!) - 0.5,
        ).span;

    // an arc: the move's transition becomes an arc
    const arcTransition = spanOn(ids[0]!, arcPage).transitionId!;
    await db
        .update(schema.timeline_transitions)
        .set({ path_style: "arc", path_params: JSON.stringify({ bulge: 0.3 }) })
        .where(eq(schema.timeline_transitions.id, arcTransition));

    // a group path for three marchers, through one smooth point off their straight line
    const group = ids.slice(0, 3);
    const groupTransition = spanOn(group[0]!, groupPage).transitionId!;
    const timelineId = (await db
        .select({ id: schema.timeline_transitions.timeline_id })
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.id, groupTransition))
        .get())!.id;
    const from = pageEndBeat(plain.sortedPages[groupPage - 1]!);
    const to = pageEndBeat(plain.sortedPages[groupPage]!);
    const mean = (beat: number): [number, number] => {
        const at = group.map((m) => resolver.positionAt(m, beat));
        return [
            at.reduce((s, p) => s + p[0], 0) / at.length,
            at.reduce((s, p) => s + p[1], 0) / at.length,
        ];
    };
    const a = mean(from);
    const b = mean(to);
    await drawGroupRoute({
        db,
        timelineId,
        marcherIds: group,
        points: [
            {
                at: [
                    a[0] + (b[0] - a[0]) / 3 - (b[1] - a[1]) / 3,
                    a[1] + (b[1] - a[1]) / 3 + (b[0] - a[0]) / 3,
                ],
                tension: 1,
            },
            {
                at: [
                    a[0] + ((b[0] - a[0]) * 2) / 3 - (b[1] - a[1]) / 4,
                    a[1] + ((b[1] - a[1]) * 2) / 3 + (b[0] - a[0]) / 4,
                ],
                tension: 1,
            },
        ],
    });

    const curved = await charts(db, true);
    dump("curved", curved.SVGs);
    const paths = (svg: string) => svg.match(/<path d="[^"]+"/g) ?? [];
    // the arc is the path into its page and out of the page before
    const intoArc = paths(curved.SVGs[0]![arcPage]!);
    expect(intoArc.some((d) => / A /.test(d))).toBe(true);
    expect(
        paths(curved.SVGs[0]![arcPage - 1]!).some((d) => / A /.test(d)),
    ).toBe(true);
    // every member of the group path walks a curve
    for (let m = 0; m < group.length; m++)
        expect(
            paths(curved.SVGs[m]![groupPage]!).some((d) => / C /.test(d)),
        ).toBe(true);
    // a chart no curve touches is unchanged
    const last = plain.sortedPages.length - 1;
    if (last > groupPage + 1 && last > arcPage + 1)
        expect(curved.SVGs[CHARTED - 1]![last]).toBe(
            plain.SVGs[CHARTED - 1]![last],
        );
    // dots still sit where the pages put them
    expect(curved.SVGs.flat().join("")).not.toContain("NaN");
}, 120_000);
