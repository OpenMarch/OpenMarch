import { afterEach, describe, expect, it as plainIt, vi } from "vitest";
import { and, eq, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    performRedo,
    performUndo,
    transactionWithHistory,
} from "@/db-functions/history";
import {
    marcherPagesByPageId,
    updateMarcherPages,
} from "@/db-functions/marcherPage";
import { moveMarchersOnPage } from "@/db-functions/timelineMoves";
import { createTimelineShapesInTransaction } from "@/db-functions/timelineShapes";
import {
    setTimelineTransitionDestinationInTransaction,
    updateTimelineTransitionsInTransaction,
} from "@/db-functions/timelineTransitions";
import { toMarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import type Page from "@/global/classes/Page";
import {
    setMarchersToNeighborPage,
    type NeighborPageDirection,
    type NeighborPageScope,
} from "@/utilities/setMarchersToNeighborPage";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import { pageEndBeat } from "../timelineCanvas";
import {
    copyPagePositions,
    TimelineNotReadyError,
    type TimelineMoveRequest,
} from "../timelineCoordinateWrites";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";
import { keepFixturesInPageMode } from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * "Set all or selected marchers to the previous or next page"
 * (docs/timeline/phases/07-page-parity.md P7.6), through `setMarchersToNeighborPage`, the function
 * `RegisteredActionsHandler` runs for the four actions, with the flag on and off.
 */

afterEach(() => stopTimelineResolver());

const sortedPages = async (db: DbConnection): Promise<Page[]> => {
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

const resolver = () => useTimelineResolverStore.getState().resolver!;
const positionAt = (marcherId: number, beat: number) =>
    resolver().positionAt(marcherId, beat);
const positionsAt = (beat: number) =>
    Object.fromEntries(
        resolver()
            .marcherIds()
            .map((id) => [id, positionAt(id, beat)]),
    );

const tableRows = async (
    db: DbConnection,
    tables: readonly SQLiteTable[],
): Promise<Record<string, unknown[]>> => {
    const out: Record<string, unknown[]> = {};
    for (const table of tables)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};
const pageEraRows = (db: DbConnection) =>
    tableRows(db, [schema.marcher_pages, schema.pathways]);
const timelineRows = (db: DbConnection) =>
    tableRows(db, [
        schema.marchers,
        schema.timeline_shapes,
        schema.timeline_transitions,
        schema.timeline_assignments,
        schema.timeline_slot_destinations,
    ]);
const undoRows = (db: DbConnection) =>
    db.select().from(schema.history_undo).all();

/** Deletes a marcher's assignment in the page move ending at `endBeat`, leaving its slot vacant. */
const deleteAssignmentEndingAt = async (
    db: DbConnection,
    marcherId: number,
    endBeat: number,
) => {
    const pageMove = await pageMoveEndingAt(db, endBeat);
    await db
        .delete(schema.timeline_assignments)
        .where(
            and(
                eq(schema.timeline_assignments.marcher_id, marcherId),
                eq(schema.timeline_assignments.transition_id, pageMove.id),
            ),
        );
};

const pageMoveEndingAt = async (db: DbConnection, endBeat: number) =>
    (await db
        .select()
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.end_beat, endBeat))
        .get())!;

const t = (key: string, params?: Record<string, string | number>) =>
    params ? `${key} ${JSON.stringify(params)}` : key;

/**
 * Runs the action as the handler does, with the flag on: `writeTimeline` is the real
 * `moveMarchersOnPage` (the mutation's `mutateAsync` in the app). Returns the result and the spies.
 */
