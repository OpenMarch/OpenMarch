import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import type { SelectionHolds } from "@/timeline/timelineHoldBars";
import type { TimelinePageMarker } from "../TimelineViewModel";
import {
    borrowedGroups,
    hoveredGroupAt,
    TimelineHoldBars,
} from "../TimelineHoldBars";
import { TIMELINE_PAGE_ROW_BOTTOM } from "../TimelineGeometry";

/**
 * A borrowed Held hold's bar (fork #474; holds 04-anchors "Display"): lighter and hatched, with a
 * chip naming the spot it holds, and a line back to that spot only on hover, while lit, or while
 * the selection ends inside it. Basic draws it as plain Held, naming the spot in its label.
 *
 * Pages flag at 8, 16, 24 and 32.
 */

const marker = (label: string, atBeat: number, endBeat: number) =>
    ({
        id: label,
        label,
        atBeat,
        endBeat,
        isInitial: label === "1",
    }) satisfies TimelinePageMarker;
const PAGES = [
    marker("1", 0, 0),
    marker("2", 0, 8),
    marker("3", 8, 16),
    marker("4", 16, 24),
    marker("5", 24, 32),
];

/** Page 2's spot held over page 5 [24, 32) */
const borrowed = (lit = false): SelectionHolds => ({
    bars: [
        {
            start: 8,
            end: 24,
            kind: "notDefined",
            shape: false,
            lit: false,
            marcherIds: [1],
            total: 1,
        },
        {
            start: 24,
            end: 32,
            kind: "held",
            shape: false,
            lit,
            borrowedFrom: 8,
            marcherIds: [1],
            total: 1,
        },
    ],
    departures: [],
});

const draw = (holds: SelectionHolds, selectedEnd: number | null = null) =>
    render(
        <div>
            <TimelineHoldBars
                holds={holds}
                pages={PAGES}
                pixelsPerBeat={10}
                selectedEnd={selectedEnd}
            />
        </div>,
    );

const bar = () => screen.getByTestId("timeline-held-bar-24-32");
const chip = () => screen.queryByTestId("timeline-borrowed-chip-24-32");
const line = () => screen.queryByTestId("timeline-borrowed-line-24-32");

beforeAll(async () => {
    await tolgee.run();
});
beforeEach(() => {
    useEditorModeStore.setState({ mode: "expert", loaded: true });
});
afterEach(cleanup);

describe("TimelineHoldBars: borrowed holds (#474)", () => {
    it("draws hatched, with a chip naming the spot it holds, and no line back at rest", () => {
        draw(borrowed());
        expect(bar().dataset.borrowed).toBe("true");
        expect(chip()?.textContent).toBe("Held · Page 2's spot");
        expect(bar().getAttribute("aria-label")).toBe(
            "Held · Page 5. Standing at Page 2's spot",
        );
        expect(line()).toBeNull();
    });

    it("shows the line back to the spot while lit", () => {
        draw(borrowed(true));
        expect(line()).not.toBeNull();
        // From page 2's flag to the hold's start, in pixels
        expect(line()!.style.left).toBe("80px");
        expect(line()!.style.width).toBe("160px");
    });

    it("shows the line back while the selected page ends inside the hold", () => {
        draw(borrowed(), 32);
        expect(line()).not.toBeNull();
    });

    it("in Basic, draws plain Held with the spot in its label only", () => {
        useEditorModeStore.setState({ mode: "basic", loaded: true });
        draw(borrowed(true));
        expect(bar().dataset.borrowed).toBeUndefined();
        expect(chip()).toBeNull();
        expect(line()).toBeNull();
        expect(bar().getAttribute("aria-label")).toBe(
            "Held · Page 5. Standing at Page 2's spot",
        );
    });

    it("an arrival hold draws plain Held, with no chip", () => {
        draw({
            bars: [{ ...borrowed().bars[1]!, borrowedFrom: undefined }],
            departures: [],
        });
        expect(bar().dataset.borrowed).toBeUndefined();
        expect(chip()).toBeNull();
        expect(bar().getAttribute("aria-label")).toBe("Held · Page 5");
    });
});

