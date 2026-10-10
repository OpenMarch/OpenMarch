import { afterEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { createLastPage } from "@/db-functions/page";
import { createMarchers } from "@/db-functions/marcher";
import {
    moveLaterMovesToo,
    updateMarcherPages,
    type MarcherPagesWriteResult,
} from "@/db-functions/marcherPage";
import { createShapePages } from "@/db-functions/shapePages";
import { performRedo, performUndo } from "@/db-functions/history";
import { mergeCarriedRuns, toastCarryForward } from "../carryForwardToast";
import {
    continueEditRun,
    editScope,
    editSurpriseToastId,
    forgetEditRun,
    marcherNamesList,
    moveThemTooMessage,
} from "../moveThemToo";

/**
 * **Move them too** (defined-coordinates 09, G4): the message and page mode. Timeline mode is in
 * `timeline/__test__/timelineMoveThemToo.test.ts`.
 */

describe("the message", () => {
    it("names the marchers and their one page", () => {
        expect(
            moveThemTooMessage([
                { label: "OT1", page: "3" },
                { label: "OT8", page: "3" },
            ]),
        ).toEqual({
            message:
                "OT1 and OT8 have their own move on Page 3, so they kept their spot",
            actionLabel: "Move them too",
        });
        expect(moveThemTooMessage([{ label: "OT8", page: "3" }]).message).toBe(
            "OT8 has its own move on Page 3, so it kept its spot",
        );
    });

    it("with several pages, says their later moves", () => {
        expect(
            moveThemTooMessage([
                { label: "OT1", page: "3" },
                { label: "OT2", page: "4" },
                { label: "OT3", page: "3" },
            ]).message,
        ).toBe(
            "OT1, OT2 and OT3 have their own later moves, so they kept their spots",
        );
    });

    it("lists three names at most", () => {
        expect(marcherNamesList(["A1"])).toBe("A1");
        expect(marcherNamesList(["A1", "A2", "A3"])).toBe("A1, A2 and A3");
        expect(
            marcherNamesList(["OT1", "OT2", "OT3", "OT4", "OT5", "OT6"]),
        ).toBe("OT1, OT2 and 4 others");
    });
});

describe("a run of edits behind one toast", () => {
    /** An edit adding `n` to the run's total; returns the total and the run */
    const edit = (mode: "page" | "timeline", mark: number, n: number) => {
        const run = continueEditRun<number>(
            mode,
            mark,
            editScope([2], [1, 8]),
            (previous) => (previous ?? 0) + n,
        );
        run.shown(editSurpriseToastId());
        return run;
    };

    it("the next history change in the same mode adds up; anything else starts over", () => {
        forgetEditRun();
        expect(edit("page", 10, 1).value).toBe(1);
        expect(edit("page", 11, 2).value).toBe(3);
        // A gap (an undo, another edit)
        expect(edit("page", 13, 4).value).toBe(4);
        // Another mode
        expect(edit("timeline", 14, 8).value).toBe(8);
        // Another surprise toast in between
        editSurpriseToastId();
        expect(edit("timeline", 15, 16).value).toBe(16);
        // The toast closed, or its action ran
        edit("timeline", 16, 1).forget();
        const newer = edit("timeline", 17, 32);
        expect(newer.value).toBe(32);
        expect(newer.stale).toBe(false);
        // An older edit finishing late leaves the newer run alone, and is stale: no toast
        const late = continueEditRun<number>("timeline", 12, "", () => 99);
        expect(late.value).toBe(99);
        expect(late.stale).toBe(true);
        expect(edit("timeline", 18, 1).value).toBe(33);
        // Another page, or other marchers
        expect(
            continueEditRun<number>(
                "timeline",
                19,
                editScope([3], [1, 8]),
                (p) => (p ?? 0) + 1,
            ).value,
        ).toBe(1);
        expect(edit("timeline", 20, 1).value).toBe(1);
        expect(
            continueEditRun<number>(
                "timeline",
                21,
                editScope([2], [8]),
                (p) => (p ?? 0) + 1,
            ).value,
        ).toBe(1);
        // The same, in any order
        expect(editScope([2, 3], [8, 1])).toBe(editScope([3, 2], [1, 8]));
        forgetEditRun();
    });
});

describe("mergeCarriedRuns", () => {
    const run = (
        pageId: number,
        x: number,
        rows: [id: number, pageId: number, x: number][],
    ) => ({
        marcherId: 1,
        pageId,
        x,
        y: 0,
        rows: rows.map(([id, p, rx]) => ({ id, pageId: p, x: rx, y: 0 })),
        nextPathwayId: 9,
        nextPageId: 5,
    });

    it("keeps each row's position from before the run, and rows only an earlier edit carried to", () => {
        const first = run(2, 10, [
            [3, 3, 0],
            [4, 4, 0],
        ]);
        // The second edit carried to page 3 only (page 4 has been changed since)
        const second = run(2, 20, [[3, 3, 10]]);
        expect(mergeCarriedRuns([first], [second])).toEqual([
            {
                ...first,
                rows: [{ id: 4, pageId: 4, x: 0, y: 0 }],
            },
            { ...second, rows: [{ id: 3, pageId: 3, x: 0, y: 0 }] },
        ]);
        // A run that lost its last row leaves the next pathway alone
        expect(
            mergeCarriedRuns([first], [run(2, 20, [[4, 4, 10]])])[0],
        ).toMatchObject({
            rows: [{ id: 3, x: 0 }],
            nextPathwayId: null,
            nextPageId: null,
        });
        expect(mergeCarriedRuns([], [second])).toEqual([second]);
    });
});

// These tests write marcher pages, which only page mode allows
keepFixturesInPageMode("page-mode Move them too writes marcher_pages");

afterEach(() => {
    forgetEditRun();
    vi.restoreAllMocks();
});

const orderedPageIds = async (db: DbConnection) =>
    (
        await db
            .select({ id: schema.pages.id })
            .from(schema.pages)
            .innerJoin(
                schema.beats,
                eq(schema.beats.id, schema.pages.start_beat),
            )
            .orderBy(asc(schema.beats.position))
            .all()
    ).map((p) => p.id);

const rowOf = async (db: DbConnection, marcherId: number, pageId: number) =>
    (await db
        .select()
        .from(schema.marcher_pages)
        .where(
            and(
                eq(schema.marcher_pages.marcher_id, marcherId),
                eq(schema.marcher_pages.page_id, pageId),
            ),
        )
        .get())!;

/**
 * The study's starter show (09): OT1–OT8 in a line on page 1, pages 2–4 copies of it. Then the
 * study's steps: everyone marches forward 100 on page 2 (pages 3–4 follow), and on page 3 OT1
 * and OT8 step out sideways by 50 (page 4 follows). Returns the page ids and marcher ids in drill
 * order.
 */
const studyShow = async (db: DbConnection) => {
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
    const pages = await orderedPageIds(db);
    expect(pages).toHaveLength(4);
    const marchers = (
        await db
            .select()
            .from(schema.marchers)
            .orderBy(asc(schema.marchers.drill_order))
            .all()
    ).map((m) => m.id);
    // Page 1: a line
    await updateMarcherPages({
        db,
        modifiedMarcherPages: marchers.map((id, i) => ({
            marcher_id: id,
            page_id: pages[0]!,
            x: 100 + 50 * i,
            y: 300,
        })),
    });
    // Page 2 (G1): forward 100; pages 3–4 follow
    await updateMarcherPages({
        db,
        modifiedMarcherPages: marchers.map((id, i) => ({
            marcher_id: id,
            page_id: pages[1]!,
            x: 100 + 50 * i,
            y: 200,
        })),
    });
    // Page 3 (G3): OT1 and OT8 step out; page 4 follows
    await updateMarcherPages({
        db,
        modifiedMarcherPages: [
            { marcher_id: marchers[0]!, page_id: pages[2]!, x: 50, y: 200 },
            { marcher_id: marchers[7]!, page_id: pages[2]!, x: 500, y: 200 },
        ],
    });
    return { pages, marchers };
};

/** G4: shorten the page-2 move to 50 forward */
const shorten = async (
    db: DbConnection,
    pages: number[],
    marchers: number[],
): Promise<MarcherPagesWriteResult> =>
    await updateMarcherPages({
        db,
        modifiedMarcherPages: marchers.map((id, i) => ({
            marcher_id: id,
            page_id: pages[1]!,
            x: 100 + 50 * i,
            y: 250,
        })),
    });

const spot = async (db: DbConnection, marcherId: number, pageId: number) => {
    const r = await rowOf(db, marcherId, pageId);
    return [r.x, r.y];
};

/** The toast's action, from the spied `toast.info` call */
const clickAction = (info: ReturnType<typeof vi.spyOn>) => {
    const options = info.mock.calls[0]![1] as {
        action: { onClick: () => void };
    };
    options.action.onClick();
};

describeDbTests("page mode: Move them too", (it) => {
    it("study scenario: shortening page 2 names OT1 and OT8 at Page 3; the action shifts them, page 4 follows, one undo reverts it", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const ot1 = marchers[0]!;
        const ot8 = marchers[7]!;
        const result = await shorten(db, pages, marchers);

        // OT2–OT7 followed on pages 3–4; OT1 and OT8 stopped at their own page 3
        expect(result.followedPageIds).toEqual([pages[2], pages[3]]);
        expect(
            result.ownMoveStops.map((s) => [s.marcherId, s.stopPageId]),
        ).toEqual([
            [ot1, pages[2]],
            [ot8, pages[2]],
        ]);
        expect(result.ownMoveStops[0]).toMatchObject({ dx: 0, dy: 50 });

        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        const message = vi.spyOn(toast, "message").mockImplementation(() => 0);
        await toastCarryForward(new QueryClient(), result);
        // One toast that says both, with Move them too and Only Page 1 side by side
        expect(message).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledTimes(1);
        // Pages are numbered from 0 here (no page number offset): Page 2 is the study's set 3
        expect(info.mock.calls[0]![0]).toBe(
            "Pages 2–3 followed (they were copies). OT1 and OT8 have their own move on Page 2, so they kept their spot",
        );
        expect(info.mock.calls[0]![1]).toMatchObject({
            id: expect.stringMatching(/^timeline-edit-\d+$/),
            action: { label: "Move them too" },
            cancel: { label: "Only Page 1" },
        });
        expect(await spot(db, ot1, pages[2]!)).toEqual([50, 200]);

        clickAction(info);
        await vi.waitFor(async () =>
            expect(await spot(db, ot1, pages[2]!)).toEqual([50, 250]),
        );
        expect(await spot(db, ot8, pages[2]!)).toEqual([500, 250]);
        // Page 4 was a copy of page 3, so it follows
        expect(await spot(db, ot1, pages[3]!)).toEqual([50, 250]);
        expect(await spot(db, ot8, pages[3]!)).toEqual([500, 250]);
        // The others are where the shortened move put them
        expect(await spot(db, marchers[1]!, pages[2]!)).toEqual([150, 250]);
        // The action says nothing more
        expect(info).toHaveBeenCalledTimes(1);

        // One undo takes back only the action
        await performUndo(db);
        expect(await spot(db, ot1, pages[2]!)).toEqual([50, 200]);
        expect(await spot(db, ot1, pages[3]!)).toEqual([50, 200]);
        expect(await spot(db, ot1, pages[1]!)).toEqual([100, 250]);
        expect(await spot(db, marchers[1]!, pages[3]!)).toEqual([150, 250]);
        await performRedo(db);
        expect(await spot(db, ot1, pages[3]!)).toEqual([50, 250]);
    });

    it("the toast's Only Page N puts the followed pages back, and leaves the kept marchers alone", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const result = await shorten(db, pages, marchers);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await toastCarryForward(new QueryClient(), result);
        const options = info.mock.calls[0]![1] as {
            cancel: { onClick: () => void };
        };
        options.cancel.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, marchers[1]!, pages[2]!)).toEqual([150, 200]),
        );
        expect(await spot(db, marchers[1]!, pages[1]!)).toEqual([150, 250]);
        expect(await spot(db, marchers[0]!, pages[2]!)).toEqual([50, 200]);
    });

    it("stops on different pages: says their later moves", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        // OT2 steps out on page 4 instead
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                {
                    marcher_id: marchers[1]!,
                    page_id: pages[3]!,
                    x: 150,
                    y: 100,
                },
            ],
        });
        const result = await shorten(db, pages, marchers);
        expect(
            result.ownMoveStops.map((s) => [s.marcherId, s.stopPageId]),
        ).toEqual([
            [marchers[0], pages[2]],
            [marchers[1], pages[3]],
            [marchers[7], pages[2]],
        ]);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await toastCarryForward(new QueryClient(), result);
        expect(info.mock.calls[0]![0]).toBe(
            "Pages 2–3 followed (they were copies). OT1, OT2 and OT8 have their own later moves, so they kept their spots",
        );
    });

    it("a page in a shape isn't a move to shift", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        await createShapePages({
            db,
            newItems: [
                {
                    page_id: pages[2]!,
                    svg_path: "M 0 0 L 100 100",
                    marcher_coordinates: [
                        { marcher_id: marchers[0]!, x: 50, y: 200 },
                    ],
                },
            ],
        });
        const result = await shorten(db, pages, marchers);
        expect(result.ownMoveStops.map((s) => s.marcherId)).toEqual([
            marchers[7],
        ]);
    });

    it("an edit that moves nobody, or only within the tolerance, offers nothing", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const result = await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                {
                    marcher_id: marchers[0]!,
                    page_id: pages[1]!,
                    x: 100 + 1e-9,
                    y: 200,
                },
            ],
        });
        expect(result.ownMoveStops).toEqual([]);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await toastCarryForward(new QueryClient(), result);
        expect(info).not.toHaveBeenCalled();
    });

    it("Only Page N (no carry forward) and undo offer nothing", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const only = await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                { marcher_id: marchers[0]!, page_id: pages[1]!, x: 1, y: 2 },
            ],
            carryForward: false,
        });
        expect(only.ownMoveStops).toEqual([]);
    });

    it("the action shifts from where the stop is now, and skips rows that are gone", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const result = await shorten(db, pages, marchers);
        // OT1's page 3 was moved again since
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                { marcher_id: marchers[0]!, page_id: pages[2]!, x: 0, y: 0 },
            ],
        });
        await moveLaterMovesToo({
            db,
            stops: [
                ...result.ownMoveStops,
                { ...result.ownMoveStops[0]!, stopPageId: 9999 },
            ],
        });
        expect(await spot(db, marchers[0]!, pages[2]!)).toEqual([0, 50]);
    });
});

