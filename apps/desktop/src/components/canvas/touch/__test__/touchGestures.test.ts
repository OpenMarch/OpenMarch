import { describe, expect, it } from "vitest";
import {
    GESTURE_TIMING,
    GestureEffect,
    GestureInput,
    GestureResult,
    GestureState,
    initialGestureState,
    navigationGeometry,
    navigationTransform,
    stepGesture,
} from "../touchGestures";

/** Feeds inputs in order; returns every result */
const run = (inputs: GestureInput[], start = initialGestureState()) => {
    let state: GestureState = start;
    const results: GestureResult[] = [];
    for (const input of inputs) {
        const result = stepGesture(state, input);
        results.push(result);
        state = result.state;
    }
    return { state, results, effects: results.flatMap((r) => r.effects) };
};

const touch = (
    type: "down" | "move" | "up" | "cancel",
    id: number,
    x: number,
    y: number,
    t: number,
) => ({ type, id, kind: "touch" as const, x, y, t });
const pen = (
    type: "down" | "move" | "up" | "cancel",
    id: number,
    x: number,
    y: number,
    t: number,
) => ({ type, id, kind: "pen" as const, x, y, t });

const types = (effects: GestureEffect[]) => effects.map((e) => e.type);

describe("one finger", () => {
    it("passes a tap to Fabric and reports it as a tap", () => {
        const { results, effects, state } = run([
            touch("down", 1, 100, 100, 0),
            touch("move", 1, 103, 102, 50),
            touch("up", 1, 103, 102, 100),
        ]);
        expect(results.every((r) => r.passThrough)).toBe(true);
        expect(types(effects)).toEqual(["singleStart", "singleEnd"]);
        expect(effects[1]).toMatchObject({ type: "singleEnd", tap: true });
        expect(state.mode).toBe("idle");
    });

    it("passes a drag to Fabric, says when it stops being a tap, and never navigates", () => {
        const { results, effects } = run([
            touch("down", 1, 100, 100, 0),
            touch("move", 1, 105, 100, 20),
            touch("move", 1, 130, 100, 40),
            touch("move", 1, 160, 100, 60),
            touch("up", 1, 160, 100, 80),
        ]);
        expect(results.every((r) => r.passThrough)).toBe(true);
        expect(types(effects)).toEqual([
            "singleStart",
            "singleDragged",
            "singleEnd",
        ]);
        expect(effects[2]).toMatchObject({ tap: false });
    });

    it("cancels Fabric's press when the browser cancels the finger", () => {
        const { effects, state } = run([
            touch("down", 1, 100, 100, 0),
            touch("move", 1, 140, 100, 20),
            touch("cancel", 1, 140, 100, 40),
        ]);
        expect(types(effects)).toContain("cancelSingle");
        expect(types(effects)).not.toContain("singleEnd");
        expect(state.mode).toBe("idle");
    });

    it("ignores a cancel for a finger it already let go (lostpointercapture after up)", () => {
        const { results } = run([
            touch("down", 1, 100, 100, 0),
            touch("up", 1, 100, 100, 40),
            touch("cancel", 1, 100, 100, 41),
        ]);
        expect(results[2].effects).toEqual([]);
    });
});

