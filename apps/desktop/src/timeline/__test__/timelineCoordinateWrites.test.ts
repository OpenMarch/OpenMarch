import { afterEach, describe, expect, it as plainIt, vi } from "vitest";
import { eq, getTableName } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import type { ModifiedMarcherPageArgs } from "@/global/classes/MarcherPage";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import type Page from "@/global/classes/Page";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { readShowTiming } from "@/timeline/showTiming";
import { convertPagesToTimeline } from "@/test/convertPages";
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

// P7.17: these tests convert the show themselves
keepFixturesInPageMode("its tests convert the show themselves");

/**
 * The routed coordinate tools (docs/timeline/phases/07-page-parity.md P7.2), editing against the
 * UI-9 selection (P8.15): canvas drag
 * (`canvasCoordinateWriter`, as `Canvas.tsx` installs it) and the tools as
 * the shortcut action handlers (`shortcuts/handlers`) run them (read the
 * selected marchers, apply `CoordinateActions`, write).
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

    plainIt(
        "writes the moves where the selection edits, ignoring page_id",
        () => {
            const writeTimeline = vi.fn();
            canvasCoordinateWriter({
                writeTimeline,
                onRefused: vi.fn(),
                plan: () => timelinePlan,
            })(changes);
            expect(writeTimeline).toHaveBeenCalledWith({
                target: { kind: "timeline", timelineId: 4 },
                moves: [{ marcherId: 1, x: 10, y: 20 }],
            });
        },
    );

    plainIt("plans when the move ends, not when installed", () => {
        const store = useTimelineSelectionStore.getState();
        store.selectHome();
        const writeTimeline = vi.fn();
        const onRefused = vi.fn();
        const write = canvasCoordinateWriter({
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

    plainIt("refused by the selection: writes nothing", () => {
        const writeTimeline = vi.fn();
        const onRefused = vi.fn();
        const error = new TimelineEditRefusedError("noTimeline");
        canvasCoordinateWriter({
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
    it("canvas drag: sets the ending in the selected timeline", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[2]!;
        const plan = await pagePlan(db, page);
        const stale = pages[5]!;
        const staleBefore = positionAt(4, pageEndBeat(stale));

        let pending: Promise<unknown> = Promise.resolve();
        const write = canvasCoordinateWriter<ModifiedMarcherPageArgs>({
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

        await timelineResolverSettled();
        expect(positionAt(4, pageEndBeat(page))).toEqual([111, 222]);
        // The stale page was not touched
        expect(positionAt(4, pageEndBeat(stale))).toEqual(staleBefore);
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

    it("align vertically: starts from the resolver", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const page = (await sortedPages(db))[3]!;
        const endBeat = pageEndBeat(page);
        const plan = await pagePlan(db, page);
        if (!plan.ok) throw new Error("planned");
        // An earlier timeline move
        await moveMarchersInTarget({
            db,
            target: plan.target,
            moves: [{ marcherId: 1, x: 50, y: 900 }],
        });
        await timelineResolverSettled();

        // useAlignmentActionHandlers: getSelectedMarcherPages → alignVertically → updateCoordinates
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
        [1, 2, 3].forEach((id, i) =>
            expect(positionAt(id, endBeat)).toEqual([drawn[i]![0], averageY]),
        );
    });

    it("nudge: moves the marchers from the resolver's positions", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const page = (await sortedPages(db))[3]!;
        const endBeat = pageEndBeat(page);
        const [x0, y0] = positionAt(6, endBeat);

        // useUpdateSelectedMarchers, with a nudge as the transform
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

    it("swap: the two marchers exchange positions at the timeline's end", async ({
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

        // useAlignmentActionHandlers's swapMarchers
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
    });
});
