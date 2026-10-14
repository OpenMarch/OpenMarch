import { act, render, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { useEffect, type ReactNode } from "react";
import { TolgeeProvider } from "@tolgee/react";
import {
    QueryClient,
    QueryClientProvider,
    useQuery,
} from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import type { DbConnection } from "@/db-functions/types";
import tolgee from "@/global/singletons/Tolgee";
import type Page from "@/global/classes/Page";
import type Marcher from "@/global/classes/Marcher";
import { IsPlayingProvider } from "@/context/IsPlayingContext";
import {
    SelectedPageProvider,
    useSelectedPage,
} from "@/context/SelectedPageContext";
import {
    SelectedMarchersProvider,
    useSelectedMarchers,
} from "@/context/SelectedMarchersContext";
import { SelectedAudioFileProvider } from "@/context/SelectedAudioFileContext";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import TimelineResolverHost from "@/timeline/TimelineResolverHost";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { timelinePositionsSettled } from "@/timeline/timelineCoordinateWrites";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    selectedStoredTimeline,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import {
    pageAtPlayhead,
    pageFlags,
    selectionOfPage,
} from "@/timeline/timelinePlayhead";

/**
 * Renders app features on a `base.tsx` fixture database with the app's providers and the timeline
 * resolver host (docs/timeline/phases/07-page-parity.md P7.18).
 *
 * Some mutations invalidate through the app's query client (`@/App`), so a test file that uses
 * this mocks `@/App` to return `harnessQueryClient()`:
 *
 * ```ts
 * const app = vi.hoisted(() => ({ client: (): unknown => null }));
 * vi.mock("@/App", () => ({ get queryClient() { return app.client(); } }));
 * app.client = harnessQueryClient;
 * ```
 *
 * (An async factory that imports this module would deadlock: this module imports `@/App`.)
 *
 * Call `stopTimelineResolver()` and `cleanup()` after each test.
 */

let queryClient: QueryClient | null = null;

/** The query client of the last `mountFeature` */
export const harnessQueryClient = (): QueryClient | null => queryClient;

/** What a test reads from inside the providers */
export interface FeatureProbe {
    pages: Page[];
    marchers: Marcher[] | undefined;
    selectedPage: Page | null;
    selectedMarchers: Marcher[];
    setSelectedPage: (page: { id: number }) => void;
    setSelectedMarchers: (marchers: Marcher[]) => void;
    /** Settings and field properties have loaded */
    loaded: boolean;
}

const probe: { current: FeatureProbe | null } = { current: null };

function ProbeView() {
    const { pages } = useTimingObjects();
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const selectedPageContext = useSelectedPage()!;
    const selectedMarchersContext = useSelectedMarchers()!;
    const settings = useQuery(workspaceSettingsQueryOptions());
    const fieldProperties = useQuery(fieldPropertiesQueryOptions());
    // The page boxes the start flag follows (UI-10), as `TimelineModePanel` keeps them in the app
    useEffect(() => {
        useTimelineSelectionStore
            .getState()
            .setPageBoxes(
                pageFlags(pages).flatMap((f) =>
                    f.range ? [{ ...f.range, name: f.page.name }] : [],
                ),
            );
    }, [pages]);
    probe.current = {
        pages,
        marchers,
        selectedPage: selectedPageContext.selectedPage,
        selectedMarchers: selectedMarchersContext.selectedMarchers,
        setSelectedPage: selectedPageContext.setSelectedPage,
        setSelectedMarchers: selectedMarchersContext.setSelectedMarchers,
        loaded: settings.isSuccess && fieldProperties.isSuccess,
    };
    return null;
}

/** The latest state read inside the providers */
export const probed = (): FeatureProbe => {
    expect(probe.current, "the harness is mounted").not.toBeNull();
    return probe.current!;
};

/**
 * Sets the timeline selection (ui.md UI-9), as clicking the timeline does: `"home"` selects
 * home and moves the playhead to beat 0; a page selects its box (previous flag to its own flag)
 * and moves the playhead to its flag, or home for the first page; a range selects it and moves the
 * playhead to its end. Waits for the selected page to follow the playhead (the TEMPORARY bridge
 * until P8.12) and for the stored timelines to load, so dimming and the selected timeline are
 * settled.
 */
export const selectTimeline = async (
    target: "home" | Page | { readonly start: number; readonly end: number },
) => {
    const store = useTimelineSelectionStore.getState();
    act(() => {
        if (target === "home") store.selectHome();
        else if ("start" in target) store.selectRange(target.start, target.end);
        else {
            const flag = pageFlags(probed().pages).find(
                (f) => f.page.id === target.id,
            );
            expect(flag, "the page is in the show").toBeDefined();
            const selection = selectionOfPage(flag!);
            if (selection.kind === "home") store.selectHome();
            else store.selectRange(selection.start, selection.end);
        }
    });
    await waitFor(() => {
        const { playheadBeat, storedTimelines } =
            useTimelineSelectionStore.getState();
        expect(probed().selectedPage?.id).toBe(
            pageAtPlayhead(probed().pages, playheadBeat)?.id,
        );
        expect(storedTimelines).not.toBeNull();
    });
};

/** The timeline selection, playhead and the stored timeline the selection resolves to */
export const timelineSelection = () => {
    const state = useTimelineSelectionStore.getState();
    return {
        selection: state.selection,
        playheadBeat: state.playheadBeat,
        selectedTimeline: selectedStoredTimeline(state),
    };
};

/**
 * Renders `children` inside the app's providers, with the resolver host. The timeline selection
 * starts on home, as opening a show does.
 */
export const mountFeature = (children: ReactNode) => {
    const qc = new QueryClient();
    queryClient = qc;
    probe.current = null;
    useTimelineSelectionStore.getState().reset();
    const result = render(
        <QueryClientProvider client={qc}>
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <TooltipProvider>
                    <IsPlayingProvider>
                        <SelectedPageProvider>
                            <SelectedMarchersProvider>
                                <SelectedAudioFileProvider>
                                    <TimelineResolverHost />
                                    {children}
                                    <ProbeView />
                                </SelectedAudioFileProvider>
                            </SelectedMarchersProvider>
                        </SelectedPageProvider>
                    </IsPlayingProvider>
                </TooltipProvider>
            </TolgeeProvider>
        </QueryClientProvider>,
    );
    return { qc, result };
};

/**
 * Selects `page` and the marchers with `marcherIds`, and waits for their data to load. It also
 * selects the page's box (its page timeline, or home), as the editing context.
 */
export const selectPageAndMarchers = async (
    page: Page,
    marcherIds: readonly number[],
) => {
    // Editing changes the selected timeline, not the page (UI-9, P8.15): select the page's box
    // as a click on it does (its page timeline, or home for the first page)
    const flag = pageFlags(probed().pages).find((f) => f.page.id === page.id);
    const selection = flag ? selectionOfPage(flag) : null;
    const store = useTimelineSelectionStore.getState();
    act(() => {
        if (selection?.kind === "home") store.selectHome();
        else if (selection?.kind === "range")
            store.selectRange(selection.start, selection.end);
    });
    act(() => probed().setSelectedPage(page));
    act(() =>
        probed().setSelectedMarchers(
            probed().marchers!.filter((m) => marcherIds.includes(m.id)),
        ),
    );
    await waitFor(() => {
        expect(probed().selectedPage?.id).toBe(page.id);
        expect(
            probed()
                .selectedMarchers.map((m) => m.id)
                .sort(),
        ).toEqual([...marcherIds].sort());
        expect(probed().loaded).toBe(true);
        // A selected range resolves to its stored timeline only once they've loaded
        expect(
            useTimelineSelectionStore.getState().storedTimelines,
        ).not.toBeNull();
    });
};

/**
 * Mounts `children`, selects `pages[pageIndex]` and the given marchers, and waits for the
 * resolver.
 */
export const setUpFeature = async (
    children: ReactNode,
    pageIndex: number,
    marcherIds: readonly number[],
) => {
    const { qc, result } = mountFeature(children);
    await waitFor(() => {
        expect(probed().pages.length).toBeGreaterThan(pageIndex);
        expect(probed().marchers?.length).toBeGreaterThan(0);
    });
    await selectPageAndMarchers(probed().pages[pageIndex]!, marcherIds);
    await waitFor(() =>
        expect(useTimelineResolverStore.getState().status).toBe("ready"),
    );
    return { qc, result, page: probed().pages[pageIndex]! };
};

/** Where the app draws a marcher at the end of a page, from the resolver. */
export const positionOn = async (
    _db: DbConnection,
    page: Page,
    marcherId: number,
): Promise<[number, number]> => {
    await timelinePositionsSettled();
    const resolver = useTimelineResolverStore.getState().resolver!;
    const [x, y] = resolver.positionAt(marcherId, pageEndBeat(page));
    return [x, y];
};

export const positionsOn = async (
    db: DbConnection,
    page: Page,
    marcherIds: readonly number[],
) => Promise.all(marcherIds.map((id) => positionOn(db, page, id)));
