// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    FOLLOW_SETTLE_PX,
    followPageRanges,
    glideOrCut,
    landingScroll,
    playbackScroll,
    playheadOffscreen,
    revealPlayheadScroll,
    revealRangeScroll,
    stepGlide,
    type FollowView,
} from "../timelineFollow";
import type { TimelinePageMarker } from "../TimelineViewModel";

const page = (
    id: number,
    atBeat: number,
    extra: Partial<TimelinePageMarker> = {},
): TimelinePageMarker => ({
    id,
    label: String(id),
    atBeat,
    isInitial: false,
    ...extra,
});

// Pages of 16 beats; at 10px a beat a page is 160px, so it fits a 500px view
const pages = followPageRanges(
    [
        page(0, 0, { isInitial: true }),
        page(1, 0),
        page(2, 16),
        page(3, 32),
        page(4, 48),
        page(5, 64, { endBeat: 80 }),
    ],
    200,
);
const scale = { pixelsPerBeat: 10, inset: 0 };
const view = (left: number, width = 500): FollowView => ({
    left,
    width,
    contentWidth: 2000,
});

describe("followPageRanges", () => {
    it("orders the timed pages, the last ending at its own flag", () => {
        expect(pages).toEqual([
            { startBeatIndex: 0, endBeatIndex: 16 },
            { startBeatIndex: 16, endBeatIndex: 32 },
            { startBeatIndex: 32, endBeatIndex: 48 },
            { startBeatIndex: 48, endBeatIndex: 64 },
            { startBeatIndex: 64, endBeatIndex: 80 },
        ]);
    });
});

describe("playbackScroll", () => {
    it("doesn't move while the playhead stays in a page", () => {
        expect(
            playbackScroll({
                view: view(0),
                scale,
                pages,
                fromBeat: 3,
                toBeat: 3.2,
            }),
        ).toBeNull();
    });

    it("doesn't move when the playhead crosses into a page already in view", () => {
        expect(
            playbackScroll({
                view: view(0),
                scale,
                pages,
                fromBeat: 15.9,
                toBeat: 16.1,
            }),
        ).toBeNull();
    });

    it("lands a page that isn't fully in view with its flag 8% in from the left", () => {
        // Page 4 is 480-640px; the view shows 0-500
        expect(
            playbackScroll({
                view: view(0),
                scale,
                pages,
                fromBeat: 47.9,
                toBeat: 48.1,
            }),
        ).toBe(480 - 40);
    });

    it("glides a page wider than the view back once the playhead reaches 85%", () => {
        // 40px a beat: a page is 640px, wider than the 500px view
        const wide = { pixelsPerBeat: 40, inset: 0 };
        expect(
            playbackScroll({
                view: view(640),
                scale: wide,
                pages,
                fromBeat: 26.5,
                toBeat: 26.6,
            }),
        ).toBeNull();
        // 85% of the view is 640 + 425 = 1065px, beat 26.625
        expect(
            playbackScroll({
                view: view(640),
                scale: wide,
                pages,
                fromBeat: 26.6,
                toBeat: 26.7,
            }),
        ).toBeCloseTo(26.7 * 40 - 125);
    });

    it("doesn't use the 85% backstop when the page ends in view", () => {
        // Page 2 (160-320px) ends in the view 0-330; the playhead at 300 is past 85% (280)
        expect(
            playbackScroll({
                view: view(0, 330),
                scale,
                pages,
                fromBeat: 29.9,
                toBeat: 30,
            }),
        ).toBeNull();
    });

    it("stays inside the content", () => {
        // Page 5 is 640-800px; the content is only 900px wide, so the view can't start past 400
        expect(
            playbackScroll({
                view: { left: 200, width: 500, contentWidth: 900 },
                scale,
                pages,
                fromBeat: 63.9,
                toBeat: 64.1,
            }),
        ).toBe(400);
    });

    it("counts the initial page's inset", () => {
        expect(
            playbackScroll({
                view: view(0),
                scale: { pixelsPerBeat: 10, inset: 60 },
                pages,
                fromBeat: 47.9,
                toBeat: 48.1,
            }),
        ).toBe(60 + 480 - 40);
    });
});

describe("landingScroll", () => {
    it("lands the playhead's page with its flag at 8% when the page fits", () => {
        expect(landingScroll({ view: view(0), scale, pages, beat: 70 })).toBe(
            640 - 40,
        );
    });

    it("puts the playhead at 25% when its page is wider than the view", () => {
        const wide = { pixelsPerBeat: 40, inset: 0 };
        expect(
            landingScroll({ view: view(0), scale: wide, pages, beat: 40 }),
        ).toBe(1600 - 125);
    });

    it("puts the playhead at 25% past the last page", () => {
        expect(landingScroll({ view: view(0), scale, pages, beat: 150 })).toBe(
            1500 - 125,
        );
    });

    it("stays at the start of the show", () => {
        expect(landingScroll({ view: view(900), scale, pages, beat: 2 })).toBe(
            0,
        );
    });
});

