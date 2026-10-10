import { afterEach, describe, expect, it as plainIt, vi } from "vitest";
import { and, eq, getTableName } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import type { ModifiedMarcherPageArgs } from "@/db-functions/marcherPage";
import {
    marcherPagesByPageId,
    updateMarcherPages,
} from "@/db-functions/marcherPage";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import type Page from "@/global/classes/Page";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import { pageEndBeat } from "../timelineCanvas";
import {
    canvasCoordinateWriter,
    planCanvasEdit,
    timelineCoordinateRecords,
    transformMarchersInSelection,
    TimelineEditRefusedError,
    TimelineNotReadyError,
    toTimelineMoves,
    withTimelinePositions,
    type CanvasEditPlan,
    type TimelineEditRequest,
} from "../timelineCoordinateWrites";
import { timelineErrorMessage } from "../timelineErrorMessages";
import { readStoredTimelineMemberships } from "../useTimelineSelectionHost";
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
 * The routed coordinate tools (docs/timeline/phases/07-page-parity.md P7.2), with the timeline
 * flag on and off, editing against the UI-9 selection (P8.15): canvas drag
 * (`canvasCoordinateWriter`, as `Canvas.tsx` installs it) and the tools as
 * `RegisteredActionsHandler` runs them (read the selected marchers, apply `CoordinateActions`,
 * write).
 */

afterEach(() => {
    stopTimelineResolver();
    useTimelineSelectionStore.getState().reset();
});

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

/** The edit plan for `page`'s page timeline, as the selection store gives it at its end. */
const pagePlan = async (
    db: DbConnection,
    page: Page,
): Promise<CanvasEditPlan> => {
    const timeline = await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.end_beat, pageEndBeat(page)))
        .get();
    expect(timeline).toBeDefined();
    return {
        ok: true,
        target: { kind: "timeline", timelineId: timeline!.id },
        beat: timeline!.end_beat,
    };
};

/** Loads the stored timelines into the selection store, as `useTimelineSelectionHost` does. */
const loadSelection = async (db: DbConnection) =>
    useTimelineSelectionStore
        .getState()
        .setStoredTimelines(await readStoredTimelineMemberships(db));

describe("planCanvasEdit (UI-10 edit window, Home)", () => {
    plainIt("home edits homes", () => {
        expect(planCanvasEdit({ selection: { kind: "home" } })).toEqual({
            ok: true,
            target: { kind: "home" },
            beat: 0,
        });
    });

    plainIt(
        "a window edits the timeline over it, stored or not, at its end",
        () => {
            for (const [start, end] of [
                [9, 17], // a page box
                [9, 12], // mid-page: no page, no stored timeline needed
                [3, 30], // across flags
            ] as const) {
                expect(
                    planCanvasEdit({
                        selection: { kind: "range", start, end },
                    }),
                ).toEqual({
                    ok: true,
                    target: { kind: "range", start, end },
                    beat: end,
                });
            }
        },
    );

    plainIt("nothing selected is refused", () => {
        const plan = planCanvasEdit({ selection: { kind: "none" } });
        expect(!plan.ok && plan.error).toBeInstanceOf(TimelineEditRefusedError);
        expect(
            !plan.ok && (plan.error as TimelineEditRefusedError).refusal,
        ).toBe("noTimeline");
    });

    plainIt("reads the store's edit window by default", () => {
        const store = useTimelineSelectionStore.getState();
        store.setPageBoxes([
            { start: 1, end: 9 },
            { start: 9, end: 17 },
        ]);
        store.selectRange(1, 9);
        expect(planCanvasEdit()).toEqual({
            ok: true,
            target: { kind: "range", start: 1, end: 9 },
            beat: 9,
        });
        store.seek(13); // the start flag follows to the box holding the playhead
        expect(planCanvasEdit()).toEqual({
            ok: true,
            target: { kind: "range", start: 9, end: 13 },
            beat: 13,
        });
        store.setPageBoxes([]);
    });

    plainIt("the refusal shows its message", () => {
        const error = new TimelineEditRefusedError("noTimeline");
        expect(timelineErrorMessage(error, { translate: (_k, d) => d })).toBe(
            error.message,
        );
        expect(timelineErrorMessage(error, { translate: (key) => key })).toBe(
            error.key,
        );
    });
});

