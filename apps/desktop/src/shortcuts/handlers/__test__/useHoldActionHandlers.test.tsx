import { cleanup, render, waitFor } from "@testing-library/react";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import type { Resolver, SpanInfo } from "@openmarch/core";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import { holdFromPreviousPage } from "@/db-functions/timelineHoldFromPrevious";
import { setAsShownOnPage } from "@/db-functions/timelineSetAsShown";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { useHoldCommands } from "@/timeline/useHoldCommands";
import { useMarcherNameOf } from "@/timeline/useKeepLaterPages";
import { TolgeeProvider } from "@tolgee/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import FieldContextMenu from "@/field/three/FieldContextMenu";
import { useHeldMarksStore } from "@/timeline/useHeldMarks";
import { holdOverWindow } from "@/db-functions/timelineHoldOverWindow";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    isActionChecked,
    isActionEnabled,
    previewAction,
    runAction,
} from "../../registry";
import { useHoldLightStore } from "@/timeline/holdLight";
import { useHoldActionHandlers } from "../useHoldActionHandlers";
import { useBatchEditActionHandlers } from "../useBatchEditActionHandlers";

/**
 * Holds: the `timelineDefineAsShown` and `timelineHoldFromPrevious` actions run the page box
 * menu's commands on the current page, so both write the same thing and say the same toast.
 */

const page = (id: number, name: string, first: number, last: number) => ({
    id,
    name,
    previousPageId: id === 1 ? null : id - 1,
    beats: Array.from({ length: last - first + 1 }, (_, i) => ({
        index: first + i,
    })),
});
// Flags: page 1 at 0 (home), page 2 at 9, page 3 at 17
const PAGES = [page(1, "1", 0, 0), page(2, "2", 1, 8), page(3, "3", 9, 16)];

const mocks = vi.hoisted(() => ({
    selectedPage: null as unknown,
    isPlaying: false,
    selectedMarchers: [] as { id: number; drill_number: string }[],
}));