const runTimeline = async (
    db: DbConnection,
    {
        page,
        pages,
        direction,
        scope,
        selected = [],
        onSuccess,
    }: {
        page: Page;
        pages: Page[];
        direction: NeighborPageDirection;
        scope: NeighborPageScope;
        selected?: number[];
        onSuccess?: () => void;
    },
) => {
    const writeTimeline = vi.fn((request: TimelineMoveRequest) =>
        moveMarchersOnPage({ db, ...request }),
    );
    const writePages = vi.fn();
    const notify = {
        success: vi.fn(() => onSuccess?.()),
        error: vi.fn(),
    };
    const reportError = vi.fn();
    const result = await setMarchersToNeighborPage({
        timelineMode: true,
        direction,
        scope,
        selectedPage: page,
        pages,
        selectedMarcherIds: selected,
        neighborMarcherPages: undefined,
        writePages,
        writeTimeline,
        notify,
        t,
        reportError,
    });
    await timelineResolverSettled();
    return { result, writeTimeline, writePages, notify, reportError };
};

describe("copyPagePositions without a resolver", () => {
    plainIt("refuses to guess", () => {
        const page = { previousPageId: 1, beats: [{ index: 3 }] };
        expect(() =>
            copyPagePositions({
                page,
                source: { previousPageId: null, beats: [{ index: 0 }] },
            }),
        ).toThrow(TimelineNotReadyError);
    });
});

describeDbTests("set marchers to the previous or next page, flag off", (it) => {
    it("page mode is unchanged: copies the neighbor's marcher_pages rows, no timeline write", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const pages = await sortedPages(db);
        const page = pages[3]!;
        const previousRows = await marcherPagesByPageId({
            db,
            pageId: pages[2]!.id,
        });
        const timelineBefore = await timelineRows(db);
        let pending: Promise<unknown> = Promise.resolve();
        const writeTimeline = vi.fn();
        const notify = { success: vi.fn(), error: vi.fn() };

        const result = await setMarchersToNeighborPage({
            timelineMode: false,
            direction: "previous",
            scope: "all",
            selectedPage: page,
            pages,
            selectedMarcherIds: [],
            neighborMarcherPages: toMarcherPagesByMarcher(previousRows),
            writePages: (modifiedMarcherPages) => {
                pending = updateMarcherPages({ db, modifiedMarcherPages });
            },
            writeTimeline,
            notify,
            t,
        });
        await pending;

        expect(result).toBe(previousRows.length);
        const after = await marcherPagesByPageId({ db, pageId: page.id });
        for (const mp of previousRows)
            expect(
                after.find((a) => a.marcher_id === mp.marcher_id),
            ).toMatchObject({ x: mp.x, y: mp.y });
        expect(writeTimeline).not.toHaveBeenCalled();
        expect(await timelineRows(db)).toEqual(timelineBefore);
        expect(notify.success).toHaveBeenCalledWith(
            expect.stringContaining(
                "actions.batchEdit.setAllToPreviousSuccess",
            ),
        );
    });

    it("page mode: selected to next writes only the selected rows; no neighbor rows is an error", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await sortedPages(db);
        const page = pages[2]!;
        const nextRows = toMarcherPagesByMarcher(
            await marcherPagesByPageId({ db, pageId: pages[3]!.id }),
        );
        const writePages = vi.fn();
        const notify = { success: vi.fn(), error: vi.fn() };
        const common = {
            timelineMode: false,
            direction: "next" as const,
            selectedPage: page,
            pages,
            writePages,
            writeTimeline: vi.fn(),
            notify,
            t,
        };

        await setMarchersToNeighborPage({
            ...common,
            scope: "selected",
            selectedMarcherIds: [2, 5],
            neighborMarcherPages: nextRows,
        });
        expect(writePages).toHaveBeenCalledTimes(1);
        expect(
            writePages.mock.calls[0]![0].map(
                (c: { marcher_id: number }) => c.marcher_id,
            ),
        ).toEqual([2, 5]);

        // The neighbor's rows aren't loaded
        expect(
            await setMarchersToNeighborPage({
                ...common,
                scope: "all",
                selectedMarcherIds: [],
                neighborMarcherPages: undefined,
            }),
        ).toBeNull();
        expect(notify.error).toHaveBeenCalledWith(
            "actions.batchEdit.noNextPage",
        );
        expect(writePages).toHaveBeenCalledTimes(1);
    });
});

