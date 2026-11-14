import { afterEach, describe, expect, it, vi } from "vitest";
import {
    attachTimelineGestures,
    fingerDragSlop,
    findTouchHit,
    isTouchContextMenu,
    TimelineGestures,
    timelineNavigation,
    timelineTouchRegion,
    type TimelineGestureEnv,
    type TimelineGestureEvent,
    type TimelineNavigationStep,
    type TimelineTouchRegion,
} from "../timelineGestures";
import {
    TIMELINE_RANGE_DRAG_PX,
    timelineDragSlop,
} from "../TimelinePrimitives";

describe("timelineTouchRegion", () => {
    it("gives a control its own press, wherever it is", () => {
        expect(
            timelineTouchRegion({
                onControl: true,
                offsetY: 5,
                headerHeight: 60,
            }),
        ).toBe("control");
        expect(
            timelineTouchRegion({
                onControl: true,
                offsetY: 200,
                headerHeight: 60,
            }),
        ).toBe("control");
    });

    it("scrubs on the bare ruler and page row, pans on bare track space", () => {
        expect(
            timelineTouchRegion({
                onControl: false,
                offsetY: 59,
                headerHeight: 60,
            }),
        ).toBe("ruler");
        expect(
            timelineTouchRegion({
                onControl: false,
                offsetY: 60,
                headerHeight: 60,
            }),
        ).toBe("body");
    });
});

describe("timelineNavigation", () => {
    const start = { scrollLeft: 100, scrollTop: 40, pixelsPerBeat: 10 };

    it("pans: the beat under the fingers stays under them, and the tracks scroll with them", () => {
        const step = timelineNavigation({
            start,
            from: { mid: { x: 200, y: 100 }, distance: null },
            current: { mid: { x: 150, y: 80 }, distance: null },
            leadingInset: 40,
        });
        // Beat (100 + 200 - 40) / 10 = 26 was under x 200; it's now under x 150
        expect(step.anchorBeat).toBe(26);
        expect(step.pixelsPerBeat).toBe(10);
        expect(step.scrollLeft).toBe(40 + 26 * 10 - 150);
        expect(step.scrollTop).toBe(60);
        expect(step.anchorPx).toBe(150);
    });

    it("pinches about the midpoint, within the limits", () => {
        const step = timelineNavigation({
            start,
            from: { mid: { x: 200, y: 100 }, distance: 100 },
            current: { mid: { x: 200, y: 100 }, distance: 200 },
            leadingInset: 40,
            clampZoom: (z) => Math.min(z, 15),
        });
        expect(step.pixelsPerBeat).toBe(15);
        // Beat 26 stays at x 200
        expect(40 + step.anchorBeat * 15 - step.scrollLeft).toBe(200);
    });

    it("keeps the zoom without a zoom seam, or with one finger", () => {
        expect(
            timelineNavigation({
                start,
                from: { mid: { x: 0, y: 0 }, distance: 100 },
                current: { mid: { x: 0, y: 0 }, distance: 300 },
                leadingInset: 0,
            }).pixelsPerBeat,
        ).toBe(10);
        expect(
            timelineNavigation({
                start,
                from: { mid: { x: 0, y: 0 }, distance: null },
                current: { mid: { x: 0, y: 0 }, distance: null },
                leadingInset: 0,
                clampZoom: (z) => z * 2,
            }).pixelsPerBeat,
        ).toBe(10);
    });
});

describe("timelineDragSlop", () => {
    it("keeps the mouse's threshold and widens a finger's", () => {
        expect(timelineDragSlop("mouse")).toBe(TIMELINE_RANGE_DRAG_PX);
        expect(timelineDragSlop("pen")).toBe(TIMELINE_RANGE_DRAG_PX);
        expect(timelineDragSlop("touch")).toBe(12);
    });

    it("never narrows a control's own threshold for a finger", () => {
        expect(fingerDragSlop("touch", 4)).toBe(12);
        expect(fingerDragSlop("touch", 20)).toBe(20);
        expect(fingerDragSlop("mouse", 6)).toBe(6);
        expect(fingerDragSlop("pen", 6)).toBe(6);
    });
});

/** A gesture adapter on a fake timeline whose viewport sits at the page's top left */
function setup(regions: (x: number, y: number) => TimelineTouchRegion) {
    const view = { scrollLeft: 0, scrollTop: 0, pixelsPerBeat: 10 };
    const navigate = vi.fn((step: TimelineNavigationStep) => {
        view.scrollLeft = step.scrollLeft;
        view.scrollTop = step.scrollTop;
        view.pixelsPerBeat = step.pixelsPerBeat;
    });
    const env = {
        region: (event: TimelineGestureEvent) =>
            regions(event.clientX, event.clientY),
        local: (x: number, y: number) => ({ x, y }),
        view: () => ({ ...view }),
        navigate,
        leadingInset: () => 0,
        clampZoom: (z: number) => Math.min(Math.max(z, 1), 100),
        tap: vi.fn(),
        cancelPress: vi.fn(),
    } satisfies TimelineGestureEnv;
    const gestures = new TimelineGestures(env);
    let t = 0;
    const send = (
        type: string,
        pointerId: number,
        clientX: number,
        clientY: number,
        pointerType = "touch",
    ) =>
        gestures.handle({
            type,
            pointerId,
            pointerType,
            clientX,
            clientY,
            timeStamp: (t += 16),
            target: null,
        });
    return { gestures, env, view, navigate, send };
}

