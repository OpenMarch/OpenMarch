import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { Toaster } from "sonner";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "@/timeline/convert/writePageConversion";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import { renameTimeline } from "@/db-functions/timelineCommands";
import { readStoredTimelineMemberships } from "@/timeline/useTimelineSelectionHost";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { pageFlags } from "@/timeline/timelinePlayhead";
import { createMoveCommands } from "../useTimelineCommands";

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
});
