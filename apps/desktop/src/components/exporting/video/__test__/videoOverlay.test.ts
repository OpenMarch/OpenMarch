import { describe, expect, it } from "vitest";
import {
    buildOverlaySegments,
    formatClock,
    OverlayOptions,
    OverlayTimeline,
} from "../videoOverlay";
import Page from "@/global/classes/Page";
import Measure from "@/global/classes/Measure";
import Beat from "@/global/classes/Beat";

const beat = (timestamp: number, duration = 1): Beat =>
    ({ timestamp, duration }) as Beat;

const page = (
    name: string,
    timestamp: number,
    duration: number,
    beats: Beat[],
): Page => ({ name, timestamp, duration, beats, counts: beats.length }) as Page;

const measure = (
    number: number,
    timestamp: number,
    rehearsalMark: string | null,
): Measure => ({ number, timestamp, rehearsalMark }) as Measure;

/**
 * Show fixture: 6 seconds, 1 beat per second.
 * Set 1 (start) -> Set 2 over [0, 4) -> Set 2A over [4, 6)
 * Measures of 2 counts each; rehearsal mark "A" at m1, "B" at m3.
 */
const pages = [
    page("1", 0, 0, [beat(0)]),
    page("2", 0, 4, [beat(0), beat(1), beat(2), beat(3)]),
    page("2A", 4, 2, [beat(4), beat(5)]),
];
const measures = [measure(1, 0, "A"), measure(2, 2, null), measure(3, 4, "B")];

describe("OverlayTimeline", () => {
    it("reports the first transition at time 0", () => {
        const state = new OverlayTimeline(pages, measures).getState(0);

        expect(state.previousSetName).toBe("1");
        expect(state.setName).toBe("2");
        expect(state.count).toBe(1);
        expect(state.totalCounts).toBe(4);
        expect(state.measureNumber).toBe(1);
        expect(state.rehearsalMark).toBe("A");
        expect(state.tempoBpm).toBe(60);
        expect(state.totalSeconds).toBe(6);
    });

    it("advances counts and carries the last rehearsal mark forward", () => {
        const timeline = new OverlayTimeline(pages, measures);
        const state = timeline.getState(2.5);

        expect(state.setName).toBe("2");
        expect(state.count).toBe(3);
        expect(state.measureNumber).toBe(2);
        // No mark on m2; section "A" is still active
        expect(state.rehearsalMark).toBe("A");
    });

    it("rolls into the next page and rehearsal mark at the boundary", () => {
        const timeline = new OverlayTimeline(pages, measures);
        const state = timeline.getState(4);

        expect(state.previousSetName).toBe("2");
        expect(state.setName).toBe("2A");
        expect(state.count).toBe(1);
        expect(state.totalCounts).toBe(2);
        expect(state.measureNumber).toBe(3);
        expect(state.rehearsalMark).toBe("B");
    });

    it("tracks state correctly over monotonically increasing queries", () => {
        const timeline = new OverlayTimeline(pages, measures);
        const sets = [0, 1, 2, 3, 4, 5].map(
            (t) => timeline.getState(t).setName,
        );
        expect(sets).toEqual(["2", "2", "2", "2", "2A", "2A"]);

        const counts = [0, 1, 2, 3, 4, 5].map(
            (t) => new OverlayTimeline(pages, measures).getState(t).count,
        );
        expect(counts).toEqual([1, 2, 3, 4, 1, 2]);
    });

    it("omits measure info when there are no measures", () => {
        const state = new OverlayTimeline(pages, []).getState(1);

        expect(state.measureNumber).toBeNull();
        expect(state.rehearsalMark).toBeNull();
    });
});

describe("buildOverlaySegments", () => {
    const allOptions: OverlayOptions = {
        showSet: true,
        showCounts: true,
        showMeasures: true,
        showTempo: true,
        showClock: true,
        setLabel: "Set",
        countLabel: "Count",
    };

    it("builds every segment in display order", () => {
        const state = new OverlayTimeline(pages, measures).getState(2.5);
        const segments = buildOverlaySegments(state, allOptions);

        expect(segments.map((s) => s.text)).toEqual([
            "Set 1 → 2",
            "Count 3 / 4",
            "[A]  m. 2",
            "60 bpm",
            "0:02 / 0:06",
        ]);
        expect(segments.map((s) => s.bold)).toEqual([
            true,
            true,
            false,
            false,
            false,
        ]);
    });

    it("omits disabled and unavailable items", () => {
        const state = new OverlayTimeline(pages, []).getState(0);
        const segments = buildOverlaySegments(state, {
            ...allOptions,
            showCounts: false,
            showClock: false,
        });

        // Counts and clock are off; measure info is unavailable
        expect(segments.map((s) => s.text)).toEqual(["Set 1 → 2", "60 bpm"]);
    });
});

describe("formatClock", () => {
    it("formats seconds as m:ss", () => {
        expect(formatClock(0)).toBe("0:00");
        expect(formatClock(65)).toBe("1:05");
        expect(formatClock(599.9)).toBe("9:59");
        expect(formatClock(3600)).toBe("60:00");
    });
});
