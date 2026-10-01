import { afterEach, beforeAll, expect } from "vitest";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { timelineFixtureMode } from "@/test/timelineMode";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import tolgee from "@/global/singletons/Tolgee";
import Marcher, { dbMarcherToMarcher } from "@/global/classes/Marcher";
import type Page from "@/global/classes/Page";
import { getMarchers } from "@/db-functions/marcher";
import { updateMarcherPages } from "@/db-functions/marcherPage";
import { moveMarchersOnPage } from "@/db-functions/timelineMoves";
import { readShowTiming } from "@/timeline/convert/writePageConversion";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import {
    pagePositionMapFromRows,
    readExportPositions,
    readTimelineFlag,
} from "../utils/exportPagePositions";
import { buildCoordinateSheets } from "../utils/coordinateSheets";
import { buildMarcherAppearancesByPageId } from "../utils/exportAppearances";
import { generateDrillChartExportSVGs } from "../utils/svg-generator";

/**
 * The coordinate sheet and drill chart exports on the `base.tsx` fixtures, through the same
 * calls `ExportCoordinatesModal` makes (docs/timeline/phases/07-page-parity.md P7.18). The file's
 * mode decides where positions come from: `marcher_pages` in the default run, the resolver under
 * `test:timeline` (a converted show with the flag on). A converted show exports as its pages did,
 * and an edit that writes only timeline rows reaches both exports.
 */

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
/** How many marchers get an individual drill chart */
const CHARTED = 3;
const messages = { notLoaded: "not loaded", showChanged: "show changed" };
const options = {
    quarterPages: false,
    terse: false,
    includeMeasures: false,
    useXY: false,
    roundingDenominator: 4,
};

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => stopTimelineResolver());

/** What the modal holds in React state when an export starts */
const appState = async (db: DbConnection) => {
    const { pages } = await readShowTiming(db);
    const sorted: Page[] = [...pages].sort((a, b) => a.order - b.order);
    const marchers: (Marcher & { name: string })[] = (
        await getMarchers({ db })
    ).map((m) => {
        const marcher = dbMarcherToMarcher(m);
        return Object.assign(marcher, {
            name: marcher.name || marcher.drill_number,
        });
    });
    const rows = await db.select().from(schema.marcher_pages).all();
    return {
        pages: sorted,
        marchers,
        pageModePositions: pagePositionMapFromRows(rows),
    };
};

/** Both exports, from the positions the modal reads */
const exportShow = async (db: DbConnection) => {
    const { pages, marchers, pageModePositions } = await appState(db);
    const positions = await readExportPositions({
        db,
        rendered: { pages, marchers },
        pageModePositions,
        messages,
    });
    const sheets = buildCoordinateSheets({
        marchers,
        pages,
        positions,
        fieldProperties,
        options,
        t: tolgee.t,
    });
    // Individual charts are slow to render, so the chart covers the first few marchers
    const charted = marchers.slice(0, CHARTED);
    const { coords } = await generateDrillChartExportSVGs({
        fieldProperties,
        marchers: charted,
        sortedPages: pages,
        marcherPagesMap: positions,
        sectionAppearances: [],
        marcherAppearancesByPageId: buildMarcherAppearancesByPageId({
            sortedPages: pages,
            marchers: charted,
            marcherPagesMap: pageModePositions,
            timelineMode: await readTimelineFlag(db),
            sectionAppearances: [],
            marcherIdsByTagId: new Map(),
            allTagAppearances: [],
            tagAppearanceIdsByPageId: new Map(),
            fieldProperties,
        }),
        individualCharts: true,
    });
    return { pages, marchers, positions, pageModePositions, sheets, coords };
};

describeDbTests(
    "coordinate sheet and drill chart exports in the file's mode",
    (it) => {
        it("read the file's positions; a converted show exports as its pages did", async ({
            db,
            marchersAndPages: _,
        }) => {
            expect(await readTimelineFlag(db)).toBe(timelineFixtureMode());
            const { pages, marchers, positions, pageModePositions } =
                await exportShow(db);
            if (!timelineFixtureMode()) {
                expect(positions).toBe(pageModePositions);
                return;
            }
            expect(positions).not.toBe(pageModePositions);
            for (const page of pages)
                for (const marcher of marchers) {
                    const sampled =
                        positions.marcherPagesByPage[page.id]![marcher.id]!;
                    const row =
                        pageModePositions.marcherPagesByPage[page.id]![
                            marcher.id
                        ]!;
                    expect(sampled.x).toBeCloseTo(row.x, 6);
                    expect(sampled.y).toBeCloseTo(row.y, 6);
                }
        });

        it("an edit on one page reaches both exports", async ({
            db,
            marchersAndPages,
        }) => {
            const before = await exportShow(db);
            const rowsBefore = await db
                .select()
                .from(schema.marcher_pages)
                .all();
            const page = before.pages[3]!;
            const id = marchersAndPages.expectedMarchers[0]!.id;
            const index = before.marchers.findIndex((m) => m.id === id);
            expect(index).toBeLessThan(CHARTED);
            // To where the marcher stands on page 1
            const target =
                before.positions.marcherPagesByPage[before.pages[1]!.id]![id]!;
            if (timelineFixtureMode())
                await moveMarchersOnPage({
                    db,
                    page,
                    moves: [{ marcherId: id, x: target.x, y: target.y }],
                });
            else
                await updateMarcherPages({
                    db,
                    modifiedMarcherPages: [
                        {
                            marcher_id: id,
                            page_id: page.id,
                            x: target.x,
                            y: target.y,
                        },
                    ],
                });

            const after = await exportShow(db);
            const moved = after.positions.marcherPagesByPage[page.id]![id]!;
            expect(moved.x).toBeCloseTo(target.x, 6);
            expect(moved.y).toBeCloseTo(target.y, 6);
            // The marcher's sheet and chart changed; no one else's did
            const sheet = (s: typeof before.sheets) =>
                s.find(
                    (x) =>
                        x.drillNumber === before.marchers[index]!.drill_number,
                )!.renderedPage;
            expect(sheet(after.sheets)).not.toEqual(sheet(before.sheets));
            expect(after.coords[index]).not.toEqual(before.coords[index]);
            after.coords.forEach((coords, i) => {
                if (i !== index) expect(coords).toEqual(before.coords[i]);
            });
            // Timeline mode writes only timeline rows
            const rowsAfter = await db
                .select()
                .from(schema.marcher_pages)
                .all();
            if (timelineFixtureMode()) expect(rowsAfter).toEqual(rowsBefore);
            else expect(rowsAfter).not.toEqual(rowsBefore);
        });
    },
);
