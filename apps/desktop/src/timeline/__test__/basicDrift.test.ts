import { afterEach, expect } from "vitest";
import type { XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { readShowTiming } from "@/timeline/showTiming";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { readBasicRows } from "@/db-functions/basicRows";
import { createLastPage, deletePages } from "@/db-functions/page";
import { addPageFlag, movePageFlag } from "@/db-functions/pageFlags";
import {
    readAllShapeRecipes,
    saveShapeRecipeInTransaction,
    type ShapeRecipeRecord,
} from "@/db-functions/shapeRecipes";
import { readHeldMarks } from "@/db-functions/timelineHeldMarks";
import { holdFromPreviousPage } from "@/db-functions/timelineHoldFromPrevious";
import {
    moveMarchersInTarget,
    type TimelineEditTarget,
} from "@/db-functions/timelineMoves";
import { performRedo, performUndo } from "@/db-functions/history";
import {
    rejoinedHoldEnd,
    removePositionAtBeat,
} from "@/db-functions/timelinePointMoves";
import { readPageGrid } from "@/db-functions/timelineRipple";
import { unsetMarchersAt } from "@/db-functions/timelineUnset";
import type { PageBox } from "@/stores/TimelineSelectionStore";
import { useBasicLocksStore, withoutLockedMarchers } from "../basicLocks";
import { lockedMarchersByPage, pointsInBox } from "../basicSimple";

keepFixturesInPageMode(
    "its tests trim the show, write timeline rows and set the flag themselves",
);

/**
 * **Basic mode drift audit** (2026-11-18, branch `audit/basic-drift`). Basic (UI-19, fork #134) is
 * a page-box view over the timeline's data: a marcher is simple on a page or locked there
 * (`basicSimple.ts`), a mid-page edit splits its move at the count, and a flag edit edits the
 * page (`timelinePointMoves.ts`). These tests check those rules against what was built after it:
 * holds (Held marks), shape recipes, subset pages and page flag moves.
 *
 * A test marked `it.fails` proves a bug that is still in the code: it asserts what should happen
 * and fails today. When the bug is fixed the test passes, vitest reports it, and the `.fails` goes.
 * Each sets its show up inside `arranged`, which returns `null` on a setup error, so a broken setup
 * can't make an `it.fails` test look right.
 *
 * The show: home, page 1 [1, 9), page 2 [9, 17), page 3 [17, 25), page 4 [25, 33); nobody has a
 * move until a test writes one.
 */

afterEach(() => {
    stopTimelineResolver();
    useBasicLocksStore.getState().set(null, []);
});

const UP: XY = [100, 100];
const UP2: XY = [200, 100];
const FAR: XY = [500, 260];
const PAGE2 = { start: 9, end: 17 };
const PAGE3 = { start: 17, end: 25 };
const PAGE4 = { start: 25, end: 33 };
const LINE: ShapeRecipeRecord = {
    kind: "line",
    kindVersion: 1,
    params: {},
    orderMode: "keep",
    reverse: false,
};

const resolver = () => useTimelineResolverStore.getState().resolver!;

const edit = async (
    db: DbConnection,
    target: TimelineEditTarget,
    moves: { marcherId: number; xy: XY }[],
) => {
    const result = await moveMarchersInTarget({
        db,
        target,
        moves: moves.map(({ marcherId, xy: [x, y] }) => ({ marcherId, x, y })),
    });
    await timelineResolverSettled();
    return result;
};

/** A Basic point edit: `marcherId` at `xy` on count `beat` of the page box `box`. */
const point = (
    db: DbConnection,
    beat: number,
    box: { start: number; end: number },
    marcherId: number,
    xy: XY,
) => edit(db, { kind: "point", beat, box }, [{ marcherId, xy }]);

/** A marcher's rows as `[start, end]`, by start. */
const spansOf = async (db: DbConnection, marcherId: number) =>
    (await readBasicRows(db, { marcherIds: [marcherId] })).map((r) => [
        r.start,
        r.end,
    ]);

const marksOf = async (db: DbConnection, marcherId: number) =>
    (await readHeldMarks(db, [marcherId])).map(({ start, end }) => ({
        start,
        end,
    }));

/** Every placed shape: the count it is placed at (its move's end) and who is in it. */
const shapes = async (db: DbConnection) => {
    const ends = new Map(
        (await db.select().from(schema.timelines).all()).map((t) => [
            t.id,
            t.end_beat,
        ]),
    );
    return (await readAllShapeRecipes(db)).map((r) => ({
        at: r.timelineId === null ? 0 : ends.get(r.timelineId),
        members: r.members.map((m) => m.marcherId).sort((x, y) => x - y),
    }));
};

/** The page boxes after home, in show order. */
const boxesOf = async (db: DbConnection) =>
    (await db.transaction(async (tx) => await readPageGrid(tx))).pages
        .slice(1)
        .map((p) => ({ id: p.id, start: p.start, end: p.end }));

/** The marchers Basic locks, as `[box start, marcher id, reason]`. */
const locks = async (db: DbConnection) => {
    const boxes = await boxesOf(db);
    return [...lockedMarchersByPage(await readBasicRows(db), boxes)].flatMap(
        ([i, locked]) =>
            [...locked].map(([id, reason]) => [boxes[i]!.start, id, reason]),
    );
};

/** Pages 1–4 in timeline mode, nobody moved. */
const show = async (db: DbConnection) => {
    const pages = [...(await readShowTiming(db)).pages].sort(
        (a, b) => a.order - b.order,
    );
    await deletePages({
        db,
        pageIds: new Set(pages.filter((p) => p.order >= 2).map((p) => p.id)),
    });
    for (let i = 0; i < 3; i++) await createLastPage({ db, newPageCounts: 8 });
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
    await startTimelineResolver(db);
    const [a, b, c] = resolver().marcherIds();
    return { a: a!, b: b!, c: c! };
};

/**
 * Places `ids` in a Line at x = 100, 120, … at the Basic target, as the Shape tool's Place does:
 * every member is set there (`keepUnchanged`) and the recipe is saved in the same edit.
 */
const placeLine = async (
    db: DbConnection,
    ids: number[],
    target: TimelineEditTarget,
) => {
    const members = ids.map((marcherId, i) => ({
        marcherId,
        slot: i,
        x: 100 + 20 * i,
        y: 50,
    }));
    await moveMarchersInTarget({
        db,
        target,
        keepUnchanged: true,
        moves: members.map(({ marcherId, x, y }) => ({ marcherId, x, y })),
        afterWrite: async (tx, timelineId) => {
            await saveShapeRecipeInTransaction({
                tx,
                timelineId,
                recipe: LINE,
                members,
            });
        },
    });
    await timelineResolverSettled();
};

/** Runs a test's setup; `null` (and the error logged) when it throws. See the file comment. */
const arranged = async <T>(run: () => Promise<T>): Promise<T | null> => {
    try {
        return await run();
    } catch (e) {
        console.error("basicDrift: the setup failed", e);
        return null;
    }
};

describeDbTests("Basic and placed shapes (shape recipes, #363)", (it) => {
    /** a, b and c in a Line placed at page 2's flag, in Basic */
    const lineOnPage2 = async (db: DbConnection) => {
        const ids = await show(db);
        await placeLine(db, [ids.a, ids.b, ids.c], {
            kind: "point",
            beat: PAGE2.end,
            box: PAGE2,
        });
        expect(await shapes(db)).toEqual([
            { at: 17, members: [ids.a, ids.b, ids.c] },
        ]);
        return ids;
    };

    // BUG 1: Basic's + and Split page re-cut every marcher's move out of the page's move
    // (`splitMovesAtBeatInTransaction`), the emptied page move is deleted, and its shape recipe
    // goes with it (`timeline_shape_recipes.timeline_id` cascades). Expert's Split at playhead
    // keeps the recipe with the half that still arrives (`timelineSplitAtBeat.ts`).
    it("+ inside a page keeps the shape placed at the page's flag", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await arranged(() => lineOnPage2(db));
        if (!ids) return;
        const at17 = [ids.a, ids.b, ids.c].map((id) =>
            resolver().positionAt(id, 17),
        );
        await addPageFlag({ db, beat: 13, splitMoves: true });
        await timelineResolverSettled();
        // Nobody moved: every member still stands on its spot at the flag
        expect(
            [ids.a, ids.b, ids.c].map((id) => resolver().positionAt(id, 17)),
        ).toEqual(at17);
        expect(await shapes(db)).toEqual([
            { at: 17, members: [ids.a, ids.b, ids.c] },
        ]);
    });

    it("Undo and Redo of + inside a page keep the shape at the page's flag", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await arranged(() => lineOnPage2(db));
        if (!ids) return;
        const all = [ids.a, ids.b, ids.c];
        await addPageFlag({ db, beat: 13, splitMoves: true });
        await performUndo(db);
        await timelineResolverSettled();
        expect(await shapes(db)).toEqual([{ at: 17, members: all }]);
        expect(await spansOf(db, ids.a)).toEqual([[9, 17]]);
        await performRedo(db);
        await timelineResolverSettled();
        expect(await shapes(db)).toEqual([{ at: 17, members: all }]);
        expect(await spansOf(db, ids.a)).toEqual([
            [9, 13],
            [13, 17],
        ]);
    });

    // BUG 1 (same cause, the point writer): a mid-page position for every member re-cuts their
    // rows into [9, 13) and [13, 17), the page's move is left empty and deleted with its recipe.
    it("a mid-page position for every member keeps the shape at the page's flag", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await arranged(() => lineOnPage2(db));
        if (!ids) return;
        await edit(
            db,
            { kind: "point", beat: 13, box: PAGE2 },
            [ids.a, ids.b, ids.c].map((marcherId, i) => ({
                marcherId,
                xy: [300 + 20 * i, 200] as XY,
            })),
        );
        // The flag's positions are the second halves' destinations, unchanged
        expect(resolver().positionAt(ids.a, 17)).toEqual([100, 50]);
        expect(await shapes(db)).toEqual([
            { at: 17, members: [ids.a, ids.b, ids.c] },
        ]);
    });

    // BUG 1 (same cause, Remove this count's position): the merge deletes [13, 17), the move the
    // flag's shape was saved in, and writes [9, 17) in a new move with no recipe.
    it("removing a mid-page position keeps the shape placed at the page's flag", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await arranged(async () => {
            const made = await show(db);
            const all = [made.a, made.b, made.c];
            await edit(
                db,
                { kind: "point", beat: 13, box: PAGE2 },
                all.map((marcherId) => ({ marcherId, xy: FAR })),
            );
            await placeLine(db, all, {
                kind: "point",
                beat: PAGE2.end,
                box: PAGE2,
            });
            expect(await shapes(db)).toEqual([{ at: 17, members: all }]);
            return made;
        });
        if (!ids) return;
        await removePositionAtBeat({
            db,
            beat: 13,
            box: PAGE2,
            marcherIds: [ids.a, ids.b, ids.c],
        });
        await timelineResolverSettled();
        expect(resolver().positionAt(ids.a, 17)).toEqual([100, 50]);
        expect(await shapes(db)).toEqual([
            { at: 17, members: [ids.a, ids.b, ids.c] },
        ]);
    });

    // #485 in Basic, the part Expert's range writer keeps too (`ownPageMoves`): a member whose
    // only move over the page is its own page move still goes back onto the page's start by
    // losing it, so the page follows the one before, where the shape is already placed.
    it("a shape placed again where the page starts takes members' own page moves, and the earlier page's shape carries", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await arranged(async () => {
            const made = await show(db);
            const all = [made.a, made.b, made.c];
            await placeLine(db, all, {
                kind: "point",
                beat: PAGE2.end,
                box: PAGE2,
            });
            await edit(
                db,
                { kind: "point", beat: PAGE3.end, box: PAGE3 },
                all.map((marcherId) => ({ marcherId, xy: FAR })),
            );
            expect(await spansOf(db, made.a)).toEqual([
                [9, 17],
                [17, 25],
            ]);
            return made;
        });
        if (!ids) return;
        const all = [ids.a, ids.b, ids.c];
        await placeLine(db, all, {
            kind: "point",
            beat: PAGE3.end,
            box: PAGE3,
        });
        expect(await spansOf(db, ids.a)).toEqual([[9, 17]]);
        expect(all.map((id) => resolver().positionAt(id, 25))).toEqual([
            [100, 50],
            [120, 50],
            [140, 50],
        ]);
        expect(await shapes(db)).toEqual([{ at: 17, members: all }]);
    });

    // BUG 2 (still open, owner decision): a recipe lists only marchers whose rows are in its move
    // (`saveShapeRecipeInTransaction`; ADR 0006, revision of 2026-10-29, rule 1). Basic's mid-page
    // positions put each marcher's rows in moves of their own ([13, 17) for a, [9, 17) for the
    // others), so a shape placed at the flag keeps only the members of one of them. Listing a
    // here needs that ADR rule changed for the parts of a page. Until then the placement is no
    // longer silent: everyone is set on their spot and the Shape tool's write names who was left
    // out (`placeWithMidPagePositionBasic.test.ts`).
    it.fails(
        "BUG 2: a shape placed at a page's flag keeps a member that has a mid-page position",
        async ({ db, marchersAndPages: _ }) => {
            const ids = await arranged(async () => {
                const made = await show(db);
                await point(db, 13, PAGE2, made.a, FAR);
                expect(await spansOf(db, made.a)).toEqual([
                    [9, 13],
                    [13, 17],
                ]);
                return made;
            });
            if (!ids) return;
            await placeLine(db, [ids.a, ids.b, ids.c], {
                kind: "point",
                beat: PAGE2.end,
                box: PAGE2,
            });
            // All three stand on their spots at the flag
            expect(
                [ids.a, ids.b, ids.c].map((id) =>
                    resolver().positionAt(id, 17),
                ),
            ).toEqual([
                [100, 50],
                [120, 50],
                [140, 50],
            ]);
            expect(await shapes(db)).toEqual([
                { at: 17, members: [ids.a, ids.b, ids.c] },
            ]);
        },
    );
});

