import { act, renderHook, waitFor } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { beforeEach, expect } from "vitest";
import { describeDbTests, type DbConnection, schema } from "@/test/base";
import { transactionWithHistory } from "@/db-functions/history";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { addPageFlagMutationOptions } from "@/hooks/queries/usePageFlags";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useTimelinePageBridge } from "../useTimelinePageBridge";

/**
 * The page bridge keeps the selected page (the inspector's) on the page at the playhead, as
 * `pageAtPlayhead` and Basic's `basicPageBox` say, through page list changes.
 */

const store = () => useTimelineSelectionStore.getState();

/**
 * Beats 1..24; after the blank file's page at beat 0, pages start on beats 1, 5, 9 and 13, and the last page has 4 counts, so the flags
 * are 0, 5, 9, 13 and 17 and beats 17..24 are music after the last flag.
 */
const seedShow = (db: DbConnection) =>
    transactionWithHistory(db, "seedShow", async (tx) => {
        await tx.delete(schema.workspace_settings);
        await tx.insert(schema.workspace_settings).values({
            id: 1,
            json_data: JSON.stringify({ timelineMode: true }),
        });
        await tx.insert(schema.beats).values(
            Array.from({ length: 24 }, (_, i) => ({
                id: i + 1,
                position: i + 1,
                duration: 0.5,
            })),
        );
        await tx.insert(schema.pages).values([
            { id: 1, start_beat: 1 },
            { id: 2, start_beat: 5 },
            { id: 3, start_beat: 9 },
            { id: 4, start_beat: 13 },
        ]);
        await tx.update(schema.utility).set({ last_page_counts: 4 });
    });

beforeEach(() => {
    store().reset();
    store().setPageBoxes([]);
});

describeDbTests("timeline page bridge", (it) => {
    const renderBridge = async (db: DbConnection, wrapper: never) => {
        await seedShow(db);
        const { result } = renderHook(
            () => {
                useTimelinePageBridge(true);
                return {
                    timing: useTimingObjects()!,
                    selectedPage: useSelectedPage()!.selectedPage,
                    queryClient: useQueryClient(),
                };
            },
            { wrapper },
        );
        await waitFor(() => expect(result.current.timing.pages.length).toBe(5));
        return result;
    };

    it("selects the page + adds past the last flag, where the playhead is", async ({
        db,
        wrapper,
    }) => {
        const result = await renderBridge(db, wrapper as never);
        act(() => {
            store().seek(20);
        });
        await waitFor(() => expect(result.current.selectedPage?.id).toBe(4));

        const options = addPageFlagMutationOptions(result.current.queryClient);
        await act(async () => {
            const added = await options.mutationFn!(
                { beat: 20 },
                undefined as never,
            );
            options.onSuccess?.(
                added,
                { beat: 20 },
                undefined,
                undefined as never,
            );
        });
        await waitFor(() => expect(result.current.timing.pages.length).toBe(6));
        const added = result.current.timing.pages[5]!;
        await waitFor(() =>
            expect(result.current.selectedPage?.id).toBe(added.id),
        );
        // and it stays there once every query has settled
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(result.current.selectedPage?.id).toBe(added.id);
    });

    it("selects the page + adds inside a page, which ends on the playhead", async ({
        db,
        wrapper,
    }) => {
        const result = await renderBridge(db, wrapper as never);
        act(() => {
            store().seek(7);
        });
        await waitFor(() => expect(result.current.selectedPage?.id).toBe(2));

        const options = addPageFlagMutationOptions(result.current.queryClient);
        await act(async () => {
            const added = await options.mutationFn!(
                { beat: 7 },
                undefined as never,
            );
            options.onSuccess?.(
                added,
                { beat: 7 },
                undefined,
                undefined as never,
            );
        });
        await waitFor(() => expect(result.current.timing.pages.length).toBe(6));
        // The new page comes before the split one and ends on the playhead
        const added = result.current.timing.pages[2]!;
        expect(added.id).not.toBe(2);
        await waitFor(() =>
            expect(result.current.selectedPage?.id).toBe(added.id),
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(result.current.selectedPage?.id).toBe(added.id);
    });
});
