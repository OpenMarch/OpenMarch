// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxFrame, type BoxParams } from "../../box/boxGeometry";
import { BOX_PARAMS } from "../../box/boxParams";
import { boxTool } from "../../box/boxTool";
import type { ToolEnv } from "../../tool/toolKind";
import type { XY } from "../../types";
import { withMode } from "../../distribute/modes";
import { DEFAULT_ODD_GAP } from "../../distribute/distribution";
import { scrubSpacing, withSpacing } from "../boxEdits";

/**
 * Guides while dragging a spacing (#452): grown from its pivot, a box's corner or center that
 * comes near one of the field's lines lands on it, the spacing becoming whatever that takes.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
/** Yard lines every 8 steps side to side; front sideline, front and back hash front to back */
const LINES = {
    x: [-160, -80, 0, 80, 160],
    y: [0, -280, -560],
};
const env = (over: Partial<ToolEnv> = {}): ToolEnv => ({
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
    fieldLines: LINES,
    pullRadius: 6,
    ...over,
});
const N = 12;
/** fine: off the half-step ladder, still pulled (owner on #453) */
const FINE = { snap: false, fine: true };
/** The Snap toggle off: no snapping at all */
const NO_SNAP = { snap: false, pull: false };
/** 4 files by 3 ranks, 2 steps apart, turned `degrees` around the default pivot */
const turned = (
    degrees: number,
    center: XY = { x: 40, y: -150 },
): BoxParams => ({
    center,
    rotation: (degrees * Math.PI) / 180,
    files: 4,
    across: 2 * STEP,
    deep: 2 * STEP,
});
const points = (p: BoxParams) => boxTool.snapPoints!(p, N);
const onLine = (p: XY) =>
    LINES.x.some((x) => Math.abs(p.x - x) < 1e-9) ||
    LINES.y.some((y) => Math.abs(p.y - y) < 1e-9);
const onHalves = (v: number) =>
    Math.abs(v / half - Math.round(v / half)) < 1e-9;
/** The across spacing dragged `px` for more */
const drag = (p: BoxParams, px: number, over: Partial<ToolEnv> = {}) =>
    scrubSpacing(p, "across", px, N, env(over));
/** Where the box would be with the spacing exactly where a drag of `px` has it, unrounded */
const freeAt = (p: BoxParams, px: number) =>
    withSpacing(
        p,
        "across",
        p.across / STEP + (px / 8) * 0.5,
        N,
        env({ snap: false }),
        true,
    );