describe("TimelineGestures", () => {
    it("never takes a mouse or pen press", () => {
        const { send, navigate, env } = setup(() => "body");
        for (const kind of ["mouse", "pen"]) {
            expect(send("pointerdown", 1, 100, 100, kind)).toBe(false);
            expect(send("pointermove", 1, 50, 100, kind)).toBe(false);
            expect(send("pointerup", 1, 50, 100, kind)).toBe(false);
        }
        expect(navigate).not.toHaveBeenCalled();
        expect(env.tap).not.toHaveBeenCalled();
    });

    it("pans with one finger on bare track space, from where it went down", () => {
        const { send, view } = setup(() => "body");
        view.scrollLeft = 300;
        expect(send("pointerdown", 1, 200, 150)).toBe(true);
        // Inside the tap slop: nothing moves yet
        expect(send("pointermove", 1, 195, 150)).toBe(true);
        expect(view.scrollLeft).toBe(300);
        // Past it, the view catches up with the whole drag
        expect(send("pointermove", 1, 180, 150)).toBe(true);
        expect(view.scrollLeft).toBe(320);
        send("pointermove", 1, 100, 130);
        expect(view.scrollLeft).toBe(400);
        expect(view.scrollTop).toBe(20);
        expect(send("pointerup", 1, 100, 130)).toBe(true);
    });

    it("seeks on a tap on bare track space, never on a pan", () => {
        const { send, env } = setup(() => "body");
        send("pointerdown", 1, 200, 150);
        send("pointermove", 1, 204, 151);
        send("pointerup", 1, 204, 151);
        expect(env.tap).toHaveBeenCalledTimes(1);
        expect(env.tap).toHaveBeenCalledWith(204);
        send("pointerdown", 2, 200, 150);
        send("pointermove", 2, 150, 150);
        send("pointerup", 2, 150, 150);
        expect(env.tap).toHaveBeenCalledTimes(1);
    });

    it.each(["control", "ruler"] as const)(
        "leaves a single finger on the %s to the timeline's own handlers",
        (region) => {
            const { send, navigate, env } = setup(() => region);
            expect(send("pointerdown", 1, 200, 20)).toBe(false);
            expect(send("pointermove", 1, 100, 20)).toBe(false);
            expect(send("pointerup", 1, 100, 20)).toBe(false);
            expect(navigate).not.toHaveBeenCalled();
            expect(env.tap).not.toHaveBeenCalled();
            expect(env.cancelPress).not.toHaveBeenCalled();
        },
    );

    it("cancels the first finger's drag when a second lands, then both fingers navigate", () => {
        const { send, navigate, env, view } = setup((_, y) =>
            y < 50 ? "ruler" : "control",
        );
        expect(send("pointerdown", 1, 200, 100)).toBe(false);
        expect(send("pointermove", 1, 230, 100)).toBe(false);
        // The second finger: the clip's drag is cancelled with its own down event
        expect(send("pointerdown", 2, 300, 100)).toBe(true);
        expect(env.cancelPress).toHaveBeenCalledTimes(1);
        expect(env.cancelPress.mock.calls[0][0]).toMatchObject({
            pointerId: 1,
            clientX: 200,
        });
        // From here every finger's events are the navigation's
        expect(send("pointermove", 1, 210, 100)).toBe(true);
        expect(send("pointermove", 2, 280, 100)).toBe(true);
        expect(navigate).toHaveBeenCalled();
        // Both moved 20 px left, the spread unchanged: panned 20 px at the same zoom
        expect(view.pixelsPerBeat).toBe(10);
        expect(view.scrollLeft).toBeCloseTo(20);
        expect(send("pointerup", 1, 210, 100)).toBe(true);
        // Down to one finger it keeps navigating, and never resumes the drag
        expect(send("pointermove", 2, 280, 100)).toBe(true);
        expect(send("pointerup", 2, 280, 100)).toBe(true);
        expect(env.cancelPress).toHaveBeenCalledTimes(1);
    });

    it("pinches with two fingers through the zoom seam", () => {
        const { send, view } = setup(() => "body");
        send("pointerdown", 1, 100, 100);
        send("pointerdown", 2, 200, 100);
        send("pointermove", 2, 300, 100);
        // Spread 100 → 200: twice the zoom
        expect(view.pixelsPerBeat).toBe(20);
        // The beat under the start midpoint (15) is under the new midpoint (200)
        expect(15 * view.pixelsPerBeat - view.scrollLeft).toBe(200);
    });

    it("doesn't cancel a panning finger's press, which moved nothing", () => {
        const { send, env } = setup(() => "body");
        send("pointerdown", 1, 100, 100);
        send("pointermove", 1, 60, 100);
        send("pointerdown", 2, 200, 100);
        expect(env.cancelPress).not.toHaveBeenCalled();
    });

    it("leaves a browser's cancel of a control's press to the control", () => {
        const { send, env } = setup(() => "control");
        send("pointerdown", 1, 100, 100);
        expect(send("pointercancel", 1, 100, 100)).toBe(false);
        expect(env.cancelPress).not.toHaveBeenCalled();
    });
});

