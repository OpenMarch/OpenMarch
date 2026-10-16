import { describe, expect, it } from "vitest";
import { createResolver, type Resolver } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { StepSize } from "@/global/classes/StepSize";
import { evaluatePathWarning } from "@/timeline/stepSizeWarning";
import { GOLDEN_FIXTURES } from "../fixtures/goldenFixtures";
import { sampleMarcherPath } from "../timelineKeyframes";
import {
    PATH_DRAW_TOLERANCE,
    pathIntoPage,
    pathsIntoPage,
    sampleTimelinePath,
    timelineMinMaxStepSizes,
    timelineStepSize,
    type PathPage,
} from "../timelinePaths";

/**
 * Timeline-mode path visuals and step sizes (docs/timeline/phases/07-page-parity.md P7.10):
 * paths are sampled from the resolver between page end beats, so arcs and follow-the-leader
 * moves come out curved, never as a straight line between the ends.
 */

const resolverFor = (name: string): Resolver =>
    createResolver(GOLDEN_FIXTURES.find((g) => g.name === name)!.build().show);

/** A page whose end beat (`pageEndBeat`) is `endBeat`, with `counts` counts. */
const page = (endBeat: number, counts = 8): PathPage => ({
    counts,
    beats: endBeat > 0 ? [{ index: endBeat - 1 }] : [],
});

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;

/** The distance from `p` to the nearest point on the polyline. */
function distanceToPolyline(
    p: readonly [number, number],
    points: readonly { x: number; y: number }[],
): number {
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
    if (points.length === 1)
        best = Math.hypot(p[0] - points[0]!.x, p[1] - points[0]!.y);
    return best;
}

/** The farthest any resolver position in [from, to] is from the polyline. */
function worstDeviation(
    resolver: Resolver,
    marcherId: number,
    from: number,
    to: number,
    points: readonly { x: number; y: number }[],
    samples = 400,
): number {
    let worst = 0;
    for (let i = 0; i <= samples; i++) {
        const beat = from + ((to - from) * i) / samples;
        worst = Math.max(
            worst,
            distanceToPolyline(resolver.positionAt(marcherId, beat), points),
        );
    }
    return worst;
}

describe("sampleMarcherPath", () => {
    it("gives a direct move as its two ends", () => {
        const resolver = resolverFor("G1");
        const { points } = sampleMarcherPath(resolver, 1, 0, 16);
        expect(points).toEqual([
            [...resolver.positionAt(1, 0)],
            [...resolver.positionAt(1, 16)],
        ]);
    });

    it.each(["G8", "G8b"])(
        "follows the %s arc within the tolerance",
        (name) => {
            const resolver = resolverFor(name);
            const { points, maxErrorAboveTolerance } = sampleMarcherPath(
                resolver,
                1,
                0,
                8,
                { tolerance: 0.01 },
            );
            expect(points.length).toBeGreaterThan(2);
            expect(maxErrorAboveTolerance).toBe(0);
            const xy = points.map(([x, y]) => ({ x, y }));
            // A dense check between the probes, with a little slack for the sampled bound
            expect(worstDeviation(resolver, 1, 0, 8, xy)).toBeLessThan(0.02);
        },
    );

    it("rejects an empty range", () => {
        expect(() => sampleMarcherPath(resolverFor("G1"), 1, 4, 4)).toThrow(
            RangeError,
        );
    });

    it("drops repeated points where the marcher holds", () => {
        // G4: a move over [0, 8], a hold over [8, 12], then a move over [12, 20]
        const resolver = resolverFor("G4");
        const { points } = sampleMarcherPath(resolver, 1, 0, 20);
        for (let i = 1; i < points.length; i++)
            expect(points[i]).not.toEqual(points[i - 1]);
        expect(points).toContainEqual([...resolver.positionAt(1, 10)]);
    });
});

describe("sampleTimelinePath", () => {
    it("draws an arc as a curve, with the midset on it", () => {
        const resolver = resolverFor("G8");
        const path = sampleTimelinePath(resolver, 1, 0, 8)!;
        const [sx, sy] = resolver.positionAt(1, 0);
        const [ex, ey] = resolver.positionAt(1, 8);
        expect(path.start).toEqual({ x: sx, y: sy });
        expect(path.end).toEqual({ x: ex, y: ey });

        const [mx, my] = resolver.positionAt(1, 4);
        expect(path.midpoint).toEqual({ x: mx, y: my });
        // A semicircle's midset is off the chord, so a straight line would put it elsewhere
        const chordMid = { x: (sx + ex) / 2, y: (sy + ey) / 2 };
        expect(Math.hypot(mx - chordMid.x, my - chordMid.y)).toBeGreaterThan(1);

        expect(
            worstDeviation(resolver, 1, 0, 8, path.points),
        ).toBeLessThanOrEqual(PATH_DRAW_TOLERANCE * 1.5);
        // Half a circle of diameter 8 is 4π long; the polyline is a little shorter
        const chord = Math.hypot(ex - sx, ey - sy);
        expect(chord).toBeCloseTo(8);
        expect(path.length).toBeGreaterThan(4 * Math.PI - 0.1);
        expect(path.length).toBeLessThanOrEqual(4 * Math.PI + 1e-9);
    });

    it("follows a follow-the-leader move", () => {
        // G6's T2 (beats 4 to 12) is follow-the-leader along a bent trail
        const resolver = resolverFor("G6");
        for (const marcherId of resolver.marcherIds()) {
            const path = sampleTimelinePath(resolver, marcherId, 4, 12)!;
            expect(
                worstDeviation(resolver, marcherId, 4, 12, path.points),
            ).toBeLessThanOrEqual(PATH_DRAW_TOLERANCE * 1.5);
        }
        // At least one marcher turns a corner, so its path isn't a straight line
        const bent = resolver.marcherIds().some((id) => {
            const path = sampleTimelinePath(resolver, id, 4, 12)!;
            const chord = Math.hypot(
                path.end.x - path.start.x,
                path.end.y - path.start.y,
            );
            return path.length > chord + 0.5;
        });
        expect(bent).toBe(true);
    });

    it("is null for an unknown marcher or an empty range", () => {
        const resolver = resolverFor("G1");
        expect(sampleTimelinePath(resolver, 99, 0, 8)).toBeNull();
        expect(sampleTimelinePath(resolver, 1, 8, 8)).toBeNull();
    });
});

