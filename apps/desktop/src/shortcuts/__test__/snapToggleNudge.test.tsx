import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { describeDbTests } from "@/test/base";
import {
    harnessQueryClient,
    positionsOn,
    setUpFeature,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { EditorActionHandlers } from "@/shortcuts/ActionHandlers";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { runActionWhenReady } from "@/test/runActionWhenReady";

/**
 * The Snap toggle (modifier roles, version A) covers the field's arrow nudge: with it off, the
 * plain nudge moves the selected marchers a whole step from where they are, off the grid if they
 * were, instead of onto the grid. The Free (Alt) nudge is unchanged. Each marcher is put a quarter
 * step off the grid first with the Fine nudge, which never snaps.
 */

// Mutations invalidate through the app's query client; use the harness's (as in
// EditorActionHandlersModes.test.tsx)
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
    act(() => {
        useUiSettingsStore.getState().setSnap(true);
    });
    vi.restoreAllMocks();
});

const PAGE = 3;

describeDbTests("the arrow nudge with the Snap toggle", (it) => {
    /** Two marchers nudged a quarter step right, then a plain step right; their x before and after each */
    const nudged = async (
        db: Parameters<typeof positionsOn>[0],
        ids: readonly number[],
    ) => {
        const { page } = await setUpFeature(
            <EditorActionHandlers />,
            PAGE,
            ids,
        );
        const xs = async () =>
            (await positionsOn(db, page, ids)).map(([x]) => x);
        const start = await xs();
        await runActionWhenReady("moveSelectedMarchersRightFine");
        await waitFor(async () =>
            (await xs()).forEach((x, i) => expect(x).not.toBe(start[i])),
        );
        const quarter = await xs();
        await runActionWhenReady("moveSelectedMarchersRight");
        await waitFor(async () =>
            (await xs()).forEach((x, i) => expect(x).not.toBe(quarter[i])),
        );
        return { start, quarter, after: await xs() };
    };

    it("off, the plain nudge doesn't snap: a whole step from a quarter off", async ({
        db,
        marchersAndPages,
    }) => {
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        const ids = marchersAndPages.expectedMarchers
            .slice(0, 2)
            .map((m) => m.id);
        const { start, quarter, after } = await nudged(db, ids);
        const step = quarter[0]! - start[0]!;
        // The Fine nudge is a quarter step: a whole one is four of them
        after.forEach((x, i) =>
            expect(x - quarter[i]!).toBeCloseTo(4 * step, 3),
        );
    });

    it("on, the plain nudge snaps back onto the grid", async ({
        db,
        marchersAndPages,
    }) => {
        const ids = marchersAndPages.expectedMarchers
            .slice(0, 2)
            .map((m) => m.id);
        const { start, quarter, after } = await nudged(db, ids);
        const step = quarter[0]! - start[0]!;
        after.forEach((x, i) =>
            expect(x - quarter[i]!).not.toBeCloseTo(4 * step, 3),
        );
    });
});