describe("pinch zoom (tablet 3.2)", () => {
    /** The beat under client x `x` in the fake view (beat 0 at content x 0) */
    const beatAt = (
        view: { scrollLeft: number; pixelsPerBeat: number },
        x: number,
    ) => (view.scrollLeft + x) / view.pixelsPerBeat;

    /**
     * Two fingers either side of `mid`, `from` px apart, spread to `to` px apart in `steps`
     * moves of both fingers; `midTo` moves the midpoint along the way. Calls `each` after
     * every move with the midpoint and spread then.
     */
    function pinch(
        send: ReturnType<typeof setup>["send"],
        {
            mid,
            midTo = mid,
            from,
            to,
            steps = 20,
            vertical = false,
            each,
        }: {
            mid: { x: number; y: number };
            midTo?: { x: number; y: number };
            from: number;
            to: number;
            steps?: number;
            vertical?: boolean;
            each?: (mid: { x: number; y: number }, spread: number) => void;
        },
    ) {
        const fingers = (m: { x: number; y: number }, spread: number) =>
            vertical
                ? [
                      { x: m.x, y: m.y - spread / 2 },
                      { x: m.x, y: m.y + spread / 2 },
                  ]
                : [
                      { x: m.x - spread / 2, y: m.y },
                      { x: m.x + spread / 2, y: m.y },
                  ];
        const [a, b] = fingers(mid, from);
        send("pointerdown", 1, a.x, a.y);
        send("pointerdown", 2, b.x, b.y);
        let last = { mid, spread: from };
        for (let i = 1; i <= steps; i++) {
            const m = {
                x: mid.x + ((midTo.x - mid.x) * i) / steps,
                y: mid.y + ((midTo.y - mid.y) * i) / steps,
            };
            const spread = from + ((to - from) * i) / steps;
            const [p, q] = fingers(m, spread);
            // Each finger moves on its own, as a browser reports them
            send("pointermove", 1, p.x, p.y);
            send("pointermove", 2, q.x, q.y);
            last = { mid: m, spread };
            each?.(m, spread);
        }
        return last;
    }

    it("follows the spread 1:1 over many moves, without compounding", () => {
        const { send, view } = setup(() => "body");
        // The field's pinch once gave ×5 for a ×2.6 spread: each move scaled the zoom again
        pinch(send, { mid: { x: 300, y: 100 }, from: 100, to: 260 });
        expect(view.pixelsPerBeat).toBeCloseTo(26, 9);
        pinch(send, { mid: { x: 300, y: 100 }, from: 200, to: 100 });
        expect(view.pixelsPerBeat).toBeCloseTo(13, 9);
    });

    it("scales by the spread at every move, not only at the end", () => {
        const { send, view } = setup(() => "body");
        pinch(send, {
            mid: { x: 300, y: 100 },
            from: 80,
            to: 240,
            each: (_mid, spread) =>
                expect(view.pixelsPerBeat).toBeCloseTo((10 * spread) / 80, 9),
        });
    });

    it("keeps the beat under the fingers' midpoint under it, while it moves", () => {
        const { send, view } = setup(() => "body");
        view.scrollLeft = 140;
        const anchor = beatAt(view, 300);
        pinch(send, {
            mid: { x: 300, y: 100 },
            midTo: { x: 180, y: 120 },
            from: 120,
            to: 300,
            each: (mid) => expect(beatAt(view, mid.x)).toBeCloseTo(anchor, 9),
        });
        // And the tracks scrolled with the midpoint's 20 px down
        expect(view.scrollTop).toBe(-20);
    });

    it("measures the spread however the fingers lie", () => {
        const { send, view } = setup(() => "body");
        pinch(send, {
            mid: { x: 300, y: 200 },
            from: 100,
            to: 150,
            vertical: true,
        });
        expect(view.pixelsPerBeat).toBeCloseTo(15, 9);
    });

    it("stops at the zoom limits without overshoot, and comes back from them", () => {
        // Limits 1 to 100 px per beat (setup's clampZoom)
        const { send, view } = setup(() => "body");
        const anchor = beatAt(view, 300);
        const seen: number[] = [];
        // ×20 spread in, then back to where it started, in one press
        const [a, b] = [
            { x: 250, y: 100 },
            { x: 350, y: 100 },
        ];
        send("pointerdown", 1, a.x, a.y);
        send("pointerdown", 2, b.x, b.y);
        for (const spread of [200, 600, 1000, 2000, 1000, 400, 100]) {
            send("pointermove", 1, 300 - spread / 2, 100);
            send("pointermove", 2, 300 + spread / 2, 100);
            seen.push(view.pixelsPerBeat);
            expect(beatAt(view, 300)).toBeCloseTo(anchor, 9);
        }
        expect(Math.max(...seen)).toBe(100);
        expect(seen).toEqual([20, 60, 100, 100, 100, 40, 10]);
        send("pointerup", 1, 300 - 50, 100);
        send("pointerup", 2, 300 + 50, 100);

        // Out past the lower limit: stops at 1, never under it
        pinch(send, {
            mid: { x: 300, y: 100 },
            from: 400,
            to: 10,
            each: () => expect(view.pixelsPerBeat).toBeGreaterThanOrEqual(1),
        });
        expect(view.pixelsPerBeat).toBe(1);
    });

    it("keeps the zoom when a finger lifts mid-pinch, and goes on from there", () => {
        const { send, view } = setup(() => "body");
        send("pointerdown", 1, 200, 100);
        send("pointerdown", 2, 300, 100);
        send("pointermove", 2, 400, 100);
        expect(view.pixelsPerBeat).toBe(20);
        // A third finger lands and the second lifts: no jump
        send("pointerdown", 3, 500, 100);
        send("pointerup", 2, 400, 100);
        expect(view.pixelsPerBeat).toBe(20);
        // Fingers 1 and 3 (300 apart) spread to 600: twice again
        send("pointermove", 3, 800, 100);
        expect(view.pixelsPerBeat).toBeCloseTo(40, 9);
    });
});