/** Everyone's page-2 y set to `y` (a nudge of the shortened move), and its toast's options */
const nudgePage2 = async (
    db: DbConnection,
    pages: number[],
    marchers: number[],
    y: number,
    info: ReturnType<typeof vi.spyOn>,
    skip: readonly number[] = [],
) => {
    const result = await updateMarcherPages({
        db,
        modifiedMarcherPages: marchers.flatMap((id, i) =>
            skip.includes(id)
                ? []
                : [{ marcher_id: id, page_id: pages[1]!, x: 100 + 50 * i, y }],
        ),
    });
    const shown = info.mock.calls.length;
    await toastCarryForward(new QueryClient(), result);
    expect(info.mock.calls.length).toBe(shown + 1);
    return info.mock.calls.at(-1)![1] as {
        action: { onClick: () => void };
        cancel: { onClick: () => void };
        onAutoClose: () => void;
    };
};

describeDbTests(
    "page mode: a run is one page and one set of marchers",
    (it) => {
        it("the same page, other marchers (all but OT4): Move them too and Only Page 2 are the last edit's only", async ({
            db,
        }) => {
            const { pages, marchers } = await studyShow(db);
            const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
            await nudgePage2(db, pages, marchers, 225, info);
            // OT1 and OT8 are kept again, but OT4 stays put
            const last = await nudgePage2(db, pages, marchers, 250, info, [
                marchers[3]!,
            ]);
            last.cancel.onClick();
            await vi.waitFor(async () =>
                expect(await spot(db, marchers[1]!, pages[2]!)).toEqual([
                    150, 225,
                ]),
            );
            expect(await spot(db, marchers[3]!, pages[2]!)).toEqual([250, 225]);
            await performUndo(db);
            last.action.onClick();
            await vi.waitFor(async () =>
                expect(await spot(db, marchers[0]!, pages[2]!)).toEqual([
                    50, 225,
                ]),
            );
        });

        it("another page, the same marchers: Only Page N is the last edit's only", async ({
            db,
        }) => {
            const { pages, marchers } = await lineShow(db, [300]);
            const message = vi
                .spyOn(toast, "message")
                .mockImplementation(() => 0);
            for (const [p, y] of [
                [1, 290],
                [2, 280],
            ] as const) {
                const result = await updateMarcherPages({
                    db,
                    modifiedMarcherPages: marchers.map((id, i) => ({
                        marcher_id: id,
                        page_id: pages[p]!,
                        x: 100 + 50 * i,
                        y,
                    })),
                });
                await toastCarryForward(new QueryClient(), result);
            }
            const options = message.mock.calls[1]![1] as {
                action: { label: string; onClick: () => void };
            };
            expect(options.action.label).toBe("Only Page 2");
            options.action.onClick();
            // Page 4 goes back to page 2's edit, not to before it
            await vi.waitFor(async () =>
                expect(await spot(db, marchers[0]!, pages[3]!)).toEqual([
                    100, 290,
                ]),
            );
            expect(await spot(db, marchers[0]!, pages[2]!)).toEqual([100, 280]);
        });
    },
);

