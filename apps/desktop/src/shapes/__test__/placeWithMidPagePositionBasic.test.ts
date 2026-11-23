import { afterEach, beforeEach, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type DbConnection, describeDbTests } from "@/test/base";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import type { CanvasEditPlan } from "@/timeline/timelineCoordinateWrites";
import { readBasicRows } from "@/db-functions/basicRows";
import { performRedo, performUndo } from "@/db-functions/history";
import { timelinesWithRange } from "@/db-functions/timelines";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import {
    readAllShapeRecipes,
    type ShapeRecipeMember,
    type ShapeRecipeRecord,
} from "@/db-functions/shapeRecipes";
import { useBasicLocksStore } from "@/timeline/basicLocks";
import type { PageBox } from "@/stores/TimelineSelectionStore";
import { writePlacement } from "../tool/shapePlacement";

/**
 * A shape placed at a page's flag in **Basic** for marchers whose last mid-page position on the
 * page is at different counts (Basic drift audit, 2026-11-18, BUG 2). One marcher has a position
 * at count 13 of page 2 `[9, 17)`, so it arrives at the flag in a move over `[13, 17)` and the
 * others in the page's move. A recipe lists only marchers in its move (ADR 0006, revision of
 * 2026-10-29), so it can't hold all three; Basic shows no moves, so the placement says who was
 * left out, where it used to drop them without a word. Everyone is still set on their spot.
 *
 * On the `marchersAndPages` show page N's box is `[8N − 7, 8N + 1)`.
 */

const warning = vi.spyOn(toast, "warning");

beforeEach(() => {
    warning.mockClear();
});
afterEach(() => {
    stopTimelineResolver();
    useBasicLocksStore.getState().set(null, []);
});

const BOX: ShapeRecipeRecord = {
    kind: "box",
    kindVersion: 1,
    params: { pivot: "c", spots: 3 },
    orderMode: "nearest",
    reverse: false,
};
const PAGE2 = { start: 9, end: 17 };
const SPOTS = [
    [100, 50],
    [120, 50],
    [140, 50],
];

/** Basic's edit on page 2's flag, and Expert's window over page 2 */
const BASIC: CanvasEditPlan = {
    ok: true,
    target: { kind: "point", beat: PAGE2.end, box: PAGE2 },
    beat: PAGE2.end,
};
const EXPERT: CanvasEditPlan = {
    ok: true,
    target: { kind: "range", ...PAGE2 },
    beat: PAGE2.end,
};

const resolver = () => useTimelineResolverStore.getState().resolver!;

/** The first three marchers, the first with a position at count 13 of page 2 (unless `later`) */
const setup = async (db: DbConnection, { later = false } = {}) => {
    await startTimelineResolver(db);
    const ids = resolver().marcherIds().slice(0, 3);
    const [a, b, c] = ids as [number, number, number];
    const spans = async (marcherId: number) =>
        (await readBasicRows(db, { marcherIds: [marcherId] }))
            .filter((r) => r.start < PAGE2.end && r.end > PAGE2.start)
            .map((r) => [r.start, r.end]);
    const midPage = async () => {
        await moveMarchersInTarget({
            db,
            target: { kind: "point", beat: 13, box: PAGE2 },
            moves: [{ marcherId: a, x: 500, y: 260 }],
        });
        await timelineResolverSettled();
        expect(await spans(a)).toEqual([
            [9, 13],
            [13, 17],
        ]);
        expect(await spans(b)).toEqual([[9, 17]]);
    };
    if (!later) await midPage();
    const members: ShapeRecipeMember[] = ids.map((marcherId, i) => ({
        marcherId,
        slot: i,
        x: SPOTS[i]![0]!,
        y: SPOTS[i]![1]!,
    }));
    const place = async (
        plan: CanvasEditPlan,
        replaces?: { id: number; timelineId: number | null },
    ) => {
        expect(
            await writePlacement(
                { recipe: BOX, members, replaces, setAll: true },
                new QueryClient(),
                "Error placing the shape",
                plan,
            ),
        ).toBe(true);
        await timelineResolverSettled();
    };
    const shapes = async () =>
        (await readAllShapeRecipes(db)).map((r) => ({
            move: r.timelineId,
            members: r.members.map((m) => m.marcherId),
        }));
    const at17 = () => ids.map((id) => resolver().positionAt(id, 17));
    const pageMove = async () => (await timelinesWithRange(db, PAGE2))[0]!.id;
    return { a, b, c, place, shapes, spans, at17, pageMove, midPage };
};

