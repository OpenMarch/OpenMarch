import { beforeEach, describe, expect, it } from "vitest";
import { clientXToBeat } from "@/components/timeline/TimelineGeometry";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { seekTimeline } from "../timelineTransport";

/**
 * Scrubbing while paused (ui.md UI-12 review): one seek per whole beat the scrub passes, and the
 * pointer reaches the end of the show, where the playhead may rest (UI-11).
 */

/** Beats 0..16 of 0.5 s; the end of the show is beat 17 */
const BEATS = Array.from({ length: 17 }, (_, i) => ({
    timestamp: i * 0.5,
    duration: 0.5,
}));
const store = () => useTimelineSelectionStore.getState();
const paused = { isPlaying: false, setIsPlaying: () => {} };

beforeEach(() => {
    store().reset();
    store().setShowEndBeat(17);
    store().setPageBoxes([
        { start: 1, end: 9 },
        { start: 9, end: 17 },
    ]);
});

describe("scrubbing while paused", () => {
    it("seeks once per whole beat, skipping moves within the beat it is on", () => {
        const revision = store().playheadRevision;
        seekTimeline(BEATS, 5, "press", paused);
        seekTimeline(BEATS, 5.2, "drag", paused);
        seekTimeline(BEATS, 4.6, "drag", paused);
        expect(store().playheadRevision).toBe(revision + 1);
        seekTimeline(BEATS, 6, "drag", paused);
        expect(store().playheadBeat).toBe(6);
        expect(store().playheadRevision).toBe(revision + 2);
        // The release always lands, even on the beat the scrub is on
        seekTimeline(BEATS, 6, "end", paused);
        expect(store().playheadRevision).toBe(revision + 3);
        // A new gesture starts afresh
        seekTimeline(BEATS, 6, "press", paused);
        expect(store().playheadRevision).toBe(revision + 4);
        seekTimeline(BEATS, 6, "end", paused);
    });

    it("keeps an unpinned start flag until the scrub ends, then moves it once", () => {
        store().selectRange(1, 9);
        seekTimeline(BEATS, 9, "press", paused);
        seekTimeline(BEATS, 12, "drag", paused);
        seekTimeline(BEATS, 15, "drag", paused);
        expect(store().startBeat).toBe(1);
        expect(store().startPinned).toBe(false);
        seekTimeline(BEATS, 15, "end", paused);
        expect(store().startBeat).toBe(9);
        expect(store().scrubbing).toBe(false);
        // A click without a gesture moves it at once
        seekTimeline(BEATS, 4, undefined, paused);
        expect(store().startBeat).toBe(1);
    });

    it("seeks without a gesture every time", () => {
        const revision = store().playheadRevision;
        seekTimeline(BEATS, 5, undefined, paused);
        seekTimeline(BEATS, 5, undefined, paused);
        expect(store().playheadRevision).toBe(revision + 2);
    });

    it("reaches the end of the show from the timeline surface", () => {
        expect(
            clientXToBeat({
                clientX: 1000,
                surfaceLeft: 0,
                pixelsPerBeat: 10,
                startBeat: 0,
                beatCount: 17,
            }),
        ).toBe(17);
    });
});