describeDbTests("Basic's locks and Held holds (#472, #474)", (it) => {
    /**
     * `a` moves in Expert across page 2's flag ([13, 21), ending mid page 3) and is Held from
     * there through page 4; `b` never moves.
     */
    const heldFromExpertMove = async (db: DbConnection) => {
        const ids = await show(db);
        await edit(db, { kind: "range", start: 13, end: 21 }, [
            { marcherId: ids.a, xy: UP },
        ]);
        await holdFromPreviousPage({
            db,
            pageBox: PAGE4,
            marcherIds: [ids.a],
        });
        expect(await marksOf(db, ids.a)).toEqual([{ start: 21, end: 33 }]);
        return ids;
    };

    it("the writer refuses a Basic edit inside a hold that grows out of an Expert move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldFromExpertMove(db);
        await expect(point(db, 29, PAGE4, a, UP2)).rejects.toThrow(
            /Held from an Expert move/,
        );
    });

    // BUG 3 (fixed): the locks read only rows over the page (`lockedMarchersByPage`), and a Held
    // marcher has none there, so the page didn't show it locked and `withoutLockedMarchers`
    // didn't drop it. The writer then refused the whole edit (`refuseLockedArrivals`), so the
    // other selected marchers didn't move either, where a locked marcher is left alone and the
    // rest are written (V-203). The locks now share the writer's rule (`heldArrivalLock`).
    it("BUG 3: a marcher Held from an Expert move is locked on the held page, so the others still move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await arranged(async () => {
            const made = await heldFromExpertMove(db);
            useBasicLocksStore
                .getState()
                .set(
                    await readBasicRows(db),
                    (await boxesOf(db)) as PageBox[],
                    await readHeldMarks(db),
                );
            return made;
        });
        if (!ids) return;
        const target: TimelineEditTarget = {
            kind: "point",
            beat: 29,
            box: PAGE4,
        };
        const { moves, locked } = withoutLockedMarchers(target, [
            { marcherId: ids.a, x: UP2[0], y: UP2[1] },
            { marcherId: ids.b, x: UP2[0], y: UP2[1] },
        ]);
        expect(locked).toEqual([ids.a]);
        await moveMarchersInTarget({ db, target, moves });
        await timelineResolverSettled();
        expect(resolver().positionAt(ids.b, 29)).toEqual(UP2);
    });

    it("a marcher Held from a simple move isn't locked on the held page, and moves with the others", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await show(db);
        // `a` moves on page 3 in Basic and is Held from there through page 4
        await point(db, PAGE3.end, PAGE3, ids.a, UP);
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [ids.a] });
        expect(await marksOf(db, ids.a)).toEqual([{ start: 25, end: 33 }]);
        const boxes = await boxesOf(db);
        const rows = await readBasicRows(db);
        const holds = await readHeldMarks(db);
        expect(
            [...lockedMarchersByPage(rows, boxes, holds).values()].every(
                (locked) => locked.size === 0,
            ),
        ).toBe(true);
        useBasicLocksStore.getState().set(rows, boxes as PageBox[], holds);
        const target: TimelineEditTarget = {
            kind: "point",
            beat: 29,
            box: PAGE4,
        };
        const { moves, locked } = withoutLockedMarchers(target, [
            { marcherId: ids.a, x: UP2[0], y: UP2[1] },
            { marcherId: ids.b, x: UP2[0], y: UP2[1] },
        ]);
        expect(locked).toEqual([]);
        await moveMarchersInTarget({ db, target, moves });
        await timelineResolverSettled();
        // The whole hold moved with `a`'s arrival (holds decision 4)
        expect(resolver().positionAt(ids.a, 29)).toEqual(UP2);
        expect(resolver().positionAt(ids.b, 29)).toEqual(UP2);
    });
});

