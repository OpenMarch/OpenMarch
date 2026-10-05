import { act, render, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { useEffect, type ReactNode } from "react";
import { and, eq } from "drizzle-orm";
import { TolgeeProvider } from "@tolgee/react";
import {
    QueryClient,
    QueryClientProvider,
    useQuery,
} from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { schema } from "@/../electron/database/db";
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
import { marcherPagesByPageQueryOptions } from "@/hooks/queries/useMarcherPages";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import TimelineResolverHost from "@/timeline/TimelineResolverHost";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { timelinePositionsSettled } from "@/timeline/timelineCoordinateWrites";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { isTimelineModeEnabled } from "@/settings/workspaceSettings";
import {
    selectedStoredTimeline,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import {
    pageAtPlayhead,
    pageFlags,
    selectionOfPage,
} from "@/timeline/timelinePlayhead";
import { timelineFixtureMode } from "./timelineMode";

/**
 * Renders app features on a `base.tsx` fixture database with the app's providers and the timeline
 * resolver host, so a feature test takes whichever path the file's mode picks: page mode in the
 * default run, timeline mode under `test:timeline` (docs/timeline/phases/07-page-parity.md P7.18).
 *
 * Page-mode mutations invalidate through the app's query client (`@/App`), so a test file that
 * uses this mocks `@/App` to return `harnessQueryClient()`:
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
    /** Settings, field properties and the selected page's rows have loaded */
    loaded: boolean;
    /** The file's timeline flag, from the loaded workspace settings */
    timelineMode: boolean;
}

const probe: { current: FeatureProbe | null } = { current: null };

function ProbeView() {
    const { pages } = useTimingObjects();
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const selectedPageContext = useSelectedPage()!;
    const selectedMarchersContext = useSelectedMarchers()!;
    const settings = useQuery(workspaceSettingsQueryOptions());
    const fieldProperties = useQuery(fieldPropertiesQueryOptions());
    const marcherPages = useQuery(
        marcherPagesByPageQueryOptions(selectedPageContext.selectedPage?.id),
    );
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
        timelineMode: isTimelineModeEnabled(settings.data),
        loaded:
            settings.isSuccess &&
            fieldProperties.isSuccess &&
            marcherPages.isSuccess,
    };
    return null;
}

/** The latest state read inside the providers */
export const probed = (): FeatureProbe => {
    expect(probe.current, "the harness is mounted").not.toBeNull();
    return probe.current!;
};

/**
 * Sets the timeline-mode selection (ui.md UI-9), as clicking the timeline does: `"home"` selects
 * home and moves the playhead to beat 0; a page selects its box (previous flag to its own flag)
 * and moves the playhead to its flag, or home for the first page; a range selects it and moves the
 * playhead to its end. Waits for the selected page to follow the playhead (the TEMPORARY bridge
 * until P8.12) and, in timeline mode, for the stored timelines to load, so dimming and the
 * selected timeline are settled.
 */
export const selectTimeline = async (
    target: "home" | Page | { readonly start: number; readonly end: number },
) => {
    // Page mode has no timeline selection (and no bridge to wait for)
    expect(
        probed().timelineMode,
        "selectTimeline needs a file in timeline mode",
    ).toBe(true);
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
        if (timelineFixtureMode()) expect(storedTimelines).not.toBeNull();
    });
};

/** The timeline-mode selection, playhead and the stored timeline the selection resolves to */
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
 * Selects `page` and the marchers with `marcherIds`, and waits for their data to load. In timeline
 * mode it also selects the page's box (its page timeline, or home), as the editing context.
 */
export const selectPageAndMarchers = async (
    page: Page,
    marcherIds: readonly number[],
) => {
    // Timeline mode edits the selected timeline, not the page (UI-9, P8.15): select the page's
    // box as a click on it does (its page timeline, or home for the first page)
    if (probed().timelineMode) {
        const flag = pageFlags(probed().pages).find(
            (f) => f.page.id === page.id,
        );
        const selection = flag ? selectionOfPage(flag) : null;
        const store = useTimelineSelectionStore.getState();
        act(() => {
            if (selection?.kind === "home") store.selectHome();
            else if (selection?.kind === "range")
                store.selectRange(selection.start, selection.end);
        });
    }
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
        if (probed().timelineMode)
            expect(
                useTimelineSelectionStore.getState().storedTimelines,
            ).not.toBeNull();
    });
};

/**
 * Mounts `children`, selects `pages[pageIndex]` and the given marchers, and in timeline mode waits
 * for the resolver.
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
    // `positionOn` and `expectWrittenWhereTheModeWrites` pick the mode from the test run; the
    // app picks it from the file's flag. They must agree, or the checks read the wrong place.
    expect(
        probed().timelineMode,
        "the file's timeline flag matches the test run's mode",
    ).toBe(timelineFixtureMode());
    if (timelineFixtureMode())
        await waitFor(() =>
            expect(useTimelineResolverStore.getState().status).toBe("ready"),
        );
    return { qc, result, page: probed().pages[pageIndex]! };
};

/** Where the app draws a marcher on a page: the resolver in timeline mode, the row otherwise. */
export const positionOn = async (
    db: DbConnection,
    page: Page,
    marcherId: number,
): Promise<[number, number]> => {
    if (timelineFixtureMode()) {
        await timelinePositionsSettled();
        const resolver = useTimelineResolverStore.getState().resolver!;
        const [x, y] = resolver.positionAt(marcherId, pageEndBeat(page));
        return [x, y];
    }
    const row = await db
        .select()
        .from(schema.marcher_pages)
        .where(
            and(
                eq(schema.marcher_pages.marcher_id, marcherId),
                eq(schema.marcher_pages.page_id, page.id),
            ),
        )
        .get();
    return [row!.x, row!.y];
};

export const positionsOn = async (
    db: DbConnection,
    page: Page,
    marcherIds: readonly number[],
) => Promise.all(marcherIds.map((id) => positionOn(db, page, id)));

/** Every `marcher_pages` position */
export const marcherPageRows = (db: DbConnection) =>
    db
        .select({
            marcher_id: schema.marcher_pages.marcher_id,
            page_id: schema.marcher_pages.page_id,
            x: schema.marcher_pages.x,
            y: schema.marcher_pages.y,
        })
        .from(schema.marcher_pages)
        .all();

/** Timeline mode never writes `marcher_pages`; page mode writes its positions there. */
export const expectWrittenWhereTheModeWrites = async (
    db: DbConnection,
    rowsBefore: Awaited<ReturnType<typeof marcherPageRows>>,
) => {
    const rowsAfter = await marcherPageRows(db);
    if (timelineFixtureMode()) expect(rowsAfter).toEqual(rowsBefore);
    else expect(rowsAfter).not.toEqual(rowsBefore);
};
