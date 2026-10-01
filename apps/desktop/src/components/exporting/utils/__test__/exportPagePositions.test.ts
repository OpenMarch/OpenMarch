import { afterEach, describe, expect, it as plainIt } from "vitest";
import { DbConnection, describeDbTests } from "@/test/base";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    getAllMarcherPages,
    updateMarcherPages,
} from "@/db-functions/marcherPage";
import { createMarchers, getMarchers } from "@/db-functions/marcher";
import { deletePages } from "@/db-functions/page";
import { schema } from "@/global/database/db";
import { dbMarcherToMarcher } from "@/global/classes/Marcher";
import { moveMarchersOnPage } from "@/db-functions/timelineMoves";
import { updateWorkspaceSettingsParsed } from "@/db-functions/workspaceSettings";
import { marcherPageMapFromArray } from "@/global/classes/MarcherPageIndex";
import type Page from "@/global/classes/Page";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "@/timeline/convert/writePageConversion";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { acquireExportResolver } from "@/timeline/timelineExport";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import {
    assertExportMatchesSnapshot,
    marchersWithoutPositions,
    pagePositionMapFromRows,
    positionsForMarcherInPageOrder,
    readExportPositions,
    readTimelineExportPositions,
    ShowChangedDuringExportError,
} from "../exportPagePositions";
import { generateDrillChartExportSVGs } from "../svg-generator";
import { keepFixturesInPageMode } from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * Page positions for the coordinate sheet and drill chart exports in timeline mode
 * (docs/timeline/phases/07-page-parity.md P7.7): the resolver at each page's end beat, never
 * `marcher_pages`.
 */

afterEach(() => stopTimelineResolver());

const setTimelineMode = (db: DbConnection, timelineMode: boolean) =>
    updateWorkspaceSettingsParsed({
        db,
        settings: workspaceSettingsSchema.parse({ timelineMode }),
    });

