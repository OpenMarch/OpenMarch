import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimelineFollow } from "../useTimelineFollow";
import type {
    TimelineBeatRange,
    TimelinePageMarker,
} from "../TimelineViewModel";

/**
 * The view following the playhead (UI-23), against a scroller that only keeps its scroll and a
 * hand-run frame clock. The rules themselves are in timelineFollow.test.ts.
 */

// Pages of 16 beats at 10px a beat: 160px each, so one fits the 500px view
const PAGES: TimelinePageMarker[] = [0, 16, 32, 48, 64, 80].map(
    (atBeat, i) => ({ id: i, label: String(i), atBeat, isInitial: false }),
);
const WIDTH = 500;

let clock = 0;
let queue: FrameRequestCallback[] = [];
let viewport: HTMLDivElement;
/** Something on the timeline to press, inside the scroller */
let content: HTMLDivElement;

const frames = (count: number) => {
    for (let i = 0; i < count; i++) {
        clock += 1000 / 60;
        const run = queue;
        queue = [];
        act(() => run.forEach((callback) => callback(clock)));
    }
};

beforeEach(() => {
    clock = 1000;
    queue = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        queue.push(callback);
        return queue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    viewport = document.createElement("div");
    let left = 0;
    Object.defineProperty(viewport, "scrollLeft", {
        get: () => left,
        set: (value: number) => {
            left = Math.max(0, value);
            viewport.dispatchEvent(new Event("scroll"));
        },
    });
    content = document.createElement("div");
    viewport.appendChild(content);
    document.body.appendChild(viewport);
});

