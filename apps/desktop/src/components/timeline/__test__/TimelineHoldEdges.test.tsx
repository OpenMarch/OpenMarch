import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { holdEdgeLimits, type HoldEdgeHandle } from "@/timeline/holdExtent";
import type { SelectionHolds } from "@/timeline/timelineHoldBars";
import type {
    TimelineHoldEdgesInput,
    TimelineSplitHoldMenu,
} from "@/timeline/useHoldExtent";
import { Timeline } from "../Timeline";

/**
 * The draggable ends of the Held bars (fork #475). The show: home, then pages "1" over spec beats
 * [1, 9) and "2" over [9, 17). The timeline hides the zero-length beat 0, so spec beat b is drawn
 * at view beat b - 1, 10px a beat here (jsdom puts the surface at x = 0).
 *
 * Marcher 7 is Held over spec [9, 13): it arrives at page 1's flag, and its next move starts at
 * 17, so the hold's end can go from 10 to 17.
 */

afterEach(cleanup);
beforeEach(() => useTimelineSelectionStore.getState().reset());

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

const BEATS = appBeats(24);

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

/** Marcher 7's hold's end at spec `end` */
const endAt = (end: number): HoldEdgeHandle => ({
    beat: end,
    marcherIds: [7],
    limits: holdEdgeLimits({
        mark: { start: 9, end },
        moves: [
            { start: 1, end: 9 },
            { start: 17, end: 20 },
        ],
        showEnd: 17,
    })!,
});

const END = endAt(13);

const HOLDS: SelectionHolds = {
    bars: [
        {
            kind: "held",
            start: 9,
            end: 13,
            shape: false,
            lit: false,
            marcherIds: [7],
            total: 1,
        },
    ],
    departures: [],
};

const show = ({
    isPlaying = false,
    splitHold,
}: { isPlaying?: boolean; splitHold?: TimelineSplitHoldMenu } = {}) => {
    const preview = vi.fn();
    const commit = vi.fn(async () => {});
    const holdEdges: TimelineHoldEdgesInput = {
        handles: [END],
        preview,
        commit,
    };
    render(
        <Timeline
            mode="expanded"
            beats={BEATS}
            pages={PAGES}
            measures={[]}
            timelines={[]}
            showTransport={false}
            pixelsPerBeat={10}
            playback={{ positionBeat: 3, isPlaying }}
            selection={null}
            onSelectionChange={vi.fn()}
            holds={HOLDS}
            holdEdges={holdEdges}
            {...(splitHold ? { splitHold } : {})}
        />,
    );
    return { preview, commit };
};

const handle = () => screen.queryByTestId("timeline-hold-end-12");

const pointer = (
    target: Element,
    type: string,
    clientX: number,
    altKey = false,
) =>
    fireEvent(
        target,
        new MouseEvent(type, { bubbles: true, button: 0, clientX, altKey }),
    );

const readout = () => screen.queryByTestId("timeline-hold-edge-readout");

const surfaceLeft = () =>
    screen.getByTestId("timeline-pointer-surface").getBoundingClientRect().left;

