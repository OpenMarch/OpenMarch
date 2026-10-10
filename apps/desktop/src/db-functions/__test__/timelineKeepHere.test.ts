import { afterEach, expect } from "vitest";
import { countDistinct, getTableName } from "drizzle-orm";
import type { XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { getTestWithHistory } from "@/test/history";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "@/timeline/convert/writePageConversion";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import {
    findLaterOwnMoves,
    readEditStart,
} from "@/timeline/timelineMoveThemToo";
import { timelineErrorCode } from "@/timeline/timelineErrorMessages";
import { performRedo, performUndo } from "../history";
import { createLastPage, deletePages } from "../page";
import { deletePageFlags, movePageFlag } from "../pageFlags";
import { deletePagesWithMoves, deletePageYankWithMoves } from "../pageDelete";
import { deleteMarchers } from "../marcher";
import { deleteTimeline } from "../timelineCommands";
import { setTimelineTransitionDestination } from "../timelineTransitions";
import {
    moveMarchersInTarget,
    type TimelineEditTarget,
} from "../timelineMoves";
import {
    followAgainOnPage,
    keepMarchersOnPage,
    keptStatesOnPageBoxes,
} from "../timelineKeepHere";
import { readKeptAssignmentIds } from "../timelineKeptMarkers";

keepFixturesInPageMode(
    "its tests trim the show, write timeline rows and set the flag themselves",
);

/**
 * Keep later pages (defined-coordinates 10, owner decision 2026-10-09; ADR 0001 amendment
 * 2026-10-09): **Keep** gives marchers that follow on a page their own zero-motion move there,
 * marked kept in `timeline_kept_assignments`; **Follow again** deletes it. The marker survives
 * undo and redo exactly, and goes with its move.
 *
 * The show: home, page 1 [1, 9), page 2 [9, 17), page 3 [17, 25), page 4 [25, 33); beat ids equal
 * their ordinals. Marchers `a` and `b` move on page 2 and hold on pages 3 and 4; `c` never moves.
 */

afterEach(() => stopTimelineResolver());

const UP: XY = [100, 100];
const UP2: XY = [200, 100];
const ELSEWHERE: XY = [400, 400];
const FAR: XY = [500, 260];
const PAGE2 = { start: 9, end: 17 };
const PAGE3 = { start: 17, end: 25 };
const PAGE4 = { start: 25, end: 33 };

const TABLES = [
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
    schema.timeline_kept_assignments,
];

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const keptRows = async (db: DbConnection) =>
    await db.select().from(schema.timeline_kept_assignments).all();

const undoGroups = async (db: DbConnection) =>
    (
        await db
            .select({ n: countDistinct(schema.history_undo.history_group) })
            .from(schema.history_undo)
            .get()
    )?.n ?? 0;

const resolver = () => useTimelineResolverStore.getState().resolver!;

const pagesInOrder = async (db: DbConnection) =>
    [...(await readShowTiming(db)).pages].sort((a, b) => a.order - b.order);

const atFlags = async (db: DbConnection, marcherId: number) => {
    await timelineResolverSettled();
    return (await pagesInOrder(db))
        .map((p) => (p.id === 0 ? 0 : pageEndBeat(p)))
        .map((b) => resolver().positionAt(marcherId, b) as XY);
};

const move = async (
    db: DbConnection,
    range: { start: number; end: number },
    moves: { marcherId: number; xy: XY }[],
    clearOwn = false,
) => {
    const result = await moveMarchersInTarget({
        db,
        target: { kind: "range", ...range },
        moves: moves.map(({ marcherId, xy: [x, y] }) => ({ marcherId, x, y })),
        clearOwn,
    });
    await timelineResolverSettled();
    return result;
};

const stateOn = async (
    db: DbConnection,
    box: { start: number; end: number },
    marcherId: number,
) =>
    (
        await keptStatesOnPageBoxes({
            db,
            pageBoxes: [box],
            marcherIds: [marcherId],
        })
    )[0]!.states.get(marcherId);

const setTimelineFlag = async (db: DbConnection) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
};

/** Pages 1–4 in timeline mode; `a` and `b` moved on page 2, holding on 3 and 4. */
const show = async (db: DbConnection) => {
    const pages = await pagesInOrder(db);
    await deletePages({
        db,
        pageIds: new Set(pages.filter((p) => p.order >= 2).map((p) => p.id)),
    });
    for (let i = 0; i < 3; i++) await createLastPage({ db, newPageCounts: 8 });
    await setTimelineFlag(db);
    await startTimelineResolver(db);
    const [a, b, c] = resolver().marcherIds();
    await move(db, PAGE2, [
        { marcherId: a!, xy: UP },
        { marcherId: b!, xy: UP2 },
    ]);
    const ids = (await pagesInOrder(db)).map((p) => p.id);
    return { a: a!, b: b!, c: c!, page3Id: ids[3]!, page4Id: ids[4]! };
};

