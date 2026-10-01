import { describe, expect, it } from "vitest";
import { createResolver, type Resolver } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { StepSize } from "@/global/classes/StepSize";
import { evaluatePathWarning } from "@/global/classes/canvasObjects/stepSizeWarning";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import MarcherVisualGroup from "@/global/classes/MarcherVisualGroup";
import TimelinePathway from "@/global/classes/canvasObjects/TimelinePathway";
import Pathway from "@/global/classes/canvasObjects/Pathway";
import Endpoint from "@/global/classes/canvasObjects/Endpoint";
import Midpoint from "@/global/classes/canvasObjects/Midpoint";
import type Marcher from "@/global/classes/Marcher";
import { defaultSettings } from "@/stores/UiSettingsStore";
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

describe("renderTimelinePathVisuals", () => {
    const marcher = {
        id: 1,
        name: null,
        section: "Brass",
        year: null,
        notes: null,
        drill_prefix: "B",
        drill_order: 1,
        drill_number: "B1",
        type: "marcher",
    } as unknown as Marcher;

    const setup = () => {
        const canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties,
            uiSettings: defaultSettings,
        });
        const visual = new MarcherVisualGroup({ marcher });
        for (const object of [
            visual.getCanvasMarcher(),
            visual.getPreviousPathway(),
            visual.getNextPathway(),
            visual.getPreviousMidpoint(),
            visual.getNextMidpoint(),
            visual.getPreviousEndpoint(),
            visual.getNextEndpoint(),
        ])
            canvas.add(object);
        return { canvas, visual, marcherVisuals: { 1: visual } };
    };

    it("draws the curved paths and hides the straight page-mode lines", () => {
        const { canvas, visual, marcherVisuals } = setup();
        const resolver = resolverFor("G8");
        visual.getPreviousPathway().show();
        visual.getNextPathway().show();
        const into = pathsIntoPage(resolver, [1], page(4, 4), page(0));
        const out = pathsIntoPage(resolver, [1], page(8, 4), page(4, 4));

        canvas.renderTimelinePathVisuals({
            marcherVisuals,
            marcherIds: [1],
            previousPaths: into,
            nextPaths: out,
            previousPathsEnabled: true,
            nextPathsEnabled: true,
            stepSizeWarningsEnabled: false,
            fieldProperties,
        });

        expect(visual.getPreviousPathway().visible).toBe(false);
        expect(visual.getNextPathway().visible).toBe(false);
        const previous = visual.getPreviousTimelinePathway();
        const next = visual.getNextTimelinePathway();
        expect(canvas.getObjectsByType(TimelinePathway)).toHaveLength(2);
        expect(previous.visible).toBe(true);
        expect(next.visible).toBe(true);
        // Offset by half a grid line, like the dots, so the path runs through them
        const offset = TimelinePathway.gridOffset;
        expect(offset).toBeGreaterThan(0);
        expect(previous.points!.map((p) => ({ x: p.x, y: p.y }))).toEqual(
            into.get(1)!.points.map((p) => ({
                x: p.x + offset,
                y: p.y + offset,
            })),
        );
        // Stacked under the dots, where the straight line it replaces sits
        const objects = canvas.getObjects();
        expect(objects.indexOf(previous)).toBeLessThan(
            objects.indexOf(visual.getPreviousMidpoint()),
        );
        expect(objects.indexOf(next)).toBeLessThan(
            objects.indexOf(visual.getNextEndpoint()),
        );
        expect(next.points!.length).toBeGreaterThan(2);

        // Endpoints: where the move into the page starts, and where the next move ends
        const [px, py] = resolver.positionAt(1, 0);
        const [nx, ny] = resolver.positionAt(1, 8);
        const previousEndpoint = visual.getPreviousEndpoint();
        const nextEndpoint = visual.getNextEndpoint();
        expect(previousEndpoint.visible).toBe(true);
        expect(nextEndpoint.visible).toBe(true);
        const endpointAt = (e: typeof previousEndpoint) => ({
            left: e.left,
            top: e.top,
        });
        const expectedPrevious = setupEndpointAt(px, py);
        const expectedNext = setupEndpointAt(nx, ny);
        expect(endpointAt(previousEndpoint)).toEqual(expectedPrevious);
        expect(endpointAt(nextEndpoint)).toEqual(expectedNext);

        // The midpoint is the midset of the move, on the arc
        const [mx, my] = resolver.positionAt(1, 2);
        const probe = visual.getPreviousMidpoint();
        const reference = new Midpoint({
            marcherId: 1,
            start: { x: mx, y: my },
            end: { x: mx, y: my },
            innerColor: "white",
            outerColor: "black",
        });
        expect({ left: probe.left, top: probe.top }).toEqual({
            left: reference.left,
            top: reference.top,
        });
    });

    it("hides a side with no path and keeps the toggles", () => {
        const { canvas, visual, marcherVisuals } = setup();
        const resolver = resolverFor("G8");
        canvas.renderTimelinePathVisuals({
            marcherVisuals,
            marcherIds: [1],
            previousPaths: new Map(),
            nextPaths: pathsIntoPage(resolver, [1], page(8), page(0)),
            previousPathsEnabled: true,
            nextPathsEnabled: false,
            stepSizeWarningsEnabled: false,
            fieldProperties,
        });
        expect(visual.getPreviousTimelinePathway().visible).toBe(false);
        expect(visual.getPreviousMidpoint().visible).toBe(false);
        expect(visual.getPreviousEndpoint().visible).toBe(false);
        // Next paths are toggled off and warnings are off, so nothing forces it on
        expect(visual.getNextTimelinePathway().visible).toBe(false);
        expect(visual.getNextEndpoint().visible).toBe(false);
    });

    it("removes the curved paths, which page mode never creates", () => {
        const { canvas, visual, marcherVisuals } = setup();
        expect(canvas.getObjectsByType(TimelinePathway)).toHaveLength(0);
        canvas.renderTimelinePathVisuals({
            marcherVisuals,
            marcherIds: [1],
            previousPaths: new Map(),
            nextPaths: new Map(),
            previousPathsEnabled: true,
            nextPathsEnabled: true,
            stepSizeWarningsEnabled: true,
            fieldProperties,
        });
        expect(canvas.getObjectsByType(TimelinePathway)).toHaveLength(2);
        canvas.removeTimelinePathways();
        expect(canvas.getObjectsByType(TimelinePathway)).toHaveLength(0);
        // The straight page-mode lines stay on the canvas
        expect(canvas.getObjectsByType(Pathway)).toHaveLength(2);
        expect(visual.getPreviousPathway().canvas).toBe(canvas);
    });
});

/** Where an Endpoint at (x, y) puts its fabric position (built the way the canvas builds it). */
function setupEndpointAt(x: number, y: number) {
    const endpoint = new Endpoint({
        coordinate: { x: 0, y: 0 },
        marcherId: 2,
        dotRadius: 3,
        color: "black",
    });
    endpoint.updateCoords({ x, y });
    return { left: endpoint.left, top: endpoint.top };
}