const sortedPages = async (db: DbConnection): Promise<Page[]> => {
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

const messages = { notLoaded: "not loaded", showChanged: "show changed" };

const pageModeMap = async (db: DbConnection) =>
    marcherPageMapFromArray(
        await getAllMarcherPages({
            db,
            pinkyPromiseThatYouKnowWhatYouAreDoing: true,
        }),
    );

describe("pagePositionMapFromRows and positionsForMarcherInPageOrder", () => {
    plainIt(
        "indexes both ways and sorts a marcher's rows by page order",
        () => {
            const rows = [
                { marcher_id: 1, page_id: 5, x: 1, y: 2 },
                { marcher_id: 2, page_id: 5, x: 3, y: 4 },
                { marcher_id: 1, page_id: 3, x: 5, y: 6 },
            ];
            const map = pagePositionMapFromRows(rows);

            expect(map.marcherPagesByPage[5]![2]).toBe(rows[1]);
            expect(map.marcherPagesByMarcher[1]![3]).toBe(rows[2]);
            const pages = [
                { id: 5, order: 1 },
                { id: 3, order: 2 },
            ];
            expect(positionsForMarcherInPageOrder(map, 1, pages)).toEqual([
                rows[0],
                rows[2],
            ]);
            expect(positionsForMarcherInPageOrder(map, 99, pages)).toEqual([]);
        },
    );
});

describe("assertExportMatchesSnapshot", () => {
    const snapshot = { pageIds: [0, 4, 7], marcherIds: [1, 2] };
    const ids = (list: number[]) => list.map((id) => ({ id }));

    plainIt("accepts the same pages and marchers in any order", () => {
        expect(() =>
            assertExportMatchesSnapshot(snapshot, {
                pages: ids([7, 0, 4]),
                marchers: ids([2, 1]),
            }),
        ).not.toThrow();
    });

    plainIt.each([
        ["a page deleted from the snapshot", [0, 4, 7, 9], [1, 2]],
        ["a page added to the snapshot", [0, 4], [1, 2]],
        ["a marcher added to the snapshot", [0, 4, 7], [1]],
        ["a marcher deleted from the snapshot", [0, 4, 7], [1, 2, 3]],
        ["a page swapped for another", [0, 4, 8], [1, 2]],
    ])("rejects %s", (_name, pages, marchers) => {
        expect(() =>
            assertExportMatchesSnapshot(
                snapshot,
                { pages: ids(pages), marchers: ids(marchers) },
                "show changed",
            ),
        ).toThrow(new ShowChangedDuringExportError("show changed"));
    });

    plainIt("lists marchers with no positions at all", () => {
        const map = pagePositionMapFromRows([
            { marcher_id: 1, page_id: 0, x: 0, y: 0 },
        ]);
        expect(marchersWithoutPositions([{ id: 1 }, { id: 2 }], map)).toEqual([
            { id: 2 },
        ]);
    });
});

describeDbTests("readTimelineExportPositions", (it) => {
    it("returns null in page mode, so the exports read marcher_pages", async ({
        db,
        marchersAndPages: _,
    }) => {
        expect(await readTimelineExportPositions(db)).toBeNull();
        await convertPagesToTimeline(db);
        expect(await readTimelineExportPositions(db)).toBeNull();
    });

    it("gives a freshly converted show the page-mode positions", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pageMode = await pageModeMap(db);
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);

        const read = await readTimelineExportPositions(db);

        expect(read).not.toBeNull();
        const timeline = read!.positions;
        const pages = await sortedPages(db);
        const marchers = await getMarchers({ db });
        expect([...read!.pageIds].sort()).toEqual(
            pages.map((p) => p.id).sort(),
        );
        expect([...read!.marcherIds].sort()).toEqual(
            marchers.map((m) => m.id).sort(),
        );
        expect(pages.length).toBeGreaterThan(1);
        for (const page of pages) {
            for (const marcher of marchers) {
                const want = pageMode.marcherPagesByPage[page.id]![marcher.id]!;
                const got = timeline.marcherPagesByPage[page.id]![marcher.id]!;
                // The resolver returns the converted destinations exactly at page end beats
                expect(got).toEqual({
                    marcher_id: marcher.id,
                    page_id: page.id,
                    x: want.x,
                    y: want.y,
                });
            }
        }
    });

    it("samples the resolver at each page's end beat and ignores marcher_pages", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        const pages = await sortedPages(db);
        const page = pages[2]!;
        const before = await acquireExportResolver(db);
        const [x, y] = before.positionAt(1, pageEndBeat(page));
        await moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId: 1, x: x + 24, y }],
        });
        // Frozen page-era rows that disagree with the timeline are ignored
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                { marcher_id: 2, page_id: page.id, x: 1, y: 1 },
            ],
        });

        const { positions } = (await readTimelineExportPositions(db))!;

        const resolver = await acquireExportResolver(db);
        for (const p of pages) {
            for (const id of resolver.marcherIds()) {
                const [rx, ry] = resolver.positionAt(id, pageEndBeat(p));
                expect(positions.marcherPagesByPage[p.id]![id]).toEqual({
                    marcher_id: id,
                    page_id: p.id,
                    x: rx,
                    y: ry,
                });
            }
        }
        expect(positions.marcherPagesByPage[page.id]![1]!.x).toBeCloseTo(
            x + 24,
            9,
        );
        expect(positions.marcherPagesByPage[page.id]![2]!.x).not.toBe(1);
    });

    it("draws the same drill chart coordinates as page mode for a converted show", async ({
        db,
        marchersAndPages: _,
    }) => {
        const fieldProperties =
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
        const pageMode = await pageModeMap(db);
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        const timeline = (await readTimelineExportPositions(db))!.positions;
        const pages = await sortedPages(db);
        // Two marchers keep the individual charts quick; each draws every page
        const marchers = (await getMarchers({ db }))
            .slice(0, 2)
            .map(dbMarcherToMarcher);

        const render = (marcherPagesMap: typeof timeline) =>
            generateDrillChartExportSVGs({
                fieldProperties,
                marchers,
                sortedPages: pages,
                marcherPagesMap,
                sectionAppearances: [],
                individualCharts: true,
            });
        const fromTimeline = await render(timeline);
        const fromPages = await render(pageMode);

        expect(fromTimeline.coords).toEqual(fromPages.coords);
        expect(fromTimeline.SVGs).toHaveLength(marchers.length);
        expect(fromTimeline.SVGs[0]).toHaveLength(pages.length);
    });

    it("treats settings that fail to parse as page mode", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        expect(await readTimelineExportPositions(db)).not.toBeNull();

        await db
            .update(schema.workspace_settings)
            .set({ json_data: "{not json" });
        expect(await readTimelineExportPositions(db)).toBeNull();

        await db
            .update(schema.workspace_settings)
            .set({ json_data: JSON.stringify({ timelineMode: "yes" }) });
        expect(await readTimelineExportPositions(db)).toBeNull();
    });

    it("readExportPositions uses the marcher_pages map in page mode", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pageMode = await pageModeMap(db);
        const rendered = { pages: [], marchers: [] };
        // Page mode doesn't compare the lists; the query's map is used as is
        expect(
            await readExportPositions({
                db,
                rendered,
                pageModePositions: pageMode,
                messages,
            }),
        ).toBe(pageMode);
        await expect(
            readExportPositions({
                db,
                rendered,
                pageModePositions: undefined,
                messages,
            }),
        ).rejects.toThrow("not loaded");
    });

    it("readExportPositions rejects lists from before the show changed", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        const pages = await sortedPages(db);
        const marchers = await getMarchers({ db });

        const positions = await readExportPositions({
            db,
            rendered: { pages, marchers },
            pageModePositions: undefined,
            messages,
        });
        expect(Object.keys(positions.marcherPagesByPage)).toHaveLength(
            pages.length,
        );

        // A marcher added after React read its lists
        await createMarchers({
            db,
            newMarchers: [
                { section: "Flute", drill_prefix: "N", drill_order: 1 },
            ],
        });
        await expect(
            readExportPositions({
                db,
                rendered: { pages, marchers },
                pageModePositions: undefined,
                messages,
            }),
        ).rejects.toThrow(new ShowChangedDuringExportError("show changed"));

        // A page deleted after React read its lists
        const marchersNow = await getMarchers({ db });
        await deletePages({
            db,
            pageIds: new Set([pages[pages.length - 1]!.id]),
        });
        await expect(
            readExportPositions({
                db,
                rendered: { pages, marchers: marchersNow },
                pageModePositions: undefined,
                messages,
            }),
        ).rejects.toThrow(ShowChangedDuringExportError);
    });
});