describeDbTests("Keep later pages: storage and commands", (it) => {
    it("owner flow: keep page 3, then edit page 2: pages 3 and 4 keep the spot", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const before = await atFlags(db, a);
        expect(before.slice(2)).toEqual([UP, UP, UP]);

        const result = await keepMarchersOnPage({
            db,
            pageBox: PAGE3,
            marcherIds: [b, a],
        });
        const kept = await readKeptAssignmentIds(db);
        expect(result).toEqual({
            changed: [a, b].sort((x, y) => x - y),
            skipped: [],
            // The markers it wrote, for the renderer's copy (pre-merge review U2)
            markers: { added: [...kept].sort((x, y) => x - y), removed: [] },
        });
        // Nothing moved, but each has its own move over page 3, marked kept
        expect(await atFlags(db, a)).toEqual(before);
        expect(kept.size).toBe(2);
        const own = (
            await db.select().from(schema.timeline_assignments).all()
        ).filter((r) => r.start_beat === PAGE3.start);
        expect(new Set(own.map((r) => r.id))).toEqual(kept);
        expect(own.every((r) => r.end_beat === PAGE3.end)).toBe(true);
        expect(await stateOn(db, PAGE3, a)).toBe("kept");
        // Page 4 holds from the kept page
        expect(await stateOn(db, PAGE4, a)).toBe("follows");

        await move(db, PAGE2, [
            { marcherId: a, xy: ELSEWHERE },
            { marcherId: b, xy: ELSEWHERE },
        ]);
        expect((await atFlags(db, a)).slice(2)).toEqual([ELSEWHERE, UP, UP]);
        expect((await atFlags(db, b)).slice(2)).toEqual([ELSEWHERE, UP2, UP2]);
        // The page 2 edit leaves the kept moves kept
        expect(await readKeptAssignmentIds(db)).toEqual(kept);
    });

    it("keeps only marchers that follow there, reports the rest, and refuses a box that isn't a page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, c } = await show(db);
        // b moves on page 3; c is partway through a move over pages 3 and 4
        await move(db, PAGE3, [{ marcherId: b, xy: ELSEWHERE }]);
        await move(db, { start: 17, end: 33 }, [{ marcherId: c, xy: FAR }]);
        const result = await keepMarchersOnPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a, b, c],
        });
        expect(result.changed).toEqual([a]);
        expect(result.skipped).toEqual(
            [
                { marcherId: b, state: "own" },
                { marcherId: c, state: "midMove" },
            ].sort((x, y) => x.marcherId - y.marcherId),
        );
        expect((await atFlags(db, b))[3]).toEqual(ELSEWHERE);

        // Keeping again writes nothing and adds no undo step
        const rows = await snapshot(db);
        const groups = await undoGroups(db);
        const again = await keepMarchersOnPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a, b],
        });
        expect(again.changed).toEqual([]);
        expect(again.skipped.map((s) => s.state).sort()).toEqual([
            "kept",
            "own",
        ]);
        expect(await snapshot(db)).toEqual(rows);
        expect(await undoGroups(db)).toBe(groups);

        const notABox = await keepMarchersOnPage({
            db,
            pageBox: { start: 17, end: 21 },
            marcherIds: [a],
        }).catch((e: unknown) => e);
        expect(timelineErrorCode(notABox)).toBe("E-ARGS");
        // Worded in pages and counts, never beats (pre-merge review D2)
        expect((notABox as Error).message).toContain(
            "Keep works on a whole page, not Page 3, counts 1–4",
        );
        expect(await snapshot(db)).toEqual(rows);
    });

    it("keep and Follow again are one undo step each, and undo and redo restore the marker exactly", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const beforeKeep = await snapshot(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a, b] });
        const kept = await snapshot(db);
        expect(kept.timeline_kept_assignments).toHaveLength(2);

        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(beforeKeep);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);

        const result = await followAgainOnPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a, b],
        });
        expect(result.changed).toEqual([a, b].sort((x, y) => x - y));
        expect(result.markers).toEqual({
            added: [],
            removed: (
                kept.timeline_kept_assignments as { assignment_id: number }[]
            )
                .map((r) => r.assignment_id)
                .sort((x, y) => x - y),
        });
        // The kept moves, their markers and the emptied timeline are gone
        expect(await snapshot(db)).toEqual(beforeKeep);
        await timelineResolverSettled();
        await move(db, PAGE2, [{ marcherId: a, xy: ELSEWHERE }]);
        expect((await atFlags(db, a)).slice(2)).toEqual([
            ELSEWHERE,
            ELSEWHERE,
            ELSEWHERE,
        ]);

        expect((await performUndo(db)).success).toBe(true);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(beforeKeep);
    });

    it("Follow again leaves following marchers and ordinary own moves alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        // b's own move that goes nowhere is not a kept one
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [b] });
        await db.delete(schema.timeline_kept_assignments);
        const rows = await snapshot(db);
        const groups = await undoGroups(db);
        const result = await followAgainOnPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a, b],
        });
        expect(result.changed).toEqual([]);
        expect(result.skipped).toEqual(
            [
                { marcherId: a, state: "follows" },
                { marcherId: b, state: "own" },
            ].sort((x, y) => x.marcherId - y.marcherId),
        );
        expect(await snapshot(db)).toEqual(rows);
        expect(await undoGroups(db)).toBe(groups);
    });

    it("deleting a kept move's timeline takes the marker, and undo brings it back exactly", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a, b] });
        const kept = await snapshot(db);
        const timelineId = (
            kept.timelines as { id: number; start_beat: number }[]
        ).find((t) => t.start_beat === PAGE3.start)!.id;

        await deleteTimeline({ db, timelineId });
        expect(await keptRows(db)).toEqual([]);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);
        expect((await performRedo(db)).success).toBe(true);
        expect(await keptRows(db)).toEqual([]);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);
    });

    it("deleting a kept marcher takes its marker", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a, b] });
        const kept = await snapshot(db);
        await deleteMarchers({ db, marcherIds: new Set([a]) });
        expect(await keptRows(db)).toHaveLength(1);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);
    });
});