describe("a finger the adapter never hears lift", () => {
    it("holds the gesture open until it's dropped, then lets the next press through", () => {
        const { gestures, send, env } = setup(() => "control");
        send("pointerdown", 1, 100, 100);
        send("pointerdown", 2, 200, 100);
        expect(env.cancelPress).toHaveBeenCalledTimes(1);
        send("pointerup", 2, 200, 100);
        // Finger 1 lifted off the pane: its release never came. A new press is swallowed
        expect(gestures.tracks(1)).toBe(true);
        expect(send("pointerdown", 3, 100, 100)).toBe(true);
        send("pointerup", 3, 100, 100);
        // Forgotten, the next press goes to its control again
        gestures.drop(1, 1_000);
        expect(gestures.tracks(1)).toBe(false);
        expect(gestures.active).toBe(false);
        expect(send("pointerdown", 4, 100, 100)).toBe(false);
        expect(env.cancelPress).toHaveBeenCalledTimes(1);
    });

    it("keeps the fingers it owns: a panning one, then every navigating one", () => {
        const { gestures, send } = setup((x) => (x < 150 ? "control" : "body"));
        send("pointerdown", 1, 100, 100);
        // A control's finger is the control's
        expect(gestures.owned()).toEqual([]);
        send("pointerdown", 2, 200, 100);
        // Taken from its control by the second finger, it's the adapter's too
        expect(gestures.owned()).toEqual([1, 2]);
        send("pointerup", 1, 100, 100);
        send("pointerup", 2, 200, 100);
        send("pointerdown", 3, 200, 100);
        expect(gestures.owned()).toEqual([3]);
    });

    it("drops nothing it isn't following", () => {
        const { gestures, navigate, env } = setup(() => "body");
        gestures.drop(7, 0);
        expect(navigate).not.toHaveBeenCalled();
        expect(env.tap).not.toHaveBeenCalled();
    });
});

/** A finger's pointer event in jsdom, which has no `PointerEvent` */
function fingerEvent(
    type: string,
    pointerId: number,
    clientX: number,
    clientY = 100,
    pointerType = "touch",
) {
    const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
    Object.defineProperties(event, {
        pointerId: { value: pointerId },
        pointerType: { value: pointerType },
    });
    return event;
}

