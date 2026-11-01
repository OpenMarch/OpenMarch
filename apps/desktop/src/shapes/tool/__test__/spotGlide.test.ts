// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    GLIDE_MS,
    ShapeGlide,
    SpotGlide,
    type FramePoints,
} from "../spotGlide";

/**
 * The glide (#387, the owner's pick from the lab): when the open shape changes without a gesture,
 * each marcher's spot slides from where it was to where it's going instead of jumping.
 */

const a = {
    params: {},
    targets: [
        { id: 1, to: { x: 0, y: 0 } },
        { id: 2, to: { x: 10, y: 0 } },
    ],
};
const b = {
    params: {},
    targets: [
        { id: 1, to: { x: 20, y: 0 } },
        { id: 2, to: { x: 10, y: 40 } },
    ],
};

describe("the spot glide", () => {
    it("does nothing until the shape changes", () => {
        const g = new SpotGlide();
        g.update(a.params, false, a.targets, 0);
        expect(g.positions(10)).toBeNull();
    });

    it("slides each marcher from its old spot to its new one, eased, then stops", () => {
        const g = new SpotGlide();
        g.update(a.params, false, a.targets, 0);
        g.update(b.params, false, b.targets, 1000);
        const start = g.positions(1000)!;
        expect(start.get(1)).toEqual({ x: 0, y: 0 });
        const mid = g.positions(1000 + GLIDE_MS / 2)!;
        // Eased out: past halfway at half time
        expect(mid.get(1)!.x).toBeGreaterThan(10);
        expect(mid.get(1)!.x).toBeLessThan(20);
        expect(mid.get(2)!.y).toBeGreaterThan(20);
        expect(g.positions(1000 + GLIDE_MS)).toBeNull();
        expect(g.active(1000 + GLIDE_MS)).toBe(false);
    });

    it("doesn't glide during a gesture: a drag follows the pointer", () => {
        const g = new SpotGlide();
        g.update(a.params, false, a.targets, 0);
        g.update(b.params, true, b.targets, 10);
        expect(g.positions(20)).toBeNull();
    });

    it("starts a new glide from where the marchers are shown, mid-glide", () => {
        const g = new SpotGlide();
        g.update(a.params, false, a.targets, 0);
        g.update(b.params, false, b.targets, 100);
        const shown = g.positions(100 + GLIDE_MS / 2)!.get(1)!;
        const c = {
            params: {},
            targets: [
                { id: 1, to: { x: 0, y: 0 } },
                { id: 2, to: { x: 0, y: 0 } },
            ],
        };
        g.update(c.params, false, c.targets, 100 + GLIDE_MS / 2);
        expect(g.positions(100 + GLIDE_MS / 2)!.get(1)).toEqual(shown);
    });

    it("leaves a marcher that only one side has where it's going", () => {
        const g = new SpotGlide();
        g.update(a.params, false, a.targets, 0);
        const more = {
            params: {},
            targets: [...b.targets, { id: 3, to: { x: 5, y: 5 } }],
        };
        g.update(more.params, false, more.targets, 10);
        expect(g.positions(10)!.get(3)).toEqual({ x: 5, y: 5 });
    });
});

/**
 * The frame glides with the spots (owner on #459), but only for the same shape: never from the
 * last shape opened, nor across a change of kind or a turn (review on #459)
 */
describe("the shape glide", () => {
    const box = {};
    const ring = {};
    const square = (half: number, gap = false): FramePoints => ({
        outline: [
            { x: -half, y: -half },
            { x: half, y: -half },
            { x: half, y: half },
            { x: -half, y: half },
        ],
        handles: [
            { x: half, y: 0 },
            { x: 0, y: half },
        ],
        knob: { at: { x: 0, y: -half - 10 }, stem: { x: 0, y: -half } },
        centerDot: { x: 0, y: 0 },
        pivotMark: { x: -half, y: -half },
        ...(gap ? { gaps: [{ x: 0, y: -half }] } : {}),
    });
    const spot = (x: number) => [{ id: 1, to: { x, y: 0 } }];
    const shape = (
        session: unknown,
        params: unknown,
        over: { kind?: unknown; rotation?: number } = {},
    ) => ({
        session,
        kind: over.kind ?? box,
        params,
        rotation: over.rotation ?? 0,
        gesture: false,
    });
    /** Halfway through a glide, eased */
    const mid = GLIDE_MS / 2;
    const between = (from: number, to: number, shown: number) =>
        Math.abs(shown) > Math.min(Math.abs(from), Math.abs(to)) &&
        Math.abs(shown) < Math.max(Math.abs(from), Math.abs(to));

    it("−/+ on the same shape glides its outline, handles, knob, center, pivot mark and gap", () => {
        const g = new ShapeGlide();
        const s = [{}];
        g.update(shape(s, {}), spot(0), square(10, true), 0);
        const next = square(20, true);
        g.update(shape(s, {}), spot(5), next, 0);
        const shown = g.frame(mid, next);
        expect(between(10, 20, shown.outline![1]!.x)).toBe(true);
        expect(between(10, 20, shown.handles[0]!.x)).toBe(true);
        expect(between(-20, -30, shown.knob!.at.y)).toBe(true);
        expect(between(-10, -20, shown.pivotMark!.x)).toBe(true);
        expect(between(-10, -20, shown.gaps![0]!.y)).toBe(true);
        expect(shown.centerDot).toEqual({ x: 0, y: 0 });
        // And lands exactly
        expect(g.frame(GLIDE_MS + 1, next)).toEqual(next);
    });

    it("a second shape opened doesn't glide anything from the first", () => {
        const g = new ShapeGlide();
        g.update(shape([{}], {}), spot(0), square(10), 0);
        const next = square(40);
        g.update(shape([{}], {}), spot(100), next, 0);
        expect(g.positions(mid)).toBeNull();
        expect(g.frame(mid, next)).toEqual(next);
    });

    it("after a reset (closed), the next shape doesn't glide from before", () => {
        const g = new ShapeGlide();
        const s = [{}];
        g.update(shape(s, {}), spot(0), square(10), 0);
        g.reset();
        const next = square(40);
        g.update(shape(s, {}), spot(100), next, 0);
        expect(g.positions(mid)).toBeNull();
        expect(g.frame(mid, next)).toEqual(next);
    });

    it("a change of kind glides the spots but not the frame", () => {
        const g = new ShapeGlide();
        const s = [{}];
        g.update(shape(s, {}), spot(0), square(10), 0);
        const next = square(20);
        g.update(shape(s, {}, { kind: ring }), spot(10), next, 0);
        expect(between(0, 10, g.positions(mid)!.get(1)!.x)).toBe(true);
        expect(g.frame(mid, next)).toEqual(next);
    });

    it("a quarter turn glides the spots but not the frame", () => {
        const g = new ShapeGlide();
        const s = [{}];
        g.update(shape(s, {}), spot(0), square(10), 0);
        const next = square(20);
        g.update(shape(s, {}, { rotation: Math.PI / 2 }), spot(10), next, 0);
        expect(between(0, 10, g.positions(mid)!.get(1)!.x)).toBe(true);
        expect(g.frame(mid, next)).toEqual(next);
    });

    it("doesn't pair frame points when which ones are drawn changes (a gap appears)", () => {
        const g = new ShapeGlide();
        const s = [{}];
        g.update(shape(s, {}), spot(0), square(10), 0);
        const next = square(20, true);
        g.update(shape(s, {}), spot(10), next, 0);
        expect(g.frame(mid, next)).toEqual(next);
    });
});