describe("two fingers", () => {
    it("cancels Fabric, blocks the second finger, and navigates", () => {
        const { results, state } = run([
            touch("down", 1, 100, 100, 0),
            touch("move", 1, 120, 100, 100),
            touch("down", 2, 200, 100, 300),
        ]);
        expect(results[2].passThrough).toBe(false);
        expect(types(results[2].effects)).toEqual([
            "cancelSingle",
            "navigationStart",
        ]);
        expect(results[2].effects[1]).toMatchObject({
            geometry: { mid: { x: 160, y: 100 }, distance: 80 },
        });
        expect(state.mode).toBe("gesture");
    });

    it("pans and pinches with both fingers, blocking them from Fabric", () => {
        const { results } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, 300),
            touch("move", 2, 300, 100, 320),
            touch("move", 1, 100, 150, 340),
        ]);
        expect(results[2].passThrough).toBe(false);
        expect(results[2].effects).toEqual([
            {
                type: "navigate",
                geometry: { mid: { x: 200, y: 100 }, distance: 200 },
            },
        ]);
        expect(results[3].effects[0]).toMatchObject({
            type: "navigate",
            geometry: { mid: { x: 200, y: 125 } },
        });
    });

    it("keeps navigating with one finger after the other lifts, without a jump and without editing", () => {
        const { results, state } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, 300),
            touch("move", 2, 260, 100, 320),
            touch("up", 1, 100, 100, 340),
            touch("move", 2, 280, 110, 360),
            touch("up", 2, 280, 110, 380),
        ]);
        // Re-baselines on the remaining finger
        expect(results[3].effects).toEqual([
            {
                type: "navigationStart",
                geometry: { mid: { x: 260, y: 100 }, distance: null },
            },
        ]);
        expect(results[3].passThrough).toBe(false);
        expect(results[4].passThrough).toBe(false);
        expect(results[4].effects).toEqual([
            {
                type: "navigate",
                geometry: { mid: { x: 280, y: 110 }, distance: null },
            },
        ]);
        expect(types(results[5].effects)).toEqual(["navigationEnd"]);
        expect(results[5].passThrough).toBe(false);
        expect(state.mode).toBe("idle");
        const all = results.flatMap((r) => r.effects);
        expect(types(all)).not.toContain("singleEnd");
        expect(types(all)).not.toContain("undo");
    });

    it("lets a finger after the gesture start a fresh one-finger press", () => {
        const { results } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, 300),
            touch("up", 1, 100, 100, 340),
            touch("up", 2, 200, 100, 360),
            touch("down", 3, 150, 150, 500),
        ]);
        expect(results[4].passThrough).toBe(true);
        expect(types(results[4].effects)).toEqual(["singleStart"]);
    });

    it("drops a finger the browser cancels and re-baselines", () => {
        const { results, state } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, 30),
            touch("cancel", 2, 200, 100, 60),
            touch("up", 1, 100, 100, 90),
        ]);
        expect(types(results[2].effects)).toEqual(["navigationStart"]);
        // A cancelled finger is not a tap
        expect(types(results[3].effects)).toEqual(["navigationEnd"]);
        expect(state.mode).toBe("idle");
    });
});

describe("multi-finger taps", () => {
    it("two-finger tap is undo", () => {
        const { effects } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, 40),
            touch("up", 1, 101, 100, 120),
            touch("up", 2, 200, 101, 140),
        ]);
        expect(types(effects)).toContain("undo");
        expect(types(effects)).not.toContain("redo");
    });

    it("three-finger tap is redo", () => {
        const { effects } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, 30),
            touch("down", 3, 300, 100, 60),
            touch("up", 1, 100, 100, 150),
            touch("up", 2, 200, 100, 160),
            touch("up", 3, 300, 100, 170),
        ]);
        expect(types(effects)).toContain("redo");
        expect(types(effects)).not.toContain("undo");
    });

    it("is not a tap when the second finger comes down late", () => {
        const { effects } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, GESTURE_TIMING.multiTapDownWindowMs + 1),
            touch("up", 1, 100, 100, GESTURE_TIMING.multiTapDownWindowMs + 50),
            touch("up", 2, 200, 100, GESTURE_TIMING.multiTapDownWindowMs + 60),
        ]);
        expect(types(effects)).not.toContain("undo");
    });

    it("is not a tap when the fingers pinch", () => {
        const { effects } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, 20),
            touch("move", 2, 240, 100, 60),
            touch("up", 1, 100, 100, 100),
            touch("up", 2, 240, 100, 120),
        ]);
        expect(types(effects)).not.toContain("undo");
    });

    it("is not a tap when the fingers stay down too long", () => {
        const { effects } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, 20),
            touch("up", 1, 100, 100, GESTURE_TIMING.multiTapMaxMs),
            touch("up", 2, 200, 100, GESTURE_TIMING.multiTapMaxMs + 1),
        ]);
        expect(types(effects)).not.toContain("undo");
    });

    it("four fingers do nothing", () => {
        const { effects } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, 10),
            touch("down", 3, 300, 100, 20),
            touch("down", 4, 400, 100, 30),
            touch("up", 1, 100, 100, 100),
            touch("up", 2, 200, 100, 100),
            touch("up", 3, 300, 100, 100),
            touch("up", 4, 400, 100, 100),
        ]);
        expect(types(effects)).not.toContain("undo");
        expect(types(effects)).not.toContain("redo");
    });
});