describeDbTests("Keep later pages: edits of a kept spot", (it) => {
    it("dragging a kept marcher on its kept page makes it an ordinary own move, in the same edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a, b] });
        const kept = await snapshot(db);
        const groups = await undoGroups(db);

        await move(db, PAGE3, [{ marcherId: a, xy: FAR }]);
        expect(await undoGroups(db)).toBe(groups + 1);
        expect(await stateOn(db, PAGE3, a)).toBe("own");
        expect(await stateOn(db, PAGE3, b)).toBe("kept");
        expect((await atFlags(db, a))[3]).toEqual(FAR);

        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);
    });

    it("an edit that leaves a kept spot where it is writes nothing and keeps it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const kept = await snapshot(db);
        const groups = await undoGroups(db);
        await move(db, PAGE3, [{ marcherId: a, xy: UP }]);
        expect(await snapshot(db)).toEqual(kept);
        expect(await undoGroups(db)).toBe(groups);
    });

    it("a drag back never clears a kept spot; it clears an ordinary own move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a] });
        // b gets an ordinary own move on page 3 that goes nowhere yet
        await move(db, PAGE3, [{ marcherId: b, xy: FAR }]);
        // Edit page 2: a walks back to its kept spot on page 3; b to its own move's end
        await move(db, PAGE2, [
            { marcherId: a, xy: ELSEWHERE },
            { marcherId: b, xy: ELSEWHERE },
        ]);
        expect((await atFlags(db, a)).slice(2, 4)).toEqual([ELSEWHERE, UP]);

        // Drag both back to where page 3 starts
        const result = await move(db, PAGE3, [
            { marcherId: a, xy: ELSEWHERE },
            { marcherId: b, xy: ELSEWHERE },
        ]);
        expect(result.cleared).toEqual([b]);
        // a keeps its move, now ending where it starts, as an ordinary own move
        expect(await stateOn(db, PAGE3, a)).toBe("own");
        expect(await stateOn(db, PAGE3, b)).toBe("follows");
        expect((await atFlags(db, a)).slice(2)).toEqual([
            ELSEWHERE,
            ELSEWHERE,
            ELSEWHERE,
        ]);
    });

    it("set to previous page (clearOwn) deletes a kept move and its marker", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        const beforeKeep = await snapshot(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const result = await move(db, PAGE3, [{ marcherId: a, xy: UP }], true);
        expect(result.cleared).toEqual([a]);
        expect(await snapshot(db)).toEqual(beforeKeep);
    });

    it("setting a kept move's destination in the inspector makes it an ordinary own move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const kept = await snapshot(db);
        const row = (
            kept.timeline_assignments as {
                id: number;
                transition_id: number;
                start_beat: number;
            }[]
        ).find((r) => r.start_beat === PAGE3.start)!;
        await setTimelineTransitionDestination({
            db,
            transitionId: row.transition_id,
            destination: { kind: "individual", points: [FAR] },
        });
        expect(await keptRows(db)).toEqual([]);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);
    });

    it("Move them too never offers a kept marcher, and a kept marcher alone is no split", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, c } = await show(db);
        const boxes = [
            { start: 0, end: 1 },
            { start: 1, end: 9 },
            PAGE2,
            PAGE3,
            PAGE4,
        ];
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [b] });
        // c gets an ordinary own move on page 3
        await move(db, PAGE2, [{ marcherId: c, xy: UP }]);
        await move(db, PAGE3, [{ marcherId: c, xy: FAR }]);

        const edit = async (marcherIds: number[], dy: number) => {
            const target: TimelineEditTarget = { kind: "range", ...PAGE2 };
            const start = readEditStart(target, marcherIds, resolver());
            const result = await move(
                db,
                PAGE2,
                marcherIds.map((marcherId) => ({
                    marcherId,
                    xy: [ELSEWHERE[0] + marcherId, ELSEWHERE[1] + dy],
                })),
            );
            return await findLaterOwnMoves({
                database: db,
                target,
                result,
                start,
                boxes,
            });
        };
        // a follows into page 3, b is kept there: nothing to offer
        expect(await edit([a, b], 0)).toEqual([]);
        // a follows, b kept, c's own move kept its destination: only c is offered
        expect((await edit([a, b, c], 10)).map((m) => m.marcherId)).toEqual([
            c,
        ]);
    });
});