afterEach(() => {
    viewport.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

type Props = {
    isPlaying: boolean;
    positionBeat: number;
    live: number | null;
    selectionRange: TimelineBeatRange | null;
    loop: TimelineBeatRange | null;
};

const setup = (initial: Partial<Props> = {}) => {
    const props: Props = {
        isPlaying: false,
        positionBeat: 0,
        live: null,
        selectionRange: null,
        loop: null,
        ...initial,
    };
    const ref = { current: viewport };
    const hook = renderHook(
        (p: Props) =>
            useTimelineFollow({
                viewportRef: ref,
                viewportWidth: WIDTH,
                contentWidth: 2000,
                pixelsPerBeat: 10,
                inset: 0,
                pages: PAGES,
                beatCount: 200,
                isPlaying: p.isPlaying,
                positionBeat: p.positionBeat,
                livePositionBeat: () => props.live,
                loop: p.loop,
                selectionRange: p.selectionRange,
            }),
        { initialProps: props },
    );
    const set = (next: Partial<Props>) => {
        Object.assign(props, next);
        hook.rerender({ ...props });
    };
    return { ...hook, props, set };
};

/** Plays from `from` to `to` beats, a little each frame, then lets a glide land */
const playTo = (
    harness: ReturnType<typeof setup>,
    from: number,
    to: number,
) => {
    for (let beat = from; beat <= to + 1e-9; beat += 0.25) {
        harness.props.live = beat;
        frames(1);
    }
};

describe("useTimelineFollow while playing", () => {
    it("lands a page that isn't in view with its flag 8% in, gliding", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 40 });
        frames(1);
        playTo(harness, 40, 48.5);
        // Gliding, not there yet
        expect(viewport.scrollLeft).toBeGreaterThan(0);
        expect(viewport.scrollLeft).toBeLessThan(440);
        frames(30);
        expect(viewport.scrollLeft).toBe(480 - 40);
    });

    it("doesn't move while the page stays in view", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 0 });
        playTo(harness, 0, 40);
        frames(30);
        expect(viewport.scrollLeft).toBe(0);
    });

    it("brings a playhead out of view in on Play, cutting when far", () => {
        const harness = setup({ positionBeat: 120 });
        // Stopped at 120 (1200px) with the view at 0: navigation would have revealed it, so put
        // the view back by hand, as a scroll would
        viewport.scrollLeft = 0;
        harness.set({ isPlaying: true, live: 120 });
        frames(1);
        expect(viewport.scrollLeft).toBe(1200 - 125);
    });

    it("pauses when a scroll leaves the playhead out of view, and resumes when it comes back", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 10 });
        frames(1);
        // Scroll ahead to look at page 5
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 600 }));
        viewport.scrollLeft = 600;
        frames(12);
        expect(harness.result.current.offscreen).toBe("left");
        // Crossing into page 2 doesn't pull the view back
        playTo(harness, 10, 20);
        frames(30);
        expect(viewport.scrollLeft).toBe(600);
        // The playhead walks into view at 600px (beat 60) and following takes over: page 5 starts
        // at 800px, past the view's 1100px edge... it ends past it, so it lands
        playTo(harness, 20, 80.5);
        frames(30);
        expect(harness.result.current.offscreen).toBeNull();
        expect(viewport.scrollLeft).toBe(800 - 40);
    });

    it("keeps following when a scroll leaves the playhead in view", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 30 });
        frames(1);
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }));
        viewport.scrollLeft = 100;
        frames(12);
        playTo(harness, 30, 48.5);
        frames(30);
        expect(viewport.scrollLeft).toBe(480 - 40);
    });

    it("waits for a pressed pointer to be released before gliding", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 46 });
        frames(1);
        content.dispatchEvent(
            new MouseEvent("pointerdown", {
                clientX: 10,
                clientY: 10,
                bubbles: true,
            }),
        );
        playTo(harness, 46, 48.5);
        frames(30);
        expect(viewport.scrollLeft).toBe(0);
        window.dispatchEvent(new MouseEvent("pointerup"));
        frames(30);
        expect(viewport.scrollLeft).toBe(480 - 40);
    });

    it("frames a loop that fits once, and holds still through its wraps", () => {
        const loop = { startBeatIndex: 64, endBeatIndex: 80 };
        const harness = setup({ loop });
        harness.set({ isPlaying: true, live: 64 });
        frames(30);
        const framed = viewport.scrollLeft;
        // 640-800px shown with the least move
        expect(framed).toBe(800 + 40 - 500);
        playTo(harness, 64, 79.75);
        harness.props.live = 64;
        frames(30);
        expect(viewport.scrollLeft).toBe(framed);
    });

    it("frames a loop that fits and holds still even where a page runs past the view", () => {
        // 400-580px; framed at 120 (580 + 40 - 500), the view is 120-620 and page 3 (480-640)
        // runs past it, which would otherwise land the page and trip the 85% backstop
        const loop = { startBeatIndex: 40, endBeatIndex: 58 };
        const harness = setup({ loop });
        harness.set({ isPlaying: true, live: 40 });
        frames(30);
        expect(viewport.scrollLeft).toBe(120);
        playTo(harness, 40, 57.75);
        harness.props.live = 40;
        frames(30);
        expect(viewport.scrollLeft).toBe(120);
    });

    it("resumes and brings the playhead in on navigation after a pause", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 10 });
        frames(1);
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 1500 }));
        viewport.scrollLeft = 1500;
        frames(12);
        expect(harness.result.current.offscreen).toBe("left");
        // E while playing: playback jumps to page 4's start (480px, out of view)
        harness.props.live = 48;
        frames(30);
        expect(viewport.scrollLeft).toBe(480 - 40);
        expect(harness.result.current.offscreen).toBeNull();
    });

    it("glides back on a short backward jump; only a loop's wrap always cuts", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 64 });
        frames(1);
        expect(viewport.scrollLeft).toBe(640 - 40);
        playTo(harness, 64, 66);
        // Q while playing: back to page 4 (480px), 160px behind the view
        harness.props.live = 48;
        frames(2);
        expect(viewport.scrollLeft).toBeGreaterThan(440);
        expect(viewport.scrollLeft).toBeLessThan(600);
        frames(30);
        expect(viewport.scrollLeft).toBe(440);
    });

    it("zooms about the playhead while following", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 20 });
        frames(1);
        expect(harness.result.current.zoomAnchor()).toEqual({
            anchorPx: 200,
            anchorBeat: 20,
        });
        harness.set({ isPlaying: false, live: null, positionBeat: 20 });
        expect(harness.result.current.zoomAnchor()).toBeNull();
    });
});

