import { afterEach, expect, vi } from "vitest";
import { asc } from "drizzle-orm";
import { toast } from "sonner";
import type { XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { createLastPage } from "@/db-functions/page";
import { createMarchers } from "@/db-functions/marcher";
import { updateMarcherPages } from "@/db-functions/marcherPage";
import { performUndo } from "@/db-functions/history";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import { readKeptAssignmentIds } from "@/db-functions/timelineKeptMarkers";
import { keptStatesOnPageBoxes } from "@/db-functions/timelineKeepHere";
import type Page from "@/global/classes/Page";
import { keepHereMenu } from "@/components/timeline/PageKeepChain";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { forgetEditRun } from "@/utilities/moveThemToo";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import { neighborPageTarget } from "../timelineCoordinateWrites";
import { moveMarchersAndOfferFollowUp } from "../timelineMoveThemToo";
import { pageFlags } from "../timelinePlayhead";
import { pageKeepStates } from "../timelineKeepLater";
import {
    followAgainOn,
    keepOnPage,
    toggleKeepOnPage,
} from "../timelineKeepCommands";
import {
    keepPagesOf,
    refreshKeptAssignments,
    useKeptAssignmentsStore,
} from "../useKeepLaterPages";
import {
    resolverSpans,
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";

/**
 * UI-18 keep later pages, through the API on a real database: the page box menu's commands and
 * **K** keep or let follow again the selected marchers, one undo step each; and after an edit that
 * changed an existing own move and carried into later held pages, the "Pages 2–3 followed"
 * toast's **Only Page 1** keeps the next page at the spots from before the edit, as its own undo
 * step. A page's first move stays silent, and the pass-through and Move them too toasts win.
 */

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
 * The study's starter show: OT1–OT8 in a line at home (x = 100, 150, … 450; y = 300), pages 1–3
 * after it, nobody moving yet; converted, with the resolver running and the page boxes set. Pages
 * are numbered from 0 here, so page 1 is the study's page 2.
 */
const starterShow = async (db: DbConnection) => {
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
    await updateMarcherPages({
        db,
        modifiedMarcherPages: marchers.map((id, i) => ({
            marcher_id: id,
            page_id: pages[0]!.id,
            x: 100 + 50 * i,
            y: 300,
        })),
    });
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
    const boxes = pageFlags(pages).flatMap((f) =>
        f.range ? [{ ...f.range, name: f.page.name }] : [],
    );
    useTimelineSelectionStore.getState().setPageBoxes(boxes);
    return { pages, marchers };
};

const at = (marcherId: number, page: Page): XY =>
    useTimelineResolverStore
        .getState()
        .resolver!.positionAt(marcherId, box(page).end) as XY;

type Info = ReturnType<typeof vi.spyOn<typeof toast, "info">>;

/** Waits for the edit's follow-up check to finish, then the toasts shown */
const toastsAfter = async (info: Info) => {
    await timelineResolverSettled();
    await new Promise((r) => setTimeout(r, 200));
    return info.mock.calls.map((c) => c[0]);
};

const onlyAction = (info: Info) =>
    info.mock.calls.at(-1)![1] as {
        action: { label: string; onClick: () => void };
    };

/** Everyone marches forward 100 on page 1 (the study's G1): later pages hold there */
const forward = (db: DbConnection, pages: Page[], marchers: number[]) =>
    moveMarchersAndOfferFollowUp({
        database: db,
        target: box(pages[1]!),
        moves: marchers.map((id, i) => ({
            marcherId: id,
            x: 100 + 50 * i,
            y: 200,
        })),
    });

/** OT1 and OT8 step out sideways by `dx` on page 1 */
const stepOut = (
    db: DbConnection,
    pages: Page[],
    marchers: number[],
    dx = 50,
) =>
    moveMarchersAndOfferFollowUp({
        database: db,
        target: box(pages[1]!),
        moves: [
            { marcherId: marchers[0]!, x: 100 - dx, y: 200 },
            { marcherId: marchers[7]!, x: 450 + dx, y: 200 },
        ],
    });

const stateOn = async (
    db: DbConnection,
    page: Page,
    marcherId: number,
): Promise<string | undefined> =>
    (
        await keptStatesOnPageBoxes({
            db,
            pageBoxes: [box(page)],
            marcherIds: [marcherId],
        })
    )[0]!.states.get(marcherId);

describeDbTests("keep later pages: Only Page N after an edit", (it) => {
    it("a page's first move stays silent; later pages follow it", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await forward(db, pages, marchers);
        expect(await toastsAfter(info)).toEqual([]);
        expect(at(marchers[0]!, pages[3]!)).toEqual([100, 200]);
    });

    it("study flow: changing page 1's move says Pages 2–3 followed; Only Page 1 keeps them where they were, as its own undo step", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        const [ot1, ot8] = [marchers[0]!, marchers[7]!];
        await forward(db, pages, marchers);
        await timelineResolverSettled();
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await stepOut(db, pages, marchers);
        expect(await toastsAfter(info)).toEqual([
            `Pages ${pages[2]!.name}–${pages[3]!.name} followed`,
        ]);
        const { action } = onlyAction(info);
        expect(action.label).toBe(`Only Page ${pages[1]!.name}`);
        // The edit carried: pages 2 and 3 show the new spots
        expect(at(ot1, pages[3]!)).toEqual([50, 200]);

        action.onClick();
        await vi.waitFor(async () =>
            expect(await stateOn(db, pages[2]!, ot1)).toBe("kept"),
        );
        await timelineResolverSettled();
        // Page 1 keeps the edit; pages 2–3 are back where they were
        expect(at(ot1, pages[1]!)).toEqual([50, 200]);
        expect(at(ot8, pages[1]!)).toEqual([500, 200]);
        expect(at(ot1, pages[2]!)).toEqual([100, 200]);
        expect(at(ot8, pages[2]!)).toEqual([450, 200]);
        expect(at(ot1, pages[3]!)).toEqual([100, 200]);
        expect(await stateOn(db, pages[2]!, ot8)).toBe("kept");
        // The others never moved on page 2
        expect(await stateOn(db, pages[2]!, marchers[3]!)).toBe("follows");

        // One undo takes back Only Page 1 alone
        await performUndo(db);
        await timelineResolverSettled();
        expect(at(ot1, pages[2]!)).toEqual([50, 200]);
        expect(at(ot1, pages[1]!)).toEqual([50, 200]);
        expect(await readKeptAssignmentIds(db)).toEqual(new Set());
    });

    it("nudges in a row keep one toast; Only Page 1 goes back to before the first", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        const ot1 = marchers[0]!;
        await forward(db, pages, marchers);
        await timelineResolverSettled();
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await stepOut(db, pages, marchers, 10);
        await toastsAfter(info);
        await stepOut(db, pages, marchers, 20);
        expect(await toastsAfter(info)).toHaveLength(1);
        onlyAction(info).action.onClick();
        await vi.waitFor(async () =>
            expect(await stateOn(db, pages[2]!, ot1)).toBe("kept"),
        );
        await timelineResolverSettled();
        expect(at(ot1, pages[1]!)).toEqual([80, 200]);
        expect(at(ot1, pages[2]!)).toEqual([100, 200]);
    });

    it("after a run's toast closes, the next nudge shows a new toast (pre-merge review U1)", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        await forward(db, pages, marchers);
        await timelineResolverSettled();
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await stepOut(db, pages, marchers, 10);
        await toastsAfter(info);
        await stepOut(db, pages, marchers, 20);
        expect(await toastsAfter(info)).toHaveLength(1);
        // The run's one toast times out
        (info.mock.calls[0]![1] as { onAutoClose: () => void }).onAutoClose();
        await stepOut(db, pages, marchers, 30);
        expect(await toastsAfter(info)).toHaveLength(2);
    });

    it("a kept page doesn't follow, so changing the move before it says nothing", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        const [ot1, ot8] = [marchers[0]!, marchers[7]!];
        await forward(db, pages, marchers);
        await timelineResolverSettled();
        await keepHereMenu(await statesFor(db, pages, [ot1, ot8])).onKeep(
            pages[2]!.id,
        );
        await vi.waitFor(async () =>
            expect(await stateOn(db, pages[2]!, ot8)).toBe("kept"),
        );
        await timelineResolverSettled();
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        await stepOut(db, pages, marchers);
        expect(await toastsAfter(info)).toEqual([]);
        // The owner's ask: pages 2–3 unchanged
        expect(at(ot1, pages[2]!)).toEqual([100, 200]);
        expect(at(ot1, pages[3]!)).toEqual([100, 200]);
        expect(at(ot1, pages[1]!)).toEqual([50, 200]);
    });

    it("Move them too wins over Only Page N when an edit splits the group", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        await forward(db, pages, marchers);
        // OT1 and OT8 step out on page 2: their own move there
        await moveMarchersInTarget({
            db,
            target: box(pages[2]!),
            moves: [
                { marcherId: marchers[0]!, x: 50, y: 200 },
                { marcherId: marchers[7]!, x: 500, y: 200 },
            ],
        });
        await timelineResolverSettled();
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        // Shorten page 1 for everyone: the others follow into page 2, OT1 and OT8 don't
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[1]!),
            moves: marchers.map((id, i) => ({
                marcherId: id,
                x: 100 + 50 * i,
                y: 250,
            })),
        });
        const shown = await toastsAfter(info);
        expect(shown).toHaveLength(1);
        expect(String(shown[0])).toContain("so they kept their spot");
    });
});