describeDbTests("Keep later pages: page edits", (it) => {
    it("Delete page and its moves takes a kept move and its marker; undo restores both", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, page3Id } = await show(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a, b] });
        const kept = await snapshot(db);
        await deletePagesWithMoves({ db, pageIds: new Set([page3Id]) });
        expect(await keptRows(db)).toEqual([]);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);
        expect((await performRedo(db)).success).toBe(true);
        expect(await keptRows(db)).toEqual([]);
    });

    it("Yank takes a kept move and its marker; undo restores both", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, page3Id } = await show(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const kept = await snapshot(db);
        await deletePageYankWithMoves({ db, pageId: page3Id });
        expect(await keptRows(db)).toEqual([]);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);
    });

    it("the flag delete keeps the kept move and its marker", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, page3Id } = await show(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const kept = await snapshot(db);
        await deletePageFlags({ db, pageIds: new Set([page3Id]) });
        expect(await snapshot(db)).toEqual(kept);
        // Page 4's box now runs over both: the kept move lies inside it, an own move there
        expect(await stateOn(db, { start: 17, end: 33 }, a)).toBe("own");
    });

    it("a flag drag stretches a kept move with its page, and it stays kept", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, page3Id } = await show(db);
        await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const kept = await snapshot(db);
        await movePageFlag({ db, pageId: page3Id, beat: 27 });
        expect(await stateOn(db, { start: 17, end: 27 }, a)).toBe("kept");
        expect(await keptRows(db)).toEqual(kept.timeline_kept_assignments);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);
    });

    it("keeps a marcher that never moved, ahead of any move: a later first move doesn't reach the kept page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        const home = await atFlags(db, c);
        expect(await stateOn(db, PAGE3, c)).toBe("follows");
        const result = await keepMarchersOnPage({
            db,
            pageBox: PAGE3,
            marcherIds: [c],
        });
        expect(result).toMatchObject({ changed: [c], skipped: [] });
        expect(result.markers.added).toHaveLength(1);
        expect(await stateOn(db, PAGE3, c)).toBe("kept");
        // Nothing moved: it's kept where it stands, its starting spot
        expect(await atFlags(db, c)).toEqual(home);

        // Its first move, on page 2: page 3 walks back to the kept spot, page 4 holds there
        await move(db, PAGE2, [{ marcherId: c, xy: ELSEWHERE }]);
        expect((await atFlags(db, c)).slice(2)).toEqual([
            ELSEWHERE,
            home[3]!,
            home[4]!,
        ]);
        expect(await stateOn(db, PAGE3, c)).toBe("kept");

        // Follow again takes it back: page 3 follows page 2
        await followAgainOnPage({ db, pageBox: PAGE3, marcherIds: [c] });
        expect((await atFlags(db, c)).slice(2)).toEqual([
            ELSEWHERE,
            ELSEWHERE,
            ELSEWHERE,
        ]);
    });

    it("the converter writes no kept markers", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        expect(
            (await db.select().from(schema.timeline_assignments).all()).length,
        ).toBeGreaterThan(0);
        expect(await keptRows(db)).toEqual([]);
    });
});

