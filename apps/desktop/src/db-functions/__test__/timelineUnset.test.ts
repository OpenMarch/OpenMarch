import { afterEach, expect } from "vitest";
import { countDistinct, getTableName } from "drizzle-orm";
import type { XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readShowTiming } from "@/timeline/showTiming";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    followingAt,
    marcherSetBeats,
    selectionKeyframes,
} from "@/timeline/timelineSetFollowing";
import {
    resolverSpans,
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performRedo, performUndo } from "../history";
import { createLastPage, deletePages } from "../page";
import { moveMarchersInTarget } from "../timelineMoves";
import {
    pageBoxStatesOnPageBoxes,
    setAsShownOnPage,
} from "../timelineSetAsShown";
import { unsetMarchersAt } from "../timelineUnset";
import {
    unsetFollowingPages,
    unsetHere,
    unsetHereAndFollowing,
    unsetMenuStateAt,
} from "@/timeline/timelineUnset";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";

keepFixturesInPageMode(
    "its tests trim the show, write timeline rows and set the flag themselves",
);

/**
 * **Unset here** (Set vs Following, #300 and #304): the selected marchers' moves ending on the
 * playhead's count are deleted, so they follow from earlier there, and the later pages that
 * followed the deleted spot keep their spots with a move of the marcher's own where the first of
 * them begins (Set as shown with `at`, as Only Page N writes it), an ordinary move whose end is a
 * keyframe in turn. One undo step.
 *
 * The show: home, page 1 [1, 9), page 2 [9, 17), page 3 [17, 25), page 4 [25, 33); beat ids equal
 * their ordinals. Marchers `a` and `b` move on page 2 and hold on pages 3 and 4; `c` never moves.
 */

afterEach(() => stopTimelineResolver());

const UP: XY = [100, 100];
const UP2: XY = [200, 100];
const ELSEWHERE: XY = [400, 400];
const PAGE2 = { start: 9, end: 17 };
const PAGE3 = { start: 17, end: 25 };
const ranged = ({ start, end }: { start: number; end: number }) => ({
    start,
    end,
});