/** The selection's keep states, as the timeline panel reads them */
const statesFor = async (
    db: DbConnection,
    pages: Page[],
    marcherIds: number[],
) => {
    await timelineResolverSettled();
    const resolver = useTimelineResolverStore.getState().resolver!;
    return pageKeepStates({
        pages: keepPagesOf(pages),
        marcherIds,
        spansOf: (id) => resolverSpans(resolver, id),
        kept: await readKeptAssignmentIds(db),
    });
};

describeDbTests("keep later pages: the menu and K", (it) => {
    it("the menu keeps the selected marchers that follow, and lets them follow again", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        const [ot1, ot8] = [marchers[0]!, marchers[7]!];
        await forward(db, pages, marchers);
        let menu = keepHereMenu(await statesFor(db, pages, [ot1, ot8]));
        expect(menu.stateFor(pages[2]!.id)).toEqual({
            canKeep: true,
            canFollow: false,
        });
        // Page 1 is where they move: nothing to keep there
        expect(menu.stateFor(pages[1]!.id)).toEqual({
            canKeep: false,
            canFollow: false,
        });
        menu.onKeep(pages[2]!.id);
        await vi.waitFor(async () =>
            expect(await stateOn(db, pages[2]!, ot1)).toBe("kept"),
        );
        menu = keepHereMenu(await statesFor(db, pages, [ot1, ot8]));
        expect(menu.stateFor(pages[2]!.id)).toEqual({
            canKeep: false,
            canFollow: true,
        });
        menu.onFollow(String(pages[2]!.id));
        await vi.waitFor(async () =>
            expect(await stateOn(db, pages[2]!, ot1)).toBe("follows"),
        );
        // Nothing selected: no entries
        expect(keepHereMenu([]).stateFor(pages[2]!.id)).toBeNull();
    });

    it("Keep and Follow again update the renderer's kept markers as they return, before any re-read (pre-merge review U2)", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        const [ot1, ot8] = [marchers[0]!, marchers[7]!];
        await forward(db, pages, marchers);
        await timelineResolverSettled();
        useKeptAssignmentsStore.setState({ ids: new Set() });
        // A read that started before the write can't put the old markers back
        const earlier = refreshKeptAssignments(db);
        await keepOnPage(box(pages[2]!), [ot1, ot8], db);
        const kept = await readKeptAssignmentIds(db);
        expect(kept.size).toBe(2);
        expect(useKeptAssignmentsStore.getState().ids).toEqual(kept);
        await earlier;
        expect(useKeptAssignmentsStore.getState().ids).toEqual(kept);

        await timelineResolverSettled();
        await followAgainOn(box(pages[2]!), [ot1, ot8], db);
        expect(useKeptAssignmentsStore.getState().ids).toEqual(new Set());
        useKeptAssignmentsStore.setState({ ids: new Set() });
    });

    it("K on the page they move keeps the next page, a second K lets it follow again; one undo step each", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        const [ot1, ot8] = [marchers[0]!, marchers[7]!];
        await forward(db, pages, marchers);
        await timelineResolverSettled();
        const k = () =>
            toggleKeepOnPage({
                database: db,
                pages,
                currentPageId: pages[1]!.id,
                marcherIds: [ot1, ot8],
            });
        expect(await k()).toBe("keep");
        expect(await stateOn(db, pages[2]!, ot1)).toBe("kept");
        expect(await stateOn(db, pages[2]!, ot8)).toBe("kept");
        // Page 3 isn't touched: it follows the kept page
        expect(await stateOn(db, pages[3]!, ot1)).toBe("follows");
        await timelineResolverSettled();
        expect(await k()).toBe("follow");
        expect(await stateOn(db, pages[2]!, ot1)).toBe("follows");
        await timelineResolverSettled();
        await performUndo(db);
        expect(await stateOn(db, pages[2]!, ot1)).toBe("kept");
    });

    it("K on a page they hold on keeps that page, not the next (the final study); again lets it follow", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        const [ot1, ot8] = [marchers[0]!, marchers[7]!];
        await forward(db, pages, marchers);
        await timelineResolverSettled();
        const k = () =>
            toggleKeepOnPage({
                database: db,
                pages,
                currentPageId: pages[2]!.id,
                marcherIds: [ot1, ot8],
            });
        expect(await k()).toBe("keep");
        expect(await stateOn(db, pages[2]!, ot1)).toBe("kept");
        expect(await stateOn(db, pages[2]!, ot8)).toBe("kept");
        expect(await stateOn(db, pages[3]!, ot1)).toBe("follows");
        // The study's T2: a later step out on page 1 leaves page 2 (and 3) in the line
        await stepOut(db, pages, marchers);
        await timelineResolverSettled();
        expect(at(ot1, pages[1]!)).toEqual([50, 200]);
        expect(at(ot1, pages[2]!)).toEqual([100, 200]);
        expect(at(ot8, pages[3]!)).toEqual([450, 200]);
        expect(await k()).toBe("follow");
        expect(await stateOn(db, pages[2]!, ot1)).toBe("follows");
    });

    it("K with some moving and some holding on the page keeps those that hold, there", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        const [ot1, ot2] = [marchers[0]!, marchers[1]!];
        await forward(db, pages, marchers);
        // OT2 also moves on page 2
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[2]!),
            moves: [{ marcherId: ot2, x: 150, y: 100 }],
        });
        await timelineResolverSettled();
        expect(
            await toggleKeepOnPage({
                database: db,
                pages,
                currentPageId: pages[2]!.id,
                marcherIds: [ot1, ot2],
            }),
        ).toBe("keep");
        expect(await stateOn(db, pages[2]!, ot1)).toBe("kept");
        expect(await stateOn(db, pages[2]!, ot2)).toBe("own");
        expect(await stateOn(db, pages[3]!, ot2)).toBe("follows");
    });

    it("K before any move keeps a marcher on the current page, so the first move doesn't reach it", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        const ot1 = marchers[0]!;
        expect(
            await toggleKeepOnPage({
                database: db,
                pages,
                currentPageId: pages[2]!.id,
                marcherIds: [ot1],
            }),
        ).toBe("keep");
        expect(await stateOn(db, pages[2]!, ot1)).toBe("kept");
        await forward(db, pages, marchers);
        await timelineResolverSettled();
        expect(at(ot1, pages[1]!)).toEqual([100, 200]);
        // Kept at its starting spot: page 2 walks back there, page 3 holds it
        expect(at(ot1, pages[2]!)).toEqual([100, 300]);
        expect(at(ot1, pages[3]!)).toEqual([100, 300]);
    });

    it("K does nothing with nothing selected, or on the last page they move on", async ({
        db,
    }) => {
        const { pages, marchers } = await starterShow(db);
        await timelineResolverSettled();
        expect(
            await toggleKeepOnPage({
                database: db,
                pages,
                currentPageId: pages[1]!.id,
                marcherIds: [],
            }),
        ).toBeNull();
        await moveMarchersAndOfferFollowUp({
            database: db,
            target: box(pages[3]!),
            moves: [{ marcherId: marchers[0]!, x: 100, y: 100 }],
        });
        await timelineResolverSettled();
        expect(
            await toggleKeepOnPage({
                database: db,
                pages,
                currentPageId: pages[3]!.id,
                marcherIds: [marchers[0]!],
            }),
        ).toBeNull();
        expect(await readKeptAssignmentIds(db)).toEqual(new Set());
    });
});
