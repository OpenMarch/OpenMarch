import { afterEach, describe, expect, vi } from "vitest";
import { asc } from "drizzle-orm";
import { toast } from "sonner";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { createLastPage } from "@/db-functions/page";
import { createMarchers } from "@/db-functions/marcher";
import { updateMarcherPages } from "@/db-functions/marcherPage";
import {
    performRedo,
    performUndo,
    transactionWithHistory,
} from "@/db-functions/history";
import {
    moveMarchersInTarget,
    shiftSlotDestinations,
    type TimelineMarcherMove,
} from "@/db-functions/timelineMoves";
import { createTimelineShapesInTransaction } from "@/db-functions/timelineShapes";
import { setTimelineTransitionDestinationInTransaction } from "@/db-functions/timelineTransitions";
import type Page from "@/global/classes/Page";
import { deleteTimelineAndCompare } from "@/db-functions/timelineCommands";
import { moveDeletedMessage } from "@/components/timeline/useTimelineCommands";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import { neighborPageTarget } from "../timelineCoordinateWrites";
import { forgetEditRun } from "@/utilities/moveThemToo";
import {
    moveMarchersAndOfferFollowUp,
    toastLaterOwnMoves,
} from "../timelineMoveThemToo";
import { pageFlags } from "../timelinePlayhead";
import {
    resolverSpans,
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";

/**
 * **Move them too** in timeline mode (defined-coordinates 09, G4): an edit that splits the
 * marchers it moved at a later page (some follow into it, some keep their own move there) offers
 * to shift the kept destinations by the same offset, as one separate undoable edit. The message and page mode are in
 * `utilities/__test__/moveThemToo.test.ts`.
 */

// The show is built in page mode, then converted, so the fixtures stay in page mode
keepFixturesInPageMode("its tests build the show and convert it themselves");

afterEach(() => {
    forgetEditRun();
    stopTimelineResolver();
    useTimelineSelectionStore.getState().reset();
    vi.restoreAllMocks();
});

const box = (page: Page) => {
    const target = neighborPageTarget(page);
    if (target.kind !== "range") throw new Error("not a page box");
    return target;
};

/**
 * OT1–OT8 in a line (x = 100, 150, … 450), and pages 1–3 after home, built in page mode with
 * `ys[i]` as everyone's y on page i (home is page 0; pages past `ys` copy the last), then
 * converted, with the resolver running and the page boxes set.
 */
const convertedShow = async (db: DbConnection, ys: readonly number[]) => {
    await createMarchers({
        db,
        newMarchers: Array.from({ length: 8 }, (_, i) => ({
            section: "Trumpet",
            drill_prefix: "OT",
            drill_order: i + 1,
        })),
    });
    for (let i = 0; i < 3; i++)
        await createLastPage({ db, newPageCounts: 8, createNewBeats: true });
    const marchers = (
        await db
            .select()
            .from(schema.marchers)
            .orderBy(asc(schema.marchers.drill_order))
            .all()
    ).map((m) => m.id);
    const { pages: unsorted } = await readShowTiming(db);
    const pages = [...unsorted].sort((a, b) => a.order - b.order);
    for (const [p, y] of ys.entries())
        await updateMarcherPages({
            db,
            modifiedMarcherPages: marchers.map((id, i) => ({
                marcher_id: id,
                page_id: pages[p]!.id,
                x: 100 + 50 * i,
                y,
            })),
        });
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
    const boxes = pageFlags(pages).flatMap((f) =>
        f.range ? [{ ...f.range, name: f.page.name }] : [],
    );
    useTimelineSelectionStore.getState().setPageBoxes(boxes);
    return { pages, marchers, boxes };
};

/**
 * The study's starter show (09): OT1–OT8 in a line at home (x = 100, 150, … 450; y = 300),
 * pages 1–3 after it, nobody moving; then the study's steps, as timeline edits: everyone marches
 * forward 100 on page 1 (later pages hold there), and OT1 and OT8 step out sideways by 50 on page
 * 2 (unless `stepOut` is false: a fully held show). Pages are numbered from 0 here (no page
 * number offset), so page 2 is the study's set 3.
 */
const studyShow = async (db: DbConnection, { stepOut = true } = {}) => {
    const { pages, marchers, boxes } = await convertedShow(db, [300]);
    // Nobody moves in the starter show, so the conversion writes no moves
    expect(await db.select().from(schema.timelines).all()).toEqual([]);

    // Page 1 (G1): forward 100
    await moveMarchersInTarget({
        db,
        target: box(pages[1]!),
        moves: marchers.map((id, i) => ({
            marcherId: id,
            x: 100 + 50 * i,
            y: 200,
        })),
    });
    // Page 2 (G3): OT1 and OT8 step out
    if (stepOut)
        await moveMarchersInTarget({
            db,
            target: box(pages[2]!),
            moves: [
                { marcherId: marchers[0]!, x: 50, y: 200 },
                { marcherId: marchers[7]!, x: 500, y: 200 },
            ],
        });
    await timelineResolverSettled();
    return { pages, marchers, boxes };
};

/** G4: shorten the page-1 move to 50 forward */
const shortenMoves = (marchers: readonly number[]): TimelineMarcherMove[] =>
    marchers.map((id, i) => ({ marcherId: id, x: 100 + 50 * i, y: 250 }));

const at = (marcherId: number, page: Page) =>
    useTimelineResolverStore
        .getState()
        .resolver!.positionAt(marcherId, box(page).end);

type Info = ReturnType<typeof vi.spyOn<typeof toast, "info">>;

/** The **Move them too** toast's call, once it has shown */
const moveThemTooCall = async (info: Info) => {
    await vi.waitFor(() =>
        expect(
            info.mock.calls.some(
                (c) =>
                    String(c[0]).includes("so they kept their spot") ||
                    String(c[0]).includes("so it kept its spot") ||
                    String(c[0]).includes("so they kept their spots"),
            ),
        ).toBe(true),
    );
    return info.mock.calls.at(-1)!;
};

describeDbTests("timeline mode: Move them too", (it) => {
    it("study scenario: shortening page 1 names OT1 and OT8 at Page 2; the action shifts them, page 3 follows, one undo reverts it", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const [ot1, ot8] = [marchers[0]!, marchers[7]!];
        expect(at(ot1, pages[2]!)).toEqual([50, 200]);
        expect(at(ot1, pages[3]!)).toEqual([50, 200]);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);

        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[1]!),
            moves: shortenMoves(marchers),
        });

        const [message, options] = await moveThemTooCall(info);
        expect(message).toBe(
            "OT1 and OT8 have their own move on Page 2, so they kept their spot",
        );
        expect(options).toMatchObject({
            id: expect.stringMatching(/^timeline-edit-\d+$/),
            action: { label: "Move them too" },
        });
        // Before the action: the others followed, OT1 and OT8 kept their spot
        expect(at(marchers[1]!, pages[2]!)).toEqual([150, 250]);
        expect(at(ot1, pages[2]!)).toEqual([50, 200]);

        (options as { action: { onClick: () => void } }).action.onClick();
        await vi.waitFor(() => expect(at(ot1, pages[2]!)).toEqual([50, 250]));
        expect(at(ot8, pages[2]!)).toEqual([500, 250]);
        // Page 3 holds from page 2, so it follows
        expect(at(ot1, pages[3]!)).toEqual([50, 250]);
        expect(at(ot8, pages[3]!)).toEqual([500, 250]);
        expect(at(marchers[1]!, pages[3]!)).toEqual([150, 250]);
        // The action says nothing more
        const calls = info.mock.calls.length;

        // One undo takes back only the action
        await performUndo(db);
        await timelineResolverSettled();
        expect(at(ot1, pages[2]!)).toEqual([50, 200]);
        expect(at(ot1, pages[3]!)).toEqual([50, 200]);
        expect(at(ot1, pages[1]!)).toEqual([100, 250]);
        expect(at(marchers[1]!, pages[2]!)).toEqual([150, 250]);
        await performRedo(db);
        await timelineResolverSettled();
        expect(at(ot1, pages[2]!)).toEqual([50, 250]);
        // Undo and redo offer nothing
        expect(info.mock.calls.length).toBe(calls);
    });

    it("own moves on several pages: says their later moves", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        // OT2 steps out on page 3
        await moveMarchersInTarget({
            db,
            target: box(pages[3]!),
            moves: [{ marcherId: marchers[1]!, x: 150, y: 100 }],
        });
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[1]!),
            moves: shortenMoves(marchers),
        });
        const [message] = await moveThemTooCall(info);
        expect(message).toBe(
            "OT1, OT2 and OT8 have their own later moves, so they kept their spots",
        );
    });

    it("a shape-backed later move is skipped and not listed", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const resolver = useTimelineResolverStore.getState().resolver!;
        const ot1Move = resolverSpans(resolver, marchers[0]!).find(
            (s) => s.kind !== "hold" && s.end === box(pages[2]!).end,
        )!;
        await transactionWithHistory(db, "shape", async (tx) => {
            const [shape] = await createTimelineShapesInTransaction({
                tx,
                newShapes: [
                    {
                        kind: "circle",
                        geometry: {
                            center: [60, 210],
                            radius: 10,
                            start_angle: 0,
                            clockwise: true,
                        },
                    },
                ],
            });
            await setTimelineTransitionDestinationInTransaction({
                tx,
                transitionId: ot1Move.transitionId!,
                destination: { kind: "shape", shapeId: shape!.id },
            });
        });
        await timelineResolverSettled();
        const shaped = at(marchers[0]!, pages[2]!);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[1]!),
            moves: shortenMoves(marchers),
        });
        const [message, options] = await moveThemTooCall(info);
        expect(message).toBe(
            "OT8 has its own move on Page 2, so it kept its spot",
        );
        (options as { action: { onClick: () => void } }).action.onClick();
        await vi.waitFor(() =>
            expect(at(marchers[7]!, pages[2]!)).toEqual([500, 250]),
        );
        expect(at(marchers[0]!, pages[2]!)).toEqual(shaped);
        // Shifting a shape-backed slot directly writes nothing
        expect(
            await shiftSlotDestinations({
                db,
                shifts: [
                    {
                        marcherId: marchers[0]!,
                        transitionId: ot1Move.transitionId!,
                        slotIndex: ot1Move.slot!,
                        dx: 1,
                        dy: 1,
                    },
                ],
            }),
        ).toEqual([]);
    });

    it("shifting a kept spot clears its kept marker, so it is an own move again (pre-merge review D1)", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const resolver = useTimelineResolverStore.getState().resolver!;
        const ot8Move = resolverSpans(resolver, marchers[7]!).find(
            (s) => s.kind !== "hold" && s.end === box(pages[2]!).end,
        )!;
        const a = schema.timeline_assignments;
        const assignment = (await db.select().from(a).all()).find(
            (r) =>
                r.transition_id === ot8Move.transitionId &&
                r.slot_index === ot8Move.slot,
        )!;
        await db
            .insert(schema.timeline_kept_assignments)
            .values({ assignment_id: assignment.id })
            .run();
        await shiftSlotDestinations({
            db,
            shifts: [
                {
                    marcherId: marchers[7]!,
                    transitionId: ot8Move.transitionId!,
                    slotIndex: ot8Move.slot!,
                    dx: 0,
                    dy: 50,
                },
            ],
        });
        expect(
            await db.select().from(schema.timeline_kept_assignments).all(),
        ).toEqual([]);
        // Undo brings the marker back with the spot
        await performUndo(db);
        expect(
            (
                await db.select().from(schema.timeline_kept_assignments).all()
            ).map((r) => r.assignment_id),
        ).toEqual([assignment.id]);
    });

    it("an older edit's check finishing after a newer one's shows no toast (pre-merge review U5)", async ({
        db,
    }) => {
        const { pages, marchers, boxes } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        const found = [
            {
                marcherId: marchers[7]!,
                transitionId: 1,
                slotIndex: 0,
                dx: 0,
                dy: 10,
                flag: box(pages[2]!).end,
            },
        ];
        await toastLaterOwnMoves(found, boxes, 20, "newer");
        await toastLaterOwnMoves(found, boxes, 19, "older");
        expect(info).toHaveBeenCalledTimes(1);
    });

    it("an edit that moves them only within the tolerance offers nothing", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[1]!),
            moves: [{ marcherId: marchers[0]!, x: 100 + 1e-9, y: 200 }],
        });
        // Give the follow-up its chance to run
        await timelineResolverSettled();
        await new Promise((r) => setTimeout(r, 200));
        expect(info).not.toHaveBeenCalled();
    });

    it("an edit of marchers whose next page holds offers no Move them too, only Only Page N (UI-18 keep later pages)", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[1]!),
            moves: [{ marcherId: marchers[3]!, x: 260, y: 240 }],
        });
        await timelineResolverSettled();
        await new Promise((r) => setTimeout(r, 200));
        expect(info.mock.calls.map((c) => c[0])).toEqual([
            `Pages ${pages[2]!.name}–${pages[3]!.name} followed`,
        ]);
    });

    it("with a window passing a flag that also splits them, only the pass-through toast shows (Keep as a stop stays reachable)", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const [ot4, ot5] = [marchers[3]!, marchers[4]!];
        // OT4 has its own move on page 3; OT5 holds there
        await moveMarchersInTarget({
            db,
            target: box(pages[3]!),
            moves: [{ marcherId: ot4, x: 250, y: 100 }],
        });
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        // A window over pages 1–2 moves OT4 and OT5: it passes page 1's flag, and splits them at
        // page 3 (OT5 follows, OT4 keeps its move)
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: {
                kind: "range",
                start: box(pages[1]!).start,
                end: box(pages[2]!).end,
            },
            moves: [
                { marcherId: ot4, x: 270, y: 180 },
                { marcherId: ot5, x: 320, y: 180 },
            ],
        });
        await timelineResolverSettled();
        await new Promise((r) => setTimeout(r, 200));
        expect(at(ot5, pages[3]!)).toEqual([320, 180]);
        expect(at(ot4, pages[3]!)).toEqual([250, 100]);
        expect(info.mock.calls.map((c) => c[0])).toEqual([
            `Page ${pages[1]!.name} is no longer a stop`,
        ]);
        expect(info.mock.calls[0]![1]).toMatchObject({
            id: expect.stringMatching(/^timeline-edit-\d+$/),
            action: { label: `Keep Page ${pages[1]!.name} as a stop` },
        });
    });

    it("a fully held show: shortening page 1 for everyone offers no Move them too, only Only Page N (UI-18 keep later pages)", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db, { stepOut: false });
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[1]!),
            moves: shortenMoves(marchers),
        });
        await timelineResolverSettled();
        await new Promise((r) => setTimeout(r, 200));
        // Everyone followed
        expect(at(marchers[0]!, pages[3]!)).toEqual([100, 250]);
        expect(info.mock.calls.map((c) => c[0])).toEqual([
            `Pages ${pages[2]!.name}–${pages[3]!.name} followed`,
        ]);
    });

    it("a fully written show (every marcher moves on every page): an ordinary drag and a nudge on page 2 offer nothing", async ({
        db,
    }) => {
        const { pages, marchers } = await convertedShow(db, [300, 200, 100, 0]);
        expect(at(marchers[0]!, pages[2]!)).toEqual([100, 100]);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        // Drag everyone on page 2
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[2]!),
            moves: marchers.map((id, i) => ({
                marcherId: id,
                x: 110 + 50 * i,
                y: 120,
            })),
        });
        await timelineResolverSettled();
        await new Promise((r) => setTimeout(r, 200));
        // Nudge one
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[2]!),
            moves: [{ marcherId: marchers[3]!, x: 261, y: 120 }],
        });
        await timelineResolverSettled();
        await new Promise((r) => setTimeout(r, 200));
        expect(at(marchers[3]!, pages[2]!)).toEqual([261, 120]);
        // Page 3 kept its own spot for everyone
        expect(at(marchers[3]!, pages[3]!)).toEqual([250, 0]);
        expect(info).not.toHaveBeenCalled();
    });
});