describeDbTests("page mode: Only Page N after several edits", (it) => {
    it("two nudges in a row: Only Page 2 puts pages 3–4 back to before the first; one undo follows again", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const ot2 = marchers[1]!;
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await nudgePage2(db, pages, marchers, 225, info);
        const last = await nudgePage2(db, pages, marchers, 250, info);
        expect(await spot(db, ot2, pages[2]!)).toEqual([150, 250]);
        last.cancel.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, ot2, pages[2]!)).toEqual([150, 200]),
        );
        expect(await spot(db, ot2, pages[3]!)).toEqual([150, 200]);
        // Page 2 keeps both nudges; OT1 and OT8 kept their own spot throughout
        expect(await spot(db, ot2, pages[1]!)).toEqual([150, 250]);
        expect(await spot(db, marchers[0]!, pages[2]!)).toEqual([50, 200]);
        await performUndo(db);
        expect(await spot(db, ot2, pages[2]!)).toEqual([150, 250]);
        expect(await spot(db, ot2, pages[3]!)).toEqual([150, 250]);
    });

    it("a fully held show: two nudges, then Only Page 1 on the followed toast puts every later page back", async ({
        db,
    }) => {
        const { pages, marchers } = await lineShow(db, [300]);
        const message = vi.spyOn(toast, "message").mockImplementation(() => 0);
        for (const y of [290, 280]) {
            const result = await updateMarcherPages({
                db,
                modifiedMarcherPages: marchers.map((id, i) => ({
                    marcher_id: id,
                    page_id: pages[1]!,
                    x: 100 + 50 * i,
                    y,
                })),
            });
            await toastCarryForward(new QueryClient(), result);
        }
        expect(message).toHaveBeenCalledTimes(2);
        const options = message.mock.calls[1]![1] as {
            action: { label: string; onClick: () => void };
        };
        expect(options.action.label).toBe("Only Page 1");
        options.action.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, marchers[0]!, pages[2]!)).toEqual([100, 300]),
        );
        expect(await spot(db, marchers[0]!, pages[3]!)).toEqual([100, 300]);
        expect(await spot(db, marchers[0]!, pages[1]!)).toEqual([100, 280]);
    });

    it("an undo in between: only the edits after it", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await nudgePage2(db, pages, marchers, 225, info);
        await nudgePage2(db, pages, marchers, 250, info);
        await performUndo(db);
        const last = await nudgePage2(db, pages, marchers, 275, info);
        last.cancel.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, marchers[1]!, pages[2]!)).toEqual([150, 225]),
        );
    });

    it("another edit in between, or the toast closing: only the last", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const ot2 = marchers[1]!;
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await nudgePage2(db, pages, marchers, 225, info);
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                {
                    marcher_id: marchers[3]!,
                    page_id: pages[3]!,
                    x: 250,
                    y: 100,
                },
            ],
        });
        const second = await nudgePage2(db, pages, marchers, 250, info);
        second.onAutoClose();
        const last = await nudgePage2(db, pages, marchers, 275, info);
        last.cancel.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, ot2, pages[2]!)).toEqual([150, 250]),
        );
    });

    it("after Only Page 2, pages 3–4 no longer copy page 2, so the next nudge carries nowhere", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const ot2 = marchers[1]!;
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        const first = await nudgePage2(db, pages, marchers, 225, info);
        first.cancel.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, ot2, pages[2]!)).toEqual([150, 200]),
        );
        // Page 3 no longer copies page 2, so a nudge there carries nowhere: no toast
        const result = await updateMarcherPages({
            db,
            modifiedMarcherPages: marchers.map((id, i) => ({
                marcher_id: id,
                page_id: pages[1]!,
                x: 100 + 50 * i,
                y: 250,
            })),
        });
        expect(result.followedPageIds).toEqual([]);
    });
});