describe("revealRangeScroll", () => {
    it("doesn't move when the range is in view", () => {
        expect(
            revealRangeScroll({ view: view(0), startX: 160, endX: 320 }),
        ).toBeNull();
    });

    it("moves the least to show a range off to the right, with a margin", () => {
        expect(
            revealRangeScroll({ view: view(0), startX: 480, endX: 640 }),
        ).toBe(640 + 40 - 500);
    });

    it("moves the least to show a range off to the left, with a margin", () => {
        expect(
            revealRangeScroll({ view: view(800), startX: 640, endX: 800 }),
        ).toBe(640 - 40);
    });

    it("shows the start of a range wider than the view", () => {
        expect(
            revealRangeScroll({ view: view(0), startX: 1000, endX: 1800 }),
        ).toBe(1000 - 40);
    });
});

describe("revealPlayheadScroll", () => {
    it("doesn't move when the playhead is in view", () => {
        expect(
            revealPlayheadScroll({ view: view(0), scale, pages, beat: 40 }),
        ).toBeNull();
    });

    it("moves the least to show the playhead's page when it fits", () => {
        expect(
            revealPlayheadScroll({ view: view(0), scale, pages, beat: 70 }),
        ).toBe(800 + 40 - 500);
        expect(
            revealPlayheadScroll({ view: view(900), scale, pages, beat: 20 }),
        ).toBe(160 - 40);
    });

    it("puts the playhead at 25% in a page wider than the view", () => {
        const wide = { pixelsPerBeat: 40, inset: 0 };
        expect(
            revealPlayheadScroll({
                view: view(0),
                scale: wide,
                pages,
                beat: 40,
            }),
        ).toBe(1600 - 125);
    });
});

describe("playheadOffscreen", () => {
    it("says which side the playhead is off", () => {
        expect(playheadOffscreen({ view: view(100), x: 50 })).toBe("left");
        expect(playheadOffscreen({ view: view(100), x: 300 })).toBeNull();
        expect(playheadOffscreen({ view: view(100), x: 700 })).toBe("right");
    });
});

describe("glideOrCut", () => {
    it("glides within a view's width and cuts past it", () => {
        expect(glideOrCut({ width: 500, from: 0, to: 400 })).toBe("glide");
        expect(glideOrCut({ width: 500, from: 0, to: 600 })).toBe("cut");
        expect(glideOrCut({ width: 500, from: 600, to: 0 })).toBe("cut");
    });

    it("cuts with reduced motion", () => {
        expect(
            glideOrCut({ width: 500, from: 0, to: 100, reducedMotion: true }),
        ).toBe("cut");
    });
});

describe("stepGlide", () => {
    const run = (dt: number, frames: number) => {
        let glide = { position: 0, velocity: 0, target: 400 };
        const positions: number[] = [];
        let settledAt = -1;
        for (let i = 0; i < frames; i++) {
            const next = stepGlide(glide, dt);
            positions.push(next.position);
            if (next.settled && settledAt < 0) settledAt = i;
            glide = { ...glide, ...next };
        }
        return { positions, settledAt };
    };

    it("settles in about a quarter second without overshooting", () => {
        const { positions, settledAt } = run(1 / 60, 60);
        expect(Math.max(...positions)).toBeLessThanOrEqual(400);
        // Most of the way there in 250ms, settled by 400ms
        expect(positions[14]).toBeGreaterThan(400 * 0.95);
        expect(settledAt).toBeGreaterThan(0);
        expect(settledAt).toBeLessThan(24);
        expect(positions[settledAt]).toBe(400);
    });

    it("moves every frame in the same direction", () => {
        const { positions } = run(1 / 60, 30);
        for (let i = 1; i < positions.length; i++)
            expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    });

    it("lands in the same place on slow frames", () => {
        const fast = run(1 / 120, 120).positions[59];
        const slow = run(1 / 30, 30).positions[14];
        expect(Math.abs(fast - slow)).toBeLessThan(FOLLOW_SETTLE_PX + 1);
    });

    it("keeps its speed when the target moves mid-glide", () => {
        let glide = { position: 0, velocity: 0, target: 400 };
        for (let i = 0; i < 6; i++)
            glide = { ...glide, ...stepGlide(glide, 1 / 60) };
        const speed = glide.velocity;
        const aimedAgain = stepGlide({ ...glide, target: 800 }, 1 / 60);
        expect(aimedAgain.velocity).toBeGreaterThan(speed * 0.8);
    });
});