/** The Move them too toasts shown so far */
const moveThemTooCalls = (info: Info) =>
    info.mock.calls.filter((c) =>
        /so (it|they) kept (its|their) spots?$/.test(String(c[0])),
    );

/** Everyone's page-1 y set to `y` (a nudge of the shortened move), and its Move them too toast */
const nudgePage1 = async (
    db: DbConnection,
    pages: readonly Page[],
    marchers: readonly number[],
    y: number,
    info: Info,
    skip: readonly number[] = [],
) => {
    const shown = moveThemTooCalls(info).length;
    await moveMarchersAndOfferFollowUp({
        database: db,
        target: box(pages[1]!),
        moves: marchers.flatMap((id, i) =>
            skip.includes(id) ? [] : [{ marcherId: id, x: 100 + 50 * i, y }],
        ),
    });
    await vi.waitFor(() =>
        expect(moveThemTooCalls(info).length).toBe(shown + 1),
    );
    return moveThemTooCalls(info).at(-1)![1] as {
        action: { onClick: () => void };
        onAutoClose: () => void;
    };
};

describeDbTests("timeline mode: Move them too after several edits", (it) => {
    it("two nudges in a row: the action shifts by both", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        const [ot1, ot8] = [marchers[0]!, marchers[7]!];
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await nudgePage1(db, pages, marchers, 225, info);
        const last = await nudgePage1(db, pages, marchers, 250, info);
        last.action.onClick();
        await vi.waitFor(() => expect(at(ot1, pages[2]!)).toEqual([50, 250]));
        expect(at(ot8, pages[2]!)).toEqual([500, 250]);
        expect(at(ot1, pages[3]!)).toEqual([50, 250]);
        // One undo takes back the whole shift
        await performUndo(db);
        await timelineResolverSettled();
        expect(at(ot1, pages[2]!)).toEqual([50, 200]);
    });

    it("the same window, other marchers (all but OT4): only the last", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await nudgePage1(db, pages, marchers, 225, info);
        const last = await nudgePage1(db, pages, marchers, 250, info, [
            marchers[3]!,
        ]);
        last.action.onClick();
        await vi.waitFor(() =>
            expect(at(marchers[0]!, pages[2]!)).toEqual([50, 225]),
        );
        expect(at(marchers[7]!, pages[2]!)).toEqual([500, 225]);
    });

    it("a nudge, an undo, a nudge: only the last", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await nudgePage1(db, pages, marchers, 225, info);
        await performUndo(db);
        await timelineResolverSettled();
        const last = await nudgePage1(db, pages, marchers, 225, info);
        last.action.onClick();
        await vi.waitFor(() =>
            expect(at(marchers[0]!, pages[2]!)).toEqual([50, 225]),
        );
    });

    it("a nudge, another edit, a nudge: only the last", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await nudgePage1(db, pages, marchers, 225, info);
        // OT4 steps forward on page 3
        await moveMarchersInTarget({
            db,
            target: box(pages[3]!),
            moves: [{ marcherId: marchers[3]!, x: 250, y: 100 }],
        });
        await timelineResolverSettled();
        const last = await nudgePage1(db, pages, marchers, 250, info);
        last.action.onClick();
        await vi.waitFor(() =>
            expect(at(marchers[0]!, pages[2]!)).toEqual([50, 225]),
        );
    });

    it("after the toast closes, the next nudge starts over", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        const first = await nudgePage1(db, pages, marchers, 225, info);
        first.onAutoClose();
        const last = await nudgePage1(db, pages, marchers, 250, info);
        last.action.onClick();
        await vi.waitFor(() =>
            expect(at(marchers[0]!, pages[2]!)).toEqual([50, 225]),
        );
    });

    it("after Move them too, the next nudge starts over", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        const first = await nudgePage1(db, pages, marchers, 225, info);
        first.action.onClick();
        await vi.waitFor(() =>
            expect(at(marchers[0]!, pages[2]!)).toEqual([50, 225]),
        );
        const last = await nudgePage1(db, pages, marchers, 250, info);
        last.action.onClick();
        await vi.waitFor(() =>
            expect(at(marchers[0]!, pages[2]!)).toEqual([50, 250]),
        );
    });
});