describeDbTests("Basic's ticks (mid-page positions)", (it) => {
    /** `a` at FAR on count 13 of page 2, then Remove keyframe on page 2's flag: a hold after 13. */
    const holdAfterPoint = async (db: DbConnection) => {
        const made = await show(db);
        await point(db, 13, PAGE2, made.a, FAR);
        // Basic's Remove keyframe on the page's flag (`unsetHere`)
        await unsetMarchersAt({
            db,
            beat: 17,
            marcherIds: [made.a],
            tidyShared: true,
        });
        await timelineResolverSettled();
        // Page 3 keeps the spot it had (Unset here's stay)
        expect(await spansOf(db, made.a)).toEqual([
            [9, 13],
            [17, 25],
        ]);
        expect(pointsInBox(await readBasicRows(db), made.a, PAGE2)).toEqual([
            13,
        ]);
        return made;
    };

    // Was BUG 4: a tick is drawn at every move end inside a page (`pointsInBox`), but Remove this
    // count's position only merged a move ending on the count with one starting there. A tick
    // with a hold after it (Remove keyframe at the flag, a drag back at the flag) kept its menu
    // entry, which wrote nothing and said nothing. Now the move runs on to where the hold ends,
    // arriving where it did, as a merge folds in the move after it.
    it("Remove this count's position takes away a tick that has no move after it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await holdAfterPoint(db);
        await removePositionAtBeat({
            db,
            beat: 13,
            box: PAGE2,
            marcherIds: [ids.a],
        });
        await timelineResolverSettled();
        expect(pointsInBox(await readBasicRows(db), ids.a, PAGE2)).toEqual([]);
        // One move over the page, arriving at the flag where the hold kept it
        expect(await spansOf(db, ids.a)).toEqual([
            [9, 17],
            [17, 25],
        ]);
        expect(resolver().positionAt(ids.a, 17)).toEqual(FAR);
    });

    it("one Undo of that Remove brings the tick and its hold back; Redo takes them away again", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await holdAfterPoint(db);
        await removePositionAtBeat({
            db,
            beat: 13,
            box: PAGE2,
            marcherIds: [ids.a],
        });
        await timelineResolverSettled();
        expect(await spansOf(db, ids.a)).toEqual([
            [9, 17],
            [17, 25],
        ]);
        await performUndo(db);
        await timelineResolverSettled();
        expect(await spansOf(db, ids.a)).toEqual([
            [9, 13],
            [17, 25],
        ]);
        expect(pointsInBox(await readBasicRows(db), ids.a, PAGE2)).toEqual([
            13,
        ]);
        expect(resolver().positionAt(ids.a, 13)).toEqual(FAR);
        await performRedo(db);
        await timelineResolverSettled();
        expect(await spansOf(db, ids.a)).toEqual([
            [9, 17],
            [17, 25],
        ]);
    });

    it("the hold after a tick ends at the next move, a later Held hold or the flag; a Held hold from the tick keeps it", () => {
        const box = PAGE2;
        expect(rejoinedHoldEnd([], [], box, 13)).toBe(17);
        expect(
            rejoinedHoldEnd([{ start: 9 }, { start: 15 }], [], box, 13),
        ).toBe(15);
        expect(rejoinedHoldEnd([], [{ start: 14 }], box, 13)).toBe(14);
        expect(rejoinedHoldEnd([], [{ start: 11 }], box, 13)).toBe(17);
        expect(rejoinedHoldEnd([{ start: 15 }], [{ start: 13 }], box, 13)).toBe(
            null,
        );
    });
});

