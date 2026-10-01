import { describe, expect, it, vi } from "vitest";
import {
    createResolver,
    rgbaToString,
    type Resolver,
    type SpanInfo,
    type TimelineSnapshot,
} from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { StepSize } from "@/global/classes/StepSize";
import {
    evaluatePathWarning,
    STEP_SIZE_WARNING_COLOR,
    STEP_SIZE_WARNING_STROKE_WIDTH,
} from "@/global/classes/canvasObjects/stepSizeWarning";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import MarcherVisualGroup from "@/global/classes/MarcherVisualGroup";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import Pathway from "@/global/classes/canvasObjects/Pathway";
import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import LineListeners from "@/components/canvas/listeners/LineListeners";
import type Marcher from "@/global/classes/Marcher";
import { defaultSettings } from "@/stores/UiSettingsStore";
import { GOLDEN_FIXTURES } from "../fixtures/goldenFixtures";
import { P, rowBuilder, tr } from "../fixtures/fixtureTypes";
import { pageEndBeat } from "../timelineCanvas";
import { sampleMarcherPath } from "../timelineKeyframes";
import {
    pathsIntoPage,
    sampleTimelinePath,
    stepSizeOfPath,
    timelineStepSize,
    type PathPage,
} from "../timelinePaths";

/**
 * Review fixes for P7.10 (PR #33): the step size is the stride of the fastest moving stretch,
 * count seeding for zig-zags, the real first and last page shapes, mid-page corners, warning
 * styling, the sampling budget and the line tool's marcher ids.
 */

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;

/** A page whose end beat is `endBeat`, with `counts` counts. */
const page = (endBeat: number, counts = 8): PathPage => ({
    counts,
    beats: endBeat > 0 ? [{ index: endBeat - 1 }] : [],
});

/** One marcher at the origin that holds 4 counts, then moves `steps` steps east in 4 counts. */
const holdThenMove = (steps: number): Resolver => {
    const row = rowBuilder();
    const show: TimelineSnapshot = {
        marchers: [{ id: 1, home: [0, 0] }],
        shapes: { 1: P(steps * STEP, 0) },
        transitions: { 1: tr(1, 4, 8, 1) },
        assignments: [row(1, 1, 0, 4, 8)],
    };
    return createResolver(show);
};

const marcher = (id: number) =>
    ({
        id,
        name: null,
        section: "Brass",
        year: null,
        notes: null,
        drill_prefix: "B",
        drill_order: id,
        drill_number: `B${id}`,
        type: "marcher",
    }) as unknown as Marcher;

describe("step size: the stride of the fastest moving stretch", () => {
    it("isn't diluted by a hold: 8 steps in the last 4 counts of an 8-count page", () => {
        const resolver = holdThenMove(8);
        const path = sampleTimelinePath(resolver, 1, 0, 8)!;
        // 2 steps per count, not the page average of 1
        expect(path.stride / STEP).toBeCloseTo(2, 12);
        const stepSize = timelineStepSize({
            resolver,
            marcherId: 1,
            page: page(8),
            previousPage: page(0),
            fieldProperties,
        })!;
        expect(stepSize.displayString()).toBe("4 to 5");
        // The page average would read 8 to 5
        expect(
            StepSize.fromDistance({
                marcher_id: 1,
                distance: 8 * STEP,
                counts: 8,
                fieldProperties,
            }).displayString(),
        ).toBe("8 to 5");
    });

    it("warns when the fast stretch is over the threshold though the page average isn't", () => {
        // 9 steps in 4 counts: about 50.6 inches a step, over the default 45-inch threshold.
        // (8 steps in 4 counts is exactly 45 inches, on the threshold, which doesn't warn.)
        const resolver = holdThenMove(9);
        const path = sampleTimelinePath(resolver, 1, 0, 8)!;
        const warn = (distance: number, counts: number) =>
            evaluatePathWarning({
                start: path.start,
                end: path.end,
                distance,
                counts,
                fieldProperties,
                pathEnabled: true,
                allowForceShow: true,
            }).isWarning;
        expect(warn(path.stride, 1)).toBe(true);
        expect(warn(path.length, 8)).toBe(false);
        expect(
            stepSizeOfPath(1, path, fieldProperties).exceedsThreshold(
                fieldProperties.stepSizeWarningThresholdInches,
            ),
        ).toBe(true);
    });

    it("puts the midpoint on the start endpoint when a hold covers the first half", () => {
        const path = sampleTimelinePath(holdThenMove(8), 1, 0, 8)!;
        expect(path.midpoint).toEqual(path.start);
    });

    it("equals page mode's step size for a straight move over the whole page", () => {
        const row = rowBuilder();
        const resolver = createResolver({
            marchers: [{ id: 1, home: [0, 0] }],
            shapes: { 1: P(6 * STEP, 8 * STEP) },
            transitions: { 1: tr(1, 0, 8, 1) },
            assignments: [row(1, 1, 0, 0, 8)],
        });
        const stepSize = timelineStepSize({
            resolver,
            marcherId: 1,
            page: page(8),
            previousPage: page(0),
            fieldProperties,
        })!;
        const pageMode = new StepSize({
            marcher_id: 1,
            startingX: 0,
            startingY: 0,
            endingX: 6 * STEP,
            endingY: 8 * STEP,
            counts: 8,
            fieldProperties,
        });
        expect(stepSize.stepsPerFiveYards).toBeCloseTo(
            pageMode.stepsPerFiveYards,
            9,
        );
    });
});