describe("dragging a spacing onto a line", () => {
    it("a 45° box's across drag lands a corner exactly on a yard line, the spacing what that takes", () => {
        const p = turned(45);
        let landed: BoxParams | null = null;
        for (let px = 0; px <= 160 && !landed; px += 0.5) {
            const out = drag(p, px);
            if (!onHalves(out.across)) landed = out;
        }
        expect(landed).not.toBeNull();
        const corners = points(landed!).slice(0, 4);
        expect(
            corners.some((c) =>
                LINES.x.some((x) => Math.abs(c.x - x) < 1e-9),
            ) ||
                corners.some((c) =>
                    LINES.y.some((y) => Math.abs(c.y - y) < 1e-9),
                ),
        ).toBe(true);
        // Still turned 45°, the same count
        expect(landed!.rotation).toBe(p.rotation);
        expect(landed!.files).toBe(4);
    });

    it("gives only half steps or a point exactly on a line, and keeps every half step reachable", () => {
        const p = turned(45);
        const seen = new Set<string>();
        for (let px = 0; px <= 160; px += 0.25) {
            const out = drag(p, px);
            expect(onHalves(out.across) || points(out).some(onLine)).toBe(true);
            seen.add(out.across.toFixed(6));
        }
        // 2 steps up to 7: every half step on the way
        for (let steps = 2; steps <= 7; steps += 0.5)
            expect(seen.has((steps * STEP).toFixed(6)), `${steps}`).toBe(true);
    });

    for (const degrees of [15, 5, 1])
        it(`at ${degrees}°, a point travels no farther than the radius to catch a line`, () => {
            const p = turned(degrees, { x: 40, y: -275 });
            for (let px = 0; px <= 160; px += 0.25) {
                const out = drag(p, px);
                if (onHalves(out.across)) continue;
                // Pulled: some point is on a line, and no point moved more than 6 from the drag's
                const free = points(freeAt(p, px));
                const travel = Math.max(
                    ...points(out).map((q, k) =>
                        Math.hypot(q.x - free[k]!.x, q.y - free[k]!.y),
                    ),
                );
                expect(travel).toBeLessThanOrEqual(6 + 1e-3);
            }
        });

    it("doesn't pull far from lines", () => {
        const p = turned(45);
        const far = { fieldLines: { x: [5000], y: [5000] } };
        for (let px = 0; px <= 80; px += 1)
            expect(onHalves(drag(p, px, far).across)).toBe(true);
    });

    it("with fine, gives hundredths away from lines and still lands a corner on one (owner on #453)", () => {
        const p = turned(45);
        let landed = false;
        for (let px = 0; px <= 160; px += 0.5) {
            const out = drag(p, px, FINE);
            const hundredths = out.across / (STEP / 100);
            const onHundredths =
                Math.abs(hundredths - Math.round(hundredths)) < 1e-6;
            const onLineNow = points(out).some(onLine);
            expect(onHundredths || onLineNow).toBe(true);
            if (onLineNow && !onHundredths) landed = true;
        }
        expect(landed).toBe(true);
    });

    it("with the Snap toggle off, gives hundredths and pulls nothing (owner on #453)", () => {
        const p = turned(45);
        for (let px = 0; px <= 80; px += 1) {
            const out = drag(p, px, NO_SNAP);
            const hundredths = out.across / (STEP / 100);
            expect(Math.abs(hundredths - Math.round(hundredths))).toBeLessThan(
                1e-6,
            );
        }
    });

    it("never goes under half a step", () => {
        const p = turned(45);
        for (let px = -200; px <= 0; px += 1)
            expect(drag(p, px).across).toBeGreaterThanOrEqual(half - 1e-9);
    });

    it("keeps a typed spacing exact and the steppers on half steps, near a line or not", () => {
        const across = BOX_PARAMS.find((q) => q.key === "across")!;
        // 3 gaps 2 steps apart from x 15 to 75, growing from its west side: 2.15 steps
        // would put its right edge 1.5 short of the 80
        const p = turned(0, { x: 45, y: -150 });
        const west = { pivot: "w" as const };
        const typed = across.type!(p, N, "2.15", env(west)) as BoxParams;
        expect(typed.across).toBeCloseTo(21.5, 9);
        const wider = across.widen!(p, N, 0.5, env(west)) as BoxParams;
        expect(wider.across).toBe(25);
        // A drag to about the same spacing lands the right edge on the 80 instead: 2⅙ steps
        const dragged = drag(p, 2.4, west);
        const right = Math.max(
            ...points(dragged)
                .slice(0, 4)
                .map((c) => c.x),
        );
        expect(Math.abs(right - 80)).toBeLessThan(1e-9);
        expect(dragged.across).toBeCloseTo(65 / 3, 9);
        expect(boxFrame(dragged, N).rotation).toBe(0);
    });

    it("with the ratio lock, never takes the other spacing under half a step, and keeps the ratio (review)", () => {
        // 4 files 1 step apart, ½ deep, its right edge just past the 80, growing from back-left: a
        // landing on the 80 would take the spacing just under 1 step, and deep under ½
        const p: BoxParams = {
            center: { x: 80.1 - 15, y: -150 },
            rotation: 0,
            files: 4,
            across: STEP,
            deep: half,
        };
        const locked = { ratioLocked: true, pivot: "nw" as const };
        for (let px = -40; px <= 40; px += 0.25) {
            const out = drag(p, px, locked);
            expect(out.deep).toBeGreaterThanOrEqual(half - 1e-9);
            expect(out.across).toBeGreaterThanOrEqual(half - 1e-9);
            if (!onHalves(out.across))
                expect(out.deep / out.across).toBeCloseTo(0.5, 9);
        }
    });

    it("an outline ignores the ratio lock: its other spacing stays put and a landing isn't left out for it (review on #459)", () => {
        // The same box as an outline, 3 gaps each way: the landing on the 80 is fine as it is
        const p: BoxParams = {
            center: { x: 80.1 - 15, y: -150 },
            rotation: 0,
            files: 4,
            across: STEP,
            deep: half,
            distribution: { mode: "outline", oddGap: DEFAULT_ODD_GAP },
        };
        const locked = { ratioLocked: true, pivot: "nw" as const };
        let landed = false;
        for (let px = -4; px <= 4; px += 0.25) {
            const out = drag(p, px, locked);
            expect(out.deep).toBe(half);
            if (Math.abs(out.across - 29.9 / 3) < 1e-9) landed = true;
        }
        expect(landed).toBe(true);
    });

    describe("the cases the review probed", () => {
        const spread = (degrees: number) => {
            // 6 files by 4 ranks, so the frame is half as wide again as deep, then spread out
            const files: BoxParams = {
                center: { x: 30, y: -270 },
                rotation: (degrees * Math.PI) / 180,
                files: 6,
                across: 2 * STEP,
                deep: 2 * STEP,
            };
            return withMode(boxTool, files, 24, "spread", env()) as BoxParams;
        };
        const cases: {
            name: string;
            p: BoxParams;
            n?: number;
            which?: "across" | "deep";
            over?: Partial<ToolEnv>;
        }[] = [
            { name: "nw pivot at 45°", p: turned(45), over: { pivot: "nw" } },
            {
                name: "nw pivot at 0°",
                p: turned(0, { x: 52, y: -273 }),
                over: { pivot: "nw" },
            },
            {
                name: "a 90° deep drag",
                p: turned(90, { x: 76, y: -150 }),
                which: "deep",
            },
            {
                name: "ratio 2:1",
                p: { ...turned(30), deep: 4 * STEP },
                over: { ratioLocked: true },
            },
            {
                name: "ratio 1:3",
                p: { ...turned(30), across: 3 * STEP, deep: STEP },
                over: { ratioLocked: true },
            },
            { name: "a Spread at 37°, centered", p: spread(37), n: 24 },
            {
                name: "a Spread at 37°, nw",
                p: spread(37),
                n: 24,
                over: { pivot: "nw" },
            },
        ];
        for (const { name, p, n = N, which = "across", over = {} } of cases)
            it(`${name}: half steps or a point exactly on a line, the landing point within the radius, nothing under half a step`, () => {
                const own = (q: BoxParams) =>
                    which === "across" ? q.across : q.deep;
                const pts = (q: BoxParams) => boxTool.snapPoints!(q, n);
                for (let px = -60; px <= 120; px += 0.5) {
                    const out = scrubSpacing(p, which, px, n, env(over));
                    expect(out.across).toBeGreaterThanOrEqual(half - 1e-9);
                    expect(out.deep).toBeGreaterThanOrEqual(half - 1e-9);
                    if (onHalves(own(out)) || out === p) continue;
                    expect(pts(out).some(onLine)).toBe(true);
                    if (over.ratioLocked)
                        expect(out.deep / out.across).toBeCloseTo(
                            p.deep / p.across,
                            9,
                        );
                    const free = pts(
                        withSpacing(
                            p,
                            which,
                            own(p) / STEP + (px / 8) * 0.5,
                            n,
                            env({ ...over, snap: false }),
                            true,
                        ),
                    );
                    // The point that landed moved no more than the radius; the spacing never more
                    // than a quarter of a half step, so points farther from the pivot stay close too
                    const landed = pts(out)
                        .map((q, k) => ({ q, k }))
                        .filter(({ q }) => onLine(q))
                        .map(({ q, k }) =>
                            Math.hypot(q.x - free[k]!.x, q.y - free[k]!.y),
                        );
                    // (the reference keeps a typed spacing to 600ths of a step, hence the slack)
                    expect(Math.min(...landed)).toBeLessThanOrEqual(6 + 0.05);
                    const raw = own(p) + (px / 8) * 0.5 * STEP;
                    expect(Math.abs(own(out) - raw)).toBeLessThanOrEqual(
                        half / 4 + 1e-2,
                    );
                }
            });
    });
});
