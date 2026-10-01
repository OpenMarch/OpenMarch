import { afterEach, describe, expect, it as plainIt, vi } from "vitest";
import { and, eq, getTableName } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import type { ModifiedMarcherPageArgs } from "@/db-functions/marcherPage";
import {
    marcherPagesByPageId,
    updateMarcherPages,
} from "@/db-functions/marcherPage";
import { moveMarchersOnPage } from "@/db-functions/timelineMoves";
import type Page from "@/global/classes/Page";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import { pageEndBeat } from "../timelineCanvas";
import {
    canvasCoordinateWriter,
    NOT_IN_TIMELINE_MODE_MESSAGE,
    refuseInTimelineMode,
    timelineCoordinateRecords,
    transformMarchersOnPage,
    TimelineNotReadyError,
    toTimelineMoves,
    withTimelinePositions,
    type TimelineMoveRequest,
} from "../timelineCoordinateWrites";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";

/**
 * The routed coordinate tools (docs/timeline/phases/07-page-parity.md P7.2), with the timeline
 * flag on and off: canvas drag (`canvasCoordinateWriter`, as `Canvas.tsx` installs it) and the
 * align-vertically tool (as `RegisteredActionsHandler` runs it: read the selected marchers, apply
 * `CoordinateActions`, write).
 */

afterEach(() => stopTimelineResolver());

