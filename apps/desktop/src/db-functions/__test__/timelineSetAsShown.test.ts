import { afterEach, expect } from "vitest";
import { refusalText } from "@/test/refusalText";
import { countDistinct, getTableName } from "drizzle-orm";
import type { XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { getTestWithHistory } from "@/test/history";
import { readShowTiming } from "@/timeline/showTiming";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { timelineErrorCode } from "@/timeline/timelineErrorMessages";
import { performRedo, performUndo } from "../history";
import { createLastPage, deletePages } from "../page";
import { moveMarchersInTarget } from "../timelineMoves";
import { keptStatesOnPageBoxes } from "../timelineKeepHere";
import { setAsShownOnPage } from "../timelineSetAsShown";

keepFixturesInPageMode(
    "its tests trim the show, write timeline rows and set the flag themselves",
);

/**
 * **Set as shown** (holds, fork #466; holds README decisions 1 and 12, review R6): a marcher Not
 * set on a page box gets an ordinary move of its own over the box, ending where it shows there, so
 * an edit of an earlier page stops carrying into it. Nothing marks the move as kept.
 *
 * The show: home, page 1 [1, 9), page 2 [9, 17), page 3 [17, 25), page 4 [25, 33); beat ids equal
 * their ordinals. Marchers `a` and `b` move on page 2 and hold (Not set) on pages 3 and 4; `c`
 * never moves.
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

/** Where `marcherId` stands at each flag: home, pages 1–4. */
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
) => {
    await moveMarchersInTarget({
        db,
        target: { kind: "range", ...range },
        moves: moves.map(({ marcherId, xy: [x, y] }) => ({ marcherId, x, y })),
    });
    await timelineResolverSettled();
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

const rowsOf = async (db: DbConnection, marcherId: number) =>
    (await db.select().from(schema.timeline_assignments).all()).filter(
        (r) => r.marcher_id === marcherId,
    );

const setTimelineFlag = async (db: DbConnection) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
};

/** Pages 1–4 in timeline mode; `a` and `b` moved on page 2, Not set on 3 and 4. */
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
    return { a: a!, b: b!, c: c! };
};

describeDbTests("Set as shown", (it) => {
    it("Set as shown on page 4, then edit page 2: page 4 keeps its spot, page 3 still changes", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const before = await atFlags(db, a);
        expect(before.slice(2)).toEqual([UP, UP, UP]);

        const result = await setAsShownOnPage({
            db,
            pageBox: PAGE4,
            marcherIds: [b, a],
        });
        expect(result).toEqual({
            changed: [a, b].sort((x, y) => x - y),
            skipped: [],
        });
        // Nothing moved; each now has its own move ending on page 4's flag (a keyframe, holds
        // decision 13), and nothing marks it kept
        expect(await atFlags(db, a)).toEqual(before);
        for (const id of [a, b]) {
            const own = (await rowsOf(db, id)).filter(
                (r) => r.start_beat === PAGE4.start,
            );
            expect(own).toHaveLength(1);
            expect(own[0]!.end_beat).toBe(PAGE4.end);
            expect(await stateOn(db, PAGE4, id)).toBe("own");
        }
        expect(
            await db.select().from(schema.timeline_kept_assignments).all(),
        ).toEqual([]);

        await move(db, PAGE2, [
            { marcherId: a, xy: ELSEWHERE },
            { marcherId: b, xy: FAR },
        ]);
        // Page 3 follows page 2; page 4 stays where it was shown
        expect((await atFlags(db, a)).slice(2)).toEqual([
            ELSEWHERE,
            ELSEWHERE,
            UP,
        ]);
        expect((await atFlags(db, b)).slice(2)).toEqual([FAR, FAR, UP2]);
    });

    it("is one undo step, exactly undone and redone", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const rows = await snapshot(db);
        const groups = await undoGroups(db);
        await setAsShownOnPage({ db, pageBox: PAGE3, marcherIds: [a, b] });
        const set = await snapshot(db);
        expect(await undoGroups(db)).toBe(groups + 1);

        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(rows);
        expect(await stateOn(db, PAGE3, a)).toBe("follows");
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(set);
    });

    it("leaves marchers already set on the page untouched, and skips those partway through a move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, c } = await show(db);
        // b is set on page 3; c is partway through a move over pages 3 and 4
        await move(db, PAGE3, [{ marcherId: b, xy: ELSEWHERE }]);
        await move(db, { start: 17, end: 33 }, [{ marcherId: c, xy: FAR }]);
        const bRows = await rowsOf(db, b);
        const cRows = await rowsOf(db, c);
        const bAt = await atFlags(db, b);

        const result = await setAsShownOnPage({
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
        expect(await rowsOf(db, b)).toEqual(bRows);
        expect(await rowsOf(db, c)).toEqual(cRows);
        expect(await atFlags(db, b)).toEqual(bAt);

        // Again: nobody is Not set there, so it writes nothing and adds no undo step
        const rows = await snapshot(db);
        const groups = await undoGroups(db);
        const again = await setAsShownOnPage({
            db,
            pageBox: PAGE3,
            marcherIds: [a, b],
        });
        expect(again.changed).toEqual([]);
        expect(await snapshot(db)).toEqual(rows);
        expect(await undoGroups(db)).toBe(groups);
    });

    it("sets a marcher that never moved at its home spot", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        const before = await atFlags(db, c);
        const result = await setAsShownOnPage({
            db,
            pageBox: PAGE3,
            marcherIds: [c],
        });
        expect(result.changed).toEqual([c]);
        expect(await atFlags(db, c)).toEqual(before);
        expect(await stateOn(db, PAGE3, c)).toBe("own");
    });

    it("refuses a box that isn't a page's, worded in pages and counts", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        const rows = await snapshot(db);
        const notABox = await setAsShownOnPage({
            db,
            pageBox: { start: 17, end: 21 },
            marcherIds: [a],
        }).catch((e: unknown) => e);
        expect(timelineErrorCode(notABox)).toBe("E-ARGS");
        expect(refusalText(notABox)).toContain(
            "Set as shown works on a whole page, not Page 3, counts 1–4",
        );
        expect(await snapshot(db)).toEqual(rows);
    });
});

describeDbTests("Set as shown: history round trips", (it) => {
    const testWithHistory = getTestWithHistory(it, TABLES);

    testWithHistory(
        "Set as shown, then an edit on the set page: one undo group each",
        async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
            const { a, b } = await show(db);
            const state = await expectNumberOfChanges.getDatabaseState(db);
            await setAsShownOnPage({ db, pageBox: PAGE3, marcherIds: [a, b] });
            await timelineResolverSettled();
            await move(db, PAGE3, [{ marcherId: a, xy: FAR }]);
            await expectNumberOfChanges.test(db, 2, state);
        },
    );
});