const TABLES = [
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
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

/** Where `marcherId` stands on each page's flag, home first. */
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

const unset = async (
    db: DbConnection,
    beat: number,
    marcherIds: number[],
    tidyShared = false,
    keepLaterPages = true,
) => {
    const result = await unsetMarchersAt({
        db,
        beat,
        marcherIds,
        tidyShared,
        keepLaterPages,
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
        await pageBoxStatesOnPageBoxes({
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
    return { a: a!, b: b!, c: c! };
};

describeDbTests("Remove keyframe", (it) => {
    it("the marchers follow from earlier on the count, and later pages keep their spots", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const [homeA] = await atFlags(db, a);
        const [homeB] = await atFlags(db, b);

        const result = await unset(db, PAGE2.end, [a, b]);
        expect(result.unset).toEqual([a, b].sort((x, y) => x - y));

        // Page 2 follows page 1 (home) now; pages 3 and 4 stand where they did
        expect(await atFlags(db, a)).toEqual([homeA, homeA, homeA, UP, UP]);
        expect(await atFlags(db, b)).toEqual([homeB, homeB, homeB, UP2, UP2]);
        // No move of theirs ends on page 2's flag; page 3 holds an ordinary move of their own
        const rows = await db.select().from(schema.timeline_assignments).all();
        expect(rows.filter((r) => r.end_beat === PAGE2.end)).toEqual([]);
        expect(await stateOn(db, PAGE3, a)).toBe("own");
        expect(await stateOn(db, PAGE3, b)).toBe("own");
    });

    it("the stay's end is a keyframe, and removing it moves the stay on a page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        const [homeA] = await atFlags(db, a);
        await unset(db, PAGE2.end, [a]);

        const setBeats = () => marcherSetBeats(resolverSpans(resolver(), a));
        expect(setBeats()).toContain(PAGE3.end);

        expect((await unset(db, PAGE3.end, [a])).unset).toEqual([a]);
        expect(await atFlags(db, a)).toEqual([homeA, homeA, homeA, homeA, UP]);
        expect(setBeats()).not.toContain(PAGE3.end);
        expect(setBeats()).toContain(PAGE3.end + 8);
    });

    it("a move that goes nowhere is a keyframe: no invisible pin (holds question 15, #468)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        const NUDGED: XY = [120, 100];
        const NUDGED_AGAIN: XY = [140, 100];
        const reads = () => {
            const setBeats = marcherSetBeats(resolverSpans(resolver(), a));
            return {
                keyframes: selectionKeyframes([setBeats], [a]).map(
                    (k) => k.beat,
                ),
                following: followingAt(new Map([[a, setBeats]]), PAGE3.end),
                canUnset: unsetMenuStateAt({
                    resolver: resolver(),
                    boxes: [],
                    marcherIds: [a],
                    beat: PAGE3.end,
                    isPlaying: false,
                }).canUnset,
            };
        };

        // 1–2. a holds through page 3, and page 3 follows a nudge on page 2
        await move(db, PAGE2, [{ marcherId: a, xy: NUDGED }]);
        expect((await atFlags(db, a))[3]).toEqual(NUDGED);
        expect(reads().keyframes).not.toContain(PAGE3.end);
        // 3. Remove keyframe on page 2 writes a move on page 3, to where a stood
        await unset(db, PAGE2.end, [a]);
        expect((await atFlags(db, a))[3]).toEqual(NUDGED);
        expect(reads().keyframes).toContain(PAGE3.end);
        // 4. Page 2 onto exactly that spot: page 3's move now goes nowhere, and is still a keyframe
        await move(db, PAGE2, [{ marcherId: a, xy: NUDGED }]);
        const flags = await atFlags(db, a);
        expect(flags[3]).toEqual(flags[2]);
        const pinned = reads();
        expect(pinned.keyframes).toContain(PAGE3.end);
        expect(pinned.following.has(a)).toBe(false);
        expect(pinned.canUnset).toBe(true);

        // Remove keyframe takes it back, and page 3 follows page 2 again
        expect(
            (await unsetHere([a], { beat: PAGE3.end, database: db })).unset,
        ).toEqual([a]);
        await timelineResolverSettled();
        const removed = reads();
        expect(removed.keyframes).not.toContain(PAGE3.end);
        expect(removed.following.has(a)).toBe(true);
        expect(removed.canUnset).toBe(false);
        // 5. The next nudge on page 2 carries into page 3
        await move(db, PAGE2, [{ marcherId: a, xy: NUDGED_AGAIN }]);
        expect((await atFlags(db, a))[3]).toEqual(NUDGED_AGAIN);
    });

    it("skips marchers with no move ending on the count, and writes nothing when none has one", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, c } = await show(db);
        const result = await unset(db, PAGE2.end, [a, c]);
        expect(result.unset).toEqual([a]);
        const [homeC] = await atFlags(db, c);
        expect(await atFlags(db, c)).toEqual([
            homeC,
            homeC,
            homeC,
            homeC,
            homeC,
        ]);

        const rows = await snapshot(db);
        const groups = await undoGroups(db);
        const none = await unset(db, PAGE2.end, [c]);
        expect(none.unset).toEqual([]);
        expect(await snapshot(db)).toEqual(rows);
        expect(await undoGroups(db)).toBe(groups);
    });

    it("writes no stay move where a later page has a move of its own", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await move(db, PAGE3, [{ marcherId: b, xy: ELSEWHERE }]);
        const [homeB] = await atFlags(db, b);

        await unset(db, PAGE2.end, [a, b]);
        expect(await atFlags(db, b)).toEqual([
            homeB,
            homeB,
            homeB,
            ELSEWHERE,
            ELSEWHERE,
        ]);
        expect(await stateOn(db, PAGE3, b)).toBe("own");
        expect(await stateOn(db, PAGE3, a)).toBe("own");
    });

    it("is one undo step, and undo and redo restore it exactly", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const before = await snapshot(db);
        const groups = await undoGroups(db);
        await unset(db, PAGE2.end, [a, b]);
        const after = await snapshot(db);
        expect(await undoGroups(db)).toBe(groups + 1);

        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
        await timelineResolverSettled();
        expect((await atFlags(db, a)).slice(2)).toEqual([UP, UP, UP]);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(after);
    });

    it("leaves a shared move's slot vacant, or with tidyShared (Basic) takes it out", async ({
        db,
        marchersAndPages: _,
    }) => {
        // A converted show: each page's move is one transition the marchers share (C-11)
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const rows = await db.select().from(schema.timeline_assignments).all();
        const transitions = await db
            .select()
            .from(schema.timeline_transitions)
            .all();
        const shared = transitions.find(
            (t) =>
                t.slot_count > 2 &&
                rows.filter((r) => r.transition_id === t.id).length ===
                    t.slot_count,
        )!;
        const [first, second] = rows.filter(
            (r) => r.transition_id === shared.id,
        );
        const slotCount = async () =>
            (await db.select().from(schema.timeline_transitions).all()).find(
                (t) => t.id === shared.id,
            )?.slot_count;

        await unset(db, first!.end_beat, [first!.marcher_id]);
        expect(await slotCount(), "Expert leaves the slot vacant").toBe(
            shared.slot_count,
        );
        await unset(db, second!.end_beat, [second!.marcher_id], true);
        expect(await slotCount(), "Basic takes the slot out").toBe(
            shared.slot_count - 1,
        );
    });
});