describeDbTests("set marchers to the previous or next page, flag on", (it) => {
    it("all to previous: every marcher takes its previous-page position in one undoable edit; success only after the write", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[3]!;
        const previous = pages[2]!;
        const endBeat = pageEndBeat(page);
        const before = positionsAt(endBeat);
        const target = positionsAt(pageEndBeat(previous));
        const otherPages = pages
            .filter((p) => p !== page)
            .map((p) => [p, positionsAt(pageEndBeat(p))] as const);
        const pageEraBefore = await pageEraRows(db);
        expect(before).not.toEqual(target);

        // When the success message shows, the edit is already in the resolver
        let atSuccess: unknown;
        const { result, writeTimeline, writePages, notify } = await runTimeline(
            db,
            {
                page,
                pages,
                direction: "previous",
                scope: "all",
                onSuccess: () => (atSuccess = positionsAt(endBeat)),
            },
        );

        const count = resolver().marcherIds().length;
        expect(result).toBe(count);
        expect(writeTimeline).toHaveBeenCalledTimes(1);
        expect(writePages).not.toHaveBeenCalled();
        expect(notify.success).toHaveBeenCalledTimes(1);
        expect(notify.success.mock.calls[0]).toEqual([
            t("actions.batchEdit.setAllToPreviousSuccess", {
                count,
                currentPage: page.name,
                previousPage: previous.name,
            }),
        ]);
        expect(atSuccess).toEqual(target);
        expect(positionsAt(endBeat)).toEqual(target);
        // Only the selected page changes, and marcher_pages is never touched
        for (const [p, positions] of otherPages)
            expect(positionsAt(pageEndBeat(p)), `page ${p.name}`).toEqual(
                positions,
            );
        expect(await pageEraRows(db)).toEqual(pageEraBefore);

        // One edit: one undo restores every marcher, redo applies it again
        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        await timelineResolverSettled();
        expect(positionsAt(endBeat)).toEqual(before);
        const redo = await performRedo(db);
        expect(redo.success, redo.error?.message).toBe(true);
        await timelineResolverSettled();
        expect(positionsAt(endBeat)).toEqual(target);
    });

    it("selected to next: only the selected marchers move; unknown ids are dropped", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[2]!;
        const endBeat = pageEndBeat(page);
        const before = positionsAt(endBeat);
        const target = positionsAt(pageEndBeat(pages[3]!));

        const { result } = await runTimeline(db, {
            page,
            pages,
            direction: "next",
            scope: "selected",
            selected: [2, 5, 9999],
        });

        expect(result).toBe(2);
        const after = positionsAt(endBeat);
        for (const id of resolver().marcherIds())
            expect(after[id], `marcher ${id}`).toEqual(
                [2, 5].includes(id) ? target[id] : before[id],
            );
    });

    it("previous from the last page and next from the second-to-last page", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const last = pages[pages.length - 1]!;
        const secondToLast = pages[pages.length - 2]!;

        const target = positionsAt(pageEndBeat(secondToLast));
        await runTimeline(db, {
            page: last,
            pages,
            direction: "previous",
            scope: "all",
        });
        expect(positionsAt(pageEndBeat(last))).toEqual(target);

        // Next from the second-to-last page reads the last page (moved apart again first)
        await moveMarchersOnPage({
            db,
            page: last,
            moves: [{ marcherId: 3, x: 123, y: 456 }],
        });
        await timelineResolverSettled();
        await runTimeline(db, {
            page: secondToLast,
            pages,
            direction: "next",
            scope: "selected",
            selected: [3],
        });
        expect(positionAt(3, pageEndBeat(secondToLast))).toEqual([123, 456]);
    });

    it("no neighbor page and an empty selection: a message or nothing, and no write", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const before = await timelineRows(db);

        const first = await runTimeline(db, {
            page: pages[0]!,
            pages,
            direction: "previous",
            scope: "all",
        });
        expect(first.result).toBeNull();
        expect(first.notify.error).toHaveBeenCalledWith(
            "actions.batchEdit.noPreviousPage",
        );

        const last = await runTimeline(db, {
            page: pages[pages.length - 1]!,
            pages,
            direction: "next",
            scope: "selected",
            selected: [1],
        });
        expect(last.notify.error).toHaveBeenCalledWith(
            "actions.batchEdit.noNextPage",
        );

        const empty = await runTimeline(db, {
            page: pages[3]!,
            pages,
            direction: "previous",
            scope: "selected",
            selected: [],
        });
        expect(empty.result).toBeNull();
        expect(empty.notify.success).not.toHaveBeenCalled();
        expect(empty.notify.error).not.toHaveBeenCalled();

        for (const run of [first, last, empty])
            expect(run.writeTimeline).not.toHaveBeenCalled();
        expect(await timelineRows(db)).toEqual(before);
    });

    it("page 0 to next: sets the homes", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const first = pages[0]!;
        expect(first.previousPageId).toBeNull();
        const target = positionsAt(pageEndBeat(pages[1]!));

        await runTimeline(db, {
            page: first,
            pages,
            direction: "next",
            scope: "selected",
            selected: [1, 3],
        });

        const homes = await db.select().from(schema.marchers).all();
        for (const id of [1, 3]) {
            const marcher = homes.find((m) => m.id === id)!;
            expect([marcher.home_x, marcher.home_y]).toEqual(target[id]);
            expect(positionAt(id, pageEndBeat(first))).toEqual(target[id]);
        }
    });

    it("waits for a write still in flight instead of planning from stale positions", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[3]!;
        const previous = pages[2]!;
        const endBeat = pageEndBeat(page);
        const target = positionAt(2, pageEndBeat(previous));
        // Marcher 2 is already at its previous-page position
        await moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId: 2, x: target[0], y: target[1] }],
        });
        await timelineResolverSettled();

        // A nudge is still being written when the action runs
        const nudge = moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId: 2, x: target[0] + 10, y: target[1] }],
        });
        const { result, writeTimeline } = await runTimeline(db, {
            page,
            pages,
            direction: "previous",
            scope: "selected",
            selected: [2],
        });
        await nudge;
        await timelineResolverSettled();

        // The plan saw the nudge, so it moved marcher 2 back
        expect(result).toBe(1);
        expect(writeTimeline).toHaveBeenCalledTimes(1);
        expect(positionAt(2, endBeat)).toEqual(target);
    });

    it("a marcher already at the source position gets no move, so a hold through the page isn't refused", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[3]!;
        const previous = pages[2]!;
        const endBeat = pageEndBeat(page);
        // Marcher 1 stops moving on this page: its assignment in the page's move goes (a vacant
        // slot), so it holds through the page and has no move ending at its end beat
        await deleteAssignmentEndingAt(db, 1, endBeat);
        await startTimelineResolver(db);
        expect(positionAt(1, endBeat)).toEqual(
            positionAt(1, pageEndBeat(previous)),
        );
        const copy = copyPagePositions({ page, source: previous });
        expect(copy.marcherIds).toContain(1);
        expect(copy.moves.map((m) => m.marcherId)).not.toContain(1);
        const target = positionsAt(pageEndBeat(previous));

        const { result } = await runTimeline(db, {
            page,
            pages,
            direction: "previous",
            scope: "all",
        });

        expect(result).toBe(copy.marcherIds.length);
        expect(positionsAt(endBeat)).toEqual(target);
    });

    it("nothing to move: no edit is written, and the action still succeeds", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const args = {
            page: pages[3]!,
            pages,
            direction: "previous" as const,
            scope: "selected" as const,
            selected: [4],
        };
        await runTimeline(db, args);
        const history = await undoRows(db);

        // Marcher 4 is already there
        const again = await runTimeline(db, args);

        expect(again.result).toBe(1);
        expect(again.writeTimeline).not.toHaveBeenCalled();
        expect(again.notify.success).toHaveBeenCalledTimes(1);
        expect(await undoRows(db)).toEqual(history);
    });

    it("a marcher with no move ending at the page is refused; nothing is written and no success shows", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[3]!;
        const endBeat = pageEndBeat(page);
        // Marcher 1 holds through this page, but still moves on the next page, so its next-page
        // position differs and needs a move here
        await deleteAssignmentEndingAt(db, 1, endBeat);
        await startTimelineResolver(db);
        const before = await timelineRows(db);
        const history = await undoRows(db);
        const writes: Promise<unknown>[] = [];

        const { result, writeTimeline, notify } = await runTimeline(db, {
            page,
            pages,
            direction: "next",
            scope: "all",
        });

        expect(result).toBeNull();
        expect(writeTimeline).toHaveBeenCalledTimes(1);
        writes.push(writeTimeline.mock.results[0]!.value as Promise<unknown>);
        await expect(writes[0]).rejects.toMatchObject({ code: "E-ARGS" });
        expect(notify.success).not.toHaveBeenCalled();
        expect(await timelineRows(db)).toEqual(before);
        expect(await undoRows(db)).toEqual(history);
    });

    it("a shape-backed transition switches to individual destinations", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[3]!;
        const previous = pages[2]!;
        const endBeat = pageEndBeat(page);
        const transition = await pageMoveEndingAt(db, endBeat);
        await transactionWithHistory(db, "shape", async (tx) => {
            const [shape] = await createTimelineShapesInTransaction({
                tx,
                newShapes: [
                    {
                        kind: "circle",
                        geometry: {
                            center: [400, 300],
                            radius: 77.7,
                            start_angle: 0.3,
                            clockwise: true,
                        },
                    },
                ],
            });
            await setTimelineTransitionDestinationInTransaction({
                tx,
                transitionId: transition.id,
                destination: { kind: "shape", shapeId: shape!.id },
            });
        });
        await timelineResolverSettled();
        const onShape = positionsAt(endBeat);
        const target = positionAt(2, pageEndBeat(previous));

        await runTimeline(db, {
            page,
            pages,
            direction: "previous",
            scope: "selected",
            selected: [2],
        });

        const after = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, transition.id))
            .get();
        expect(after!.dest_shape_id).toBeNull();
        const positions = positionsAt(endBeat);
        for (const id of resolver().marcherIds())
            expect(positions[id], `marcher ${id}`).toEqual(
                id === 2 ? target : onShape[id],
            );
    });

    it("a follow-the-leader transition into a shape is refused (E-T5)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[3]!;
        const endBeat = pageEndBeat(page);
        const transition = await pageMoveEndingAt(db, endBeat);
        await transactionWithHistory(db, "ftl", async (tx) => {
            const [shape] = await createTimelineShapesInTransaction({
                tx,
                newShapes: [
                    {
                        kind: "line",
                        geometry: {
                            points: [
                                [0, 0],
                                [500, 0],
                            ],
                        },
                    },
                ],
            });
            await setTimelineTransitionDestinationInTransaction({
                tx,
                transitionId: transition.id,
                destination: { kind: "shape", shapeId: shape!.id },
            });
            await updateTimelineTransitionsInTransaction({
                tx,
                modifiedTransitions: [
                    {
                        id: transition.id,
                        pathStyle: "follow_the_leader",
                        pathParams: { waypoints: [] },
                    },
                ],
            });
        });
        await timelineResolverSettled();
        const before = await timelineRows(db);

        const { result, writeTimeline, notify } = await runTimeline(db, {
            page,
            pages,
            direction: "previous",
            scope: "selected",
            selected: [2],
        });

        expect(result).toBeNull();
        await expect(
            writeTimeline.mock.results[0]!.value as Promise<unknown>,
        ).rejects.toMatchObject({ code: "E-T5" });
        expect(notify.success).not.toHaveBeenCalled();
        expect(await timelineRows(db)).toEqual(before);
    });

    it("no resolver yet: the planning error is reported and nothing is written", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const pages = await sortedPages(db);

        const { result, writeTimeline, reportError } = await runTimeline(db, {
            page: pages[3]!,
            pages,
            direction: "previous",
            scope: "all",
        });

        expect(result).toBeNull();
        expect(writeTimeline).not.toHaveBeenCalled();
        expect(reportError).toHaveBeenCalledWith(
            expect.any(TimelineNotReadyError),
        );
    });
});
