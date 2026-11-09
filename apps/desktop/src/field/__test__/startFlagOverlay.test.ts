import { describe, expect, it } from "vitest";
import {
    createResolver,
    FieldProperties,
    type Resolver,
} from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { GOLDEN_FIXTURES } from "@/timeline/fixtures/goldenFixtures";
import {
    STEP_SIZE_WARNING_COLOR,
    STEP_SIZE_WARNING_STROKE_WIDTH,
    WARNING_PATHWAY_DASH,
} from "@/timeline/stepSizeWarning";
import type { StartFlagLevels } from "@/timeline/startFlagLevels";
import {
    planStartFlagOverlay,
    START_FLAG_DOT_RADIUS,
    START_FLAG_PATH_COLOR,
    START_FLAG_PATH_WIDTH,
    type StartFlagOverlayInput,
} from "../startFlagOverlay";
import { rgbaOf } from "../timelineOverlays";

/**
 * Start flag positions (fork #331): a dot where each marcher is at the start flag, and the route
 * it walks from there to the playhead, for the marchers the levels draw.
 */

const resolverFor = (name: string): Resolver =>
    createResolver(GOLDEN_FIXTURES.find((g) => g.name === name)!.build().show);

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;

const levels = (
    dots: StartFlagLevels["dots"],
    paths: StartFlagLevels["paths"],
): StartFlagLevels => ({ dots, paths });

function input(
    resolver: Resolver,
    overrides: Partial<StartFlagOverlayInput> = {},
): StartFlagOverlayInput {
    return {
        resolver,
        marcherIds: [...resolver.marcherIds()],
        selectedIds: new Set<number>(),
        fromBeat: 4,
        toBeat: 12,
        levels: levels("all", "off"),
        stepSizeWarnings: false,
        fieldProperties,
        ...overrides,
    };
}

const empty = {
    dots: { units: "field", strokes: [], dots: [], labels: [] },
    paths: { units: "screen", strokes: [], dots: [], labels: [] },
};

type Point = { readonly x: number; readonly y: number };

/** The distance from `p` to the nearest point on the polyline. */
function distanceToPolyline(
    p: readonly [number, number],
    points: readonly Point[],
) {
    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const t =
            len2 === 0
                ? 0
                : Math.max(
                      0,
                      Math.min(
                          1,
                          ((p[0] - a.x) * dx + (p[1] - a.y) * dy) / len2,
                      ),
                  );
        best = Math.min(
            best,
            Math.hypot(p[0] - (a.x + t * dx), p[1] - (a.y + t * dy)),
        );
    }
    return best;
}

/** The farthest any resolver position in [from, to] is from the drawn strokes. */
function worstDeviation(
    resolver: Resolver,
    marcherId: number,
    from: number,
    to: number,
    strokes: readonly { readonly points: readonly Point[] }[],
    samples = 400,
): number {
    let worst = 0;
    for (let i = 0; i <= samples; i++) {
        const beat = from + ((to - from) * i) / samples;
        const p = resolver.positionAt(marcherId, beat);
        worst = Math.max(
            worst,
            Math.min(...strokes.map((s) => distanceToPolyline(p, s.points))),
        );
    }
    return worst;
}

const dotCenters = (plan: ReturnType<typeof planStartFlagOverlay>) =>
    plan.dots.dots.map((d) => [d.x, d.y]);