describe("canvasCoordinateWriter", () => {
    const changes: ModifiedMarcherPageArgs[] = [
        // A page id left over from an earlier render
        { marcher_id: 1, page_id: 99, x: 10, y: 20 },
    ];
    const timelinePlan: CanvasEditPlan = {
        ok: true,
        target: { kind: "timeline", timelineId: 4 },
        beat: 9,
    };

    plainIt("flag off: is the page-mode writer itself", () => {
        const writePages = vi.fn();
        const writeTimeline = vi.fn();
        const write = canvasCoordinateWriter({
            timelineMode: false,
            writePages,
            writeTimeline,
            onRefused: vi.fn(),
        });
        expect(write).toBe(writePages);
        write(changes);
        expect(writePages).toHaveBeenCalledWith(changes);
        expect(writeTimeline).not.toHaveBeenCalled();
    });

    plainIt(
        "flag on: writes the moves where the selection edits, ignoring page_id",
        () => {
            const writePages = vi.fn();
            const writeTimeline = vi.fn();
            canvasCoordinateWriter({
                timelineMode: true,
                writePages,
                writeTimeline,
                onRefused: vi.fn(),
                plan: () => timelinePlan,
            })(changes);
            expect(writePages).not.toHaveBeenCalled();
            expect(writeTimeline).toHaveBeenCalledWith({
                target: { kind: "timeline", timelineId: 4 },
                moves: [{ marcherId: 1, x: 10, y: 20 }],
            });
        },
    );

    plainIt("flag on: plans when the move ends, not when installed", () => {
        const store = useTimelineSelectionStore.getState();
        store.selectHome();
        const writeTimeline = vi.fn();
        const onRefused = vi.fn();
        const write = canvasCoordinateWriter({
            timelineMode: true,
            writePages: vi.fn(),
            writeTimeline,
            onRefused,
        });
        store.selectRange(1, 9);
        write(changes);
        expect(writeTimeline).toHaveBeenCalledWith({
            target: { kind: "range", start: 1, end: 9 },
            moves: [{ marcherId: 1, x: 10, y: 20 }],
        });
        expect(onRefused).not.toHaveBeenCalled();
    });

    plainIt("flag on, refused by the selection: writes nothing", () => {
        const writeTimeline = vi.fn();
        const onRefused = vi.fn();
        const error = new TimelineEditRefusedError("noTimeline");
        canvasCoordinateWriter({
            timelineMode: true,
            writePages: vi.fn(),
            writeTimeline,
            onRefused,
            plan: () => ({ ok: false, error }),
        })(changes);
        expect(writeTimeline).not.toHaveBeenCalled();
        expect(onRefused).toHaveBeenCalledWith(error);
    });

    plainIt("withTimelinePositions refuses to guess without a resolver", () => {
        expect(() =>
            withTimelinePositions(5, [{ marcher_id: 1, x: 0, y: 0 }]),
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
            writePages: (modifiedMarcherPages) => {
                pending = updateMarcherPages({ db, modifiedMarcherPages });
            },
            writeTimeline: () => {
                throw new Error("not in page mode");
            },
            onRefused: () => {},
        });
        write([{ marcher_id: 4, page_id: page.id, x: 111, y: 222 }]);
        await pending;

        expect(await marcherPage(db, 4, page.id)).toMatchObject({
            x: 111,
            y: 222,
        });
        expect(await timelineRows(db)).toEqual(before);
    });

    it("canvas drag, flag on: sets the ending in the selected timeline, leaves marcher_pages alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[2]!;
        const rowBefore = await marcherPage(db, 4, page.id);
        const plan = await pagePlan(db, page);

        let pending: Promise<unknown> = Promise.resolve();
        const write = canvasCoordinateWriter<ModifiedMarcherPageArgs>({
            timelineMode: true,
            writePages: () => {
                throw new Error("not in timeline mode");
            },
            writeTimeline: ({ target, moves }: TimelineEditRequest) => {
                pending = moveMarchersInTarget({ db, target, moves });
            },
            onRefused: () => {
                throw new Error("not refused");
            },
            plan: () => plan,
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

    it("canvas drag at home: sets the homes", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        useTimelineSelectionStore.getState().selectHome();
        const before = await timelineRows(db);

        let pending: Promise<unknown> = Promise.resolve();
        canvasCoordinateWriter<ModifiedMarcherPageArgs>({
            timelineMode: true,
            writePages: () => {
                throw new Error("not in timeline mode");
            },
            writeTimeline: ({ target, moves }) => {
                pending = moveMarchersInTarget({ db, target, moves });
            },
            onRefused: () => {
                throw new Error("not refused");
            },
        })([{ marcher_id: 2, page_id: 0, x: 33, y: 44 }]);
        await pending;

        await timelineResolverSettled();
        expect(positionAt(2, 0)).toEqual([33, 44]);
        const after = await timelineRows(db);
        expect(after.timeline_slot_destinations).toEqual(
            before.timeline_slot_destinations,
        );
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

        // Equal within the coordinate tolerance, not bit-exact (page-mode writes compare with it)
        for (const id of [1, 2, 3])
            expect((await marcherPage(db, id, page.id))!.y).toBeCloseTo(
                averageY,
                6,
            );
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
        const plan = await pagePlan(db, page);
        if (!plan.ok) throw new Error("planned");
        // An earlier timeline move makes marcher_pages stale for marcher 1
        await moveMarchersInTarget({
            db,
            target: plan.target,
            moves: [{ marcherId: 1, x: 50, y: 900 }],
        });
        await timelineResolverSettled();
        const marcherPagesBefore = await marcherPagesByPageId({
            db,
            pageId: page.id,
        });

        // RegisteredActionsHandler: getSelectedMarcherPages → alignVertically → updateCoordinates
        const selected = timelineCoordinateRecords(plan.beat, [1, 2, 3]);
        expect(selected.map((mp) => mp.marcher_id).sort()).toEqual([1, 2, 3]);
        for (const mp of selected)
            expect([mp.x, mp.y]).toEqual(positionAt(mp.marcher_id, endBeat));
        const drawn = [1, 2, 3].map((id) => positionAt(id, endBeat));
        const changes = CoordinateActions.alignVertically({
            marcherPages: selected,
        });
        await moveMarchersInTarget({
            db,
            target: plan.target,
            moves: toTimelineMoves(changes),
        });

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
        const result = await transformMarchersInSelection({
            db,
            plan: await pagePlan(db, page),
            marcherIds: [5, 6],
            transform: (current) => current.map((c) => ({ ...c, x: c.x + 10 })),
        });
        expect(result.map((c) => c.marcher_id)).toEqual([5, 6]);

        await timelineResolverSettled();
        expect(positionAt(6, endBeat)).toEqual([x0 + 10, y0]);
    });

    it("nudge through the selection store: at a flag edits that page's timeline; mid-page creates one ending at the playhead", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const page = (await sortedPages(db))[2]!;
        const endBeat = pageEndBeat(page);
        const plan = await pagePlan(db, page);
        if (!plan.ok || plan.target.kind !== "timeline")
            throw new Error("planned");
        await loadSelection(db);
        const store = useTimelineSelectionStore.getState();
        const timeline = store.storedTimelines!.find(
            (t) => t.id === (plan.target as { timelineId: number }).timelineId,
        )!;
        store.selectRange(timeline.start, timeline.end);
        const [x0, y0] = positionAt(3, endBeat);

        await transformMarchersInSelection({
            db,
            marcherIds: [3],
            transform: (current) => current.map((c) => ({ ...c, y: c.y + 4 })),
        });
        await timelineResolverSettled();
        expect(positionAt(3, endBeat)).toEqual([x0, y0 + 4]);
        const timelinesAfterFlagEdit = (
            await db.select().from(schema.timelines).all()
        ).length;

        // UI-10: off the flag, the move arrives at the playhead in a new timeline, not a page
        const mid = timeline.start + 3;
        store.selectRange(timeline.start, mid);
        const [mx, my] = positionAt(3, mid);
        await transformMarchersInSelection({
            db,
            marcherIds: [3],
            transform: (current) => current.map((c) => ({ ...c, x: c.x + 2 })),
        });
        await timelineResolverSettled();
        expect(positionAt(3, mid)).toEqual([mx + 2, my]);
        // ...and then resumes to where it already arrived at the flag
        expect(positionAt(3, endBeat)).toEqual([x0, y0 + 4]);
        const timelines = await db.select().from(schema.timelines).all();
        expect(timelines.length).toBe(timelinesAfterFlagEdit + 1);
        expect(
            timelines.some(
                (t) => t.start_beat === timeline.start && t.end_beat === mid,
            ),
        ).toBe(true);
    });

    it("swap, flag on: the two marchers exchange positions at the timeline's end", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const page = (await sortedPages(db))[2]!;
        const endBeat = pageEndBeat(page);
        const plan = await pagePlan(db, page);
        if (!plan.ok) throw new Error("planned");
        const a = positionAt(8, endBeat);
        const b = positionAt(9, endBeat);
        const before = await marcherPagesByPageId({ db, pageId: page.id });

        // RegisteredActionsHandler's swapMarchers case in timeline mode
        const [p, q] = timelineCoordinateRecords(plan.beat, [8, 9]);
        await moveMarchersInTarget({
            db,
            target: plan.target,
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
});