describe("the delete-move toast", () => {
    it("appends the pages that changed, as runs", () => {
        const page = (name: string, order: number) => ({
            id: order,
            name,
            order,
        });
        expect(moveDeletedMessage("Move 2")).toBe("Deleted Move 2");
        expect(moveDeletedMessage("Move 2", [page("3", 3)])).toBe(
            "Deleted Move 2 · Page 3 changed",
        );
        expect(
            moveDeletedMessage("Page 2's move", [
                page("2", 2),
                page("3", 3),
                page("5", 5),
            ]),
        ).toBe("Deleted Page 2's move · Pages 2–3, 5 changed");
    });
});

describeDbTests("deleting a move names the pages that changed", (it) => {
    it("later pages that held from it fall back, and are named; pages after an own move aren't", async ({
        db,
    }) => {
        const { pages } = await studyShow(db);
        const timelineEndingAt = async (page: Page) =>
            (await db.select().from(schema.timelines).all()).find(
                (t) => t.end_beat === box(page).end,
            )!;

        // Page 2's move (OT1 and OT8 step out): pages 2–3 go back to the line
        const page2 = await timelineEndingAt(pages[2]!);
        const step = await deleteTimelineAndCompare({
            db,
            timelineId: page2.id,
        });
        expect(step.deleted.id).toBe(page2.id);
        expect(step.changedPages.map((p) => p.name)).toEqual([
            pages[2]!.name,
            pages[3]!.name,
        ]);
        await performUndo(db);

        // Page 1's move (everyone forward): page 1 and every page holding after it change;
        // page 2 too, though OT1 and OT8 own it, since the others held there
        const page1 = await timelineEndingAt(pages[1]!);
        const forward = await deleteTimelineAndCompare({
            db,
            timelineId: page1.id,
        });
        expect(forward.changedPages.map((p) => p.name)).toEqual([
            pages[1]!.name,
            pages[2]!.name,
            pages[3]!.name,
        ]);
    });
});