describe("attachTimelineGestures", () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.replaceChildren();
    });

    /** A viewport holding a control and bare track space, with pointer capture stubbed */
    function mount() {
        const viewport = document.createElement("div");
        const control = document.createElement("button");
        control.setAttribute("data-timeline-interactive", "true");
        const bare = document.createElement("div");
        viewport.append(control, bare);
        document.body.append(viewport);
        const held = new Set<number>();
        const capture = vi.fn((id: number) => void held.add(id));
        Object.assign(viewport, {
            setPointerCapture: capture,
            hasPointerCapture: (id: number) => held.has(id),
        });
        // What reaches the timeline's own handlers, past the adapter
        const reached: string[] = [];
        document.body.addEventListener("pointerdown", (event) =>
            reached.push(`down ${(event as PointerEvent).pointerId}`),
        );
        const cancelled: Element[] = [];
        document.body.addEventListener("pointercancel", (event) => {
            if (event.target instanceof Element) cancelled.push(event.target);
        });
        const detach = attachTimelineGestures(viewport, {
            region: (event) => (event.target === control ? "control" : "body"),
            view: () => ({ scrollLeft: 0, scrollTop: 0, pixelsPerBeat: 10 }),
            navigate: () => {},
            leadingInset: () => 0,
        });
        return { viewport, control, bare, capture, reached, cancelled, detach };
    }

    it("captures a panning finger, and the first finger once a second takes it", () => {
        const { control, bare, capture, reached, detach } = mount();
        bare.dispatchEvent(fingerEvent("pointerdown", 1, 50));
        expect(capture).toHaveBeenCalledWith(1);
        // Kept from the timeline's own handlers
        expect(reached).toEqual([]);
        bare.dispatchEvent(fingerEvent("pointerup", 1, 50));
        capture.mockClear();
        control.dispatchEvent(fingerEvent("pointerdown", 2, 50));
        expect(capture).not.toHaveBeenCalled();
        expect(reached).toEqual(["down 2"]);
        bare.dispatchEvent(fingerEvent("pointerdown", 3, 150));
        expect(capture.mock.calls.map(([id]) => id).sort()).toEqual([2, 3]);
        detach();
    });

    it("never takes a mouse's press", () => {
        const { bare, capture, reached, detach } = mount();
        bare.dispatchEvent(fingerEvent("pointerdown", 1, 50, 100, "mouse"));
        expect(capture).not.toHaveBeenCalled();
        expect(reached).toEqual(["down 1"]);
        detach();
    });

    it("forgets a finger that lifted outside the timeline", () => {
        vi.useFakeTimers();
        const { control, bare, reached, detach } = mount();
        control.dispatchEvent(fingerEvent("pointerdown", 1, 50));
        bare.dispatchEvent(fingerEvent("pointerdown", 2, 150));
        bare.dispatchEvent(fingerEvent("pointerup", 2, 150));
        // Finger 1 lifts over the field: the viewport never hears it
        document.body.dispatchEvent(fingerEvent("pointerup", 1, 900));
        vi.runAllTimers();
        reached.length = 0;
        control.dispatchEvent(fingerEvent("pointerdown", 3, 50));
        expect(reached).toEqual(["down 3"]);
        detach();
    });

    it("cancels on the element holding the capture when the pressed one went", () => {
        const { viewport, control, bare, cancelled, detach } = mount();
        const holder = document.createElement("div");
        viewport.append(holder);
        control.dispatchEvent(fingerEvent("pointerdown", 1, 50));
        holder.dispatchEvent(fingerEvent("gotpointercapture", 1, 50));
        // The control re-renders away mid-drag
        control.remove();
        bare.dispatchEvent(fingerEvent("pointerdown", 2, 150));
        expect(cancelled).toEqual([holder]);
        detach();
    });
});