describeDbTests("page mode: Move them too after several edits", (it) => {
    it("two nudges in a row: the action shifts by both, page 4 follows, one undo reverts it", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const [ot1, ot8] = [marchers[0]!, marchers[7]!];
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await nudgePage2(db, pages, marchers, 225, info);
        const last = await nudgePage2(db, pages, marchers, 250, info);
        last.action.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, ot1, pages[2]!)).toEqual([50, 250]),
        );
        expect(await spot(db, ot8, pages[2]!)).toEqual([500, 250]);
        expect(await spot(db, ot1, pages[3]!)).toEqual([50, 250]);
        await performUndo(db);
        expect(await spot(db, ot1, pages[2]!)).toEqual([50, 200]);
    });

    it("a nudge, an undo, a nudge: only the last", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await nudgePage2(db, pages, marchers, 225, info);
        await performUndo(db);
        const last = await nudgePage2(db, pages, marchers, 225, info);
        last.action.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, marchers[0]!, pages[2]!)).toEqual([50, 225]),
        );
    });

    it("a nudge, another edit, a nudge: only the last", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await nudgePage2(db, pages, marchers, 225, info);
        // OT4 steps forward on page 4
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                {
                    marcher_id: marchers[3]!,
                    page_id: pages[3]!,
                    x: 250,
                    y: 100,
                },
            ],
        });
        const last = await nudgePage2(db, pages, marchers, 250, info);
        last.action.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, marchers[0]!, pages[2]!)).toEqual([50, 225]),
        );
    });

    it("after the toast closes, or after Move them too, the next nudge starts over", async ({
        db,
    }) => {
        const { pages, marchers } = await studyShow(db);
        const ot1 = marchers[0]!;
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        const first = await nudgePage2(db, pages, marchers, 225, info);
        first.onAutoClose();
        const second = await nudgePage2(db, pages, marchers, 250, info);
        second.action.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, ot1, pages[2]!)).toEqual([50, 225]),
        );
        const third = await nudgePage2(db, pages, marchers, 275, info);
        third.action.onClick();
        await vi.waitFor(async () =>
            expect(await spot(db, ot1, pages[2]!)).toEqual([50, 250]),
        );
    });

    it("a different split in between doesn't add up", async ({ db }) => {
        const { pages, marchers } = await studyShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        // Only OT1–OT7 move: OT8 isn't kept this time
        const result = await updateMarcherPages({
            db,
            modifiedMarcherPages: marchers.slice(0, 7).map((id, i) => ({
                marcher_id: id,
                page_id: pages[1]!,
                x: 100 + 50 * i,
                y: 225,
            })),
        });
        await toastCarryForward(new QueryClient(), result);
        const last = await nudgePage2(db, pages, marchers, 250, info);
        last.action.onClick();
        // OT1 moved 25 then 25, but the split changed, so only the last counts
        await vi.waitFor(async () =>
            expect(await spot(db, marchers[0]!, pages[2]!)).toEqual([50, 225]),
        );
        expect(await spot(db, marchers[7]!, pages[2]!)).toEqual([500, 250]);
    });
});