describeDbTests("Keep later pages: keep at given spots (Only Page N)", (it) => {
    it("ends the kept move at the given spot, marked kept; later pages hold there; follow again takes it back", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        // Page 2 moved again: a and b now stand at ELSEWHERE on pages 2–4
        await move(db, PAGE2, [
            { marcherId: a, xy: ELSEWHERE },
            { marcherId: b, xy: FAR },
        ]);
        const groups = await undoGroups(db);
        const result = await keepMarchersOnPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a, b],
            // Only a is given a spot: where it stood before the edit
            at: new Map([[a, UP]]),
        });
        expect(result.changed).toEqual([a, b].sort((x, y) => x - y));
        expect(await undoGroups(db)).toBe(groups + 1);
        expect((await atFlags(db, a)).slice(2)).toEqual([ELSEWHERE, UP, UP]);
        expect((await atFlags(db, b)).slice(2)).toEqual([FAR, FAR, FAR]);
        // Both are kept spots, though a's walks back
        expect(await stateOn(db, PAGE3, a)).toBe("kept");
        expect(await stateOn(db, PAGE3, b)).toBe("kept");
        expect((await readKeptAssignmentIds(db)).size).toBe(2);

        await followAgainOnPage({ db, pageBox: PAGE3, marcherIds: [a] });
        await timelineResolverSettled();
        expect((await atFlags(db, a)).slice(2)).toEqual([
            ELSEWHERE,
            ELSEWHERE,
            ELSEWHERE,
        ]);
        // One undo puts the kept move back
        await performUndo(db);
        expect((await atFlags(db, a)).slice(2)).toEqual([ELSEWHERE, UP, UP]);
        expect(await stateOn(db, PAGE3, a)).toBe("kept");
    });

    it("refuses a spot that isn't a valid destination, writing nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        const before = await snapshot(db);
        await expect(
            keepMarchersOnPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a],
                at: new Map([[a, [Number.NaN, 0] as XY]]),
            }),
        ).rejects.toThrow();
        expect(await snapshot(db)).toEqual(before);
    });
});

describeDbTests("Keep later pages: history round trips", (it) => {
    const testWithHistory = getTestWithHistory(it, TABLES);

    testWithHistory(
        "keep, drag on the kept page, follow again and delete the move: one undo group each",
        async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
            const { a, b } = await show(db);
            const state = await expectNumberOfChanges.getDatabaseState(db);
            await keepMarchersOnPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a, b],
            });
            await timelineResolverSettled();
            await move(db, PAGE3, [{ marcherId: a, xy: FAR }]);
            await followAgainOnPage({ db, pageBox: PAGE3, marcherIds: [b] });
            await keepMarchersOnPage({ db, pageBox: PAGE4, marcherIds: [b] });
            const page4 = (await db.select().from(schema.timelines).all()).find(
                (t) => t.start_beat === PAGE4.start,
            )!;
            await deleteTimeline({ db, timelineId: page4.id });
            await expectNumberOfChanges.test(db, 5, state);
        },
    );

    testWithHistory(
        "keep at given spots (Only Page N): one undo group, exactly undone and redone",
        async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
            const { a, b } = await show(db);
            await move(db, PAGE2, [{ marcherId: a, xy: ELSEWHERE }]);
            const state = await expectNumberOfChanges.getDatabaseState(db);
            await keepMarchersOnPage({
                db,
                pageBox: PAGE3,
                marcherIds: [a, b],
                at: new Map([[a, UP]]),
            });
            await expectNumberOfChanges.test(db, 1, state);
        },
    );

    testWithHistory(
        "keep a marcher that never moved, then its first move: one undo group each",
        async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
            const { c } = await show(db);
            const state = await expectNumberOfChanges.getDatabaseState(db);
            await keepMarchersOnPage({ db, pageBox: PAGE3, marcherIds: [c] });
            await timelineResolverSettled();
            await move(db, PAGE2, [{ marcherId: c, xy: ELSEWHERE }]);
            await expectNumberOfChanges.test(db, 2, state);
        },
    );
});
