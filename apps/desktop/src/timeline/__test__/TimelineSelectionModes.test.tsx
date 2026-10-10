import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { describeDbTests } from "@/test/base";
import { timelineFixtureMode } from "@/test/timelineMode";
import {
    harnessQueryClient,
    probed,
    selectTimeline,
    setUpFeature,
    timelineSelection,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { EditorActionHandlers } from "@/shortcuts/ActionHandlers";
import type { ActionId } from "@/shortcuts/definitions";
import { runActionWhenReady } from "@/test/runActionWhenReady";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import {
    Timeline,
    type TimelineSelection,
} from "@/components/timeline/Timeline";
import { pageFlags } from "../timelinePlayhead";

/**
 * Page navigation and the selection on the `base.tsx` fixtures (ui.md UI-9 Page-relative tools;
 * P8.11). Under `test:timeline` (a converted show with the flag on), navigation moves the
 * playhead to a flag and selects that page's box, home for the first page, and the legacy selected
 * page follows the playhead. The default run checks that page mode still selects pages and never
 * touches the timeline selection.
 */

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
});

/** Runs an action the way a toolbar button or its key does */
const trigger = (action: ActionId) => runActionWhenReady(action);

/** The selection a page's box makes: its range, or home for the first page */
const boxOf = (pageIndex: number) => {
    const { range } = pageFlags(probed().pages)[pageIndex]!;
    return range
        ? { kind: "range", start: range.start, end: range.end }
        : { kind: "home" };
};

describeDbTests("page navigation and the selection", (it) => {
    it("navigates by flags and selects each page's box in timeline mode, and selects pages in page mode", async ({
        db,
        marchersAndPages,
    }) => {
        void db;
        void marchersAndPages;
        await setUpFeature(<EditorActionHandlers />, 0, []);
        const pages = probed().pages;
        expect(pages.length).toBeGreaterThan(3);

        if (!timelineFixtureMode()) {
            await trigger("nextPage");
            await waitFor(() =>
                expect(probed().selectedPage?.id).toBe(pages[1]!.id),
            );
            expect(timelineSelection().selection).toEqual({ kind: "home" });
            expect(timelineSelection().playheadBeat).toBe(0);
            return;
        }

        const flags = pageFlags(pages);
        await trigger("nextPage");
        await waitFor(() =>
            expect(timelineSelection().selection).toEqual(boxOf(1)),
        );
        expect(timelineSelection().playheadBeat).toBe(flags[1]!.flag);
        await waitFor(() =>
            expect(probed().selectedPage?.id).toBe(pages[1]!.id),
        );

        await trigger("nextPage");
        await waitFor(() =>
            expect(timelineSelection().selection).toEqual(boxOf(2)),
        );

        await trigger("lastPage");
        const last = pages.length - 1;
        await waitFor(() =>
            expect(timelineSelection().selection).toEqual(boxOf(last)),
        );
        expect(timelineSelection().playheadBeat).toBe(flags[last]!.flag);

        await trigger("previousPage");
        await waitFor(() =>
            expect(timelineSelection().selection).toEqual(boxOf(last - 1)),
        );

        await trigger("firstPage");
        await waitFor(() =>
            expect(timelineSelection().selection).toEqual({ kind: "home" }),
        );
        expect(timelineSelection().playheadBeat).toBe(0);
        await waitFor(() =>
            expect(probed().selectedPage?.id).toBe(pages[0]!.id),
        );
    });

    it("sets the selection from the harness: a page's box resolves to its converted timeline, home to none", async ({
        db,
        marchersAndPages,
    }) => {
        void db;
        void marchersAndPages;
        await setUpFeature(<EditorActionHandlers />, 0, []);
        if (!timelineFixtureMode()) return;
        const page = probed().pages[2]!;
        await selectTimeline(page);
        expect(timelineSelection()).toMatchObject({
            selection: boxOf(2),
            playheadBeat: pageFlags(probed().pages)[2]!.flag,
        });
        expect(probed().selectedPage?.id).toBe(page.id);
        // P9.10 converts a timeline per page, so the box resolves to a stored timeline with every
        // marcher in it, and nobody is dimmed
        const { selectedTimeline } = timelineSelection();
        const range = pageFlags(probed().pages)[2]!.range!;
        expect(selectedTimeline).toMatchObject({
            start: range.start,
            end: range.end,
        });
        for (const m of probed().marchers!)
            expect(selectedTimeline!.marcherIds.has(m.id)).toBe(true);

        await selectTimeline("home");
        expect(timelineSelection()).toMatchObject({
            selection: { kind: "home" },
            playheadBeat: 0,
            selectedTimeline: null,
        });
    });
});

/** The timeline, on the file's beats and pages, reporting its selection changes */
function FileTimeline({
    onSelectionChange,
}: {
    onSelectionChange: (selection: TimelineSelection) => void;
}) {
    const { beats, pages, measures } = useTimingObjects();
    return (
        <Timeline
            mode="expanded"
            beats={beats}
            pages={pages}
            measures={measures}
            timelines={[]}
            showTransport={false}
            onSelectionChange={onSelectionChange}
        />
    );
}

describeDbTests("page boxes on the file's pages", (it) => {
    it("every page box selects the range navigation gives that page, the last ending at its flag", async ({
        db,
        marchersAndPages,
    }) => {
        void db;
        void marchersAndPages;
        const onSelectionChange = vi.fn();
        await setUpFeature(
            <FileTimeline onSelectionChange={onSelectionChange} />,
            0,
            [],
        );
        // The fixture's beats run past the last flag (page 6 ends at 49 of 97 beats)
        const flags = pageFlags(probed().pages);
        for (const { page, range } of flags.slice(1)) {
            fireEvent.click(
                screen.getByRole("button", { name: `Page ${page.name}` }),
            );
            expect(onSelectionChange).toHaveBeenLastCalledWith({
                kind: "range",
                range: {
                    startBeatIndex: range!.start,
                    endBeatIndex: range!.end,
                },
            });
        }
    });
});
