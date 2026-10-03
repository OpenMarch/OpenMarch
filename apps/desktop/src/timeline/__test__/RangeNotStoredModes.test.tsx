import { useMemo } from "react";
import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { timelineFixtureMode } from "@/test/timelineMode";
import {
    harnessQueryClient,
    probed,
    selectTimeline,
    setUpFeature,
    timelineSelection,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { db as appDb } from "@/global/database/db";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useAddPageFlag } from "@/hooks/queries/usePageFlags";
import { useRegisteredActionsStore } from "@/stores/RegisteredActionsStore";
import {
    isMarcherDimmed,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useTimelineCommands } from "@/components/timeline/useTimelineCommands";
import { selectAddedPage } from "@/components/timeline/TimelineModePanel";
import type { TimelineAddMarchersMenu } from "@/components/timeline/TimelineRangeMenu";
import { conToastError } from "@/utilities/utils";
import RegisteredActionsHandler, {
    RegisteredActionsEnum,
} from "@/utilities/RegisteredActionsHandler";
import { stopTimelineResolver } from "../timelineStore";
import { timelinePositionsSettled } from "../timelineCoordinateWrites";
import { pageFlags } from "../timelinePlayhead";

/**
 * UI-9 Selection and Adding marchers (P8.16), on a converted show in timeline mode: a selected
 * range with no stored timeline yet (a dragged range, or a new page's box after **+**) dims nobody,
 * so the marcher selection survives selecting it and marchers can be picked there; **Add selected
 * marchers** then stores the timeline and non-members dim. Canvas moves on such a range stay
 * refused, writing nothing. Runs under `test:timeline`; the default run has no timeline selection.
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

/** The panel's real **+** and **Add selected marchers** wiring, without the timeline's layout */
const panel: {
    add: TimelineAddMarchersMenu | null;
    plus: (() => void) | null;
    canPlus: boolean;
} = { add: null, plus: null, canPlus: false };

