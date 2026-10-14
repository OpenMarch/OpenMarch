import { afterEach, describe, expect, it as plainIt } from "vitest";
import { DbConnection, describeDbTests } from "@/test/base";
import { createMarchers, getMarchers } from "@/db-functions/marcher";
import { deletePages } from "@/db-functions/page";
import { moveMarchersOnPage } from "@/db-functions/timelineMoves";
import type Page from "@/global/classes/Page";
import { readShowTiming } from "@/timeline/showTiming";
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

/**
 * Page positions for the coordinate sheet and drill chart exports
 * (docs/timeline/phases/07-page-parity.md P7.7): the resolver at each page's end beat.
 */

afterEach(() => stopTimelineResolver());

const sortedPages = async (db: DbConnection): Promise<Page[]> => {
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

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
    it("lists the snapshot's pages and marchers", async ({
        db,
        marchersAndPages: _,
    }) => {
        const read = await readTimelineExportPositions(db);
        const pages = await sortedPages(db);
        const marchers = await getMarchers({ db });
        expect(pages.length).toBeGreaterThan(1);
        expect([...read.pageIds].sort()).toEqual(pages.map((p) => p.id).sort());
        expect([...read.marcherIds].sort()).toEqual(
            marchers.map((m) => m.id).sort(),
        );
    });

    it("samples the resolver at each page's end beat", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await sortedPages(db);
        const page = pages[2]!;
        const before = await acquireExportResolver(db);
        const [x, y] = before.positionAt(1, pageEndBeat(page));
        await moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId: 1, x: x + 24, y }],
        });

        const { positions } = await readTimelineExportPositions(db);

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
    });

    it("readExportPositions rejects lists from before the show changed", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await sortedPages(db);
        const marchers = await getMarchers({ db });
        const showChangedMessage = "show changed";

        const positions = await readExportPositions({
            db,
            rendered: { pages, marchers },
            showChangedMessage,
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
                showChangedMessage,
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
                showChangedMessage,
            }),
        ).rejects.toThrow(ShowChangedDuringExportError);
    });
});
