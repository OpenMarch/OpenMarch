import { afterEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import type Page from "@/global/classes/Page";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "@/timeline/convert/writePageConversion";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    resolverSpans,
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { readVersionedTimelineViewTables } from "@/timeline/useTimelineTracks";
import { describeMoveClips } from "@/components/timeline/moveClipText";
import {
    autoMoveNumber,
    buildTimelineClipTracks,
    moveLabels,
    timelineColor,
    TIMELINE_TRACK_COLORS,
} from "@/timeline/timelineViewModel";
import { performRedo, performUndo } from "../history";
import { deleteTimeline } from "../timelineCommands";
import { moveMarchersInTarget } from "../timelineMoves";
import { readPageBoxes } from "../timelineMoveNames";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * UI-14 round-2 review: each move keeps its "Move N" and its color for life. The number is stored
 * as its name when it is made, so deletes, undo, redo and reload never renumber it, whatever ids
 * SQLite hands out; the color goes by the stored timeline's id.
 */

afterEach(() => stopTimelineResolver());

const setUp = async (db: DbConnection): Promise<Page[]> => {
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

/** Makes a move over the first `counts` beats of page `index`'s box, for one marcher */
const makeMove = async (
    db: DbConnection,
    pages: Page[],
    index: number,
    counts: number,
    marcherId = 5,
) => {
    const end = pageEndBeat(pages[index]!);
    const page = (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.end_beat, end))
        .get())!;
    const moveEnd = page.start_beat + counts;
    await moveMarchersInTarget({
        db,
        target: { kind: "range", start: page.start_beat, end: moveEnd },
        moves: [{ marcherId, x: 200 + counts, y: 210 }],
    });
    return (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.end_beat, moveEnd))
        .get())!;
};

/** Every move's label by id, as the clips show them */
const labels = async (db: DbConnection) => {
    const rows = await db
        .select()
        .from(schema.timelines)
        .orderBy(asc(schema.timelines.id))
        .all();
    return moveLabels(
        rows.map((r) => ({
            id: r.id,
            start: r.start_beat,
            end: r.end_beat,
            name: r.name,
        })),
        await readPageBoxes(db),
    );
};

describe("autoMoveNumber", () => {
    it("reads Move N, and nothing else", () => {
        expect(autoMoveNumber("Move 12")).toBe(12);
        expect(autoMoveNumber("Move 1b")).toBeNull();
        expect(autoMoveNumber("Brass move 2")).toBeNull();
        expect(autoMoveNumber(null)).toBeNull();
    });
});

describe("timelineColor", () => {
    it("goes by the stored timeline's id, not its place among the clips", () => {
        expect(timelineColor(1)).toBe(TIMELINE_TRACK_COLORS[0]);
        expect(timelineColor(2)).toBe(TIMELINE_TRACK_COLORS[1]);
        expect(timelineColor(1 + TIMELINE_TRACK_COLORS.length)).toBe(
            TIMELINE_TRACK_COLORS[0],
        );
    });
});