describe("page shapes and corners", () => {
    it("handles the real first page (beat 0, no counts) and the last page", () => {
        const resolver = createResolver(
            GOLDEN_FIXTURES.find((g) => g.name === "G1")!.build().show,
        );
        const first: PathPage = { counts: 0, beats: [{ index: 0 }] };
        const second: PathPage = { counts: 15, beats: [{ index: 15 }] };
        expect(pageEndBeat(first)).toBe(1);
        // No move into the first page; the move out of it starts at its end beat
        expect(pathsIntoPage(resolver, [1], first, null).size).toBe(0);
        const out = pathsIntoPage(resolver, [1], second, first).get(1)!;
        const [sx, sy] = resolver.positionAt(1, 1);
        expect(out.start).toEqual({ x: sx, y: sy });
        // The last page has no next page, so no move out of it
        expect(pathsIntoPage(resolver, [1], null, second).size).toBe(0);
    });

    it("keeps the corner where a steal takes over mid-page", () => {
        // G2: a layer-1 row takes over at beat 8 of the [0, 16] move
        const resolver = createResolver(
            GOLDEN_FIXTURES.find((g) => g.name === "G2")!.build().show,
        );
        const path = sampleTimelinePath(resolver, 1, 0, 16)!;
        const [cx, cy] = resolver.positionAt(1, 8);
        expect(path.points).toContainEqual({ x: cx, y: cy });
        expect(path.points.length).toBeGreaterThan(2);
    });
});

describe("count seeding", () => {
    /** x = beat; y = 1 on odd counts and 0 on even ones, straight between: a zig-zag. */
    const zigzag = (): Pick<Resolver, "positionAt" | "spanInfos"> => {
        const span = (
            start: number,
            end: number,
            kind: SpanInfo["kind"],
        ): SpanInfo => ({
            marcherId: 1,
            start,
            end,
            kind,
            assignmentId: null,
            transitionId: null,
            slot: null,
        });
        return {
            positionAt: (_id, beat) => {
                const k = Math.floor(beat);
                const f = beat - k;
                const y0 = k % 2;
                return [beat, y0 + f * (1 - 2 * y0)];
            },
            spanInfos: () => [
                span(-Infinity, 0, "hold"),
                span(0, 16, "founding"),
                span(16, Infinity, "hold"),
            ],
        };
    };

    it("finds zig-zag corners on the counts that the probes straddle", () => {
        // Over [0, 16] the 7 probes land on even counts, all on the chord
        const { points } = sampleMarcherPath(zigzag(), 1, 0, 16, {
            tolerance: 0.25,
        });
        for (let k = 0; k <= 16; k++) expect(points).toContainEqual([k, k % 2]);
    });

    it("costs one extra position per count for a straight move", () => {
        const row = rowBuilder();
        const resolver = createResolver({
            marchers: [{ id: 1, home: [0, 0] }],
            shapes: { 1: P(16 * STEP, 0) },
            transitions: { 1: tr(1, 0, 16, 1) },
            assignments: [row(1, 1, 0, 0, 16)],
        });
        const spy = vi.spyOn(resolver, "positionAt");
        const { points } = sampleMarcherPath(resolver, 1, 0, 16, {
            tolerance: 0.25,
        });
        expect(points).toHaveLength(2);
        // 2 ends, 15 count seeds and 3 probes
        expect(spy.mock.calls.length).toBe(2 + 15 + 3);
    });
});

