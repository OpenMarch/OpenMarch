import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { Toaster } from "sonner";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { readShowTiming } from "@/timeline/showTiming";
import { convertPagesToTimeline } from "@/test/convertPages";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import { renameTimeline } from "@/db-functions/timelineCommands";
import { readStoredTimelineMemberships } from "@/timeline/useTimelineSelectionHost";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { pageFlags } from "@/timeline/timelinePlayhead";
import {
    createMoveCommands,
    moveAtPlayhead,
    splitAtPlayheadBlocker,
} from "../useTimelineCommands";

/**
 * UI-14 review: a move's commands on a real database. A repeated Delete deletes once and says
 * nothing about the second; a rename of a move deleted meanwhile is skipped quietly; the delete
 * toast's Undo closes on the next history change, so it can only undo that delete.
 */

// Only the error toast is replaced, to count refusals; the writes are real
vi.mock("@/timeline/timelineErrorMessages", () => ({
    toastTimelineError: vi.fn(),
}));

keepFixturesInPageMode("its tests convert the show themselves");

beforeAll(() => {
    // sonner reads the color scheme
    window.matchMedia ??= ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
    vi.mocked(toastTimelineError).mockReset();
    useTimelineSelectionStore.getState().reset();
});
afterEach(cleanup);

/** A mid-page move of marchers 5 and 6 on page 4, loaded into the store; returns its id */
const makeMove = async (db: DbConnection) => {
    await convertPagesToTimeline(db);
    const { pages } = await readShowTiming(db);
    const sorted = [...pages].sort((a, b) => a.order - b.order);
    const end = pageEndBeat(sorted[2]!) + 3;
    await moveMarchersInTarget({
        db,
        target: { kind: "range", start: pageEndBeat(sorted[2]!), end },
        moves: [
            { marcherId: 5, x: 200, y: 210 },
            { marcherId: 6, x: 220, y: 230 },
        ],
    });
    const store = useTimelineSelectionStore.getState();
    store.setPageBoxes(
        pageFlags(sorted).flatMap((f) => (f.range ? [f.range] : [])),
    );
    store.setStoredTimelines(await readStoredTimelineMemberships(db));
    return (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.end_beat, end))
        .get())!.id;
};

const count = async (db: DbConnection, id: number) =>
    (
        await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.id, id))
            .all()
    ).length;

const commands = (db: DbConnection, undo = vi.fn()) =>
    createMoveCommands({
        database: db,
        undo,
        selectMarchers: async () => {},
    });