/** OT1–OT8 in a line on pages 1–4, with everyone's y on page i `ys[i]` (pages past `ys` copy) */
const lineShow = async (db: DbConnection, ys: readonly number[]) => {
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
    const pages = await orderedPageIds(db);
    const marchers = (
        await db
            .select()
            .from(schema.marchers)
            .orderBy(asc(schema.marchers.drill_order))
            .all()
    ).map((m) => m.id);
    for (const [p, y] of ys.entries())
        await updateMarcherPages({
            db,
            modifiedMarcherPages: marchers.map((id, i) => ({
                marcher_id: id,
                page_id: pages[p]!,
                x: 100 + 50 * i,
                y,
            })),
        });
    return { pages, marchers };
};

describeDbTests(
    "page mode: ordinary edits stay silent unless they split",
    (it) => {
        it("a fully written show (every page differs): an ordinary drag and a nudge on page 2 say nothing", async ({
            db,
        }) => {
            const { pages, marchers } = await lineShow(db, [300, 200, 100, 0]);
            const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
            const message = vi
                .spyOn(toast, "message")
                .mockImplementation(() => 0);
            const drag = await updateMarcherPages({
                db,
                modifiedMarcherPages: marchers.map((id, i) => ({
                    marcher_id: id,
                    page_id: pages[1]!,
                    x: 110 + 50 * i,
                    y: 220,
                })),
            });
            expect(drag.ownMoveStops).toEqual([]);
            expect(drag.followedPageIds).toEqual([]);
            await toastCarryForward(new QueryClient(), drag);
            const nudge = await updateMarcherPages({
                db,
                modifiedMarcherPages: [
                    {
                        marcher_id: marchers[3]!,
                        page_id: pages[1]!,
                        x: 261,
                        y: 220,
                    },
                ],
            });
            expect(nudge.ownMoveStops).toEqual([]);
            await toastCarryForward(new QueryClient(), nudge);
            expect(info).not.toHaveBeenCalled();
            expect(message).not.toHaveBeenCalled();
            expect(await spot(db, marchers[3]!, pages[2]!)).toEqual([250, 100]);
        });

        it("a fully held show: editing page 2 says only that later pages followed", async ({
            db,
        }) => {
            const { pages, marchers } = await lineShow(db, [300]);
            const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
            const message = vi
                .spyOn(toast, "message")
                .mockImplementation(() => 0);
            const result = await updateMarcherPages({
                db,
                modifiedMarcherPages: marchers.map((id, i) => ({
                    marcher_id: id,
                    page_id: pages[1]!,
                    x: 100 + 50 * i,
                    y: 200,
                })),
            });
            expect(result.ownMoveStops).toEqual([]);
            await toastCarryForward(new QueryClient(), result);
            expect(info).not.toHaveBeenCalled();
            expect(message).toHaveBeenCalledTimes(1);
            expect(message.mock.calls[0]![0]).toBe(
                "Pages 2–3 followed (they were copies)",
            );
            expect(message.mock.calls[0]![1]).toMatchObject({
                id: expect.stringMatching(/^timeline-edit-\d+$/),
                action: { label: "Only Page 1" },
            });
        });
    },
);