describe("planStartFlagOverlay dots", () => {
    it("puts a small black dot, in field units, where each marcher is at the start flag", () => {
        // G6: the four marchers stand on T1's line at beat 4, then follow the leader to beat 12
        const plan = planStartFlagOverlay(input(resolverFor("G6")));
        expect(plan.dots.units).toBe("field");
        expect(dotCenters(plan)).toEqual([
            [0, 0],
            [2, 0],
            [4, 0],
            [6, 0],
        ]);
        for (const dot of plan.dots.dots) {
            expect(dot.radius).toBe(START_FLAG_DOT_RADIUS);
            expect(dot.fill).toEqual([0, 0, 0, 1]);
            expect(dot.stroke).toBeNull();
        }
        expect(plan.dots.labels).toEqual([]);
        // A third of a marcher's diameter (marchers are drawn with radius 5)
        expect(START_FLAG_DOT_RADIUS).toBeCloseTo(5 / 3, 5);
    });

    it("draws each dot in its marcher's shape", () => {
        const resolver = resolverFor("G6");
        const [a, b, c] = resolver.marcherIds();
        const shapes = new Map([
            [a!, "square" as const],
            [b!, "triangle" as const],
            [c!, "cross" as const],
        ]);
        const plan = planStartFlagOverlay(
            input(resolver, { shapeOf: (id) => shapes.get(id) ?? "circle" }),
        );
        expect(plan.dots.dots.map((d) => d.shape ?? "circle")).toEqual([
            "square",
            "triangle",
            "cross",
            "circle",
        ]);
        // The same size step: a third of the marcher it stands for
        for (const dot of plan.dots.dots)
            expect(dot.radius).toBe(START_FLAG_DOT_RADIUS);
    });

    it("draws nothing for a marcher who doesn't move across the window", () => {
        // G4 holds still over [8, 12]
        const g4 = resolverFor("G4");
        expect(
            planStartFlagOverlay(
                input(g4, {
                    fromBeat: 8,
                    toBeat: 12,
                    levels: levels("all", "all"),
                }),
            ),
        ).toEqual(empty);
        // G6's marchers already stand on T1's line (their homes) over [0, 4]
        const g6 = resolverFor("G6");
        expect(
            planStartFlagOverlay(
                input(g6, {
                    fromBeat: 0,
                    toBeat: 4,
                    levels: levels("all", "all"),
                }),
            ),
        ).toEqual(empty);
        // Holding at the start and moving later in the window still counts as moving
        expect(
            dotCenters(
                planStartFlagOverlay(input(g4, { fromBeat: 8, toBeat: 16 })),
            ),
        ).toEqual([[8, 0]]);
    });

    it("skips a marcher the resolver doesn't know yet, without throwing", () => {
        // Marcher rows can arrive before the resolver is rebuilt with them
        const g6 = resolverFor("G6");
        for (const paths of ["off", "all"] as const)
            expect(
                planStartFlagOverlay(
                    input(g6, {
                        marcherIds: [1, 99, 2],
                        levels: levels("all", paths),
                    }),
                ),
            ).toEqual(
                planStartFlagOverlay(
                    input(g6, {
                        marcherIds: [1, 2],
                        levels: levels("all", paths),
                    }),
                ),
            );
    });
});

describe("planStartFlagOverlay windows", () => {
    it("draws nothing at home or when the start flag isn't before the playhead", () => {
        const g6 = resolverFor("G6");
        const all = levels("all", "all");
        for (const [fromBeat, toBeat] of [
            [0, 0],
            [8, 8],
            [12, 4],
        ])
            expect(
                planStartFlagOverlay(
                    input(g6, { fromBeat, toBeat, levels: all }),
                ),
            ).toEqual(empty);
    });
});

describe("planStartFlagOverlay levels", () => {
    const g6 = resolverFor("G6");

    it("draws no dots when dots are off", () => {
        expect(
            planStartFlagOverlay(input(g6, { levels: levels("off", "off") })),
        ).toEqual(empty);
    });

    it("draws dots only for the selected marchers at Selected", () => {
        const plan = planStartFlagOverlay(
            input(g6, {
                levels: levels("selected", "off"),
                selectedIds: new Set([2, 4]),
            }),
        );
        expect(dotCenters(plan)).toEqual([
            [2, 0],
            [6, 0],
        ]);
    });

    it("draws nothing at Selected with nothing selected", () => {
        expect(
            planStartFlagOverlay(
                input(g6, { levels: levels("selected", "selected") }),
            ),
        ).toEqual(empty);
    });
});