describe("paths between page end beats", () => {
    it("samples the move into a page from the previous page's end beat", () => {
        const resolver = resolverFor("G8");
        const path = pathIntoPage(resolver, 1, page(8), page(0))!;
        expect(path).toEqual(sampleTimelinePath(resolver, 1, 0, 8));
    });

    it("has no move into the first page", () => {
        const resolver = resolverFor("G1");
        expect(pathIntoPage(resolver, 1, page(1), null)).toBeNull();
        expect(pathsIntoPage(resolver, [1], page(1), null).size).toBe(0);
        expect(pathsIntoPage(resolver, [1], null, page(1)).size).toBe(0);
    });

    it("leaves out marchers the resolver doesn't know", () => {
        const resolver = resolverFor("G6");
        const paths = pathsIntoPage(resolver, [1, 2, 99], page(12), page(4));
        expect([...paths.keys()]).toEqual([1, 2]);
    });
});

describe("step sizes from the resolver", () => {
    it("matches page mode's straight-line step size for a direct move", () => {
        const resolver = resolverFor("G1");
        const stepSize = timelineStepSize({
            resolver,
            marcherId: 1,
            page: page(16, 16),
            previousPage: page(0),
            fieldProperties,
        })!;
        const [sx, sy] = resolver.positionAt(1, 0);
        const [ex, ey] = resolver.positionAt(1, 16);
        const straight = new StepSize({
            marcher_id: 1,
            startingX: sx,
            startingY: sy,
            endingX: ex,
            endingY: ey,
            counts: 16,
            fieldProperties,
        });
        expect(stepSize.stepsPerFiveYards).toBeCloseTo(
            straight.stepsPerFiveYards,
            9,
        );
        expect(stepSize.marcher_id).toBe(1);
    });

    it("uses the distance along an arc, not the chord", () => {
        const resolver = resolverFor("G8");
        const stepSize = timelineStepSize({
            resolver,
            marcherId: 1,
            page: page(8),
            previousPage: page(0),
            fieldProperties,
        })!;
        const chord = StepSize.fromDistance({
            marcher_id: 1,
            distance: 8,
            counts: 8,
            fieldProperties,
        });
        // A longer walk is a bigger step: fewer steps per five yards
        expect(stepSize.stepsPerFiveYards).toBeLessThan(
            chord.stepsPerFiveYards,
        );
        // The stride is the drawn path's length per count. G8's arc is tiny (radius 4 field
        // units), so the 0.25 tolerance costs about 1% here; at field scale it is far less.
        const path = sampleTimelinePath(resolver, 1, 0, 8)!;
        expect(path.stride).toBeCloseTo(path.length / 8, 12);
        expect(path.stride).toBeGreaterThan((4 * Math.PI * 0.99) / 8);
        expect(path.stride).toBeLessThanOrEqual((4 * Math.PI) / 8 + 1e-12);
    });

    it("is undefined on the first page and holds show as a hold", () => {
        const resolver = resolverFor("G4");
        expect(
            timelineStepSize({
                resolver,
                marcherId: 1,
                page: page(1),
                previousPage: null,
                fieldProperties,
            }),
        ).toBeUndefined();
        // G4 holds over [8, 12]
        expect(
            timelineStepSize({
                resolver,
                marcherId: 1,
                page: page(12, 4),
                previousPage: page(8),
                fieldProperties,
            })!.displayString(),
        ).toBe("Hold");
    });

    it("finds the smallest and largest step among several marchers", () => {
        const resolver = resolverFor("G6");
        const ids = [...resolver.marcherIds()];
        const all = ids.map(
            (marcherId) =>
                timelineStepSize({
                    resolver,
                    marcherId,
                    page: page(12),
                    previousPage: page(4),
                    fieldProperties,
                })!,
        );
        const { min, max } = timelineMinMaxStepSizes({
            resolver,
            marcherIds: ids,
            page: page(12),
            previousPage: page(4),
            fieldProperties,
        });
        const sorted = [...all].sort(StepSize.compare);
        expect(min!.marcher_id).toBe(sorted[0]!.marcher_id);
        expect(max!.marcher_id).toBe(sorted[sorted.length - 1]!.marcher_id);
    });
});

describe("evaluatePathWarning with a distance", () => {
    it("warns on the distance walked rather than the chord", () => {
        const threshold = fieldProperties.stepSizeWarningThresholdInches;
        const props = fieldProperties;
        // A short chord that is fine on its own, walked along a path long enough to warn
        const counts = 8;
        const base = {
            start: { x: 0, y: 0 },
            end: { x: 1, y: 0 },
            counts,
            fieldProperties: props,
            pathEnabled: true,
            allowForceShow: true,
        };
        expect(threshold).toBeGreaterThan(0);
        expect(evaluatePathWarning(base).isWarning).toBe(false);
        const tooFar =
            ((threshold + 1) * counts * props.pixelsPerStep) /
            props.stepSizeInches;
        expect(
            evaluatePathWarning({ ...base, distance: tooFar }).isWarning,
        ).toBe(true);
    });
});
