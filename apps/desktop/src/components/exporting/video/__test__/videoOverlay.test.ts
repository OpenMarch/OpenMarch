import { describe, expect, it } from "vitest";
import {
    buildOverlaySegments,
    computeFormatBounds,
    drawOverlay,
    formatClock,
    formatClockRange,
    OverlayOptions,
    OverlayTimeline,
    padInteger,
    padIntegerSpaced,
} from "../videoOverlay";
import { getVideoThemeColors } from "../videoTheme";
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
        expect(state.formatBounds).toEqual({
            countDigits: 1,
            measureDigits: 1,
            clockMinuteDigits: 1,
            tempoDigits: 3,
            setNumberDigits: 1,
            setSuffixChars: 1,
        });
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

describe("computeFormatBounds", () => {
    it("uses the widest count, measure, and clock fields in the show", () => {
        const longPages = [
            page("1", 0, 0, [beat(0)]),
            page(
                "2",
                0,
                16,
                Array.from({ length: 16 }, (_, i) => beat(i)),
            ),
        ];
        const longMeasures = [
            measure(1, 0, null),
            measure(12, 60, null),
            measure(123, 120, null),
        ];

        expect(computeFormatBounds(longPages, longMeasures, 3661)).toEqual({
            countDigits: 2,
            measureDigits: 3,
            clockMinuteDigits: 2,
            tempoDigits: 3,
            setNumberDigits: 1,
            setSuffixChars: 0,
        });
    });

    it("reserves space for subset page letters like 2A and 2B", () => {
        const subsetPages = [
            page("1", 0, 0, [beat(0)]),
            page("2", 0, 4, [beat(0), beat(1), beat(2), beat(3)]),
            page("2A", 4, 2, [beat(4), beat(5)]),
            page("2B", 6, 2, [beat(6), beat(7)]),
        ];

        expect(computeFormatBounds(subsetPages, [], 8)).toEqual({
            countDigits: 1,
            measureDigits: 1,
            clockMinuteDigits: 1,
            tempoDigits: 3,
            setNumberDigits: 1,
            setSuffixChars: 1,
        });
    });

    it("supports two-letter page suffixes when present", () => {
        const pagesWithLongSuffix = [
            page("1", 0, 0, [beat(0)]),
            page("12AB", 0, 2, [beat(0), beat(1)]),
        ];

        expect(computeFormatBounds(pagesWithLongSuffix, [], 2)).toEqual({
            countDigits: 1,
            measureDigits: 1,
            clockMinuteDigits: 1,
            tempoDigits: 3,
            setNumberDigits: 2,
            setSuffixChars: 2,
        });
    });

    it("defaults digit widths to 1 when pages and measures are empty", () => {
        expect(computeFormatBounds([], [], 0)).toEqual({
            countDigits: 1,
            measureDigits: 1,
            clockMinuteDigits: 1,
            tempoDigits: 3,
            setNumberDigits: 1,
            setSuffixChars: 0,
        });
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

    it("builds every segment in display order with padded numeric fields", () => {
        const state = new OverlayTimeline(pages, measures).getState(2.5);
        const segments = buildOverlaySegments(state, allOptions);

        expect(segments.map((s) => s.text)).toEqual([
            "Set 1 → 2",
            "Count 3 / 4",
            "[A]  m. 2",
            " 60 bpm",
            "0:02 / 0:06",
        ]);
        expect(segments.map((s) => s.bold)).toEqual([
            true,
            true,
            false,
            false,
            false,
        ]);
        expect(segments[0]?.layoutText).toBe("Set 8M → 8M");
        expect(segments[1]?.layoutText).toBe("Count 8 / 8");
        expect(segments[4]?.layoutText).toBe("8:88 / 8:88");
    });

    it("zero-pads counts when the show needs wider count fields", () => {
        const longPages = [
            page("1", 0, 0, [beat(0)]),
            page(
                "2",
                0,
                16,
                Array.from({ length: 16 }, (_, i) => beat(i)),
            ),
        ];
        const state = new OverlayTimeline(longPages, measures).getState(2.5);
        const segments = buildOverlaySegments(state, allOptions);

        expect(segments[1]?.text).toBe("Count 03 / 16");
        expect(segments[1]?.layoutText).toBe("Count 88 / 88");
    });

    it("uses stable layoutText for counts regardless of the current count", () => {
        const longPages = [
            page("1", 0, 0, [beat(0)]),
            page(
                "2",
                0,
                16,
                Array.from({ length: 16 }, (_, i) => beat(i)),
            ),
        ];
        const timeline = new OverlayTimeline(longPages, measures);
        const baseState = timeline.getState(0);
        const countSegment = (count: number) =>
            buildOverlaySegments({ ...baseState, count }, allOptions)[1];

        expect(countSegment(1)?.layoutText).toBe("Count 88 / 88");
        expect(countSegment(10)?.layoutText).toBe("Count 88 / 88");
    });

    it("uses stable layoutText for set names with and without subset letters", () => {
        const timeline = new OverlayTimeline(pages, measures);
        const transition = buildOverlaySegments(
            timeline.getState(2.5),
            allOptions,
        )[0];
        const subsetTransition = buildOverlaySegments(
            timeline.getState(4),
            allOptions,
        )[0];

        expect(transition?.text).toBe("Set 1 → 2");
        expect(subsetTransition?.text).toBe("Set 2 → 2A");
        expect(transition?.layoutText).toBe("Set 8M → 8M");
        expect(subsetTransition?.layoutText).toBe("Set 8M → 8M");
    });

    it("keeps the clock slash at a fixed position as elapsed time grows", () => {
        const clockOptions: OverlayOptions = {
            showSet: false,
            showCounts: false,
            showMeasures: false,
            showTempo: false,
            showClock: true,
            setLabel: "Set",
            countLabel: "Count",
        };
        const bounds = {
            countDigits: 1,
            measureDigits: 1,
            clockMinuteDigits: 2,
            tempoDigits: 3,
            setNumberDigits: 1,
            setSuffixChars: 0,
        };
        const early = buildOverlaySegments(
            {
                previousSetName: null,
                setName: "1",
                count: 1,
                totalCounts: 1,
                measureNumber: null,
                rehearsalMark: null,
                tempoBpm: null,
                timeSeconds: 62,
                totalSeconds: 605,
                formatBounds: bounds,
            },
            clockOptions,
        )[0]?.text;
        const late = buildOverlaySegments(
            {
                previousSetName: null,
                setName: "1",
                count: 1,
                totalCounts: 1,
                measureNumber: null,
                rehearsalMark: null,
                tempoBpm: null,
                timeSeconds: 602,
                totalSeconds: 605,
                formatBounds: bounds,
            },
            clockOptions,
        )[0]?.text;

        expect(early).toBe(" 1:02 / 10:05");
        expect(late).toBe("10:02 / 10:05");
        expect(early?.indexOf(" / ")).toBe(late?.indexOf(" / "));
    });

    it("omits disabled and unavailable items", () => {
        const state = new OverlayTimeline(pages, []).getState(0);
        const segments = buildOverlaySegments(state, {
            ...allOptions,
            showCounts: false,
            showClock: false,
        });

        // Counts and clock are off; measure info is unavailable
        expect(segments.map((s) => s.text)).toEqual(["Set 1 → 2", " 60 bpm"]);
    });
});

describe("formatClockRange", () => {
    it("right-aligns elapsed time so the slash stays put", () => {
        expect(formatClockRange(62, 605, 2)).toEqual({
            text: " 1:02 / 10:05",
            layoutText: "88:88 / 88:88",
        });
        expect(formatClockRange(602, 605, 2)).toEqual({
            text: "10:02 / 10:05",
            layoutText: "88:88 / 88:88",
        });
    });
});

describe("formatClock", () => {
    it("formats seconds as m:ss without minute padding by default", () => {
        expect(formatClock(0)).toBe("0:00");
        expect(formatClock(65)).toBe("1:05");
        expect(formatClock(599.9)).toBe("9:59");
        expect(formatClock(3600)).toBe("60:00");
    });

    it("space-pads minutes when a minute width is provided", () => {
        expect(formatClock(65, 2)).toBe(" 1:05");
        expect(formatClock(605, 2)).toBe("10:05");
        expect(formatClock(0, 1)).toBe("0:00");
    });
});

describe("padInteger helpers", () => {
    it("zero-pads integers", () => {
        expect(padInteger(3, 2)).toBe("03");
    });

    it("space-pads integers", () => {
        expect(padIntegerSpaced(60, 3)).toBe(" 60");
    });
});

describe("getVideoThemeColors", () => {
    it("returns light theme bg-1 and dark text tokens", () => {
        const light = getVideoThemeColors("light");

        expect(light.bg1).toBe("rgb(236, 235, 240)");
        expect(light.overlayText).toContain("32, 32, 32");
        expect(light.brandingLogoHex).toBe("#202020");
    });

    it("returns dark theme bg-1 and light text tokens", () => {
        const dark = getVideoThemeColors("dark");

        expect(dark.bg1).toBe("rgb(15, 14, 19)");
        expect(dark.overlayText).toContain("255, 255, 255");
        expect(dark.brandingLogoHex).toBe("#ffffff");
    });

    it("uses different overlay backgrounds per theme", () => {
        const light = getVideoThemeColors("light");
        const dark = getVideoThemeColors("dark");

        expect(light.overlayBg).not.toBe(dark.overlayBg);
        expect(light.brandingBg).not.toBe(dark.brandingBg);
    });
});

describe("drawOverlay theme", () => {
    const overlayOptions: OverlayOptions = {
        showSet: true,
        showCounts: true,
        showMeasures: false,
        showTempo: false,
        showClock: false,
        setLabel: "Set",
        countLabel: "Count",
    };

    it("uses theme-specific overlay background colors", () => {
        const state = new OverlayTimeline(pages, measures).getState(0);
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext("2d")!;

        const fillStyles: string[] = [];
        const originalFill = ctx.fill.bind(ctx);
        ctx.fill = (...args) => {
            fillStyles.push(ctx.fillStyle);
            return originalFill(...args);
        };

        drawOverlay(
            ctx,
            state,
            overlayOptions,
            { x: 0.02, y: 0.93, scale: 1, widthFraction: 0.75 },
            640,
            360,
            "light",
        );
        drawOverlay(
            ctx,
            state,
            overlayOptions,
            { x: 0.02, y: 0.93, scale: 1, widthFraction: 0.75 },
            640,
            360,
            "dark",
        );

        expect(fillStyles[0]).toContain("236, 235, 240");
        expect(fillStyles[1]).toContain("15, 14, 19");
        expect(fillStyles[0]).not.toBe(fillStyles[1]);
    });
});