describe("sampling budget", () => {
    it("samples 300 marchers on field-size arcs in a bounded number of positions", () => {
        const row = rowBuilder();
        const count = 300;
        const ids = Array.from({ length: count }, (_, i) => i + 1);
        const resolver = createResolver({
            marchers: ids.map((id) => ({ id, home: [0, id * STEP] })),
            shapes: Object.fromEntries(
                ids.map((id) => [id, P(10 * STEP, id * STEP)]),
            ),
            transitions: Object.fromEntries(
                ids.map((id) => [
                    id,
                    tr(id, 0, 8, id, {
                        style: "arc",
                        params: { bulge: 0.5 },
                    }),
                ]),
            ),
            assignments: ids.map((id) => row(id, id, 0, 0, 8)),
        });
        const spy = vi.spyOn(resolver, "positionAt");
        const paths = pathsIntoPage(resolver, ids, page(8), page(0));
        expect(paths.size).toBe(count);
        // A semicircle 10 steps across: a few dozen chords each at 0.25 tolerance
        for (const path of paths.values())
            expect(path.points.length).toBeGreaterThan(8);
        const perMarcher = spy.mock.calls.length / count;
        // About 180 today (it was 426 with 7 probes per piece); a regression shows up here
        expect(perMarcher).toBeLessThan(250);
    });
});

describe("warning styling on the curved path", () => {
    const setup = () => {
        const canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties,
            uiSettings: defaultSettings,
        });
        const visual = new MarcherVisualGroup({ marcher: marcher(1) });
        for (const object of [
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

    it("styles an over-threshold next path as a warning and forces it on with its toggle off", () => {
        const { canvas, visual, marcherVisuals } = setup();
        const resolver = holdThenMove(9);
        canvas.renderTimelinePathVisuals({
            marcherVisuals,
            marcherIds: [1],
            previousPaths: new Map(),
            nextPaths: pathsIntoPage(resolver, [1], page(8), page(0)),
            previousPathsEnabled: true,
            nextPathsEnabled: false,
            stepSizeWarningsEnabled: true,
            fieldProperties,
        });
        const next = visual.getNextTimelinePathway();
        expect(next.visible).toBe(true);
        expect(next.stroke).toBe(rgbaToString(STEP_SIZE_WARNING_COLOR));
        expect(next.strokeWidth).toBe(STEP_SIZE_WARNING_STROKE_WIDTH);
        expect(next.strokeDashArray?.length).toBeGreaterThan(0);
        // The bounds were computed with the warning stroke width
        const xs = next.points!.map((p) => p.x);
        expect(next.width).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 9);
        expect(next.left).toBeCloseTo(
            Math.min(...xs) - STEP_SIZE_WARNING_STROKE_WIDTH / 2,
            9,
        );
    });

    it("keeps an under-threshold next path hidden with its toggle off", () => {
        const { canvas, visual, marcherVisuals } = setup();
        canvas.renderTimelinePathVisuals({
            marcherVisuals,
            marcherIds: [1],
            previousPaths: new Map(),
            nextPaths: pathsIntoPage(holdThenMove(4), [1], page(8), page(0)),
            previousPathsEnabled: true,
            nextPathsEnabled: false,
            stepSizeWarningsEnabled: true,
            fieldProperties,
        });
        expect(visual.getNextTimelinePathway().visible).toBe(false);
    });
});

describe("line tool preview in timeline mode", () => {
    it("keys the temporary paths by marcher even when positions came from the resolver", () => {
        const canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties,
            uiSettings: defaultSettings,
        });
        // Positions as the timeline static render leaves them: no marcher_pages row behind them
        const marchers = [1, 2, 3].map(
            (id) =>
                new CanvasMarcher({
                    marcher: marcher(id),
                    coordinate: { x: id * 20, y: 40 },
                }),
        );
        for (const canvasMarcher of marchers) {
            canvas.add(canvasMarcher);
            canvasMarcher.setMarcherCoords({ x: canvasMarcher.left!, y: 40 });
        }
        canvas.eventMarchers = marchers;
        const setNew = vi.fn();
        canvas.setGlobalNewMarcherPages = setNew;
        const listeners = new LineListeners({ canvas });
        (listeners as unknown as { _activeLine: MarcherLine })._activeLine =
            new MarcherLine({
                x1: 0,
                y1: 100,
                x2: 200,
                y2: 100,
                color: "black",
                startPageId: 1,
                endPageId: 1,
            });

        listeners.drawNewMarcherPaths();
        const newDots = setNew.mock.calls[0]![0] as { marcher_id: number }[];
        expect(newDots.map((d) => d.marcher_id).sort()).toEqual([1, 2, 3]);
        expect(canvas.getObjectsByType(Pathway)).toHaveLength(3);

        listeners.clearPathwaysAndStaticMarchers();
        expect(canvas.getObjectsByType(Pathway)).toHaveLength(0);
    });
});