describeDbTests(
    "a shape placed at a page's flag in Basic, one member with a mid-page position",
    (it) => {
        it("sets everyone on their spot, keeps the members in the page's move, and names the one left out", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c, place, shapes, spans, at17, pageMove } =
                await setup(db);
            await place(BASIC);

            expect(at17()).toEqual(SPOTS);
            // The mid-page position stays
            expect(await spans(a)).toEqual([
                [9, 13],
                [13, 17],
            ]);
            expect(resolver().positionAt(a, 13)).toEqual([500, 260]);
            expect(await shapes()).toEqual([
                { move: await pageMove(), members: [b, c] },
            ]);
            expect(warning).toHaveBeenCalledTimes(1);
            expect(warning.mock.calls[0]![0]).toContain(`#${a}`);
        });

        it("says nothing when every member has the same mid-page position", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c, place, shapes } = await setup(db);
            await moveMarchersInTarget({
                db,
                target: { kind: "point", beat: 13, box: PAGE2 },
                moves: [b, c].map((marcherId) => ({
                    marcherId,
                    x: 500,
                    y: 280,
                })),
            });
            await timelineResolverSettled();
            await place(BASIC);

            expect((await shapes()).map((s) => s.members)).toEqual([[a, b, c]]);
            expect(warning).not.toHaveBeenCalled();
        });

        it("names a member whose mid-page position came after the shape, when the shape is edited", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c, place, shapes, pageMove, midPage } = await setup(
                db,
                { later: true },
            );
            await place(BASIC);
            const move = await pageMove();
            expect(await shapes()).toEqual([{ move, members: [a, b, c] }]);
            await midPage();
            expect(warning).not.toHaveBeenCalled();

            const [recipe] = await readAllShapeRecipes(db);
            await place(BASIC, { id: recipe!.id, timelineId: move });
            expect(await shapes()).toEqual([{ move, members: [b, c] }]);
            expect(warning).toHaveBeenCalledTimes(1);
            expect(warning.mock.calls[0]![0]).toContain(`#${a}`);
        });

        // Review finding (2026-11-19): a locked marcher isn't moved (V-203) and has the lock toast;
        // it was named as left out too, as if it stood on its spot
        it("doesn't name a locked member as left out", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, place } = await setup(db);
            useBasicLocksStore.setState({
                boxes: [{ id: 2, ...PAGE2 } as PageBox],
                locked: new Map([[0, new Map([[a, "crossesFlag" as const]])]]),
            });
            await place(BASIC);
            const ids = warning.mock.calls.map(
                (call) => (call[1] as { id?: string } | undefined)?.id,
            );
            expect(ids).toContain("basic-locked-marchers");
            expect(ids).not.toContain("shape-left-out");
            expect(resolver().positionAt(a, 17)).not.toEqual(SPOTS[0]);
        });

        it("says nothing in Expert, where the moves show who a shape holds", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { place } = await setup(db);
            await place(EXPERT);
            expect(warning).not.toHaveBeenCalled();
        });

        it("Undo takes the shape and puts everyone back; Redo places it again, the same members in it", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c, place, shapes, spans, at17, pageMove } =
                await setup(db);
            const before = at17();
            await place(BASIC);

            await performUndo(db);
            await timelineResolverSettled();
            expect(await shapes()).toEqual([]);
            expect(at17()).toEqual(before);
            expect(await spans(a)).toEqual([
                [9, 13],
                [13, 17],
            ]);

            await performRedo(db);
            await timelineResolverSettled();
            expect(await shapes()).toEqual([
                { move: await pageMove(), members: [b, c] },
            ]);
            expect(at17()).toEqual(SPOTS);
            expect(resolver().positionAt(a, 13)).toEqual([500, 260]);
        });
    },
);