describeDbTests("a move's number (UI-14 round-2 review)", (it) => {
    it("is stored when the move is made, one more than the highest", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const first = await makeMove(db, pages, 2, 3);
        const second = await makeMove(db, pages, 3, 2, 6);
        expect(first.name).toBe("Move 1");
        expect(second.name).toBe("Move 2");
        // A page's own timeline stays unnamed: it isn't a move
        const pageTimeline = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.end_beat, pageEndBeat(pages[2]!)))
            .get())!;
        expect(pageTimeline.name).toBeNull();
    });

    it("survives deleting an earlier move, undo, redo and reading the file again", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const first = await makeMove(db, pages, 2, 3);
        const second = await makeMove(db, pages, 3, 2, 6);
        await deleteTimeline({ db, timelineId: first.id });
        expect((await labels(db)).get(second.id)).toBe("Move 2");

        expect((await performUndo(db)).success).toBe(true);
        expect((await labels(db)).get(first.id)).toBe("Move 1");
        expect((await labels(db)).get(second.id)).toBe("Move 2");

        expect((await performRedo(db)).success).toBe(true);
        expect((await labels(db)).get(second.id)).toBe("Move 2");

        // A new move after the delete never takes a number on screen
        const third = await makeMove(db, pages, 4, 2, 7);
        expect(third.name).toBe("Move 3");
        // Read again from the file: the same labels
        expect([...(await labels(db)).values()].sort()).toEqual([
            "Move 2",
            "Move 3",
        ]);
    });

    it("gives moves from before numbering the number they show, before a new one is made", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const a = await makeMove(db, pages, 2, 3);
        const b = await makeMove(db, pages, 3, 2, 6);
        // As a file from before the review stored them
        await db.update(schema.timelines).set({ name: null });
        expect((await labels(db)).get(a.id)).toBe("Move 1");
        expect((await labels(db)).get(b.id)).toBe("Move 2");

        const c = await makeMove(db, pages, 4, 2, 7);
        expect(c.name).toBe("Move 3");
        const named = await db
            .select({ id: schema.timelines.id, name: schema.timelines.name })
            .from(schema.timelines)
            .all();
        expect(named.find((r) => r.id === a.id)?.name).toBe("Move 1");
        expect(named.find((r) => r.id === b.id)?.name).toBe("Move 2");
        // The page timelines are still unnamed
        expect(named.filter((r) => r.name === null).length).toBe(
            pages.length - 1,
        );
    });
});

/** The clips as the timeline draws them, from the stored rows and the resolver */
const clipTracks = async (db: DbConnection) => {
    await timelineResolverSettled();
    const resolver = useTimelineResolverStore.getState().resolver!;
    const { tables } = await readVersionedTimelineViewTables(db);
    return buildTimelineClipTracks({
        tables,
        spansOf: (id) => resolverSpans(resolver, id),
        diagnostics: [],
    });
};

describeDbTests("a move's clip (UI-14 round-2 review)", (it) => {
    it("keeps its color when an earlier move is deleted", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const first = await makeMove(db, pages, 2, 3);
        const second = await makeMove(db, pages, 3, 2, 6);
        const before = (await clipTracks(db)).find(
            (t) => t.linkId === second.id,
        )!.color;
        expect(before).toBe(timelineColor(second.id));
        await deleteTimeline({ db, timelineId: first.id });
        expect(
            (await clipTracks(db)).find((t) => t.linkId === second.id)!.color,
        ).toBe(before);
    });

    it("says which move overrides it where it is dashed, in pages and counts", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const earlier = await makeMove(db, pages, 2, 3);
        // A newer move takes the same marcher over counts 2–4: it wins on counts 2–3
        await moveMarchersInTarget({
            db,
            target: {
                kind: "range",
                start: earlier.start_beat + 1,
                end: earlier.start_beat + 4,
            },
            moves: [{ marcherId: 5, x: 260, y: 230 }],
        });
        const later = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.start_beat, earlier.start_beat + 1))
            .get())!;
        const tracks = await clipTracks(db);
        const track = tracks.find((t) => t.linkId === earlier.id)!;
        expect(track.overriddenBy).toEqual([
            {
                timelineId: later.id,
                start: earlier.start_beat + 1,
                end: earlier.end_beat,
            },
        ]);
        const rows = await db.select().from(schema.timelines).all();
        const { clips, overridden } = describeMoveClips({
            clips: tracks.filter((t) => t.linkId === earlier.id),
            storedTimelines: rows.map((r) => ({
                id: r.id,
                start: r.start_beat,
                end: r.end_beat,
                name: r.name,
            })),
            pageBoxes: await readPageBoxes(db),
            pages,
        });
        const note = `Overridden by Move 2 on Page ${pages[2]!.name}, counts 2–3`;
        expect(clips[0]!.description).toBe(note);
        expect(clips[0]!.accessibleName).toBe(
            `Move 1, move, Page ${pages[2]!.name}, counts 1–3`,
        );
        expect(overridden.get(earlier.id)).toBe(note);
    });
});
