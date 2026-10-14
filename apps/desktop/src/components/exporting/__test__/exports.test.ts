import { afterEach, beforeAll, expect } from "vitest";
import { DbConnection, describeDbTests } from "@/test/base";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import tolgee from "@/global/singletons/Tolgee";
import Marcher, { dbMarcherToMarcher } from "@/global/classes/Marcher";
import type Page from "@/global/classes/Page";
import { getMarchers } from "@/db-functions/marcher";
import { moveMarchersOnPage } from "@/db-functions/timelineMoves";
import { readShowTiming } from "@/timeline/showTiming";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { readExportPositions } from "../utils/exportPagePositions";
import { buildCoordinateSheets } from "../utils/coordinateSheets";
import { buildMarcherAppearancesByPageId } from "../utils/exportAppearances";
import { generateDrillChartExportSVGs } from "../utils/svg-generator";

/**
 * The coordinate sheet and drill chart exports on the `base.tsx` fixtures, through the same
 * calls `ExportCoordinatesModal` makes (docs/timeline/phases/07-page-parity.md P7.18). Positions
 * come from the resolver, so a timeline edit reaches both exports.
 */

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
/** How many marchers get an individual drill chart */
const CHARTED = 3;
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
    return { pages: sorted, marchers };
};

/** Both exports, from the positions the modal reads */
const exportShow = async (db: DbConnection) => {
    const { pages, marchers } = await appState(db);
    const positions = await readExportPositions({
        db,
        rendered: { pages, marchers },
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
            sectionAppearances: [],
            marcherIdsByTagId: new Map(),
            allTagAppearances: [],
            tagAppearanceIdsByPageId: new Map(),
            fieldProperties,
        }),
        individualCharts: true,
    });
    return { pages, marchers, positions, sheets, coords };
};

describeDbTests("coordinate sheet and drill chart exports", (it) => {
    it("export a position for every marcher on every page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages, marchers, positions } = await exportShow(db);
        expect(pages.length).toBeGreaterThan(0);
        for (const page of pages)
            for (const marcher of marchers)
                expect(
                    positions.marcherPagesByPage[page.id]?.[marcher.id],
                ).toBeDefined();
    });

    it("an edit on one page reaches both exports", async ({
        db,
        marchersAndPages,
    }) => {
        const before = await exportShow(db);
        const page = before.pages[3]!;
        const id = marchersAndPages.expectedMarchers[0]!.id;
        const index = before.marchers.findIndex((m) => m.id === id);
        expect(index).toBeLessThan(CHARTED);
        // To where the marcher stands on page 1
        const target =
            before.positions.marcherPagesByPage[before.pages[1]!.id]![id]!;
        await moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId: id, x: target.x, y: target.y }],
        });

        const after = await exportShow(db);
        const moved = after.positions.marcherPagesByPage[page.id]![id]!;
        expect(moved.x).toBeCloseTo(target.x, 6);
        expect(moved.y).toBeCloseTo(target.y, 6);
        // The marcher's sheet and chart changed; no one else's did
        const sheet = (s: typeof before.sheets) =>
            s.find(
                (x) => x.drillNumber === before.marchers[index]!.drill_number,
            )!.renderedPage;
        expect(sheet(after.sheets)).not.toEqual(sheet(before.sheets));
        expect(after.coords[index]).not.toEqual(before.coords[index]);
        after.coords.forEach((coords, i) => {
            if (i !== index) expect(coords).toEqual(before.coords[i]);
        });
    });
});
