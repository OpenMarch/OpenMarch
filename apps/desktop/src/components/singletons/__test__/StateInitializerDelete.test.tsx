import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sql } from "drizzle-orm";
import { DbConnection, describeDbTests } from "@/test/base";
import {
    keepFixturesInPageMode,
    setTimelineModeFlag,
} from "@/test/timelineMode";
import {
    harnessQueryClient,
    mountFeature,
    probed,
    selectTimeline,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { convertPagesToTimeline } from "@/timeline/convert/writePageConversion";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { deletePagesMutationOptions } from "@/hooks/queries/usePages";
import {
    deletePageFlagsMutationOptions,
    deletePagesWithMovesMutationOptions,
} from "@/hooks/queries/usePageFlags";
import {
    selectionAfterDeleteWithMoves,
    selectionAfterFlagDelete,
} from "@/components/timeline/TimelineModePanel";
import StateInitializer from "../StateInitializer";

/**
 * Coverage gap 3 of the defined-coordinates change catalog
 * (docs/timeline/research/defined-coordinates/CHANGES.md section 7, B-09, B-11): deleting the page
 * that is selected. In timeline mode the view stays on the page that took the deleted page's box
 * (StateInitializer's fallback is the page at the paused playhead, not home); in page mode the
 * page timeline's In Place selects the page before, which took the deleted page's counts.
 *
 * The show is `marchersAndPages`: page 0 plus pages 1 to 6 (ids 1 to 6), 8 counts each, so page N's
 * box is `[8N - 7, 8N + 1)` and its flag is at beat `8N + 1`.
 */

keepFixturesInPageMode("its tests pick the file's mode themselves");

// Page-mode mutations invalidate through the app's query client; use the harness's
const app = vi.hoisted(() => ({ client: (): unknown => null }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client();
    },
}));
app.client = harnessQueryClient;

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    stopTimelineResolver();
    useTimelineSelectionStore.getState().reset();
    vi.restoreAllMocks();
});

const stubElectron = () => {
    // The audio file comes over IPC, which the test bridge doesn't have; never answered here
    const electron = window.electron as unknown as Record<string, unknown>;
    electron.getSelectedAudioFile = () => new Promise(() => {});
    electron.databaseIsReady = async () => true;
};

const toTimelineMode = async (db: DbConnection) => {
    await setTimelineModeFlag(db, true);
    await convertPagesToTimeline(db);
    await db.run(sql`DELETE FROM history_undo`);
};

/** Every page the selection has held, in order, and the playhead beat at each change */
const seen: { pageId: number | null; playhead: number }[] = [];
const seenSince = (index: number) => seen.slice(index).map((s) => s.pageId);

type Remove = (pageId: number, onSuccess: () => void) => void;
const actions: {
    select?: (id: number) => void;
    deleteFlag?: Remove;
    deleteWithMoves?: Remove;
    deletePage?: Remove;
} = {};

/** Records the selected page and exposes the app's delete mutations, as the page menus run them */
function Probe() {
    const context = useSelectedPage()!;
    const qc = useQueryClient();
    const { mutate: deleteFlags } = useMutation(
        deletePageFlagsMutationOptions(qc),
    );
    const { mutate: deleteWithMoves } = useMutation(
        deletePagesWithMovesMutationOptions(qc),
    );
    const { mutate: deletePages } = useMutation(deletePagesMutationOptions(qc));
    const id = context.selectedPage?.id ?? null;
    useEffect(() => {
        seen.push({
            pageId: id,
            playhead: useTimelineSelectionStore.getState().playheadBeat,
        });
    }, [id]);
    actions.select = (pageId) => context.setSelectedPage({ id: pageId });
    actions.deleteFlag = (pageId, onSuccess) =>
        deleteFlags(new Set([pageId]), { onSuccess });
    actions.deleteWithMoves = (pageId, onSuccess) =>
        deleteWithMoves(new Set([pageId]), { onSuccess });
    actions.deletePage = (pageId, onSuccess) =>
        deletePages(new Set([pageId]), { onSuccess });
    return null;
}

const selectedId = () => seen.at(-1)?.pageId;

describeDbTests("StateInitializer: the selected page is deleted", (it) => {
    it("timeline mode: with no selected page left, it selects the page at the paused playhead (the merged page), not home", async ({
        wrapper: Wrapper,
        db,
        marchersAndPages: _,
    }) => {
        await toTimelineMode(db);
        stubElectron();
        vi.spyOn(toast, "success").mockImplementation(() => 0);
        seen.length = 0;
        // StateInitializer alone, without the resolver host's playhead bridge
        render(
            <Wrapper>
                <StateInitializer />
                <Probe />
            </Wrapper>,
        );
        // Opening a show selects home
        await waitFor(() => expect(selectedId()).toBe(0));
        // Page 2 selected, the playhead on its flag
        act(() => {
            useTimelineSelectionStore.getState().selectRange(9, 17);
            actions.select!(2);
        });
        await waitFor(() => expect(selectedId()).toBe(2));
        const from = seen.length;

        // The flag delete, with no selection of its own afterwards
        act(() => actions.deleteFlag!(2, () => {}));

        // Page 3 took page 2's box and keeps its flag: the playhead (17) is in it
        await waitFor(() => expect(selectedId()).toBe(3));
        expect(seenSince(from)).not.toContain(0);
        expect(useTimelineSelectionStore.getState().playheadBeat).toBe(17);
    });

    it("timeline mode, Delete page and its moves: the page before took the box, and is selected", async ({
        wrapper: Wrapper,
        db,
        marchersAndPages: _,
    }) => {
        await toTimelineMode(db);
        stubElectron();
        vi.spyOn(toast, "success").mockImplementation(() => 0);
        seen.length = 0;
        render(
            <Wrapper>
                <StateInitializer />
                <Probe />
            </Wrapper>,
        );
        await waitFor(() => expect(selectedId()).toBe(0));
        act(() => {
            useTimelineSelectionStore.getState().selectRange(9, 17);
            actions.select!(2);
        });
        await waitFor(() => expect(selectedId()).toBe(2));
        const from = seen.length;

        act(() => actions.deleteWithMoves!(2, () => {}));

        // Page 1's box now runs to beat 17, page 2's old flag
        await waitFor(() => expect(selectedId()).toBe(1));
        expect(seenSince(from)).not.toContain(0);
    });

    it("page mode: with no selected page left, it falls back to the first page (unchanged)", async ({
        wrapper: Wrapper,
        db,
        marchersAndPages: _,
    }) => {
        expect(db).toBeDefined();
        stubElectron();
        vi.spyOn(toast, "success").mockImplementation(() => 0);
        seen.length = 0;
        render(
            <Wrapper>
                <StateInitializer />
                <Probe />
            </Wrapper>,
        );
        await waitFor(() => expect(selectedId()).toBe(0));
        act(() => actions.select!(2));
        await waitFor(() => expect(selectedId()).toBe(2));

        act(() => actions.deletePage!(2, () => {}));

        await waitFor(() => expect(selectedId()).toBe(0));
    });
});