function PanelCommands() {
    const { beats, pages } = useTimingObjects();
    const selected = useSelectedMarchers()?.selectedMarchers ?? [];
    const key = selected.map((m) => m.id).join(",");
    const selectedMarcherIds = useMemo(
        () => new Set(key === "" ? [] : key.split(",").map(Number)),
        [key],
    );
    const commands = useTimelineCommands({
        database: appDb,
        timelines: [],
        selectedMarcherIds,
    });
    const playheadBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    const plus = useAddPageFlag({
        pages,
        beatCount: beats.length,
        playheadBeat,
        isPlaying: false,
        onAdded: selectAddedPage,
    });
    panel.add = commands.addSelectedMarchers;
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

const TABLES = [
    schema.marchers,
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_slot_destinations,
    schema.timeline_assignments,
];
const rows = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
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

describeDbTests("ranges not stored yet dim nobody (UI-9 Selection)", (it) => {
    it("dragging a range keeps the selected marchers, others can be selected there, and Add stores it and dims non-members", async ({
        db,
        marchersAndPages,
    }) => {
        if (!timelineFixtureMode()) return;
        const ids = marchersAndPages.expectedMarchers.map((m) => m.id);
        expect(ids.length).toBeGreaterThan(3);
        const picked = ids.slice(0, 2);
        await setUpFeature(<PanelCommands />, 2, picked);
        // Page 2's box resolves to its converted page timeline
        expect(timelineSelection().selectedTimeline).not.toBeNull();

        // Drag a range: not stored, so nobody is dimmed and the selection stays
        const range = draggedRange();
        await selectTimeline(range);
        await settle();
        expect(timelineSelection().selectedTimeline).toBeNull();
        expect(selectedIds()).toEqual([...picked].sort((a, b) => a - b));
        for (const id of ids) expect(dimmed(id)).toBe(false);

        // Any marcher can be selected on it
        const chosen = [ids[0]!, ids[2]!];
        await selectMarchers(chosen);
        await settle();
        expect(selectedIds()).toEqual([...chosen].sort((a, b) => a - b));

        // Right-click Add: the timeline is created with the selected marchers
        expect(panel.add?.disabledReason).toBeNull();
        act(() => {
            panel.add!.onAdd({
                startBeatIndex: range.start,
                endBeatIndex: range.end,
            });
        });
        await waitFor(() =>
            expect(timelineSelection().selectedTimeline).toMatchObject({
                start: range.start,
                end: range.end,
            }),
        );
        const stored = await db.select().from(schema.timelines).all();
        expect(
            stored.filter(
                (t) => t.start_beat === range.start && t.end_beat === range.end,
            ),
        ).toHaveLength(1);
        expect([...timelineSelection().selectedTimeline!.marcherIds]).toEqual(
            expect.arrayContaining(chosen),
        );
        expect(timelineSelection().selectedTimeline!.marcherIds.size).toBe(2);
        expect(conToastError).not.toHaveBeenCalled();

        // Now non-members are dimmed, members stay selected, and a non-member doesn't stick
        for (const id of ids) expect(dimmed(id)).toBe(!chosen.includes(id));
        expect(selectedIds()).toEqual([...chosen].sort((a, b) => a - b));
        act(() => {
            probed().setSelectedMarchers(
                probed().marchers!.filter((m) => m.id === ids[1]),
            );
        });
        await waitFor(() => expect(selectedIds()).toEqual([]));
    });

    it("after +, marchers can be selected and added to the new page without visiting home", async ({
        db,
        marchersAndPages,
    }) => {
        if (!timelineFixtureMode()) return;
        const ids = marchersAndPages.expectedMarchers.map((m) => m.id);
        await setUpFeature(<PanelCommands />, 2, []);
        const { range } = pageFlags(probed().pages)[2]!;
        // Pause mid-page and press +
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
        // The new page's box has no stored timeline: nobody is dimmed
        expect(timelineSelection().selectedTimeline).toBeNull();
        for (const id of ids) expect(dimmed(id)).toBe(false);
        expect(useTimelineSelectionStore.getState().selection.kind).toBe(
            "range",
        );

        // Select marchers here and add them
        const chosen = ids.slice(1, 3);
        await selectMarchers(chosen);
        await settle();
        expect(selectedIds()).toEqual([...chosen].sort((a, b) => a - b));
        act(() => {
            panel.add!.onAdd({
                startBeatIndex: range!.start,
                endBeatIndex: beat,
            });
        });
        await waitFor(() =>
            expect(timelineSelection().selectedTimeline).toMatchObject({
                start: range!.start,
                end: beat,
            }),
        );
        expect(conToastError).not.toHaveBeenCalled();
        for (const id of ids) expect(dimmed(id)).toBe(!chosen.includes(id));
        expect(selectedIds()).toEqual([...chosen].sort((a, b) => a - b));
        // Never went home
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

    it("canvas moves on a range not stored yet are refused and write nothing", async ({
        db,
        marchersAndPages,
    }) => {
        if (!timelineFixtureMode()) return;
        const picked = marchersAndPages.expectedMarchers
            .slice(0, 2)
            .map((m) => m.id);
        await setUpFeature(<RegisteredActionsHandler />, 2, picked);
        const range = draggedRange();
        await selectTimeline(range);
        await settle();
        // The marchers stay selected, so the tools have something to move
        expect(selectedIds()).toEqual([...picked].sort((a, b) => a - b));
        expect(useTimelineSelectionStore.getState().playheadBeat).toBe(
            range.end,
        );
        const before = await rows(db);
        for (const action of [
            RegisteredActionsEnum.moveSelectedMarchersRight,
            RegisteredActionsEnum.alignHorizontally,
        ]) {
            vi.mocked(conToastError).mockReset();
            await trigger(action);
            await waitFor(() => expect(conToastError).toHaveBeenCalled());
            expect(vi.mocked(conToastError).mock.calls[0]![0]).toMatch(
                /Nobody is in this timeline yet/,
            );
            await timelinePositionsSettled();
            expect(await rows(db)).toEqual(before);
        }
    });
});