describeDbTests("a move's commands (UI-14 review)", (it) => {
    it("a repeated Delete deletes once, with no error for the repeats", async ({
        db,
        marchersAndPages: _,
    }) => {
        const id = await makeMove(db);
        const moves = commands(db);
        await Promise.all([
            moves.deleteMove(id),
            moves.deleteMove(id),
            moves.deleteMove(id),
        ]);
        expect(await count(db, id)).toBe(0);
        // The store hasn't reloaded yet: it still lists the move
        await moves.deleteMove(id);
        expect(toastTimelineError).not.toHaveBeenCalled();
    });

    it("a rename of a move deleted meanwhile is skipped, with no error", async ({
        db,
        marchersAndPages: _,
    }) => {
        const id = await makeMove(db);
        const moves = commands(db);
        await moves.deleteMove(id);
        await moves.renameMove(id, "Company front");
        expect(toastTimelineError).not.toHaveBeenCalled();
        expect(await count(db, id)).toBe(0);
    });

    it("Split at playhead makes the move two that meet at the playhead, and selects the new one (UI-27)", async ({
        db,
        marchersAndPages: _,
    }) => {
        render(<Toaster />);
        const id = await makeMove(db);
        const move = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.id, id))
            .get())!;
        const store = useTimelineSelectionStore.getState();
        const timelineCount = async () =>
            (await db.select().from(schema.timelines).all()).length;
        const stored = await timelineCount();
        // The playhead on the move's end: nothing to split off
        store.selectRange(move.start_beat, move.end_beat);
        await commands(db).splitMoveAtPlayhead(id);
        expect(await timelineCount()).toBe(stored);
        expect(
            await screen.findByText(
                "Put the playhead inside the move to split it there.",
            ),
        ).toBeTruthy();

        // Inside it: two moves, the new one before the playhead is the window
        store.selectRange(move.start_beat, move.start_beat + 1);
        const undo = vi.fn();
        await act(() => commands(db, undo).splitMoveAtPlayhead(id));
        const timelines = await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.end_beat, move.end_beat))
            .all();
        expect(timelines).toMatchObject([
            { id, start_beat: move.start_beat + 1 },
        ]);
        const before = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.end_beat, move.start_beat + 1))
            .get())!;
        expect(before.start_beat).toBe(move.start_beat);
        expect(useTimelineSelectionStore.getState().selection).toEqual({
            kind: "range",
            start: move.start_beat,
            end: move.start_beat + 1,
        });
        expect(await screen.findByText(/^Split Move 1 at /)).toBeTruthy();
        const button = await screen.findByRole("button", { name: "Undo" });
        act(() => button.click());
        expect(undo).toHaveBeenCalledTimes(1);
        expect(toastTimelineError).not.toHaveBeenCalled();
    });

    it("the delete toast says what went, and its Undo runs the app's undo", async ({
        db,
        marchersAndPages: _,
    }) => {
        render(<Toaster />);
        const id = await makeMove(db);
        const undo = vi.fn();
        await act(() => commands(db, undo).deleteMove(id));
        const button = await screen.findByRole("button", { name: "Undo" });
        expect(screen.getByText("Deleted Move 1")).toBeTruthy();
        act(() => button.click());
        expect(undo).toHaveBeenCalledTimes(1);
    });

    it("the delete toast closes on the next edit, so its Undo can't undo that edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        render(<Toaster />);
        const id = await makeMove(db);
        const other = (await db.select().from(schema.timelines).all()).find(
            (t) => t.id !== id,
        )!;
        await act(() => commands(db).deleteMove(id));
        await screen.findByText("Deleted Move 1");
        await act(async () => {
            await renameTimeline({ db, timelineId: other.id, name: "Opener" });
        });
        await waitFor(() =>
            expect(screen.queryByText("Deleted Move 1")).toBeNull(),
        );
    });
    it("a repeated Split at playhead splits once, with no error for the repeat (UI-27)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const id = await makeMove(db);
        const move = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.id, id))
            .get())!;
        useTimelineSelectionStore
            .getState()
            .selectRange(move.start_beat, move.start_beat + 1);
        const timelineCount = async () =>
            (await db.select().from(schema.timelines).all()).length;
        const stored = await timelineCount();
        const moves = commands(db);
        await act(() =>
            Promise.all([
                moves.splitMoveAtPlayhead(id),
                moves.splitMoveAtPlayhead(id),
            ]),
        );
        expect(await timelineCount()).toBe(stored + 1);
        expect(toastTimelineError).not.toHaveBeenCalled();
    });

    it("⌘K splits the isolated move, or the one move the playhead is inside (UI-27)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const id = await makeMove(db);
        const store = useTimelineSelectionStore.getState();
        const move = store.storedTimelines!.find((t) => t.id === id)!;
        // Not isolated: the one move (not a page's) the playhead is inside
        store.selectRange(move.start, move.start + 1);
        expect(
            moveAtPlayhead(useTimelineSelectionStore.getState()),
        ).toMatchObject({ id });
        // On a page's flag inside no move: none
        store.selectRange(0, 1);
        expect(moveAtPlayhead(useTimelineSelectionStore.getState())).toMatch(
            /^No move crosses /,
        );
        // Isolated with P on its end: refused, never another move under P
        store.isolate(id);
        store.seek(move.end);
        expect(moveAtPlayhead(useTimelineSelectionStore.getState())).toBe(
            "Put the playhead inside the move you're editing to split it.",
        );
        store.seek(move.start + 1);
        expect(
            moveAtPlayhead(useTimelineSelectionStore.getState()),
        ).toMatchObject({ id });
    });
    it("⌘K splits a move split off a page's move, never the page's own (UI-25, UI-27)", () => {
        const page = {
            id: 1,
            start: 9,
            end: 17,
            marcherIds: new Set<number>(),
        };
        const off = { ...page, id: 2 };
        const state = {
            selection: { kind: "none" },
            storedTimelines: [page, off],
            isolation: null,
            pageBoxes: [{ start: 9, end: 17, label: "2" }],
            playheadBeat: 13,
        } as unknown as Parameters<typeof moveAtPlayhead>[0];
        expect(moveAtPlayhead(state)).toMatchObject({ id: 2 });
    });
    it("⌘K's and the field menu's Split at playhead is available exactly when it would split (#792 review)", () => {
        const move = {
            id: 2,
            start: 10,
            end: 16,
            marcherIds: new Set<number>(),
        };
        const at = (playheadBeat: number, trail = false) =>
            ({
                selection: { kind: "none" },
                storedTimelines: [{ ...move, trail }],
                isolation: null,
                pageBoxes: [
                    { start: 1, end: 9, label: "1" },
                    { start: 9, end: 17, label: "2" },
                ],
                playheadBeat,
            }) as unknown as Parameters<typeof moveAtPlayhead>[0];
        // Strictly inside a plain move: available
        expect(splitAtPlayheadBlocker(at(13), false)).toBeNull();
        // On the move's end, or its start: not available, with the reason the action would give
        for (const beat of [16, 10]) {
            const reason = splitAtPlayheadBlocker(at(beat), false);
            expect(reason).toEqual(expect.any(String));
            expect(reason).toBe(moveAtPlayhead(at(beat)));
        }
        // Inside a move whose line follows a trail: the trail's reason
        expect(splitAtPlayheadBlocker(at(13, true), false)).toMatch(
            /follows a trail/,
        );
        // Playing: the pause reason
        expect(splitAtPlayheadBlocker(at(13), true)).toMatch(/^Pause/);
    });
});