describe("planStartFlagOverlay paths", () => {
    it("draws the route as a thin gray screen-pixel line with no markers", () => {
        const g6 = resolverFor("G6");
        const plan = planStartFlagOverlay(
            input(g6, { levels: levels("all", "all") }),
        );
        expect(plan.paths.units).toBe("screen");
        expect(plan.paths.dots).toEqual([]);
        expect(plan.paths.labels).toEqual([]);
        expect(plan.paths.strokes).toHaveLength(4);
        for (const stroke of plan.paths.strokes) {
            expect(stroke.width).toBe(START_FLAG_PATH_WIDTH);
            expect(stroke.color).toEqual(START_FLAG_PATH_COLOR);
            expect(stroke.dash).toBeNull();
        }
        expect(START_FLAG_PATH_WIDTH).toBe(1);
        // Gray: equal channels, neither black nor white
        const [r, g, b] = START_FLAG_PATH_COLOR;
        expect(r).toBe(g);
        expect(g).toBe(b);
        expect(r).toBeGreaterThan(0.2);
        expect(r).toBeLessThan(0.8);
    });

    it("draws an arc as the curve walked, not the chord", () => {
        // G8: a semicircle from (0, 0) to (8, 0) over [0, 8]
        const g8 = resolverFor("G8");
        const plan = planStartFlagOverlay(
            input(g8, { fromBeat: 0, toBeat: 8, levels: levels("all", "all") }),
        );
        const strokes = plan.paths.strokes;
        expect(strokes.length).toBeGreaterThan(0);
        expect(strokes[0]!.points[0]).toEqual({ x: 0, y: 0 });
        expect(strokes.at(-1)!.points.at(-1)).toEqual({ x: 8, y: 0 });
        expect(worstDeviation(g8, 1, 0, 8, strokes)).toBeLessThanOrEqual(0.25);
        // The semicircle's apex, 4 units off the chord, is on the line
        const apex = g8.positionAt(1, 4);
        expect(Math.abs(apex[1])).toBeCloseTo(4, 5);
        expect(
            distanceToPolyline(
                apex,
                strokes.flatMap((s) => s.points),
            ),
        ).toBeLessThanOrEqual(0.25);
    });

    it("follows a follow-the-leader move and a window over several moves", () => {
        // G6 over [0, 12]: T1 (a hold in place) then T2's follow-the-leader route
        const g6 = resolverFor("G6");
        const plan = planStartFlagOverlay(
            input(g6, {
                fromBeat: 0,
                toBeat: 12,
                levels: levels("all", "all"),
            }),
        );
        expect(plan.paths.strokes).toHaveLength(4);
        for (const [i, marcherId] of [1, 2, 3, 4].entries()) {
            const stroke = plan.paths.strokes[i]!;
            expect(
                worstDeviation(g6, marcherId, 0, 12, [stroke]),
            ).toBeLessThanOrEqual(0.25);
        }
        // G13's marcher 3 walks three moves over [0, 24], the last an arc
        const g13 = resolverFor("G13");
        const three = planStartFlagOverlay(
            input(g13, {
                marcherIds: [3],
                fromBeat: 0,
                toBeat: 24,
                levels: levels("all", "all"),
            }),
        );
        expect(three.paths.strokes.length).toBeGreaterThan(0);
        expect(
            worstDeviation(g13, 3, 0, 24, three.paths.strokes),
        ).toBeLessThanOrEqual(0.25);
    });
});

describe("planStartFlagOverlay path levels", () => {
    const g6 = resolverFor("G6");
    const pathStarts = (plan: ReturnType<typeof planStartFlagOverlay>) =>
        plan.paths.strokes.map((s) => [s.points[0]!.x, s.points[0]!.y]);

    it("draws paths only for the selected marchers at Selected, with every dot at All", () => {
        const plan = planStartFlagOverlay(
            input(g6, {
                levels: levels("all", "selected"),
                selectedIds: new Set([3]),
            }),
        );
        expect(dotCenters(plan)).toHaveLength(4);
        expect(pathStarts(plan)).toEqual([[4, 0]]);
    });

    it("never draws a path wider than the dots", () => {
        const selected = new Set([3]);
        // Paths at All with dots at Selected draw as Selected
        const plan = planStartFlagOverlay(
            input(g6, {
                levels: levels("selected", "all"),
                selectedIds: selected,
            }),
        );
        expect(dotCenters(plan)).toEqual([[4, 0]]);
        expect(pathStarts(plan)).toEqual([[4, 0]]);
        // With the dots off, nothing is drawn
        expect(
            planStartFlagOverlay(
                input(g6, {
                    levels: levels("off", "all"),
                    selectedIds: selected,
                }),
            ),
        ).toEqual(empty);
    });
});