describe("Held bar edges", () => {
    it("put a handle on a Held bar's end, on the view axis, and none while playing", () => {
        show();
        expect(handle()).not.toBeNull();
        expect(handle()!.style.left).toBe("120px");
        expect(handle()!.getAttribute("aria-label")).toBe(
            "End of Held. Drag to leave earlier or hold longer",
        );
        cleanup();
        show({ isPlaying: true });
        expect(handle()).toBeNull();
    });

    it("drags the end: previews where it lands, says where, and writes once on release, in spec beats", async () => {
        const { preview, commit } = show();
        pointer(handle()!, "pointerdown", 120);
        pointer(handle()!, "pointermove", 141);
        // View 14 is spec 15: page 2's count 6
        expect(preview).toHaveBeenLastCalledWith({
            from: 13,
            to: 15,
            marcherIds: [7],
        });
        expect(readout()!.textContent).toBe("Held through Page 2, count 6");
        expect(handle()!.style.left).toBe("140px");
        await act(async () => {
            pointer(handle()!, "pointerup", 141);
        });
        expect(commit).toHaveBeenCalledTimes(1);
        expect(commit).toHaveBeenCalledWith({
            from: 13,
            to: 15,
            marcherIds: [7],
        });
        expect(readout()).toBeNull();
    });

    it("stops at the next move and says so", () => {
        const { preview } = show();
        pointer(handle()!, "pointerdown", 120);
        pointer(handle()!, "pointermove", 220);
        expect(preview).toHaveBeenLastCalledWith(
            expect.objectContaining({ to: 17 }),
        );
        expect(readout()!.textContent).toContain("Stops at the next move");
    });

    it("lands on a page line when near", () => {
        const { preview } = show();
        pointer(handle()!, "pointerdown", 120);
        // 7px short of page 2's line, at view 16
        pointer(handle()!, "pointermove", 153);
        expect(preview).toHaveBeenLastCalledWith(
            expect.objectContaining({ to: 17 }),
        );
    });

    it("Esc puts it back and writes nothing; a press that doesn't move isn't a drag", () => {
        const { preview, commit } = show();
        pointer(handle()!, "pointerdown", 120);
        pointer(handle()!, "pointermove", 150);
        fireEvent.keyDown(handle()!, { key: "Escape" });
        expect(preview).toHaveBeenLastCalledWith(null);
        pointer(handle()!, "pointerup", 150);
        expect(commit).not.toHaveBeenCalled();

        preview.mockClear();
        pointer(handle()!, "pointerdown", 120);
        pointer(handle()!, "pointermove", 122);
        pointer(handle()!, "pointerup", 122);
        expect(preview).not.toHaveBeenCalledWith(
            expect.objectContaining({ marcherIds: [7] }),
        );
        expect(commit).not.toHaveBeenCalled();
    });

    it("steps a focused handle one count with the arrow keys", async () => {
        const { commit } = show();
        await act(async () => {
            fireEvent.keyDown(handle()!, { key: "ArrowLeft" });
        });
        expect(commit).toHaveBeenCalledWith(
            expect.objectContaining({ from: 13, to: 12 }),
        );
    });

    it("keeps the focus on a stepped handle when the marks reload, and the next press steps on from there", async () => {
        const commit = vi.fn(async () => {});
        const timeline = (end: number) => (
            <Timeline
                mode="expanded"
                beats={BEATS}
                pages={PAGES}
                measures={[]}
                timelines={[]}
                showTransport={false}
                pixelsPerBeat={10}
                playback={{ positionBeat: 3, isPlaying: false }}
                selection={null}
                onSelectionChange={vi.fn()}
                holds={HOLDS}
                holdEdges={{
                    handles: [endAt(end)],
                    preview: vi.fn(),
                    commit,
                }}
            />
        );
        const { rerender } = render(timeline(13));
        handle()!.focus();
        await act(async () => {
            fireEvent.keyDown(handle()!, { key: "ArrowLeft" });
        });
        // The write landed and the marks reloaded: the edge is now at spec 12 (view 11)
        rerender(timeline(12));
        const moved = screen.getByTestId("timeline-hold-end-11");
        expect(document.activeElement).toBe(moved);
        await act(async () => {
            fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
        });
        expect(commit.mock.calls).toEqual([
            [expect.objectContaining({ from: 13, to: 12 })],
            [expect.objectContaining({ from: 12, to: 11 })],
        ]);
    });

    it("adds up quick presses that come before the marks reload", async () => {
        const { commit } = show();
        await act(async () => {
            fireEvent.keyDown(handle()!, { key: "ArrowLeft" });
            fireEvent.keyDown(handle()!, { key: "ArrowLeft" });
        });
        expect(commit.mock.calls).toEqual([
            [expect.objectContaining({ from: 13, to: 12 })],
            [expect.objectContaining({ from: 12, to: 11 })],
        ]);
    });
});

/**
 * jsdom lays nothing out: rects from each element's inline styles, offset by the pointer
 * surface's for what's inside it, so a pointer at view x is at `surfaceLeft() + x`.
 */
const layoutFromStyles = () =>
    vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
            const style = (this as HTMLElement).style;
            const px = (value: string | undefined) =>
                value && value.endsWith("px") ? Number.parseFloat(value) : 0;
            // Inside the surface, offset by where the surface is
            const surface = this.closest?.(
                '[data-testid="timeline-pointer-surface"]',
            ) as HTMLElement | null;
            const left =
                px(style?.left) +
                (surface && surface !== this ? px(surface.style.left) : 0);
            const width = px(style?.width);
            const height = px(style?.height);
            // A hold bar is centered on its top (`-translate-y-1/2`)
            const top =
                px(style?.top) -
                (this.hasAttribute("data-timeline-hold-bar") ? height / 2 : 0);
            return {
                left,
                top,
                width,
                height,
                right: left + width,
                bottom: top + height,
                x: left,
                y: top,
                toJSON: () => ({}),
            } as DOMRect;
        });

describe("Split hold here", () => {
    it("is on a Held bar's right-click at the count under the pointer, in spec beats", () => {
        const layout = layoutFromStyles();
        try {
            const onSplit = vi.fn();
            const offeredAt = vi.fn((beat: number) => beat > 9 && beat < 13);
            show({ splitHold: { offeredAt, onSplit } });
            const bar = screen.getByTestId("timeline-held-bar-8-12");
            const rect = bar.getBoundingClientRect();
            fireEvent.contextMenu(bar, {
                clientX: 100 + surfaceLeft(),
                clientY: rect.top + rect.height / 2,
            });
            const entry = screen.getByTestId("timeline-range-menu-split-hold");
            expect(entry.textContent).toBe("Split hold here");
            // View 10 is spec 11
            expect(offeredAt).toHaveBeenCalledWith(11);
            fireEvent.click(entry);
            expect(onSplit).toHaveBeenCalledWith(11);
        } finally {
            layout.mockRestore();
        }
    });

    it("isn't offered at a count the selected holds don't have inside them", () => {
        const layout = layoutFromStyles();
        try {
            show({
                splitHold: { offeredAt: () => false, onSplit: vi.fn() },
            });
            const bar = screen.getByTestId("timeline-held-bar-8-12");
            const rect = bar.getBoundingClientRect();
            fireEvent.contextMenu(bar, {
                clientX: 100 + surfaceLeft(),
                clientY: rect.top + rect.height / 2,
            });
            expect(
                screen.queryByTestId("timeline-range-menu-split-hold"),
            ).toBeNull();
        } finally {
            layout.mockRestore();
        }
    });
});