describeDbTests(
    "Unset here from the app: the Set marchers at the playhead",
    (it) => {
        const playheadAt = (beat: number) =>
            useTimelineSelectionStore.setState({
                playheadBeat: beat,
                cursorBeat: null,
            });

        it("takes back only the selected marchers Set on the count, and nobody on the first page", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c } = await show(db);
            // a moves on page 3; b and c hold there
            await move(db, PAGE3, [{ marcherId: a, xy: ELSEWHERE }]);
            await timelineResolverSettled();
            const rows = await snapshot(db);

            playheadAt(0);
            expect(
                (await unsetHere([a, b, c], { database: db })).unset,
            ).toEqual([]);
            playheadAt(PAGE3.end);
            expect((await unsetHere([b, c], { database: db })).unset).toEqual(
                [],
            );
            expect(await snapshot(db)).toEqual(rows);

            expect(
                (await unsetHere([a, b, c], { database: db })).unset,
            ).toEqual([a]);
            await timelineResolverSettled();
            expect((await atFlags(db, a))[3]).toEqual(UP);
            expect((await atFlags(db, b))[3]).toEqual(UP2);
        });
    },
);

describeDbTests("Unset here and on Pages N–M", (it) => {
    const unsetAll = (db: DbConnection, beat: number, marcherIds: number[]) =>
        unset(db, beat, marcherIds, false, false);

    it("the later pages that followed the spot follow back to the earlier one", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const [homeA] = await atFlags(db, a);
        const [homeB] = await atFlags(db, b);

        const result = await unsetAll(db, PAGE2.end, [a, b]);
        expect(result.unset).toEqual([a, b].sort((x, y) => x - y));
        expect(await atFlags(db, a)).toEqual([
            homeA,
            homeA,
            homeA,
            homeA,
            homeA,
        ]);
        expect(await atFlags(db, b)).toEqual([
            homeB,
            homeB,
            homeB,
            homeB,
            homeB,
        ]);
    });

    it("leaves pages from the next move of their own on", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await move(db, PAGE3, [{ marcherId: b, xy: ELSEWHERE }]);
        const [homeA] = await atFlags(db, a);
        const [homeB] = await atFlags(db, b);

        await unsetAll(db, PAGE2.end, [a, b]);
        expect(await atFlags(db, a)).toEqual([
            homeA,
            homeA,
            homeA,
            homeA,
            homeA,
        ]);
        expect(await atFlags(db, b)).toEqual([
            homeB,
            homeB,
            homeB,
            ELSEWHERE,
            ELSEWHERE,
        ]);
    });

    it("is one undo step, and undo and redo restore it exactly", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const before = await snapshot(db);
        const groups = await undoGroups(db);
        await unsetAll(db, PAGE2.end, [a, b]);
        const after = await snapshot(db);
        expect(await undoGroups(db)).toBe(groups + 1);

        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
        await timelineResolverSettled();
        expect((await atFlags(db, a)).slice(2)).toEqual([UP, UP, UP]);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(after);
    });
});