describeDbTests(
    "Basic edits keep Held holds attached (checked, fine)",
    (it) => {
        /** `a` moves on page 2 and is Held on page 3, growing out of that move. */
        const heldOnPage3 = async (db: DbConnection) => {
            const ids = await show(db);
            await point(db, 17, PAGE2, ids.a, UP);
            await holdFromPreviousPage({
                db,
                pageBox: PAGE3,
                marcherIds: [ids.a],
            });
            expect(await marksOf(db, ids.a)).toEqual([PAGE3]);
            return ids;
        };

        it("+ inside the move a hold grows out of keeps the hold", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await heldOnPage3(db);
            await addPageFlag({ db, beat: 13, splitMoves: true });
            expect(await spansOf(db, a)).toEqual([
                [9, 13],
                [13, 17],
            ]);
            expect(await marksOf(db, a)).toEqual([PAGE3]);
            expect(await locks(db)).toEqual([]);
        });

        it("a mid-page position inside the move a hold grows out of, and removing it, keep the hold", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await heldOnPage3(db);
            await point(db, 13, PAGE2, a, FAR);
            expect(await marksOf(db, a)).toEqual([PAGE3]);
            expect(resolver().positionAt(a, 21)).toEqual(UP);
            await removePositionAtBeat({
                db,
                beat: 13,
                box: PAGE2,
                marcherIds: [a],
            });
            await timelineResolverSettled();
            expect(await spansOf(db, a)).toEqual([[9, 17]]);
            expect(await marksOf(db, a)).toEqual([PAGE3]);
            expect(resolver().positionAt(a, 21)).toEqual(UP);
        });

        it("a drag at the flag back onto the page's start takes the move and its hold, as Remove keyframe does", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await heldOnPage3(db);
            const start = resolver().positionAt(a, 9) as XY;
            const result = await point(db, 17, PAGE2, a, start);
            expect(result.cleared).toEqual([a]);
            expect(await spansOf(db, a)).toEqual([]);
            expect(await marksOf(db, a)).toEqual([]);
        });

        it("moving a page's flag carries the moves on it and the hold; nobody is locked", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await heldOnPage3(db);
            await point(db, 13, PAGE2, b, FAR);
            const page2 = (await boxesOf(db)).find((p) => p.start === 9)!;
            await movePageFlag({ db, pageId: page2.id, beat: 21 });
            expect(await spansOf(db, a)).toEqual([[9, 21]]);
            expect(await marksOf(db, a)).toEqual([{ start: 21, end: 25 }]);
            expect(await spansOf(db, b)).toEqual([
                [9, 13],
                [13, 21],
            ]);
            expect(await locks(db)).toEqual([]);
        });
    },
);

describeDbTests("Basic on subset pages (#173; checked, fine)", (it) => {
    it("a subset page made with + is a page box Basic edits, mid-page too", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await point(db, 17, PAGE2, a, UP);
        const added = await addPageFlag({
            db,
            beat: 13,
            splitMoves: true,
            subset: true,
        });
        expect([added.startBeat, added.endBeat]).toEqual([9, 13]);
        await point(db, 11, { start: 9, end: 13 }, a, FAR);
        expect(await spansOf(db, a)).toEqual([
            [9, 11],
            [11, 13],
            [13, 17],
        ]);
        expect(resolver().positionAt(a, 11)).toEqual(FAR);
        expect(resolver().positionAt(a, 17)).toEqual(UP);
        expect(await locks(db)).toEqual([]);
    });
});
