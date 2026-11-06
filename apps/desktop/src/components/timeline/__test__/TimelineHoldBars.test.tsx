import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import type { SelectionHolds } from "@/timeline/timelineHoldBars";
import type { TimelinePageMarker } from "../TimelineViewModel";
import { TimelineHoldBars } from "../TimelineHoldBars";

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

const draw = (holds: SelectionHolds) =>
    render(
        <div>
            <TimelineHoldBars holds={holds} pages={PAGES} pixelsPerBeat={10} />
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
    useTimelineSelectionStore.getState().reset();
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
        useTimelineSelectionStore.getState().selectRange(24, 32);
        draw(borrowed());
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