describe("planStartFlagOverlay step-size warnings", () => {
    // G13's marcher 2 walks (0, 0) → (-2, 6) → (1, 8) over [0, 12] at under 2 in a step on this
    // field, then (1, 8) → (20, 20) over [12, 16] at about 11 in a step
    const g13 = resolverFor("G13");
    const strict = new FieldProperties({
        ...fieldProperties,
        stepSizeWarningThresholdInches: 6,
    });
    const red = rgbaOf(STEP_SIZE_WARNING_COLOR);
    const marcher2 = (overrides: Partial<StartFlagOverlayInput>) =>
        planStartFlagOverlay(
            input(g13, {
                marcherIds: [2],
                fromBeat: 0,
                toBeat: 16,
                levels: levels("all", "all"),
                fieldProperties: strict,
                ...overrides,
            }),
        );

    it("draws only the too-fast stretch red and dashed, in field units as next paths' warnings", () => {
        const plan = marcher2({ stepSizeWarnings: true });
        // The calm stretch stays a 1 px gray line on screen
        expect(plan.paths.strokes).toHaveLength(1);
        const calm = plan.paths.strokes[0]!;
        expect(calm.color).toEqual(START_FLAG_PATH_COLOR);
        expect(calm.width).toBe(START_FLAG_PATH_WIDTH);
        expect(calm.dash).toBeNull();
        expect(calm.points[0]).toEqual({ x: 0, y: 0 });
        expect(calm.points.at(-1)!.x).toBeCloseTo(1, 9);
        expect(calm.points.at(-1)!.y).toBeCloseTo(8, 9);
        // The warning goes with the dots, in field units, drawn under them
        expect(plan.dots.units).toBe("field");
        expect(plan.dots.strokes).toHaveLength(1);
        const fast = plan.dots.strokes[0]!;
        expect(fast.color).toEqual(red);
        expect(fast.width).toBe(STEP_SIZE_WARNING_STROKE_WIDTH);
        expect(fast.dash).toEqual(WARNING_PATHWAY_DASH);
        expect(fast.points[0]).toEqual(calm.points.at(-1));
        expect(fast.points.at(-1)).toEqual({ x: 20, y: 20 });
        expect(plan.dots.dots).toHaveLength(1);
    });

    it("draws no warning with warnings off", () => {
        const plan = marcher2({ stepSizeWarnings: false });
        expect(plan.dots.strokes).toEqual([]);
        const strokes = plan.paths.strokes;
        expect(strokes).toHaveLength(1);
        expect(strokes[0]!.color).toEqual(START_FLAG_PATH_COLOR);
        expect(strokes[0]!.dash).toBeNull();
        expect(strokes[0]!.points.at(-1)).toEqual({ x: 20, y: 20 });
    });

    it("draws no warning on a path that isn't drawn", () => {
        for (const plan of [
            marcher2({ stepSizeWarnings: true, levels: levels("all", "off") }),
            marcher2({
                stepSizeWarnings: true,
                levels: levels("all", "selected"),
                selectedIds: new Set([1]),
            }),
        ]) {
            expect(plan.paths.strokes).toEqual([]);
            expect(plan.dots.strokes).toEqual([]);
        }
    });

    it("doesn't warn on a calm window", () => {
        const plan = marcher2({ stepSizeWarnings: true, toBeat: 12 });
        expect(plan.dots.strokes).toEqual([]);
        const strokes = plan.paths.strokes;
        expect(strokes).toHaveLength(1);
        expect(strokes[0]!.dash).toBeNull();
    });
});