describe("touch hit areas (tablet 3.3)", () => {
    afterEach(() => {
        document.body.replaceChildren();
        Reflect.deleteProperty(document, "elementsFromPoint");
    });

    const rectOf = (left: number, right: number, top = 0, bottom = 100) =>
        ({
            left,
            right,
            top,
            bottom,
            width: right - left,
            height: bottom - top,
            x: left,
            y: top,
            toJSON: () => ({}),
        }) as DOMRect;

    /** A target drawn at `left`..`right` with a 44px hit area around it */
    function target(
        parent: Element,
        left: number,
        right: number,
        {
            selected = false,
            group,
        }: { selected?: boolean; group?: string } = {},
    ) {
        const button = document.createElement("button");
        button.setAttribute("data-timeline-interactive", "true");
        button.getBoundingClientRect = () => rectOf(left, right);
        const hit = document.createElement("span");
        hit.setAttribute("data-touch-hit", "");
        if (selected) hit.setAttribute("data-touch-selected", "true");
        if (group) hit.dataset.touchGroup = group;
        const mid = (left + right) / 2;
        hit.getBoundingClientRect = () => rectOf(mid - 22, mid + 22);
        button.append(hit);
        parent.append(button);
        return { button, hit };
    }

    /** `elementsFromPoint` for jsdom: every element whose rect holds the point, topmost first */
    function stubElementsFromPoint(root: Element) {
        Object.defineProperty(document, "elementsFromPoint", {
            configurable: true,
            value: (x: number, y: number) =>
                [root, ...root.querySelectorAll("*")]
                    .filter((element) => {
                        const r = element.getBoundingClientRect();
                        return (
                            x >= r.left &&
                            x <= r.right &&
                            y >= r.top &&
                            y <= r.bottom
                        );
                    })
                    .reverse(),
        });
    }

    function mount() {
        const viewport = document.createElement("div");
        viewport.getBoundingClientRect = () => rectOf(0, 1000);
        const bare = document.createElement("div");
        bare.getBoundingClientRect = () => rectOf(0, 1000);
        viewport.append(bare);
        document.body.append(viewport);
        Object.assign(viewport, {
            setPointerCapture: () => {},
            hasPointerCapture: () => false,
        });
        stubElementsFromPoint(viewport);
        return { viewport, bare };
    }

    it("finds the nearest target, the selected one first, and none outside the hit areas", () => {
        const { viewport } = mount();
        const grip = target(viewport, 98, 102);
        const loopEnd = target(viewport, 128, 132);
        expect(findTouchHit(viewport, 110, 50)?.target).toBe(grip.hit);
        expect(findTouchHit(viewport, 121, 50)?.target).toBe(loopEnd.hit);
        expect(findTouchHit(viewport, 200, 50)).toBeNull();
        const selected = target(viewport, 138, 142, { selected: true });
        expect(findTouchHit(viewport, 121, 50)?.target).toBe(selected.hit);
        expect(findTouchHit(viewport, 121, 50)?.owner).toBe(selected.button);
    });

    /** A clip under the playhead's full-height line, whose hit area is on top of it */
    function clipUnderPlayhead() {
        const { viewport } = mount();
        const clip = document.createElement("button");
        clip.setAttribute("data-timeline-interactive", "true");
        clip.setAttribute("data-touch-keep", "clip:1");
        clip.getBoundingClientRect = () => rectOf(110, 200, 40, 60);
        viewport.append(clip);
        // Later in the DOM: painted over the clip, as the pinned layer's lines are
        const playhead = target(viewport, 98, 102);
        return { viewport, clip, playhead };
    }

    it("gives a press on a clip under the playhead's hit area to the clip, though the hit area is on top", () => {
        const { viewport, clip, playhead } = clipUnderPlayhead();
        // 15 px from the playhead, on the clip: the topmost element there is the hit area
        expect(document.elementsFromPoint(115, 50)[0]).toBe(playhead.hit);
        expect(findTouchHit(viewport, 115, 50)).toEqual({
            target: clip,
            owner: clip,
        });
        // Off the clip, the playhead takes it
        expect(findTouchHit(viewport, 115, 80)?.target).toBe(playhead.hit);
        // Right on the playhead's own button, over the clip, the line wins
        expect(findTouchHit(viewport, 101, 50)?.target).toBe(playhead.hit);
    });

    it("lets a selected clip's own edge reach in over its body, but not another clip's", () => {
        const { viewport, clip } = clipUnderPlayhead();
        target(viewport, 104, 106, { selected: true, group: "clip:2" });
        expect(findTouchHit(viewport, 120, 50)?.target).toBe(clip);
        const own = target(clip, 110, 114, { selected: true, group: "clip:1" });
        expect(findTouchHit(viewport, 118, 50)?.target).toBe(own.hit);
    });

    it("leaves a press on a page box to the targets over it, and one on another control to that control", () => {
        const { viewport } = mount();
        const box = document.createElement("button");
        box.setAttribute("data-timeline-interactive", "true");
        box.setAttribute("data-touch-yield", "");
        box.getBoundingClientRect = () => rectOf(0, 300, 40, 60);
        viewport.append(box);
        const flag = target(viewport, 98, 102);
        expect(findTouchHit(viewport, 115, 50)?.target).toBe(flag.hit);
        // The add-page pill beside the playhead
        const pill = document.createElement("button");
        pill.getBoundingClientRect = () => rectOf(110, 180, 40, 60);
        viewport.append(pill);
        // On top of the flag's hit area here, so the press already lands on the pill
        expect(findTouchHit(viewport, 115, 50)?.owner).toBe(pill);
    });

    it("keeps a press on the add-page pill painted over a page flag grip, though the grip's button holds it (#920)", () => {
        const { viewport } = mount();
        // The last page's flag grip: its button is wide, and the press is inside it
        const grip = target(viewport, 90, 130);
        // Flipped to the playhead's left, the pill covers the grip; later in the DOM, on top
        const pill = document.createElement("button");
        pill.setAttribute("data-timeline-interactive", "true");
        pill.getBoundingClientRect = () => rectOf(60, 140, 40, 60);
        const label = document.createElement("span");
        label.getBoundingClientRect = () => rectOf(80, 120, 45, 55);
        pill.append(label);
        viewport.append(pill);
        expect(findTouchHit(viewport, 110, 50)).toEqual({
            target: label,
            owner: pill,
        });
        // Off the pill, the grip still takes it
        expect(findTouchHit(viewport, 110, 30)?.target).toBe(grip.hit);
        // Painted under the grip instead, the grip's button is on top and takes the press
        viewport.insertBefore(pill, grip.button);
        expect(findTouchHit(viewport, 110, 50)?.target).toBe(grip.hit);
    });

    it("sends a finger's press near a target on to it, with its click; a mouse's stays where it landed", () => {
        const { viewport, bare } = mount();
        const { button } = target(viewport, 98, 102);
        const downs: string[] = [];
        const clicks: string[] = [];
        button.addEventListener("pointerdown", (event) =>
            downs.push(`target ${(event as PointerEvent).pointerType}`),
        );
        bare.addEventListener("pointerdown", (event) =>
            downs.push(`bare ${(event as PointerEvent).pointerType}`),
        );
        button.addEventListener("click", () => clicks.push("target"));
        bare.addEventListener("click", () => clicks.push("bare"));
        const detach = attachTimelineGestures(viewport, {
            region: (event) =>
                event.target instanceof Element &&
                event.target.closest("[data-timeline-interactive]")
                    ? "control"
                    : "body",
            view: () => ({ scrollLeft: 0, scrollTop: 0, pixelsPerBeat: 10 }),
            navigate: () => {},
            leadingInset: () => 0,
        });
        // 18px off the drawn target, on bare track space
        bare.dispatchEvent(fingerEvent("pointerdown", 1, 118, 50));
        expect(downs).toEqual(["target touch"]);
        bare.dispatchEvent(fingerEvent("pointerup", 1, 118, 50));
        bare.dispatchEvent(
            new MouseEvent("click", { bubbles: true, clientX: 118 }),
        );
        expect(clicks).toEqual(["target"]);
        downs.length = 0;
        clicks.length = 0;
        bare.dispatchEvent(fingerEvent("pointerdown", 2, 118, 50, "mouse"));
        bare.dispatchEvent(
            new MouseEvent("click", { bubbles: true, clientX: 118 }),
        );
        expect(downs).toEqual(["bare mouse"]);
        expect(clicks).toEqual(["bare"]);
        detach();
    });
});