describe("long press", () => {
    it("fires after holding still", () => {
        const { state: held } = run([touch("down", 1, 100, 100, 0)]);
        expect(held.longPressAt).toBe(GESTURE_TIMING.longPressMs);
        const early = stepGesture(held, { type: "timer", t: 200 });
        expect(early.effects).toEqual([]);
        const fired = stepGesture(held, {
            type: "timer",
            t: GESTURE_TIMING.longPressMs,
        });
        expect(fired.effects).toEqual([
            { type: "longPress", id: 1, point: { x: 100, y: 100 } },
        ]);
        expect(fired.state.longPressAt).toBeNull();
    });

    it("tolerates a small wobble", () => {
        const { state } = run([
            touch("down", 1, 100, 100, 0),
            touch("move", 1, 104, 103, 100),
        ]);
        expect(
            stepGesture(state, { type: "timer", t: 500 }).effects,
        ).toHaveLength(1);
    });

    it("is lost when the finger moves", () => {
        const { state } = run([
            touch("down", 1, 100, 100, 0),
            touch("move", 1, 120, 100, 100),
        ]);
        expect(state.longPressAt).toBeNull();
        expect(stepGesture(state, { type: "timer", t: 500 }).effects).toEqual(
            [],
        );
    });

    it("is lost when a second finger arrives", () => {
        const { state } = run([
            touch("down", 1, 100, 100, 0),
            touch("down", 2, 200, 100, 100),
        ]);
        expect(stepGesture(state, { type: "timer", t: 500 }).effects).toEqual(
            [],
        );
    });

    it("makes the release not a tap", () => {
        let { state } = run([touch("down", 1, 100, 100, 0)]);
        state = stepGesture(state, { type: "timer", t: 500 }).state;
        const up = stepGesture(state, touch("up", 1, 100, 100, 600));
        expect(up.effects[0]).toMatchObject({ type: "singleEnd", tap: false });
    });

    it("can keep the rest of the press away from Fabric", () => {
        let { state } = run([touch("down", 1, 100, 100, 0)]);
        state = stepGesture(state, { type: "timer", t: 500 }).state;
        state = stepGesture(state, { type: "blockSingle" }).state;
        const move = stepGesture(state, touch("move", 1, 150, 100, 550));
        expect(move.passThrough).toBe(false);
        const up = stepGesture(move.state, touch("up", 1, 150, 100, 600));
        expect(up.passThrough).toBe(false);
        expect(up.effects).toEqual([]);
        expect(up.state.mode).toBe("idle");
    });
});