describeDbTests(
    "Unset here and on Pages N–M from the app: the pages that follow",
    (it) => {
        const BOXES = [
            { start: 1, end: 9, name: "1" },
            { ...PAGE2, name: "2" },
            { ...PAGE3, name: "3" },
            { start: 25, end: 33, name: "4" },
        ];
        const playheadAt = (beat: number) =>
            useTimelineSelectionStore.setState({
                playheadBeat: beat,
                cursorBeat: null,
                pageBoxes: BOXES,
            });
        const following = (marcherIds: number[]) =>
            unsetFollowingPages({
                resolver: resolver(),
                marcherIds,
                beat: useTimelineSelectionStore.getState().playheadBeat,
                boxes: BOXES,
            });

        it("names the pages that follow the Set marchers' spot, up to their next move", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c } = await show(db);
            playheadAt(PAGE2.end);
            expect(following([a, b, c])).toEqual(["3", "4"]);
            await move(db, PAGE3, [{ marcherId: b, xy: ELSEWHERE }]);
            expect(following([b])).toBeNull();
            expect(following([a, b])).toEqual(["3", "4"]);
            await move(db, { start: 25, end: 33 }, [
                { marcherId: a, xy: ELSEWHERE },
            ]);
            expect(following([a])).toEqual(["3"]);
            playheadAt(0);
            expect(following([a, b, c])).toBeNull();
        });

        it("names none mid-page when the marchers move again before the page's flag", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await show(db);
            // a is Set on count 13 and moves on to page 2's flag, which pages 3–4 follow
            await move(db, { start: PAGE2.start, end: 13 }, [
                { marcherId: a, xy: ELSEWHERE },
            ]);
            playheadAt(13);
            expect(following([a])).toBeNull();
            playheadAt(PAGE2.end);
            expect(following([a])).toEqual(["3", "4"]);
        });

        it("a diamond's menu offers what applies at its count, and nothing while playing", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, c } = await show(db);
            const at = (beat: number, isPlaying = false) =>
                unsetMenuStateAt({
                    resolver: resolver(),
                    marcherIds: [a, c],
                    beat,
                    boxes: BOXES,
                    isPlaying,
                });
            expect(at(PAGE2.end)).toEqual({
                canUnset: true,
                followingLabel: "Remove keyframe, Pages 3–4 move back too",
                // Hovering it lights the Set marchers' bars on exactly those pages (#477)
                followingLight: {
                    byMarcher: new Map([[a, [PAGE3, ranged(BOXES[3]!)]]]),
                },
            });
            expect(at(PAGE3.end)).toEqual({
                canUnset: false,
                followingLabel: null,
                followingLight: null,
            });
            expect(at(PAGE2.end, true)).toEqual({
                canUnset: false,
                followingLabel: null,
                followingLight: null,
            });
        });

        it("lights each marcher's bars only on the pages it follows back on", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            // Page 5 [33, 41): b moves on page 4 and stands still on 5, at its own spot
            await createLastPage({ db, newPageCounts: 8 });
            await timelineResolverSettled();
            const PAGE4 = { start: 25, end: 33 };
            const PAGE5 = { start: 33, end: 41 };
            await move(db, PAGE4, [{ marcherId: b, xy: ELSEWHERE }]);
            const state = unsetMenuStateAt({
                resolver: resolver(),
                marcherIds: [a, b],
                beat: PAGE2.end,
                boxes: [...BOXES, { ...PAGE5, name: "5" }],
                isPlaying: false,
            });
            expect(state.followingLabel).toBe(
                "Remove keyframe, Pages 3–5 move back too",
            );
            // b follows back on page 3 only: its page 5 stays where its own move put it
            expect(state.followingLight).toEqual({
                byMarcher: new Map([
                    [a, [PAGE3, PAGE4, PAGE5]],
                    [b, [PAGE3]],
                ]),
            });
        });

        it("names none where the next page is set as shown", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await show(db);
            await setAsShownOnPage({ db, pageBox: PAGE3, marcherIds: [a] });
            await timelineResolverSettled();
            playheadAt(PAGE2.end);
            expect(following([a])).toBeNull();
        });

        it("takes back the Set marchers' spot and lets the following pages follow back", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c } = await show(db);
            const [homeA] = await atFlags(db, a);
            playheadAt(PAGE2.end);
            expect(
                (await unsetHereAndFollowing([a, c], { database: db })).unset,
            ).toEqual([a]);
            await timelineResolverSettled();
            expect(await atFlags(db, a)).toEqual([
                homeA,
                homeA,
                homeA,
                homeA,
                homeA,
            ]);
            expect((await atFlags(db, b)).slice(2)).toEqual([UP2, UP2, UP2]);
        });
    },
);

describeDbTests(
    "Unset from a keyframe diamond: at the diamond's count, not the playhead",
    (it) => {
        const playheadAt = (beat: number) =>
            useTimelineSelectionStore.setState({
                playheadBeat: beat,
                cursorBeat: null,
            });

        it("Unset here takes back the spot on the given count and leaves the playhead", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c } = await show(db);
            playheadAt(PAGE3.end);
            expect(
                (await unsetHere([a, c], { database: db, beat: PAGE2.end }))
                    .unset,
            ).toEqual([a]);
            await timelineResolverSettled();
            const [homeA] = await atFlags(db, a);
            expect((await atFlags(db, a)).slice(1)).toEqual([
                homeA,
                homeA,
                UP,
                UP,
            ]);
            expect((await atFlags(db, b)).slice(2)).toEqual([UP2, UP2, UP2]);
            expect(useTimelineSelectionStore.getState().playheadBeat).toBe(
                PAGE3.end,
            );
        });

        it("Unset here and on Pages N–M lets the following pages follow back from the given count", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await show(db);
            const [homeA] = await atFlags(db, a);
            playheadAt(0);
            expect(
                (
                    await unsetHereAndFollowing([a], {
                        database: db,
                        beat: PAGE2.end,
                    })
                ).unset,
            ).toEqual([a]);
            await timelineResolverSettled();
            expect(await atFlags(db, a)).toEqual([
                homeA,
                homeA,
                homeA,
                homeA,
                homeA,
            ]);
            expect(useTimelineSelectionStore.getState().playheadBeat).toBe(0);
        });
    },
);