describe("long press (tablet 3.4)", () => {
    /** An adapter with a long press: `opens` says whether a menu takes it */
    function setupLongPress(region: TimelineTouchRegion, opens: boolean) {
        let due: { at: number; tick: () => void } | null = null;
        const env = {
            region: () => region,
            local: (x: number, y: number) => ({ x, y }),
            view: () => ({ scrollLeft: 0, scrollTop: 0, pixelsPerBeat: 10 }),
            navigate: vi.fn(),
            leadingInset: () => 0,
            tap: vi.fn(),
            cancelPress: vi.fn(),
            longPress: vi.fn(() => opens),
            schedule: (at: number, tick: () => void) => {
                due = { at, tick };
                return () => {
                    due = null;
                };
            },
        } satisfies TimelineGestureEnv;
        const gestures = new TimelineGestures(env);
        const send = (type: string, x: number, t: number) =>
            gestures.handle({
                type,
                pointerId: 1,
                pointerType: "touch",
                clientX: x,
                clientY: 20,
                timeStamp: t,
                target: null,
            });
        /** The hold timer comes due, if one is set */
        const hold = () => {
            const pending = due as { at: number; tick: () => void } | null;
            due = null;
            pending?.tick();
            return pending !== null;
        };
        return { env, send, hold, due: () => due };
    }

    it("opens the right-click menu when a finger is held still and lifted, jitter and all", () => {
        const { env, send, hold, due } = setupLongPress("control", true);
        expect(send("pointerdown", 200, 0)).toBe(false);
        expect(due()?.at).toBe(500);
        // A finger's jitter, inside the long press slop, goes on to the control
        expect(send("pointermove", 205, 100)).toBe(false);
        expect(send("pointermove", 197, 300)).toBe(false);
        expect(hold()).toBe(true);
        expect(env.longPress).not.toHaveBeenCalled();
        // Lifted: the menu, the release kept from the control, and the press cancelled
        expect(send("pointerup", 198, 700)).toBe(true);
        expect(env.longPress).toHaveBeenCalledTimes(1);
        expect(env.longPress.mock.calls[0]).toEqual([
            expect.objectContaining({ pointerId: 1, clientX: 200 }),
            { x: 198, y: 20 },
        ]);
        expect(env.cancelPress).toHaveBeenCalledTimes(1);
        expect(env.cancelPress.mock.calls[0][0]).toMatchObject({
            type: "pointerdown",
            clientX: 200,
        });
        expect(env.tap).not.toHaveBeenCalled();
    });

    it("is no long press when the finger moves past the slop, or lifts before the hold", () => {
        const moved = setupLongPress("control", true);
        moved.send("pointerdown", 200, 0);
        moved.send("pointermove", 212, 100);
        // The timer is dropped once the finger moves on
        expect(moved.due()).toBeNull();
        expect(moved.send("pointerup", 212, 700)).toBe(false);
        expect(moved.env.longPress).not.toHaveBeenCalled();

        const quick = setupLongPress("control", true);
        quick.send("pointerdown", 200, 0);
        expect(quick.send("pointerup", 200, 300)).toBe(false);
        expect(quick.env.longPress).not.toHaveBeenCalled();
        expect(quick.env.cancelPress).not.toHaveBeenCalled();
    });

    it("lets a hesitant finger drag on after the hold", () => {
        const { env, send, hold } = setupLongPress("control", true);
        send("pointerdown", 200, 0);
        hold();
        expect(send("pointermove", 240, 800)).toBe(false);
        expect(send("pointerup", 260, 900)).toBe(false);
        expect(env.longPress).not.toHaveBeenCalled();
        expect(env.cancelPress).not.toHaveBeenCalled();
    });

    it("with no menu there, gives a control its slow tap and seeks on bare track space", () => {
        const control = setupLongPress("control", false);
        control.send("pointerdown", 200, 0);
        control.hold();
        expect(control.send("pointerup", 200, 700)).toBe(false);
        expect(control.env.longPress).toHaveBeenCalledTimes(1);
        expect(control.env.cancelPress).not.toHaveBeenCalled();

        const bare = setupLongPress("body", false);
        bare.send("pointerdown", 200, 0);
        bare.hold();
        expect(bare.send("pointerup", 203, 700)).toBe(true);
        expect(bare.env.tap).toHaveBeenCalledWith(203);
    });

    it("opens a menu on bare track space without a seek, and cancels nothing there", () => {
        const { env, send, hold } = setupLongPress("body", true);
        send("pointerdown", 200, 0);
        hold();
        expect(send("pointerup", 200, 700)).toBe(true);
        expect(env.longPress).toHaveBeenCalledTimes(1);
        expect(env.tap).not.toHaveBeenCalled();
        expect(env.cancelPress).not.toHaveBeenCalled();
    });

    it("has no long press without the seam, as before", () => {
        const { gestures, send, env } = setup(() => "body");
        send("pointerdown", 1, 200, 150);
        gestures.tick(10_000);
        send("pointerup", 1, 200, 150);
        expect(env.tap).toHaveBeenCalledWith(200);
    });
});

