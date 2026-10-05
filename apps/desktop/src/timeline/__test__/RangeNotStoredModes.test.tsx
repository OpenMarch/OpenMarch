import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { describeDbTests, schema } from "@/test/base";
import { timelineFixtureMode } from "@/test/timelineMode";
import {
    harnessQueryClient,
    probed,
    selectTimeline,
    setUpFeature,
    timelineSelection,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useAddPageFlag } from "@/hooks/queries/usePageFlags";
import { useRegisteredActionsStore } from "@/stores/RegisteredActionsStore";
import {
    isMarcherDimmed,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { selectAddedPage } from "@/components/timeline/TimelineModePanel";
import { conToastError } from "@/utilities/utils";
import RegisteredActionsHandler, {
    RegisteredActionsEnum,
} from "@/utilities/RegisteredActionsHandler";
import { stopTimelineResolver } from "../timelineStore";
import { timelinePositionsSettled } from "../timelineCoordinateWrites";
import { pageFlags } from "../timelinePlayhead";

/**
 * UI-10 Dragging adds (P8.16, reworked by P8.17), on a converted show in timeline mode: a window
 * with no stored timeline yet (a dragged range, or a new page's box after **+**) dims nobody, the
 * marcher selection survives selecting it, and a canvas move there stores the timeline with just
 * the moved marchers, as one edit. Nobody is dimmed afterwards either. Runs under
 * `test:timeline`; the default run has no timeline selection.
 */

const app = vi.hoisted(() => ({ client: (): unknown => null }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client();
    },
}));
app.client = harnessQueryClient;

vi.mock("@/utilities/utils", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/utilities/utils")>()),
    conToastError: vi.fn(),
}));

beforeAll(async () => {
    await tolgee.run();
});
beforeEach(() => vi.mocked(conToastError).mockReset());
afterEach(() => {
    cleanup();
    stopTimelineResolver();
});

/** The panel's real **+** wiring, without the timeline's layout */
const panel: {
    plus: (() => void) | null;
    canPlus: boolean;
} = { plus: null, canPlus: false };

function PanelCommands() {
    const { beats, pages } = useTimingObjects();
    const playheadBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    const plus = useAddPageFlag({
        pages,
        beatCount: beats.length,
        playheadBeat,
        isPlaying: false,
        onAdded: selectAddedPage,
    });
    panel.plus = plus.add;
    panel.canPlus = plus.insertion !== null;
    return null;
}

const trigger = async (action: RegisteredActionsEnum) => {
    const button = document.createElement("button");
    const ref = { current: button };
    act(() => {
        useRegisteredActionsStore.getState().linkRegisteredAction(action, ref);
    });
    try {
        await waitFor(() => expect(button.onclick).toBeTypeOf("function"));
        act(() => button.click());
    } finally {
        act(() => {
            useRegisteredActionsStore
                .getState()
                .removeRegisteredAction(action, ref);
        });
    }
};

const selectedIds = () =>
    probed()
        .selectedMarchers.map((m) => m.id)
        .sort((a, b) => a - b);
const selectMarchers = async (ids: readonly number[]) => {
    act(() => {
        probed().setSelectedMarchers(
            probed().marchers!.filter((m) => ids.includes(m.id)),
        );
    });
    await waitFor(() =>
        expect(selectedIds()).toEqual([...ids].sort((a, b) => a - b)),
    );
};
const dimmed = (id: number) =>
    isMarcherDimmed(useTimelineSelectionStore.getState(), id);

/** Settles React effects (the deselect hook) after a store change */
const settle = async () => {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
    });
};

/** A dragged range strictly inside page 2's box: no stored timeline has it */
const draggedRange = () => {
    const { range } = pageFlags(probed().pages)[2]!;
    expect(range!.end - range!.start).toBeGreaterThan(2);
    return { start: range!.start + 1, end: range!.end - 1 };
};