const TIMELINE_TABLES = [
    schema.marchers,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const timelineRows = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TIMELINE_TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const marcherPage = (db: DbConnection, marcherId: number, pageId: number) =>
    db
        .select()
        .from(schema.marcher_pages)
        .where(
            and(
                eq(schema.marcher_pages.marcher_id, marcherId),
                eq(schema.marcher_pages.page_id, pageId),
            ),
        )
        .get();

const sortedPages = async (db: DbConnection): Promise<Page[]> => {
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

const positionAt = (marcherId: number, beat: number) =>
    useTimelineResolverStore.getState().resolver!.positionAt(marcherId, beat);

describe("canvasCoordinateWriter", () => {
    const changes: ModifiedMarcherPageArgs[] = [
        // A page id left over from an earlier render
        { marcher_id: 1, page_id: 99, x: 10, y: 20 },
    ];
    const page = { id: 3, previousPageId: 2, beats: [{ index: 5 }] };

    plainIt("flag off: is the page-mode writer itself", () => {
        const writePages = vi.fn();
        const writeTimeline = vi.fn();
        const write = canvasCoordinateWriter({
            timelineMode: false,
            page,
            writePages,
            writeTimeline,
            onNoPage: vi.fn(),
        });
        expect(write).toBe(writePages);
        write(changes);
        expect(writePages).toHaveBeenCalledWith(changes);
        expect(writeTimeline).not.toHaveBeenCalled();
    });

    plainIt(
        "flag on: writes the moves on the selected page, ignoring page_id",
        () => {
            const writePages = vi.fn();
            const writeTimeline = vi.fn();
            canvasCoordinateWriter({
                timelineMode: true,
                page,
                writePages,
                writeTimeline,
                onNoPage: vi.fn(),
            })(changes);
            expect(writePages).not.toHaveBeenCalled();
            expect(writeTimeline).toHaveBeenCalledWith({
                page,
                moves: [{ marcherId: 1, x: 10, y: 20 }],
            });
        },
    );

    plainIt("flag on with no selected page: writes nothing", () => {
        const writeTimeline = vi.fn();
        const onNoPage = vi.fn();
        canvasCoordinateWriter({
            timelineMode: true,
            page: null,
            writePages: vi.fn(),
            writeTimeline,
            onNoPage,
        })(changes);
        expect(writeTimeline).not.toHaveBeenCalled();
        expect(onNoPage).toHaveBeenCalled();
    });

    plainIt("withTimelinePositions refuses to guess without a resolver", () => {
        expect(() =>
            withTimelinePositions(page, [{ marcher_id: 1, x: 0, y: 0 }]),
        ).toThrow(TimelineNotReadyError);
    });
});

describeDbTests("routed coordinate tools on a converted show", (it) => {
    it("canvas drag, flag off: writes marcher_pages and no timeline row", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const pages = await sortedPages(db);
        const page = pages[2]!;
        const before = await timelineRows(db);

        let pending: Promise<unknown> = Promise.resolve();
        const write = canvasCoordinateWriter<ModifiedMarcherPageArgs>({
            timelineMode: false,
            page,
            writePages: (modifiedMarcherPages) => {
                pending = updateMarcherPages({ db, modifiedMarcherPages });
            },
            writeTimeline: () => {
                throw new Error("not in page mode");
            },
            onNoPage: () => {},
        });
        write([{ marcher_id: 4, page_id: page.id, x: 111, y: 222 }]);
        await pending;

        expect(await marcherPage(db, 4, page.id)).toMatchObject({
            x: 111,
            y: 222,
        });
        expect(await timelineRows(db)).toEqual(before);
    });

    it("canvas drag, flag on: sets the slot destination, leaves marcher_pages alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[2]!;
        const rowBefore = await marcherPage(db, 4, page.id);

        let pending: Promise<unknown> = Promise.resolve();
        const write = canvasCoordinateWriter<ModifiedMarcherPageArgs>({
            timelineMode: true,
            page,
            writePages: () => {
                throw new Error("not in timeline mode");
            },
            writeTimeline: ({ page, moves }: TimelineMoveRequest) => {
                pending = moveMarchersOnPage({ db, page, moves });
            },
            onNoPage: () => {},
        });
        // The canvas marcher's coordinate.page_id is stale (a different page)
        write([{ marcher_id: 4, page_id: pages[5]!.id, x: 111, y: 222 }]);
        await pending;

        expect(await marcherPage(db, 4, page.id)).toEqual(rowBefore);
        await timelineResolverSettled();
        expect(positionAt(4, pageEndBeat(page))).toEqual([111, 222]);
        // The stale page was not touched
        const stale = pages[5]!;
        const staleRow = await marcherPage(db, 4, stale.id);
        expect(positionAt(4, pageEndBeat(stale))).toEqual([
            staleRow!.x,
            staleRow!.y,
        ]);
    });

    it("align vertically, flag off: averages marcher_pages and writes them", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const page = (await sortedPages(db))[3]!;
        const before = await timelineRows(db);
        const selected = (
            await marcherPagesByPageId({ db, pageId: page.id })
        ).filter((mp) => [1, 2, 3].includes(mp.marcher_id));
        const averageY = selected.reduce((s, mp) => s + mp.y, 0) / 3;

        await updateMarcherPages({
            db,
            modifiedMarcherPages: CoordinateActions.alignVertically({
                marcherPages: selected,
            }),
        });

        for (const id of [1, 2, 3])
            expect((await marcherPage(db, id, page.id))!.y).toBe(averageY);
        expect(await timelineRows(db)).toEqual(before);
    });

    it("align vertically, flag on: starts from the resolver, not stale marcher_pages", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const page = (await sortedPages(db))[3]!;
        const endBeat = pageEndBeat(page);
        // An earlier timeline move makes marcher_pages stale for marcher 1
        await moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId: 1, x: 50, y: 900 }],
        });
        await timelineResolverSettled();
        const marcherPagesBefore = await marcherPagesByPageId({
            db,
            pageId: page.id,
        });

        // RegisteredActionsHandler: getSelectedMarcherPages → alignVertically → updateCoordinates
        const selected = timelineCoordinateRecords(page, [1, 2, 3]);
        expect(selected.map((mp) => mp.marcher_id).sort()).toEqual([1, 2, 3]);
        for (const mp of selected)
            expect([mp.x, mp.y]).toEqual(positionAt(mp.marcher_id, endBeat));
        const drawn = [1, 2, 3].map((id) => positionAt(id, endBeat));
        const changes = CoordinateActions.alignVertically({
            marcherPages: selected,
        });
        await moveMarchersOnPage({ db, page, moves: toTimelineMoves(changes) });

        await timelineResolverSettled();
        const averageY = selected.reduce((s, mp) => s + mp.y, 0) / 3;
        expect(averageY).not.toBe(
            marcherPagesBefore
                .filter((mp) => [1, 2, 3].includes(mp.marcher_id))
                .reduce((s, mp) => s + mp.y, 0) / 3,
        );
        [1, 2, 3].forEach((id, i) =>
            expect(positionAt(id, endBeat)).toEqual([drawn[i]![0], averageY]),
        );
        expect(await marcherPagesByPageId({ db, pageId: page.id })).toEqual(
            marcherPagesBefore,
        );
    });

    it("nudge, flag on: moves a marcher that has no marcher_pages row on the page", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const page = (await sortedPages(db))[3]!;
        const endBeat = pageEndBeat(page);
        await db
            .delete(schema.marcher_pages)
            .where(
                and(
                    eq(schema.marcher_pages.marcher_id, 6),
                    eq(schema.marcher_pages.page_id, page.id),
                ),
            );
        expect(await marcherPage(db, 6, page.id)).toBeUndefined();
        const [x0, y0] = positionAt(6, endBeat);

        // useUpdateSelectedMarchers' timeline branch, with a nudge as the transform
        const result = await transformMarchersOnPage({
            db,
            page,
            marcherIds: [5, 6],
            transform: (current) => current.map((c) => ({ ...c, x: c.x + 10 })),
        });
        expect(result.map((c) => c.marcher_id)).toEqual([5, 6]);

        await timelineResolverSettled();
        expect(positionAt(6, endBeat)).toEqual([x0 + 10, y0]);
    });

    it("swap, flag on: the two marchers exchange positions on the page", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const page = (await sortedPages(db))[2]!;
        const endBeat = pageEndBeat(page);
        const a = positionAt(8, endBeat);
        const b = positionAt(9, endBeat);
        const before = await marcherPagesByPageId({ db, pageId: page.id });

        // RegisteredActionsHandler's swapMarchers case in timeline mode
        const [p, q] = timelineCoordinateRecords(page, [8, 9]);
        await moveMarchersOnPage({
            db,
            page,
            moves: toTimelineMoves([
                { ...p!, x: q!.x, y: q!.y },
                { ...q!, x: p!.x, y: p!.y },
            ]),
        });

        await timelineResolverSettled();
        expect(positionAt(8, endBeat)).toEqual(b);
        expect(positionAt(9, endBeat)).toEqual(a);
        expect(await marcherPagesByPageId({ db, pageId: page.id })).toEqual(
            before,
        );
    });

    it("set to previous/next page, flag on: refused with a message, nothing written", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const pages = await sortedPages(db);
        const page = pages[3]!;
        const previous = await marcherPagesByPageId({
            db,
            pageId: pages[2]!.id,
        });
        const marcherPagesBefore = await db
            .select()
            .from(schema.marcher_pages)
            .all();
        const timelineBefore = await timelineRows(db);

        // RegisteredActionsHandler's setAllMarchersToPreviousPage, flag on then off
        const run = async (timelineMode: boolean) => {
            const notify = vi.fn();
            if (refuseInTimelineMode(timelineMode, notify)) return notify;
            await updateMarcherPages({
                db,
                modifiedMarcherPages: previous.map((mp) => ({
                    marcher_id: mp.marcher_id,
                    page_id: page.id,
                    x: mp.x,
                    y: mp.y,
                })),
            });
            return notify;
        };

        const notify = await run(true);
        expect(notify).toHaveBeenCalledWith(NOT_IN_TIMELINE_MODE_MESSAGE);
        expect(await db.select().from(schema.marcher_pages).all()).toEqual(
            marcherPagesBefore,
        );
        expect(await timelineRows(db)).toEqual(timelineBefore);

        // Flag off: the page-mode write happens as before
        expect(await run(false)).not.toHaveBeenCalled();
        expect(await marcherPage(db, 1, page.id)).toMatchObject({
            x: previous.find((mp) => mp.marcher_id === 1)!.x,
            y: previous.find((mp) => mp.marcher_id === 1)!.y,
        });
    });
});