describe("attachTimelineGestures long press (tablet 3.4)", () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.replaceChildren();
    });

    /** A finger event stamped on the page's clock, as a browser's is */
    const stamped = (type: string, clientX: number, pointerType = "touch") => {
        const event = fingerEvent(type, 1, clientX, 100, pointerType);
        Object.defineProperty(event, "timeStamp", {
            value: performance.now(),
        });
        Object.defineProperty(event, "cancelable", { value: true });
        return event;
    };

    function mount(withMenu: boolean) {
        vi.useFakeTimers();
        const viewport = document.createElement("div");
        const control = document.createElement("button");
        control.setAttribute("data-timeline-interactive", "true");
        viewport.append(control);
        document.body.append(viewport);
        const seen: string[] = [];
        control.addEventListener("contextmenu", (event) => {
            seen.push(
                `menu ${isTouchContextMenu(event) ? "touch" : "native"} ${event.clientX}`,
            );
            if (withMenu) event.preventDefault();
        });
        for (const type of ["pointerup", "pointercancel", "click"])
            control.addEventListener(type, () => seen.push(type));
        const detach = attachTimelineGestures(viewport, {
            region: () => "control",
            view: () => ({ scrollLeft: 0, scrollTop: 0, pixelsPerBeat: 10 }),
            navigate: () => {},
            leadingInset: () => 0,
        });
        return { control, seen, detach };
    }

    it("sends the press a finger's contextmenu on release, cancels it and drops its click", () => {
        const { control, seen, detach } = mount(true);
        control.dispatchEvent(stamped("pointerdown", 50));
        // The browser's own long-press menu, while the finger is still down, goes nowhere
        const native = new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
        });
        control.dispatchEvent(native);
        expect(native.defaultPrevented).toBe(true);
        control.dispatchEvent(stamped("pointermove", 54));
        vi.advanceTimersByTime(600);
        control.dispatchEvent(stamped("pointerup", 54));
        control.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
        expect(seen).toEqual(["menu touch 54", "pointercancel"]);
        detach();
    });

    it("leaves a slow tap alone where no menu takes it, and a mouse's press always", () => {
        const { control, seen, detach } = mount(false);
        control.dispatchEvent(stamped("pointerdown", 50));
        vi.advanceTimersByTime(600);
        control.dispatchEvent(stamped("pointerup", 50));
        control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(seen).toEqual(["menu touch 50", "pointerup", "click"]);
        seen.length = 0;
        control.dispatchEvent(stamped("pointerdown", 50, "mouse"));
        vi.advanceTimersByTime(600);
        control.dispatchEvent(stamped("pointerup", 50, "mouse"));
        expect(seen).toEqual(["pointerup"]);
        detach();
    });
});
