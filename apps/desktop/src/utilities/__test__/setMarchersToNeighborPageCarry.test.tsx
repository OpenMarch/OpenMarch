import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { toast } from "sonner";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import {
    harnessQueryClient,
    probed,
    setUpFeature,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { EditorActionHandlers } from "@/shortcuts/ActionHandlers";
import type { ActionId } from "@/shortcuts/definitions";
import { runActionWhenReady } from "@/test/runActionWhenReady";

/**
 * Coverage gap 6 of the defined-coordinates change catalog
 * (docs/timeline/research/defined-coordinates/CHANGES.md section 7, B-14): in page mode, set to
 * previous / next page (Shift+P, Ctrl+Shift+P, Shift+N, Ctrl+Shift+N) writes through
 * `updateMarcherPages`, so it carries forward like any other edit. Run from the action handlers themselves.
 *
 * Timeline mode's set to previous / next is covered by `timelineSparseWrites.test.ts` (B-05).
 */

keepFixturesInPageMode(
    "page-mode carry forward: the tests write marcher_pages copies themselves",
);

// Page-mode mutations invalidate through the app's query client; use the harness's
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

/** Runs an action the way a toolbar button or its key does */
const trigger = (action: ActionId) => runActionWhenReady(action);

/** The page edited: page 3 (index 3 after home) of the `marchersAndPages` show (pages 0 to 6) */
const PAGE = 3;

type XY = [number, number];

const rowOf = async (db: DbConnection, marcherId: number, pageId: number) =>
    (await db
        .select({ x: schema.marcher_pages.x, y: schema.marcher_pages.y })
        .from(schema.marcher_pages)
        .where(
            and(
                eq(schema.marcher_pages.marcher_id, marcherId),
                eq(schema.marcher_pages.page_id, pageId),
            ),
        )
        .get())!;

/** `marcherId`'s position on pages `pageIds`, in that order */
const spots = async (
    db: DbConnection,
    marcherId: number,
    pageIds: readonly number[],
): Promise<XY[]> => {
    const out: XY[] = [];
    for (const id of pageIds) {
        const r = await rowOf(db, marcherId, id);
        out.push([r.x, r.y]);
    }
    return out;
};

/** Makes `marcherIds`' rows on `copies` equal to their row on `pageId` (pages copied forward). */
const copyForward = async (
    db: DbConnection,
    marcherIds: readonly number[],
    pageId: number,
    copies: readonly number[],
) => {
    for (const marcherId of marcherIds) {
        const { x, y } = await rowOf(db, marcherId, pageId);
        await db
            .update(schema.marcher_pages)
            .set({ x, y })
            .where(
                and(
                    eq(schema.marcher_pages.marcher_id, marcherId),
                    inArray(schema.marcher_pages.page_id, [...copies]),
                ),
            );
    }
};

/** Page ids of the show, in order (home first), as the fixture has them */
const PAGE_IDS = [0, 1, 2, 3, 4, 5, 6];

describeDbTests(
    "page mode: set to previous / next page carries forward",
    (it) => {
        it("Shift+P: the selected marcher's copies of page 3 follow it to page 2's spot; page 6 stays", async ({
            db,
            marchersAndPages,
        }) => {
            const [m, other] = marchersAndPages.expectedMarchers.map(
                (x) => x.id,
            );
            await copyForward(db, [m!, other!], 3, [4, 5]);
            const previous = (await spots(db, m!, [2]))[0]!;
            const page6 = (await spots(db, m!, [6]))[0]!;
            const otherBefore = await spots(db, other!, PAGE_IDS);
            await setUpFeature(<EditorActionHandlers />, PAGE, [m!]);
            expect(probed().pages.map((p) => p.id)).toEqual(PAGE_IDS);

            await trigger("setSelectedMarchersToPreviousPage");

            await waitFor(async () =>
                expect(await spots(db, m!, [3, 4, 5, 6])).toEqual([
                    previous,
                    previous,
                    previous,
                    page6,
                ]),
            );
            // An unselected marcher with the same copies isn't touched
            expect(await spots(db, other!, PAGE_IDS)).toEqual(otherBefore);
        });

        it("Ctrl+Shift+P: every marcher's copies follow, each stopping at its own next move", async ({
            db,
            marchersAndPages,
        }) => {
            const ids = marchersAndPages.expectedMarchers.map((x) => x.id);
            const [m1, m2] = ids;
            // Marcher 1 holds page 3 through pages 4 and 5; marcher 2 only through page 4
            await copyForward(db, [m1!], 3, [4, 5]);
            await copyForward(db, [m2!], 3, [4]);
            const prev1 = (await spots(db, m1!, [2]))[0]!;
            const prev2 = (await spots(db, m2!, [2]))[0]!;
            const before1 = await spots(db, m1!, [6]);
            const before2 = await spots(db, m2!, [5, 6]);
            await setUpFeature(<EditorActionHandlers />, PAGE, [m1!]);

            await trigger("setAllMarchersToPreviousPage");

            await waitFor(async () => {
                expect(await spots(db, m1!, [3, 4, 5])).toEqual([
                    prev1,
                    prev1,
                    prev1,
                ]);
                expect(await spots(db, m2!, [3, 4])).toEqual([prev2, prev2]);
            });
            expect(await spots(db, m1!, [6])).toEqual(before1);
            expect(await spots(db, m2!, [5, 6])).toEqual(before2);
            // A marcher with no copies moves on page 3 only
            const m3 = ids[2]!;
            expect((await spots(db, m3, [3]))[0]).toEqual(
                (await spots(db, m3, [2]))[0],
            );
        });

        it("Ctrl+Shift+N: page 3 takes page 4's spots, and nothing after page 4 follows", async ({
            db,
            marchersAndPages,
        }) => {
            const ids = marchersAndPages.expectedMarchers.map((x) => x.id);
            const [m] = ids;
            // Page 5 is back on page 3's spot after page 4 moved away: not a copy in the run
            await copyForward(db, [m!], 3, [5]);
            const next = (await spots(db, m!, [4]))[0]!;
            const old = (await spots(db, m!, [3]))[0]!;
            expect(next).not.toEqual(old);
            const laterBefore = new Map<number, XY[]>();
            for (const id of ids)
                laterBefore.set(id, await spots(db, id, [5, 6]));
            await setUpFeature(<EditorActionHandlers />, PAGE, [m!]);

            await trigger("setAllMarchersToNextPage");

            await waitFor(async () =>
                expect((await spots(db, m!, [3]))[0]).toEqual(next),
            );
            for (const id of ids) {
                expect((await spots(db, id, [3]))[0]).toEqual(
                    (await spots(db, id, [4]))[0],
                );
                expect(await spots(db, id, [5, 6])).toEqual(
                    laterBefore.get(id),
                );
            }
            expect((await spots(db, m!, [5]))[0]).toEqual(old);
        });

        it("Shift+N on page 2 with page 3 a copy of it: page 2 takes page 3's spot, which is where it already is", async ({
            db,
            marchersAndPages,
        }) => {
            const [m] = marchersAndPages.expectedMarchers.map((x) => x.id);
            await copyForward(db, [m!], 2, [3, 4]);
            const before = await spots(db, m!, PAGE_IDS);
            const rowsBefore = await db
                .select()
                .from(schema.marcher_pages)
                .all();
            await setUpFeature(<EditorActionHandlers />, 2, [m!]);
            const success = vi.spyOn(toast, "success");

            await trigger("setSelectedMarchersToNextPage");

            // The action ran and reports success, but its write is within the tolerance, so it is
            // skipped (B-15): nothing changes, and no later copy is touched
            await waitFor(() => expect(success).toHaveBeenCalled());
            expect(await spots(db, m!, PAGE_IDS)).toEqual(before);
            expect(
                (await db.select().from(schema.marcher_pages).all()).map(
                    (r) => [r.id, r.x, r.y],
                ),
            ).toEqual(rowsBefore.map((r) => [r.id, r.x, r.y]));
        });
    },
);
