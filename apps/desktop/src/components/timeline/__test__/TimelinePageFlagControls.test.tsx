import {
    cleanup,
    fireEvent,
    render,
    renderHook,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { Timeline, type TimelineInput } from "../Timeline";
import {
    selectAddedPage,
    selectionAfterDeleteWithMoves,
    selectionAfterFlagDelete,
    timelinesOffPages,
    useHeldWhileStale,
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

const view = ({
    positionBeat = 5,
    isPlaying = false,
    onAddPageFlag,
    onDeletePageFlag,
    onDeletePageWithMoves,
    onAddSubsetPage,
    onSetPageSubset,
    withAdd = true,
}: {
    positionBeat?: number;
    isPlaying?: boolean;
    onAddPageFlag?: () => void;
    onDeletePageFlag?: (pageId: number) => void;
    onDeletePageWithMoves?: (pageId: number) => void;
    onAddSubsetPage?: () => void;
    onSetPageSubset?: (pageId: number, subset: boolean) => void;
    withAdd?: boolean;
}) => (
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
        onDeletePageWithMoves={onDeletePageWithMoves}
        onAddSubsetPage={onAddSubsetPage}
        addPageNames={{ page: "3", subset: "2A" }}
        onSetPageSubset={onSetPageSubset}
    />
);

const show = (props: Parameters<typeof view>[0]) => render(view(props));

const playhead = () => screen.getByTestId("timeline-playhead");
const addPageMenu = () => screen.queryByTestId("timeline-add-page-flag-menu");

/** The text a sighted person sees: without the words a screen reader hears for a shortcut */
const shownText = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll(".sr-only").forEach((node) => node.remove());
    return copy.textContent;
};

describe("Create page at playhead on the paused playhead's right-click menu (UI-9)", () => {
    it("has no **+** beside the playhead: adding a page doesn't act on the range", () => {
        show({ onAddPageFlag: vi.fn(), onAddSubsetPage: vi.fn() });
        expect(screen.queryByTestId("timeline-add-page-flag")).toBeNull();
    });

    it("opens from a right-click on the playhead, and Create page at playhead adds a flag there", () => {
        const onAddPageFlag = vi.fn();
        show({ onAddPageFlag, onAddSubsetPage: vi.fn() });
        fireEvent.contextMenu(playhead());
        const names = screen.getAllByTestId("timeline-add-page-name");
        expect(names.map((n) => n.textContent)).toEqual(["3", "2A"]);
        const item = screen.getByTestId("timeline-add-page");
        // The action's label, name and shortcut
        expect(shownText(item)).toBe("Create page at playhead3F");
        fireEvent.click(item);
        expect(onAddPageFlag).toHaveBeenCalledTimes(1);
    });

    it("Create subset at playhead adds the subset page", () => {
        const onAddPageFlag = vi.fn();
        const onAddSubsetPage = vi.fn();
        show({ onAddPageFlag, onAddSubsetPage });
        fireEvent.contextMenu(playhead());
        const item = screen.getByTestId("timeline-add-subset-page");
        expect(shownText(item)).toBe("Create subset at playhead2AShift+F");
        fireEvent.click(item);
        expect(onAddSubsetPage).toHaveBeenCalledTimes(1);
        expect(onAddPageFlag).not.toHaveBeenCalled();
    });

    it("shows each entry's shortcut, as rebound in Settings", () => {
        useShortcutOverridesStore.setState({
            overrides: { timelineCreatePageAtPlayhead: ["Alt+N"] },
        });
        try {
            show({ onAddPageFlag: vi.fn(), onAddSubsetPage: vi.fn() });
            fireEvent.contextMenu(playhead());
            const shortcuts = screen.getAllByTestId(
                "timeline-add-page-shortcut",
            );
            expect(shortcuts.map(shownText)).toEqual(["Alt+N", "Shift+F"]);
        } finally {
            useShortcutOverridesStore.setState({ overrides: {} });
        }
    });

    it("keeps the range menu closed", () => {
        show({ onAddPageFlag: vi.fn(), onAddSubsetPage: vi.fn() });
        fireEvent.contextMenu(playhead());
        expect(addPageMenu()).not.toBeNull();
        expect(screen.queryByTestId("timeline-range-menu")).toBeNull();
    });

    it("offers only Create page at playhead without the subset command", () => {
        show({ onAddPageFlag: vi.fn() });
        fireEvent.contextMenu(playhead());
        expect(screen.getByTestId("timeline-add-page")).not.toBeNull();
        expect(screen.queryByTestId("timeline-add-subset-page")).toBeNull();
    });

    it("has no menu while playing, or where the owner offers none (on a flag)", () => {
        show({
            onAddPageFlag: vi.fn(),
            onAddSubsetPage: vi.fn(),
            isPlaying: true,
        });
        fireEvent.contextMenu(playhead());
        expect(addPageMenu()).toBeNull();
        cleanup();
        show({ onAddPageFlag: undefined });
        fireEvent.contextMenu(playhead());
        expect(addPageMenu()).toBeNull();
    });

    it("keeps the playhead button, and its focus, as the menu comes and goes", () => {
        // An arrow-key step onto a flag takes the menu away; a remount would drop focus, and the
        // next arrow would go to the page step instead of the playhead's beat step
        const { rerender } = show({ onAddPageFlag: vi.fn() });
        const button = playhead();
        button.focus();
        rerender(view({ onAddPageFlag: undefined }));
        expect(playhead()).toBe(button);
        expect(document.activeElement).toBe(button);
        rerender(view({ onAddPageFlag: vi.fn() }));
        expect(playhead()).toBe(button);
        expect(document.activeElement).toBe(button);
    });

    it("closes a menu left open when adding stops, and doesn't bring it back", () => {
        const { rerender } = show({ onAddPageFlag: vi.fn() });
        fireEvent.contextMenu(playhead());
        expect(addPageMenu()).not.toBeNull();
        rerender(view({ onAddPageFlag: undefined }));
        expect(addPageMenu()).toBeNull();
        rerender(view({ onAddPageFlag: vi.fn() }));
        expect(addPageMenu()).toBeNull();
    });

    it("selects the new page's range and moves the playhead to its flag", () => {
        selectAddedPage({ startBeat: 9, endBeat: 13 });
        const { selection, playheadBeat } =
            useTimelineSelectionStore.getState();
        expect(selection).toEqual({ kind: "range", start: 9, end: 13 });
        expect(playheadBeat).toBe(13);
    });
});

describe("Delete page on a page box (UI-9)", () => {
    it("deletes the right-clicked page's flag, by page id", () => {
        const onDeletePageFlag = vi.fn();
        show({ onDeletePageFlag });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        const item = screen.getByTestId("timeline-range-menu-delete-flag");
        expect(item.textContent).toBe("Delete page");
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

describe("Delete page and its moves on a page box (defined coordinates)", () => {
    it("comes right after Delete page, and deletes the right-clicked page", () => {
        const onDeletePageWithMoves = vi.fn();
        show({
            onDeletePageFlag: vi.fn(),
            onDeletePageWithMoves,
            withAdd: false,
        });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        expect(
            screen.getAllByRole("menuitem").map((item) => item.textContent),
        ).toEqual(["Delete page", "Delete page and its moves"]);
        fireEvent.click(
            screen.getByTestId("timeline-range-menu-delete-with-moves"),
        );
        expect(onDeletePageWithMoves).toHaveBeenCalledWith(3);
    });

    it("isn't offered on a clip, or without the command", () => {
        show({ onDeletePageFlag: vi.fn(), onDeletePageWithMoves: vi.fn() });
        fireEvent.contextMenu(screen.getByLabelText(/^A1 timeline/));
        expect(
            screen.queryByTestId("timeline-range-menu-delete-with-moves"),
        ).toBeNull();
        cleanup();
        show({ onDeletePageFlag: vi.fn() });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        expect(
            screen.queryByTestId("timeline-range-menu-delete-with-moves"),
        ).toBeNull();
    });
});

describe("the selection after Delete page and its moves (lead default)", () => {
    const range = (start: number, end: number) =>
        ({ kind: "range", start, end }) as const;
    const PAGES4 = [
        ...PAGES,
        page(4, "3", appBeats(24).slice(17, 25)),
    ] as Page[];

    it("the selected page: the previous page's box, now running to its flag", () => {
        // Pages "1" [1, 9), "2" [9, 17), "3" [17, 25)
        expect(selectionAfterDeleteWithMoves(PAGES4, 3, range(9, 17))).toEqual(
            range(1, 17),
        );
        expect(selectionAfterDeleteWithMoves(PAGES4, 4, range(17, 25))).toEqual(
            range(9, 25),
        );
    });

    it("the first page after home: the next page, which starts where it did", () => {
        expect(selectionAfterDeleteWithMoves(PAGES4, 2, range(1, 9))).toEqual(
            range(1, 17),
        );
        expect(
            selectionAfterDeleteWithMoves(PAGES.slice(0, 2), 2, range(1, 9)),
        ).toEqual({ kind: "home" });
    });

    it("leaves another selection alone", () => {
        expect(
            selectionAfterDeleteWithMoves(PAGES4, 3, range(1, 9)),
        ).toBeNull();
        expect(
            selectionAfterDeleteWithMoves(PAGES4, 3, { kind: "home" }),
        ).toBeNull();
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

    it("keeps the clip of a move split off a page's timeline: the box stands for the oldest (UI-25)", () => {
        const t = (
            linkId: number,
            startBeatIndex: number,
            endBeatIndex: number,
        ) => ({
            linkId,
            startBeatIndex,
            endBeatIndex,
        });
        expect(
            timelinesOffPages(
                [t(7, 9, 17), t(3, 9, 17), t(9, 9, 17), t(4, 1, 9)],
                PAGES,
            ),
        ).toEqual([t(7, 9, 17), t(9, 9, 17)]);
    });
});

describe("the page boxes the clips are matched against", () => {
    it("stay the ones the tracks were built with until the tracks catch up", () => {
        const { result, rerender } = renderHook(
            ({ pages, current }) => useHeldWhileStale(pages, current),
            { initialProps: { pages: "old", current: true } },
        );
        expect(result.current).toBe("old");
        // The tracks are reloading after a flag move; the new pages came first
        rerender({ pages: "new", current: false });
        expect(result.current).toBe("old");
        rerender({ pages: "new", current: true });
        expect(result.current).toBe("new");
        // An edit that leaves the tracks current (+, Delete flag) shows at once
        rerender({ pages: "newer", current: true });
        expect(result.current).toBe("newer");
    });
});

describe("The Subset switch on a page box (UI-9)", () => {
    it("flips the right-clicked page, by page id", () => {
        const onSetPageSubset = vi.fn();
        show({ onSetPageSubset, withAdd: false });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        const item = screen.getByTestId("timeline-range-menu-subset");
        expect(item.textContent).toBe("Subset");
        expect(item.getAttribute("role")).toBe("menuitemcheckbox");
        expect(item.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(item);
        expect(onSetPageSubset).toHaveBeenCalledWith(3, true);
    });

    it("shows a subset page switched on, and turns it off", () => {
        const onSetPageSubset = vi.fn();
        const subsetPages = PAGES.map((p) =>
            p.id === 3 ? ({ ...p, name: "1A", isSubset: true } as Page) : p,
        );
        render(
            <Timeline
                mode="expanded"
                beats={BEATS}
                pages={subsetPages}
                measures={[]}
                timelines={[clip]}
                showTransport={false}
                playback={{ positionBeat: 5, isPlaying: false }}
                selection={null}
                onSelectionChange={vi.fn()}
                onSetPageSubset={onSetPageSubset}
            />,
        );
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 1A" }));
        const item = screen.getByTestId("timeline-range-menu-subset");
        expect(item.textContent).toBe("Subset");
        expect(item.getAttribute("aria-checked")).toBe("true");
        fireEvent.click(item);
        expect(onSetPageSubset).toHaveBeenCalledWith(3, false);
    });

    it("isn't offered on a clip, or without the command", () => {
        show({ onSetPageSubset: vi.fn() });
        fireEvent.contextMenu(screen.getByLabelText(/^A1 timeline/));
        expect(screen.queryByTestId("timeline-range-menu-subset")).toBeNull();
        cleanup();
        show({});
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        expect(screen.queryByTestId("timeline-range-menu-subset")).toBeNull();
    });
});