describe("pen and palm rejection", () => {
    it("passes the pen through like a mouse", () => {
        const { results, effects } = run([
            pen("down", 9, 100, 100, 0),
            pen("move", 9, 150, 100, 20),
            pen("up", 9, 150, 100, 40),
        ]);
        expect(results.every((r) => r.passThrough)).toBe(true);
        expect(effects).toEqual([]);
    });

    it("makes a finger only navigate while the pen is down", () => {
        const { results } = run([
            pen("down", 9, 100, 100, 0),
            touch("down", 1, 300, 300, 10),
            touch("move", 1, 320, 300, 30),
        ]);
        expect(results[1].passThrough).toBe(false);
        expect(types(results[1].effects)).toEqual(["navigationStart"]);
        expect(results[2].passThrough).toBe(false);
        expect(types(results[2].effects)).toEqual(["navigate"]);
    });

    it("makes a finger only navigate shortly after the pen lifted", () => {
        const { results } = run([
            pen("down", 9, 100, 100, 0),
            pen("up", 9, 100, 100, 100),
            touch("down", 1, 300, 300, 100 + GESTURE_TIMING.palmRejectMs - 1),
        ]);
        expect(results[2].passThrough).toBe(false);
    });

    it("lets a finger edit again once the pen has been away a while", () => {
        const { results } = run([
            pen("down", 9, 100, 100, 0),
            pen("up", 9, 100, 100, 100),
            touch("down", 1, 300, 300, 100 + GESTURE_TIMING.palmRejectMs),
        ]);
        expect(results[2].passThrough).toBe(true);
        expect(types(results[2].effects)).toEqual(["singleStart"]);
    });

    it("takes a resting palm's press back from Fabric when the pen comes down", () => {
        const { results, state } = run([
            touch("down", 1, 300, 300, 0),
            pen("down", 9, 100, 100, 50),
            touch("move", 1, 310, 300, 60),
        ]);
        expect(results[1].passThrough).toBe(true);
        expect(types(results[1].effects)).toEqual([
            "cancelSingle",
            "navigationStart",
        ]);
        expect(results[2].passThrough).toBe(false);
        expect(state.mode).toBe("gesture");
    });

    it("never treats palm taps as undo", () => {
        const { effects } = run([
            pen("down", 9, 100, 100, 0),
            touch("down", 1, 300, 300, 10),
            touch("down", 2, 400, 300, 20),
            touch("up", 1, 300, 300, 60),
            touch("up", 2, 400, 300, 70),
        ]);
        expect(types(effects)).not.toContain("undo");
    });
});

describe("navigationTransform", () => {
    const identity = (z: number) => z;

    it("pans by the midpoint movement", () => {
        const start = navigationGeometry([{ x: 100, y: 100 }])!;
        const current = navigationGeometry([{ x: 130, y: 80 }])!;
        expect(
            navigationTransform([2, 0, 0, 2, 10, 20], start, current, identity),
        ).toEqual([2, 0, 0, 2, 40, 0]);
    });

    it("zooms by the finger spread and keeps the point under the midpoint fixed", () => {
        const vpt = [1.5, 0, 0, 1.5, -40, 25];
        const start = navigationGeometry([
            { x: 100, y: 100 },
            { x: 200, y: 100 },
        ])!;
        const current = navigationGeometry([
            { x: 50, y: 100 },
            { x: 250, y: 100 },
        ])!;
        const next = navigationTransform(vpt, start, current, identity);
        expect(next[0]).toBeCloseTo(3);
        expect(next[3]).toBeCloseTo(3);
        // The canvas point that was under the midpoint is still under it
        const canvasX = (150 - vpt[4]) / vpt[0];
        const canvasY = (100 - vpt[5]) / vpt[0];
        expect(canvasX * next[0] + next[4]).toBeCloseTo(150);
        expect(canvasY * next[0] + next[5]).toBeCloseTo(100);
    });

    it("pans and zooms at once", () => {
        const vpt = [1, 0, 0, 1, 0, 0];
        const start = navigationGeometry([
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ])!;
        const current = navigationGeometry([
            { x: 100, y: 100 },
            { x: 150, y: 100 },
        ])!;
        const next = navigationTransform(vpt, start, current, identity);
        expect(next[0]).toBeCloseTo(0.5);
        // Canvas (50, 0) was under the start midpoint; now under (125, 100)
        expect(50 * next[0] + next[4]).toBeCloseTo(125);
        expect(0 * next[0] + next[5]).toBeCloseTo(100);
    });

    it("clamps the zoom", () => {
        const start = navigationGeometry([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ])!;
        const current = navigationGeometry([
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
        ])!;
        const next = navigationTransform(
            [1, 0, 0, 1, 0, 0],
            start,
            current,
            (z) => Math.min(z, 25),
        );
        expect(next[0]).toBe(25);
    });
});