describeDbTests(
    "deleting the selected page, with the app's providers and playhead bridge",
    (it) => {
        /** Mounts the harness in timeline mode with page 2's box selected */
        const timelineWithPage2Selected = async (db: DbConnection) => {
            await toTimelineMode(db);
            stubElectron();
            vi.spyOn(toast, "success").mockImplementation(() => 0);
            seen.length = 0;
            mountFeature(
                <>
                    <StateInitializer />
                    <Probe />
                </>,
            );
            await waitFor(() => {
                expect(probed().pages.length).toBe(7);
                expect(probed().timelineMode).toBe(true);
            });
            await selectTimeline(probed().pages[2]!);
            expect(selectedId()).toBe(2);
            expect(useTimelineSelectionStore.getState().playheadBeat).toBe(17);
        };

        // What TimelineModePanel's page box menu runs after the delete (`selectAfterDelete`)
        const select = (after: ReturnType<typeof selectionAfterFlagDelete>) => {
            if (!after) return;
            const store = useTimelineSelectionStore.getState();
            if (after.kind === "home") store.selectHome();
            else store.selectRange(after.start, after.end);
        };

        it("timeline mode, Delete page on the selected page: the merged box is selected, the playhead on its flag, never home", async ({
            db,
            marchersAndPages: _,
        }) => {
            await timelineWithPage2Selected(db);
            const from = seen.length;
            const after = selectionAfterFlagDelete(
                probed().pages,
                2,
                useTimelineSelectionStore.getState().selection,
            );
            expect(after).toEqual({ kind: "range", start: 9, end: 25 });

            act(() => actions.deleteFlag!(2, () => select(after)));

            await waitFor(() => {
                expect(probed().pages.map((p) => p.id)).toEqual([
                    0, 1, 3, 4, 5, 6,
                ]);
                expect(selectedId()).toBe(3);
                expect(useTimelineSelectionStore.getState().selection).toEqual({
                    kind: "range",
                    start: 9,
                    end: 25,
                });
                expect(useTimelineSelectionStore.getState().playheadBeat).toBe(
                    25,
                );
            });
            expect(seenSince(from)).not.toContain(0);
            expect(seen.slice(from).map((s) => s.playhead)).not.toContain(0);
        });

        it("timeline mode, Delete page and its moves on the selected page: the page before's box, now to beat 17", async ({
            db,
            marchersAndPages: _,
        }) => {
            await timelineWithPage2Selected(db);
            const from = seen.length;
            const after = selectionAfterDeleteWithMoves(
                probed().pages,
                2,
                useTimelineSelectionStore.getState().selection,
            );
            expect(after).toEqual({ kind: "range", start: 1, end: 17 });

            act(() => actions.deleteWithMoves!(2, () => select(after)));

            await waitFor(() => {
                expect(probed().pages.map((p) => p.id)).toEqual([
                    0, 1, 3, 4, 5, 6,
                ]);
                expect(selectedId()).toBe(1);
                expect(useTimelineSelectionStore.getState().playheadBeat).toBe(
                    17,
                );
            });
            expect(seenSince(from)).not.toContain(0);
            expect(seen.slice(from).map((s) => s.playhead)).not.toContain(0);
        });

        it("page mode, In Place on the selected page: the page before (which took its counts) ends up selected", async ({
            db,
            marchersAndPages: _,
        }) => {
            expect(db).toBeDefined();
            stubElectron();
            vi.spyOn(toast, "success").mockImplementation(() => 0);
            seen.length = 0;
            mountFeature(
                <>
                    <StateInitializer />
                    <Probe />
                </>,
            );
            await waitFor(() => expect(probed().pages.length).toBe(7));
            act(() => actions.select!(2));
            await waitFor(() => expect(selectedId()).toBe(2));
            const page = probed().pages.find((p) => p.id === 2)!;

            // PageTimeline's handleDeletePage in page mode: select the previous page on success
            act(() =>
                actions.deletePage!(2, () =>
                    actions.select!(page.previousPageId!),
                ),
            );

            await waitFor(() => {
                expect(probed().pages.map((p) => p.id)).toEqual([
                    0, 1, 3, 4, 5, 6,
                ]);
                expect(selectedId()).toBe(1);
            });
        });
    },
);
