import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { describeDbTests, type DbConnection } from "@/test/base";
import {
    harnessQueryClient,
    positionsOn,
    setUpFeature,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { EditorActionHandlers } from "@/shortcuts/ActionHandlers";
import ShortcutDispatcher from "@/shortcuts/ShortcutDispatcher";
import { runActionWhenReady } from "@/test/runActionWhenReady";
import { createItems } from "@/db-functions/items";

/**
 * A prop is a marcher with a size and a rotation (props epic, fork #1239): selected with marchers,
 * the formation tools move it like one more marcher. A locked item stays where it is.
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
    vi.restoreAllMocks();
});

const PAGE = 3;

/** A riser off to the side of the formation, made at the first counted beat */
const createRiser = async (db: DbConnection, locked = false) => {
    const [item] = await createItems({
        db,
        newItems: [
            {
                kind: "prop",
                name: "Riser",
                surfaceType: "platform",
                home: [40, 40],
                beatId: 1,
                locked,
                geometry: {
                    outlineType: "rectangle",
                    width: 2.4,
                    depth: 1.2,
                    height: 0.4,
                },
            },
        ],
    });
    return item!.marcher_id;
};

const setUp = (ids: readonly number[]) =>
    setUpFeature(
        <>
            <ShortcutDispatcher />
            <EditorActionHandlers />
        </>,
        PAGE,
        ids,
    );

describeDbTests("formation tools with a prop selected", (it) => {
    it("align lines up the selected marchers and the prop alike", async ({
        db,
        marchersAndPages,
    }) => {
        const prop = await createRiser(db);
        const marchers = marchersAndPages.expectedMarchers
            .slice(2, 5)
            .map((m) => m.id);
        const ids = [...marchers, prop];
        const { page } = await setUp(ids);
        const before = await positionsOn(db, page, ids);
        expect(new Set(before.map(([x]) => x)).size).toBeGreaterThan(1);
        const meanX = before.reduce((sum, [x]) => sum + x, 0) / before.length;

        await runActionWhenReady("alignHorizontally");

        await waitFor(async () => {
            const after = await positionsOn(db, page, ids);
            after.forEach(([x, y], i) => {
                expect(x).toBeCloseTo(meanX, 6);
                expect(y).toBeCloseTo(before[i]![1], 6);
            });
        });
    });

    it("align leaves a locked item where it is", async ({
        db,
        marchersAndPages,
    }) => {
        const locked = await createRiser(db, true);
        const marchers = marchersAndPages.expectedMarchers
            .slice(2, 5)
            .map((m) => m.id);
        const { page } = await setUp([...marchers, locked]);
        const before = await positionsOn(db, page, marchers);
        const [lockedBefore] = await positionsOn(db, page, [locked]);
        const meanX = before.reduce((sum, [x]) => sum + x, 0) / before.length;

        await runActionWhenReady("alignHorizontally");

        await waitFor(async () => {
            const after = await positionsOn(db, page, marchers);
            after.forEach(([x]) => expect(x).toBeCloseTo(meanX, 6));
        });
        expect(await positionsOn(db, page, [locked])).toEqual([lockedBefore]);
    });
});