/** Two marchers Held over page 5, one borrowing page 2's spot and one page 3's */
const twoSources = (lit = false): SelectionHolds => {
    const [, held] = borrowed(lit).bars;
    return {
        bars: [
            held!,
            { ...held!, borrowedFrom: 16, marcherIds: [2], total: 2 },
        ].map((bar) => ({ ...bar, total: 2 })),
        departures: [],
    };
};

/** The pointer moves to `x`, `y` (jsdom's rects are all at 0, 0), and a frame passes */
const pointerAt = async (x: number, y: number, buttons = 0) => {
    await act(async () => {
        window.dispatchEvent(
            new MouseEvent("pointermove", {
                clientX: x,
                clientY: y,
                buttons,
            }),
        );
        await new Promise((resolve) => requestAnimationFrame(resolve));
    });
};

describe("TimelineHoldBars: borrowed holds from different pages over the same counts", () => {
    it("share one chip, which says the spots are borrowed without naming one", () => {
        draw(twoSources());
        expect(
            screen.getAllByTestId("timeline-borrowed-chip-24-32"),
        ).toHaveLength(1);
        expect(chip()?.textContent).toBe("Held · borrowed spots");
    });

    it("show no line back while lit or selected, so no one spot reads as the source", () => {
        draw(twoSources(true), 32);
        expect(screen.queryAllByTestId(/^timeline-borrowed-line-/)).toEqual([]);
    });

    it("show one line back per spot while hovered", async () => {
        draw(twoSources());
        await pointerAt(280, TIMELINE_PAGE_ROW_BOTTOM);
        expect(
            screen
                .getAllByTestId(/^timeline-borrowed-line-24-32-from-/)
                .map((el) => [el.style.left, el.style.width]),
        ).toEqual([
            ["80px", "160px"],
            ["160px", "80px"],
        ]);
    });
});

describe("TimelineHoldBars: hovering a borrowed bar", () => {
    it("shows its line back while the pointer is over its bar or chip, from the bars' counts", async () => {
        draw(borrowed());
        await pointerAt(250, TIMELINE_PAGE_ROW_BOTTOM);
        expect(line()).not.toBeNull();
        // Over the chip, above the bar
        await pointerAt(250, TIMELINE_PAGE_ROW_BOTTOM - 7);
        expect(line()).not.toBeNull();
        // Past the bar's end, or well above it
        await pointerAt(330, TIMELINE_PAGE_ROW_BOTTOM);
        expect(line()).toBeNull();
        await pointerAt(250, TIMELINE_PAGE_ROW_BOTTOM - 40);
        expect(line()).toBeNull();
    });

    it("isn't followed while a button is held (a field drag or a scrub)", async () => {
        draw(borrowed());
        await pointerAt(250, TIMELINE_PAGE_ROW_BOTTOM, 1);
        expect(line()).toBeNull();
    });
});

describe("borrowedGroups and hoveredGroupAt", () => {
    const bar = (start: number, end: number, from: number, lit = false) => ({
        start,
        end,
        kind: "held" as const,
        shape: false,
        lit,
        borrowedFrom: from,
        marcherIds: [1],
        total: 2,
    });

    it("groups borrowed bars by their start: the shortest end, each source once, lit if any is", () => {
        expect(
            borrowedGroups([
                bar(24, 32, 8),
                bar(40, 48, 8),
                bar(24, 28, 16, true),
                bar(24, 32, 8),
            ]).map(({ start, end, sources, lit }) => ({
                start,
                end,
                sources,
                lit,
            })),
        ).toEqual([
            { start: 24, end: 28, sources: [8, 16], lit: true },
            { start: 40, end: 48, sources: [8], lit: false },
        ]);
    });

    it("finds the group under a point, over any of its bars' counts", () => {
        const groups = borrowedGroups([bar(24, 32, 8), bar(24, 28, 16)]);
        const y = TIMELINE_PAGE_ROW_BOTTOM;
        expect(hoveredGroupAt(groups, 300, y, 10)).toBe(24);
        expect(hoveredGroupAt(groups, 239, y, 10)).toBeNull();
        expect(hoveredGroupAt(groups, 300, y + 6, 10)).toBeNull();
    });
});