/** The stored timeline over exactly `range`, and who is in it, once the host has reloaded */
const storedOver = async (range: { start: number; end: number }) => {
    await timelinePositionsSettled();
    let found: ReadonlySet<number> | null = null;
    await waitFor(() => {
        const t = useTimelineSelectionStore
            .getState()
            .storedTimelines?.find(
                (s) => s.start === range.start && s.end === range.end,
            );
        expect(t, "the window's timeline is stored").toBeDefined();
        found = t!.marcherIds;
    });
    return found!;
};

describeDbTests("windows not stored yet (UI-10 Dragging adds)", (it) => {
    it("a dragged range dims nobody, keeps the selection, and a nudge there stores its timeline with the moved marchers", async ({
        db,
        marchersAndPages,
    }) => {
        if (!timelineFixtureMode()) return;
        const ids = marchersAndPages.expectedMarchers.map((m) => m.id);
        expect(ids.length).toBeGreaterThan(3);
        const picked = ids.slice(0, 2);
        await setUpFeature(
            <>
                <PanelCommands />
                <RegisteredActionsHandler />
            </>,
            2,
            picked,
        );
        const range = draggedRange();
        await selectTimeline(range);
        await settle();
        expect(timelineSelection().selectedTimeline).toBeNull();
        expect(selectedIds()).toEqual([...picked].sort((a, b) => a - b));
        for (const id of ids) expect(dimmed(id)).toBe(false);

        // Any marcher can be selected, and moving them is what adds them
        const chosen = [ids[0]!, ids[2]!];
        await selectMarchers(chosen);
        await trigger(RegisteredActionsEnum.moveSelectedMarchersRight);
        const members = await storedOver(range);
        expect([...members].sort((a, b) => a - b)).toEqual(
            [...chosen].sort((a, b) => a - b),
        );
        const stored = await db.select().from(schema.timelines).all();
        expect(
            stored.filter(
                (t) => t.start_beat === range.start && t.end_beat === range.end,
            ),
        ).toHaveLength(1);
        expect(conToastError).not.toHaveBeenCalled();
        // Still nobody is dimmed, and the selection stays
        for (const id of ids) expect(dimmed(id)).toBe(false);
        expect(selectedIds()).toEqual([...chosen].sort((a, b) => a - b));
    });

    it("after +, a nudge stores the new page's timeline without visiting home", async ({
        db,
        marchersAndPages,
    }) => {
        if (!timelineFixtureMode()) return;
        const ids = marchersAndPages.expectedMarchers.map((m) => m.id);
        await setUpFeature(
            <>
                <PanelCommands />
                <RegisteredActionsHandler />
            </>,
            2,
            [],
        );
        const { range } = pageFlags(probed().pages)[2]!;
        const beat = range!.start + 2;
        act(() => {
            useTimelineSelectionStore.getState().seek(beat);
        });
        await waitFor(() => expect(panel.canPlus).toBe(true));
        act(() => {
            panel.plus!();
        });
        await waitFor(() =>
            expect(timelineSelection().selection).toEqual({
                kind: "range",
                start: range!.start,
                end: beat,
            }),
        );
        expect(timelineSelection().selectedTimeline).toBeNull();

        const chosen = ids.slice(1, 3);
        await selectMarchers(chosen);
        await settle();
        await trigger(RegisteredActionsEnum.moveSelectedMarchersRight);
        const members = await storedOver({ start: range!.start, end: beat });
        expect([...members].sort((a, b) => a - b)).toEqual(
            [...chosen].sort((a, b) => a - b),
        );
        expect(conToastError).not.toHaveBeenCalled();
        expect(useTimelineSelectionStore.getState().selection.kind).toBe(
            "range",
        );
        const stored = await db.select().from(schema.timelines).all();
        expect(
            stored.some(
                (t) => t.start_beat === range!.start && t.end_beat === beat,
            ),
        ).toBe(true);
    });
});
