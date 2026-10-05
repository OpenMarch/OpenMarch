import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { Timeline, type TimelineInput } from "../Timeline";
import {
    selectAddedPage,
    selectionAfterFlagDelete,
    timelinesOffPages,
} from "../TimelineModePanel";

/**
 * UI-9 **+** and Deleting a flag on the timeline (P8.15 wires P8.13's writes): **+** shows just
 * after the paused playhead when the owner offers it, and a page box's right-click menu deletes
 * that page's flag. The new page becomes the selection.
 */

afterEach(cleanup);
beforeEach(() => useTimelineSelectionStore.getState().reset());

/** The zero-length beat 0, then `count` timed beats */
const appBeats = (count: number): Beat[] =>
    Array.from({ length: count + 1 }, (_, index) => ({
        id: index + 1,
        position: index,
        duration: index === 0 ? 0 : 0.5,
        includeInMeasure: true,
        notes: null,
        index,
        timestamp: index === 0 ? 0 : (index - 1) * 0.5,
    }));

const BEATS = appBeats(16);

const page = (id: number, name: string, beats: Beat[]): Page =>
    ({
        id,
        name,
        counts: id === 1 ? 0 : beats.length,
        notes: null,
        order: id - 1,
        nextPageId: id < 3 ? id + 1 : null,
        previousPageId: id === 1 ? null : id - 1,
        isSubset: false,
        duration: beats.length * 0.5,
        beats,
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: beats[0]!.timestamp,
    }) as unknown as Page;
const PAGES = [
    page(1, "0", [BEATS[0]!]),
    page(2, "1", BEATS.slice(1, 9)),
    page(3, "2", BEATS.slice(9, 17)),
];

const clip: TimelineInput = {
    id: "clip",
    linkId: 7,
    targetId: "clip",
    targetType: "marcher",
    label: "A1",
    color: "#2fc4b2",
    startBeatIndex: 3,
    endBeatIndex: 7,
    legs: [{ id: "leg", startBeatIndex: 3, endBeatIndex: 7, texture: "move" }],
    activitySpans: [{ startBeatIndex: 3, endBeatIndex: 7, active: true }],
};

const show = ({
    positionBeat = 5,
    isPlaying = false,
    onAddPageFlag,
    onDeletePageFlag,
    withAdd = true,
}: {
    positionBeat?: number;
    isPlaying?: boolean;
    onAddPageFlag?: () => void;
    onDeletePageFlag?: (pageId: number) => void;
    withAdd?: boolean;
}) =>
    render(
        <Timeline
            mode="expanded"
            beats={BEATS}
            pages={PAGES}
            measures={[]}
            timelines={[clip]}
            showTransport={false}
            playback={{ positionBeat, isPlaying }}
            selection={null}
            onSelectionChange={vi.fn()}
            addSelectedMarchers={withAdd ? { onAdd: vi.fn() } : undefined}
            onAddPageFlag={onAddPageFlag}
            onDeletePageFlag={onDeletePageFlag}
        />,
    );

const plus = () => screen.queryByTestId("timeline-add-page-flag");

describe("**+** at the paused playhead (UI-9)", () => {
    it("shows just after the playhead and adds a flag there", () => {
        const onAddPageFlag = vi.fn();
        show({ onAddPageFlag });
        const button = plus();
        expect(button).not.toBeNull();
        const playheadLeft = parseFloat(
            screen.getByTestId("timeline-playhead").style.left,
        );
        expect(parseFloat(button!.style.left)).toBeGreaterThan(playheadLeft);
        fireEvent.click(button!);
        expect(onAddPageFlag).toHaveBeenCalledTimes(1);
    });

    it("doesn't show while playing, or where the owner offers none (on a flag)", () => {
        show({ onAddPageFlag: vi.fn(), isPlaying: true });
        expect(plus()).toBeNull();
        cleanup();
        show({ onAddPageFlag: undefined });
        expect(plus()).toBeNull();
    });

    it("selects the new page's range and moves the playhead to its flag", () => {
        selectAddedPage({ startBeat: 9, endBeat: 13 });
        const { selection, playheadBeat } =
            useTimelineSelectionStore.getState();
        expect(selection).toEqual({ kind: "range", start: 9, end: 13 });
        expect(playheadBeat).toBe(13);
    });
});

