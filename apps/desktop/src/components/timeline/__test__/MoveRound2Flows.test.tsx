import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import {
    harnessQueryClient,
    mountFeature,
    probed,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { readShowTiming } from "@/timeline/showTiming";
import { convertPagesToTimeline } from "@/test/convertPages";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { pageFlags } from "@/timeline/timelinePlayhead";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import { readStoredTimelineMemberships } from "@/timeline/useTimelineSelectionHost";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useMoveMemberSelectionStore } from "@/stores/MoveMemberSelectionStore";
import {
    createMoveCommands,
    focusAfterMoveDelete,
    useMoveCommands,
} from "../useTimelineCommands";
import {
    isLeftoverMoveSelection,
    useClearLeftoverMoveSelection,
    windowMoveId,
} from "../useMoveMemberSelection";

/**
 * UI-14 round-2 review, on a real database inside the app's providers: **Edit move** selects
 * nobody; **Select marchers** followed by a click on another move clears the leftover selection;
 * deleting a move puts focus on a neighbor.
 */

const app = vi.hoisted(() => ({ client: (): unknown => null }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client();
    },
}));
app.client = harnessQueryClient;

keepFixturesInPageMode("its tests convert the show themselves");

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => {
    cleanup();
    stopTimelineResolver();
    useMoveMemberSelectionStore.getState().clear();
    document.body.innerHTML = "";
});

/** Two mid-page moves: marchers 5 and 6 on page 3's box, marcher 7 on page 4's */
const makeMoves = async (db: DbConnection) => {
    await convertPagesToTimeline(db);
    const { pages } = await readShowTiming(db);
    const sorted = [...pages].sort((a, b) => a.order - b.order);
    const ranges = [2, 3].map((i) => ({
        start: pageEndBeat(sorted[i - 1]!),
        end: pageEndBeat(sorted[i - 1]!) + 3,
    }));
    await moveMarchersInTarget({
        db,
        target: { kind: "range", ...ranges[0]! },
        moves: [
            { marcherId: 5, x: 200, y: 210 },
            { marcherId: 6, x: 220, y: 230 },
        ],
    });
    await moveMarchersInTarget({
        db,
        target: { kind: "range", ...ranges[1]! },
        moves: [{ marcherId: 7, x: 240, y: 250 }],
    });
    const idOf = async (end: number) =>
        (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.end_beat, end))
            .get())!.id;
    return {
        sorted,
        ranges,
        a: await idOf(ranges[0]!.end),
        b: await idOf(ranges[1]!.end),
    };
};

/** Loads the page boxes and stored timelines into the store, as the app's host does */
const loadStore = async (db: DbConnection, sorted: { order: number }[]) => {
    const store = useTimelineSelectionStore.getState();
    store.setPageBoxes(
        pageFlags(sorted as Parameters<typeof pageFlags>[0]).flatMap((f) =>
            f.range ? [f.range] : [],
        ),
    );
    store.setStoredTimelines(await readStoredTimelineMemberships(db));
};

const harness: { moves: ReturnType<typeof useMoveCommands> | null } = {
    moves: null,
};

function Panel({ db }: { db: DbConnection }) {
    useClearLeftoverMoveSelection();
    harness.moves = useMoveCommands(db);
    return null;
}

const selectedIds = () =>
    probed()
        .selectedMarchers.map((m) => m.id)
        .sort((x, y) => x - y);

describe("isLeftoverMoveSelection", () => {
    const recorded = { timelineId: 1, marcherIds: new Set([5, 6]) };
    it("is the recorded move's marchers, exactly, on another move", () => {
        expect(isLeftoverMoveSelection(recorded, [6, 5], 2)).toBe(true);
        // The same move: it stays
        expect(isLeftoverMoveSelection(recorded, [5, 6], 1)).toBe(false);
        // Changed since: the designer's own selection
        expect(isLeftoverMoveSelection(recorded, [5], 2)).toBe(false);
        expect(isLeftoverMoveSelection(recorded, [5, 6, 7], 2)).toBe(false);
        expect(isLeftoverMoveSelection(null, [5, 6], 2)).toBe(false);
    });
});

describe("focusAfterMoveDelete", () => {
    it("moves focus to the next clip, else the previous one, else the timeline", () => {
        document.body.innerHTML = `
            <div data-testid="timeline-viewport" tabindex="-1">
                <button data-testid="timeline-clip" data-move-id="1">A</button>
                <button data-testid="timeline-clip" data-move-id="2">B</button>
            </div>`;
        const [a, b] = Array.from(document.querySelectorAll("button"));
        a!.focus();
        focusAfterMoveDelete(1);
        expect(document.activeElement).toBe(b);
        focusAfterMoveDelete(2);
        expect(document.activeElement).toBe(a);
        a!.remove();
        b!.focus();
        focusAfterMoveDelete(2);
        expect(document.activeElement).toBe(
            document.querySelector('[data-testid="timeline-viewport"]'),
        );
    });
});

describeDbTests("a move's flows after the round-2 review (UI-14)", (it) => {
    it("Edit move isolates the move and selects nobody, so one Esc leaves", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { sorted, a } = await makeMoves(db);
        await loadStore(db, sorted);
        const selectMarchers = vi.fn(async () => {});
        createMoveCommands({
            database: db,
            undo: vi.fn(),
            selectMarchers,
        }).editMove(a);
        expect(useTimelineSelectionStore.getState().isolation?.timelineId).toBe(
            a,
        );
        expect(selectMarchers).not.toHaveBeenCalled();
    });

    it("Select marchers, then another move: the leftover selection is cleared", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { sorted, ranges, a, b } = await makeMoves(db);
        mountFeature(<Panel db={db} />);
        await waitFor(() =>
            expect(probed().marchers?.length).toBeGreaterThan(0),
        );
        await loadStore(db, sorted);
        const store = useTimelineSelectionStore.getState();
        act(() => {
            store.selectRange(ranges[0]!.start, ranges[0]!.end);
        });
        expect(windowMoveId(useTimelineSelectionStore.getState())).toBe(a);
        await act(() => harness.moves!.selectMarchers(a));
        await waitFor(() => expect(selectedIds()).toEqual([5, 6]));

        act(() => {
            store.selectRange(ranges[1]!.start, ranges[1]!.end);
        });
        expect(windowMoveId(useTimelineSelectionStore.getState())).toBe(b);
        await waitFor(() => expect(selectedIds()).toEqual([]));
        expect(useMoveMemberSelectionStore.getState().selected).toBeNull();
    });

    it("a selection changed since Select marchers is the designer's own, and stays", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { sorted, ranges, a } = await makeMoves(db);
        mountFeature(<Panel db={db} />);
        await waitFor(() =>
            expect(probed().marchers?.length).toBeGreaterThan(0),
        );
        await loadStore(db, sorted);
        const store = useTimelineSelectionStore.getState();
        act(() => {
            store.selectRange(ranges[0]!.start, ranges[0]!.end);
        });
        await act(() => harness.moves!.selectMarchers(a));
        await waitFor(() => expect(selectedIds()).toEqual([5, 6]));
        act(() => {
            probed().setSelectedMarchers(
                probed().marchers!.filter((m) => m.id === 5),
            );
        });
        act(() => {
            store.selectRange(ranges[1]!.start, ranges[1]!.end);
        });
        // Give the effect its turn, then check nothing cleared it
        await act(async () => {});
        expect(selectedIds()).toEqual([5]);
    });
});