describe("useTimelineFollow while stopped", () => {
    it("brings the playhead's page into view on navigation, moving the least", () => {
        const harness = setup();
        harness.set({ positionBeat: 64 });
        frames(30);
        expect(viewport.scrollLeft).toBe(800 + 40 - 500);
    });

    it("puts the playhead at 25% when navigating into a page wider than the view", () => {
        const harness = setup();
        // Page 5 runs from beat 80 to the end (1200px)
        harness.set({ positionBeat: 120 });
        frames(30);
        expect(viewport.scrollLeft).toBe(1200 - 125);
    });

    it("brings the page's set into view when Play Page Once ends", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 75 });
        frames(1);
        // Looking a little ahead, the playhead still in view (750px in 700-1200)
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }));
        viewport.scrollLeft = 700;
        frames(12);
        // It ends and goes back to page 5's set at 640px, out of view
        harness.set({ isPlaying: false, live: null, positionBeat: 64 });
        // It looks once the stop has settled (300ms), then glides
        frames(12);
        expect(viewport.scrollLeft).toBe(700);
        frames(40);
        expect(viewport.scrollLeft).toBe(640 - 40);
    });

    it("leaves the view where it is when playing stops", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 10 });
        frames(1);
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 900 }));
        viewport.scrollLeft = 900;
        frames(12);
        harness.set({ isPlaying: false, live: null, positionBeat: 12 });
        frames(60);
        expect(viewport.scrollLeft).toBe(900);
        expect(harness.result.current.offscreen).toBe("left");
    });

    it("ignores the selection update that lands a few frames after a stop", () => {
        const harness = setup();
        harness.set({ isPlaying: true, live: 30 });
        frames(1);
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 200 }));
        viewport.scrollLeft = 200;
        frames(12);
        harness.set({ isPlaying: false, live: null, positionBeat: 30 });
        frames(5);
        // The store seeks where playing stopped and the window follows: [start flag, playhead]
        harness.set({
            selectionRange: { startBeatIndex: 0, endBeatIndex: 30 },
        });
        frames(30);
        expect(viewport.scrollLeft).toBe(200);
    });

    it("moves the least to show a page selected from outside the timeline", () => {
        const harness = setup();
        harness.set({
            selectionRange: { startBeatIndex: 48, endBeatIndex: 64 },
            positionBeat: 64,
        });
        frames(30);
        expect(viewport.scrollLeft).toBe(640 + 40 - 500);
    });

    it("doesn't move for a selection made with the pointer on the timeline", () => {
        const harness = setup();
        content.dispatchEvent(
            new MouseEvent("pointerdown", {
                clientX: 10,
                clientY: 10,
                bubbles: true,
            }),
        );
        window.dispatchEvent(new MouseEvent("pointerup"));
        harness.set({
            selectionRange: { startBeatIndex: 48, endBeatIndex: 64 },
            positionBeat: 64,
        });
        frames(30);
        expect(viewport.scrollLeft).toBe(0);
    });

    it("brings the playhead back from the chip", () => {
        const harness = setup({ positionBeat: 10 });
        act(() => {
            viewport.scrollLeft = 900;
        });
        expect(harness.result.current.offscreen).toBe("left");
        act(() => harness.result.current.revealPlayhead());
        frames(30);
        expect(viewport.scrollLeft).toBe(0);
        expect(harness.result.current.offscreen).toBeNull();
    });
});