vi.mock("@/context/SelectedPageContext", () => ({
    useSelectedPage: () => ({ selectedPage: mocks.selectedPage }),
}));
vi.mock("@/context/SelectedMarchersContext", () => ({
    useSelectedMarchers: () => ({ selectedMarchers: mocks.selectedMarchers }),
}));
vi.mock("@/context/IsPlayingContext", () => ({
    useIsPlaying: () => ({ isPlaying: mocks.isPlaying }),
}));
vi.mock("@/hooks", () => ({
    useTimingObjects: () => ({ pages: PAGES }),
}));
// Clear this page's handler reads the editor's state from here
vi.mock("../useEditorReadiness", () => ({
    useEditorReadiness: () => ({
        selectedPage: mocks.selectedPage,
        ready: true,
        selectedMarchers: mocks.selectedMarchers,
    }),
}));
vi.mock("sonner", () => ({
    toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
// The writes are tested on a database elsewhere; here, what each way of running asks for
vi.mock("@/db-functions/timelineHoldFromPrevious", () => ({
    holdFromPreviousPage: vi.fn(() =>
        Promise.resolve({
            held: [1],
            skipped: [{ marcherId: 2, reason: "noArrival" }],
        }),
    ),
}));
vi.mock("@/db-functions/timelineHoldOverWindow", () => ({
    holdOverWindow: vi.fn(() =>
        Promise.resolve({
            held: [1],
            skipped: [{ marcherId: 2, reason: "followLeader" }],
        }),
    ),
}));
vi.mock("@/db-functions/timelineSetAsShown", () => ({
    setAsShownOnPage: vi.fn(() =>
        Promise.resolve({ changed: [], skipped: [] }),
    ),
}));

let nextAssignment = 1;
const span = (
    marcherId: number,
    start: number,
    end: number,
    kind: SpanInfo["kind"],
): SpanInfo => ({
    marcherId,
    start,
    end,
    kind,
    assignmentId: kind === "hold" ? null : nextAssignment++,
    transitionId: null,
    slot: null,
    assignmentEnd: null,
});

/** Marcher 1 moves on page 2 and holds after; marcher 2 also moves on page 3 */
const SPANS: Record<number, SpanInfo[]> = {
    1: [
        span(1, -Infinity, 1, "hold"),
        span(1, 1, 9, "founding"),
        span(1, 9, Infinity, "hold"),
    ],
    2: [
        span(2, -Infinity, 1, "hold"),
        span(2, 1, 9, "founding"),
        span(2, 9, 17, "founding"),
        span(2, 17, Infinity, "hold"),
    ],
};
const resolver = {
    marcherIds: () => [1, 2],
    spanInfos: (id: number) => SPANS[id] ?? [],
} as unknown as Resolver;

/** The page box menu's commands, as the timeline builds them */
let pageBoxMenu: ReturnType<typeof useHoldCommands> | null = null;

function Harness({ marcherIds }: { marcherIds: readonly number[] }) {
    useHoldActionHandlers();
    const nameOf = useMarcherNameOf(mocks.selectedMarchers);
    pageBoxMenu = useHoldCommands(PAGES, marcherIds, nameOf);
    return null;
}

function mount(ids: number[]) {
    mocks.selectedMarchers = ids.map((id) => ({
        id,
        drill_number: `T${id}`,
    }));
    render(<Harness marcherIds={ids} />);
}

beforeAll(async () => {
    await tolgee.run();
});
beforeEach(() => {
    mocks.selectedPage = PAGES[2];
    mocks.isPlaying = false;
    useTimelineResolverStore.setState({ resolver, version: 1 });
    vi.mocked(holdFromPreviousPage).mockClear();
    vi.mocked(setAsShownOnPage).mockClear();
    vi.mocked(toast.info).mockClear();
    useHeldMarksStore.setState({ marks: [] });
});
afterEach(() => {
    cleanup();
    pageBoxMenu = null;
});

describe("hold actions", () => {
    it("Hold from last keyframe: the action on the current page does what the page box menu does there", async () => {
        const ids = [1, 2];
        mount(ids);
        expect(isActionEnabled("timelineHoldFromPrevious")).toBe(true);

        expect(runAction("timelineHoldFromPrevious")).toBe(true);
        await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
        pageBoxMenu!.holdFromPrevious.onSet(3);
        await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(2));

        const [byAction, byMenu] = vi.mocked(holdFromPreviousPage).mock.calls;
        expect(byAction![0]).toMatchObject({
            pageBox: { start: 9, end: 17 },
            marcherIds: ids,
        });
        expect(byMenu![0]).toEqual(byAction![0]);
        const [toastByAction, toastByMenu] = vi.mocked(toast.info).mock.calls;
        expect(toastByAction![0]).toBe("T1 Held on Page 3");
        expect(toastByMenu).toEqual(toastByAction);
    });

    it("Define as shown: the action on the current page does what the page box menu does there", async () => {
        // Marcher 1 has no position of its own on page 3; marcher 2 moves there
        mount([1, 2]);
        expect(isActionEnabled("timelineDefineAsShown")).toBe(true);

        expect(runAction("timelineDefineAsShown")).toBe(true);
        pageBoxMenu!.defineAsShown.onSet(3);
        await waitFor(() => expect(setAsShownOnPage).toHaveBeenCalledTimes(2));
        const [byAction, byMenu] = vi.mocked(setAsShownOnPage).mock.calls;
        expect(byAction![0]).toMatchObject({
            pageBox: { start: 9, end: 17 },
            marcherIds: [1],
        });
        expect(byMenu![0]).toEqual(byAction![0]);
    });

    it("is off where the page box menu says why not, without a selection, and while playing", () => {
        // Marcher 2 moves on page 3: already Defined there
        mount([2]);
        expect(pageBoxMenu!.defineAsShown.reasonFor(3)).toEqual(
            expect.any(String),
        );
        expect(isActionEnabled("timelineDefineAsShown")).toBe(false);
        expect(runAction("timelineDefineAsShown")).toBe(false);
        expect(isActionEnabled("timelineHoldFromPrevious")).toBe(true);
        cleanup();

        mount([]);
        expect(isActionEnabled("timelineDefineAsShown")).toBe(false);
        expect(isActionEnabled("timelineHoldFromPrevious")).toBe(false);
        cleanup();

        mocks.isPlaying = true;
        mount([1]);
        expect(isActionEnabled("timelineDefineAsShown")).toBe(false);
        expect(isActionEnabled("timelineHoldFromPrevious")).toBe(false);
        expect(setAsShownOnPage).not.toHaveBeenCalled();
        expect(holdFromPreviousPage).not.toHaveBeenCalled();
    });
});

describe("Expert hold tools (#476)", () => {
    const setWindow = (start: number, end: number) =>
        useTimelineSelectionStore.setState({
            selection: { kind: "range", start, end },
            isolation: null,
        });
    beforeEach(() => {
        useEditorModeStore.setState({ mode: "expert" });
        setWindow(9, 13);
        vi.mocked(holdOverWindow).mockClear();
    });
    afterEach(() => useEditorModeStore.setState({ mode: null }));

    it("Hold from start flag to playhead holds the selection over the window, and names only who it left alone", async () => {
        mount([1, 2]);
        expect(isActionEnabled("timelineHoldOverWindow")).toBe(true);
        expect(runAction("timelineHoldOverWindow")).toBe(true);
        await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
        expect(vi.mocked(holdOverWindow).mock.calls[0]![0]).toMatchObject({
            window: { start: 9, end: 13 },
            marcherIds: [1, 2],
        });
        expect(vi.mocked(toast.info).mock.calls[0]).toEqual([
            "1 marcher not held",
            {
                description:
                    "T2: follows the leader between the start flag and the playhead",
            },
        ]);
    });

    it("is off in Basic, without a selection, and while playing", () => {
        useEditorModeStore.setState({ mode: "basic" });
        mount([1]);
        expect(isActionEnabled("timelineHoldOverWindow")).toBe(false);
        cleanup();
        useEditorModeStore.setState({ mode: "expert" });
        mount([]);
        expect(isActionEnabled("timelineHoldOverWindow")).toBe(false);
        cleanup();
        mocks.isPlaying = true;
        mount([1]);
        expect(isActionEnabled("timelineHoldOverWindow")).toBe(false);
        expect(holdOverWindow).not.toHaveBeenCalled();
    });

    it("highlighting it shows the hold it would make, reaching back like the write", () => {
        setWindow(11, 13);
        // The show's page boxes: the preview stays inside the show, which ends at page 3's end
        useTimelineSelectionStore.setState({
            pageBoxes: [
                { start: 1, end: 9 },
                { start: 9, end: 17 },
            ],
        });
        useHeldMarksStore.setState({ marks: [] });
        mount([3]);
        previewAction("timelineHoldOverWindow", true);
        const light = useHoldLightStore.getState().light;
        expect(light?.wouldHold).toBe(true);
        // Marcher 3 stands on its starting spot: reaches back to the show's first page
        expect(light?.byMarcher.get(3)).toEqual([{ start: 1, end: 13 }]);
        previewAction("timelineHoldOverWindow", false);
        expect(useHoldLightStore.getState().light).toBeNull();
    });
});

/** The field menu with the real handlers: the hold actions and Clear this page */
function FieldMenuHarness() {
    useHoldActionHandlers();
    useBatchEditActionHandlers();
    return (
        <FieldContextMenu
            at={{ x: 10, y: 10 }}
            onClose={vi.fn()}
            selectedCount={mocks.selectedMarchers.length}
            timelineMode
        />
    );
}

function openFieldMenu(ids: number[]) {
    mocks.selectedMarchers = ids.map((id) => ({
        id,
        drill_number: `T${id}`,
    }));
    render(
        <QueryClientProvider client={new QueryClient()}>
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <FieldMenuHarness />
            </TolgeeProvider>
        </QueryClientProvider>,
    );
}

const entry = (id: string) => screen.getByTestId(`field-menu-${id}`);
const heldOnPage3 = (marcherId: number) => ({
    id: marcherId,
    marcherId,
    start: 9,
    end: 17,
});

describe("the field menu shows the selection's state on the current page", () => {
    it("all Held: Hold from last keyframe is checked, and off for the palette and H too", () => {
        // Marcher 1 has no move on page 3; its mark makes it Held there
        useHeldMarksStore.setState({ marks: [heldOnPage3(1)] });
        openFieldMenu([1]);
        const hold = entry("timelineHoldFromPrevious");
        expect(hold).toHaveAttribute("aria-checked", "true");
        expect(hold).toHaveAttribute("data-disabled");
        expect(hold).toHaveTextContent(/^Hold from last keyframe/);
        expect(isActionEnabled("timelineHoldFromPrevious")).toBe(false);
        expect(isActionChecked("timelineHoldFromPrevious")).toBe(true);
        expect(runAction("timelineHoldFromPrevious")).toBe(false);
        // Define as shown (not in the field menu, still an action) skips Held marchers: off, not checked
        expect(
            screen.queryByTestId("field-menu-timelineDefineAsShown"),
        ).toBeNull();
        expect(isActionEnabled("timelineDefineAsShown")).toBe(false);
        expect(isActionChecked("timelineDefineAsShown")).toBe(false);
        // Clear this page would take the hold away
        expect(entry("setSelectedMarchersToPreviousPage")).not.toHaveAttribute(
            "data-disabled",
        );
        expect(holdFromPreviousPage).not.toHaveBeenCalled();
    });

    it("mixed: the entries stay on, with no count", () => {
        // Marcher 1 is Not defined on page 3, marcher 2 is Defined there
        openFieldMenu([1, 2]);
        expect(isActionEnabled("timelineDefineAsShown")).toBe(true);
        // Ctrl+H after it is its shortcut (the test runs as Windows/Linux)
        expect(entry("timelineHoldFromPrevious")).toHaveTextContent(
            /^Hold from last keyframe.*Ctrl\+H$/,
        );
        // #573: it names the page
        expect(entry("setSelectedMarchersToPreviousPage")).toHaveTextContent(
            /^Clear Page 3 \(selected\)/,
        );
        expect(isActionEnabled("setSelectedMarchersToPreviousPage")).toBe(true);
    });

    it("after Clear this page, a menu opened again shows Clear this page checked", () => {
        openFieldMenu([1, 2]);
        expect(entry("setSelectedMarchersToPreviousPage")).not.toHaveAttribute(
            "aria-checked",
        );
        cleanup();
        // The edit: marcher 2's move on page 3 is gone, and the resolver says so
        const saved = SPANS[2]!;
        SPANS[2] = [
            span(2, -Infinity, 1, "hold"),
            span(2, 1, 9, "founding"),
            span(2, 9, Infinity, "hold"),
        ];
        try {
            useTimelineResolverStore.setState({ resolver, version: 2 });
            openFieldMenu([1, 2]);
            const clear = entry("setSelectedMarchersToPreviousPage");
            expect(clear).toHaveAttribute("aria-checked", "true");
            expect(clear).toHaveAttribute("data-disabled");
            // Ticked, it still names the page (#573)
            expect(clear).toHaveTextContent(/^Clear Page 3 \(selected\)/);
            expect(isActionEnabled("setSelectedMarchersToPreviousPage")).toBe(
                false,
            );
            // Define as shown would still change everyone
            expect(isActionEnabled("timelineDefineAsShown")).toBe(true);
        } finally {
            SPANS[2] = saved;
        }
    });

    it("on the first page the holds are off; Clear this page still runs and says there's no previous page", () => {
        mocks.selectedPage = PAGES[0];
        openFieldMenu([1]);
        expect(entry("timelineHoldFromPrevious")).toHaveAttribute(
            "data-disabled",
        );
        expect(isActionEnabled("timelineDefineAsShown")).toBe(false);
        expect(isActionEnabled("setSelectedMarchersToPreviousPage")).toBe(true);
    });
});
