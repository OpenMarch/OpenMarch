import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { Timeline, TimelineWaveformProvider } from "../Timeline";
import type {
    TimelineAppendAtPlayhead,
    TimelineSelection,
} from "../TimelineViewModel";

/**
 * **+ Add N-Count Page** beside the paused playhead past the last page (UI-9): it adds the page
 * from the last flag to the playhead, and hovering it shades where that page goes.
 */

afterEach(cleanup);

// jsdom has no PointerEvent, so fireEvent's pointer events would lose clientX
if (typeof window.PointerEvent === "undefined") {
    class TestPointerEvent extends MouseEvent {
        readonly pointerId: number;
        readonly pointerType: string;
        constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
            this.pointerType = init.pointerType ?? "mouse";
        }
    }
    window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
}

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
// Page "2" ends at the last count: its flag is at view beat 16
const PAGES = [
    page(1, "0", [BEATS[0]!]),
    page(2, "1", BEATS.slice(1, 9)),
    page(3, "2", BEATS.slice(9, 17)),
];

const PX = 16;

const show = ({
    positionBeat = 21,
    isPlaying = false,
    appendAtPlayhead,
    selection = null,
    readOnly = false,
}: {
    positionBeat?: number;
    isPlaying?: boolean;
    appendAtPlayhead?: TimelineAppendAtPlayhead;
    selection?: TimelineSelection;
    readOnly?: boolean;
}) =>
    render(
        <TimelineWaveformProvider
            waveform={{
                peaksByBeat: Array.from({ length: 16 }, () => [0.5, 0.5]),
            }}
        >
            <Timeline
                mode="expanded"
                // Counts go on past the last page's flag (endless counts)
                beats={appBeats(32)}
                pages={PAGES}
                measures={[]}
                timelines={[]}
                showTransport={false}
                pixelsPerBeat={PX}
                playback={{ positionBeat, isPlaying }}
                selection={selection}
                onSelectionChange={vi.fn()}
                appendAtPlayhead={appendAtPlayhead}
                readOnly={readOnly}
            />
        </TimelineWaveformProvider>,
    );

// The playhead at spec beat 21 (view 20), four counts past the last flag (view 16)
const append = (
    onAppend = vi.fn(),
    onSubset = vi.fn(),
): TimelineAppendAtPlayhead => ({
    counts: 4,
    label: "Add 4-Count Page",
    title: "Add a page of 4 counts, from the last page to the playhead",
    onAppend,
    subset: {
        label: "Add 4-Count Subset",
        title: "Add a subset page of 4 counts, from the last page to the playhead",
        onAppend: onSubset,
    },
});

const button = () => screen.queryByTestId("timeline-append-at-playhead");
const preview = () => screen.queryByTestId("timeline-append-preview");

describe("+ Add N-Count Page at the playhead", () => {
    it("sits beside the playhead, says what it adds, and adds it", () => {
        const onAppend = vi.fn();
        show({ appendAtPlayhead: append(onAppend) });
        const found = screen.getByRole("button", {
            name: "Add a page of 4 counts, from the last page to the playhead",
        });
        expect(found.textContent).toContain("Add 4-Count Page");
        expect(parseFloat(found.parentElement!.style.left)).toBe(20 * PX);
        expect(found.className).toContain("left-8");
        fireEvent.click(found);
        expect(onAppend).toHaveBeenCalledTimes(1);
    });

    it("isn't there on a read-only timeline (Preview), though it's given one", () => {
        show({ appendAtPlayhead: append(), readOnly: true });
        expect(button()).toBeNull();
    });

    it("with Shift held reads Add N-Count Subset and adds a subset", () => {
        const onAppend = vi.fn();
        const onSubset = vi.fn();
        show({ appendAtPlayhead: append(onAppend, onSubset) });
        fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
        expect(button()!.textContent).toContain("Add 4-Count Subset");
        fireEvent.click(button()!, { shiftKey: true });
        expect(onSubset).toHaveBeenCalledTimes(1);
        expect(onAppend).not.toHaveBeenCalled();
        fireEvent.keyUp(window, { key: "Shift", shiftKey: false });
        expect(button()!.textContent).toContain("Add 4-Count Page");
        // Shift let go outside the window: leaving it lets go
        fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
        fireEvent.blur(window);
        expect(button()!.textContent).toContain("Add 4-Count Page");
        fireEvent.click(button()!);
        expect(onAppend).toHaveBeenCalledTimes(1);
    });

    it("shades from the last flag to the playhead while hovered or focused", () => {
        show({ appendAtPlayhead: append() });
        expect(preview()).toBeNull();
        fireEvent.pointerEnter(button()!);
        expect(parseFloat(preview()!.style.left)).toBe(16 * PX);
        expect(parseFloat(preview()!.style.width)).toBe(4 * PX);
        fireEvent.pointerLeave(button()!);
        expect(preview()).toBeNull();
        fireEvent.focus(button()!);
        expect(preview()).toBeTruthy();
        fireEvent.blur(button()!);
        expect(preview()).toBeNull();
    });

    it("doesn't shade when the window, from a start flag on the last flag, already does", () => {
        show({
            appendAtPlayhead: append(),
            selection: {
                kind: "range",
                range: { startBeatIndex: 17, endBeatIndex: 21 },
            },
        });
        fireEvent.pointerEnter(button()!);
        expect(preview()).toBeNull();
        cleanup();
        // The start flag elsewhere: the window isn't the new page
        show({
            appendAtPlayhead: append(),
            selection: {
                kind: "range",
                range: { startBeatIndex: 9, endBeatIndex: 21 },
            },
        });
        fireEvent.pointerEnter(button()!);
        expect(preview()).toBeTruthy();
    });

    it("goes on the playhead's left where it wouldn't fit before the visible right edge", () => {
        // jsdom lays nothing out: put every box's left past every box's right
        const rect = vi
            .spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockReturnValue({ left: 400, right: 300, width: 300 } as DOMRect);
        try {
            show({ appendAtPlayhead: append() });
            expect(button()!.className).toContain("right-8");
        } finally {
            rect.mockRestore();
        }
    });

    it("doesn't show while playing, or without the command", () => {
        show({ appendAtPlayhead: append(), isPlaying: true });
        expect(button()).toBeNull();
        cleanup();
        show({});
        expect(button()).toBeNull();
    });
});