describe("Delete page flag on a page box (UI-9)", () => {
    it("deletes the right-clicked page's flag, by page id", () => {
        const onDeletePageFlag = vi.fn();
        show({ onDeletePageFlag });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        const item = screen.getByTestId("timeline-range-menu-delete-flag");
        expect(item.textContent).toContain("Delete page flag");
        fireEvent.click(item);
        expect(onDeletePageFlag).toHaveBeenCalledWith(3);
    });

    it("isn't offered on a clip, or without the command", () => {
        show({ onDeletePageFlag: vi.fn() });
        fireEvent.contextMenu(screen.getByLabelText(/^A1 timeline/));
        expect(
            screen.queryByTestId("timeline-range-menu-delete-flag"),
        ).toBeNull();
        cleanup();
        show({});
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        expect(
            screen.queryByTestId("timeline-range-menu-delete-flag"),
        ).toBeNull();
    });

    it("is offered without Add selected marchers, which then isn't", () => {
        const onDeletePageFlag = vi.fn();
        show({ onDeletePageFlag, withAdd: false });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        expect(screen.getAllByRole("menuitem")).toHaveLength(1);
        fireEvent.click(screen.getByTestId("timeline-range-menu-delete-flag"));
        expect(onDeletePageFlag).toHaveBeenCalledWith(3);
        cleanup();
        // A clip has nothing to offer without the add
        show({ onDeletePageFlag, withAdd: false });
        fireEvent.contextMenu(screen.getByLabelText(/^A1 timeline/));
        expect(screen.queryByTestId("timeline-range-menu")).toBeNull();
    });
});

describe("the selection after deleting a flag (lead decision)", () => {
    // Page "1" (id 2) is [1, 9), page "2" (id 3, the last) is [9, 17)
    const range = (start: number, end: number) =>
        ({ kind: "range", start, end }) as const;

    it("deleting the selected page's flag selects the merged box", () => {
        expect(selectionAfterFlagDelete(PAGES, 2, range(1, 9))).toEqual(
            range(1, 17),
        );
    });

    it("deleting the selected last page's flag selects the previous page's box", () => {
        expect(selectionAfterFlagDelete(PAGES, 3, range(9, 17))).toEqual(
            range(1, 9),
        );
        // The previous page is home
        expect(
            selectionAfterFlagDelete(PAGES.slice(0, 2), 2, range(1, 9)),
        ).toEqual({ kind: "home" });
    });

    it("leaves another selection alone", () => {
        expect(selectionAfterFlagDelete(PAGES, 2, range(9, 17))).toBeNull();
        expect(selectionAfterFlagDelete(PAGES, 2, { kind: "home" })).toBeNull();
        expect(selectionAfterFlagDelete(PAGES, 1, { kind: "home" })).toBeNull();
    });
});

describe("clips only for timelines off the page boxes (UI-10)", () => {
    it("hides a timeline with exactly a page box's range, and keeps the others", () => {
        const t = (startBeatIndex: number, endBeatIndex: number) => ({
            startBeatIndex,
            endBeatIndex,
        });
        // Boxes for PAGES: [1, 9) and [9, 17)
        expect(
            timelinesOffPages(
                [t(1, 9), t(9, 17), t(9, 13), t(5, 9), t(1, 17)],
                PAGES,
            ),
        ).toEqual([t(9, 13), t(5, 9), t(1, 17)]);
        expect(timelinesOffPages([t(1, 9)], [])).toEqual([t(1, 9)]);
    });
});
