import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { describeDbTests, schema } from "@/test/base";
import { timelineFixtureMode } from "@/test/timelineMode";
import {
    harnessQueryClient,
    positionsOn,
    selectTimeline,
    setUpFeature,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { useRegisteredActionsStore } from "@/stores/RegisteredActionsStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { conToastError } from "@/utilities/utils";
import {
    stopTimelineResolver,
    useTimelineResolverStore,
} from "../timelineStore";
import { timelinePositionsSettled } from "../timelineCoordinateWrites";
import RegisteredActionsHandler, {
    RegisteredActionsEnum,
} from "@/utilities/RegisteredActionsHandler";

/**
 * UI-10 Editing through the app's registered tools (P8.15, P8.17), on a converted show in timeline
 * mode: a nudge edits the window from the start flag to the playhead. On a flag that is the page
 * timeline; between flags the move arrives at the playhead in a new timeline, with no refusal. At
 * beat 0 it edits homes. Runs under `test:timeline`; the default run has no timeline selection.
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

describeDbTests("canvas tools edit the UI-10 edit window", (it) => {
    it("a nudge on a flag edits that page timeline; between flags it arrives at the playhead in a new timeline", async ({
        db,
        marchersAndPages,
    }) => {
        if (!timelineFixtureMode()) return;
        const ids = marchersAndPages.expectedMarchers
            .slice(0, 2)
            .map((m) => m.id);
        const { page } = await setUpFeature(
            <RegisteredActionsHandler />,
            3,
            ids,
        );
        const before = await positionsOn(db, page, ids);

        await trigger(RegisteredActionsEnum.moveSelectedMarchersRight);
        await waitFor(async () => {
            const after = await positionsOn(db, page, ids);
            after.forEach(([x, y], i) => {
                expect(x).toBeGreaterThan(before[i]![0]);
                expect(y).toBeCloseTo(before[i]![1], 6);
            });
        });
        expect(conToastError).not.toHaveBeenCalled();

        // Two counts before the flag: the window ends there, and the nudge lands there
        const { playheadBeat } = useTimelineSelectionStore.getState();
        const mid = playheadBeat - 2;
        act(() => {
            useTimelineSelectionStore.getState().seek(mid);
        });
        const resolver = () => useTimelineResolverStore.getState().resolver!;
        const atMid = ids.map((id) => resolver().positionAt(id, mid));
        await trigger(RegisteredActionsEnum.moveSelectedMarchersRight);
        await waitFor(async () => {
            await timelinePositionsSettled();
            ids.forEach((id, i) => {
                expect(resolver().positionAt(id, mid)[0]).toBeGreaterThan(
                    atMid[i]![0],
                );
            });
        });
        expect(conToastError).not.toHaveBeenCalled();
        const { selection } = useTimelineSelectionStore.getState();
        expect(selection.kind === "range" && selection.end).toBe(mid);
        const timelines = await db.select().from(schema.timelines).all();
        expect(
            timelines.some(
                (t) =>
                    selection.kind === "range" &&
                    t.start_beat === selection.start &&
                    t.end_beat === mid,
            ),
        ).toBe(true);
    });

    it("moves edit homes at beat 0, and the page box's window off it", async ({
        db,
        marchersAndPages,
    }) => {
        if (!timelineFixtureMode()) return;
        const ids = [marchersAndPages.expectedMarchers[4]!.id];
        await setUpFeature(<RegisteredActionsHandler />, 0, ids);
        await selectTimeline("home");
        const resolver = () => useTimelineResolverStore.getState().resolver!;
        const [x0, y0] = resolver().positionAt(ids[0]!, 0);

        await trigger(RegisteredActionsEnum.alignHorizontally);
        await trigger(RegisteredActionsEnum.moveSelectedMarchersDown);
        await waitFor(async () => {
            await timelinePositionsSettled();
            const [x, y] = resolver().positionAt(ids[0]!, 0);
            expect(x).toBeCloseTo(x0, 6);
            expect(y).toBeGreaterThan(y0);
        });
        const home = await db.select().from(schema.marchers).all();
        expect(home.find((m) => m.id === ids[0])!.home_y).toBeGreaterThan(y0);

        // Off beat 0 the start flag follows to the page box holding the playhead
        act(() => {
            useTimelineSelectionStore.getState().seek(9);
        });
        expect(useTimelineSelectionStore.getState().selection.kind).toBe(
            "range",
        );
        const [, y9] = resolver().positionAt(ids[0]!, 9);
        await trigger(RegisteredActionsEnum.moveSelectedMarchersDown);
        await waitFor(async () => {
            await timelinePositionsSettled();
            expect(resolver().positionAt(ids[0]!, 9)[1]).toBeGreaterThan(y9);
        });
        expect(conToastError).not.toHaveBeenCalled();
    });
});
